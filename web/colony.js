import { WORLD, CHAMBERS, chamber, chamberFor, roleOf, hash, routeBetween, trailsFromTasks, clampCamera } from './colony-model.js';

const loadImage = src => new Promise((resolve,reject) => {
  const image = new Image(); image.onload=()=>resolve(image); image.onerror=()=>reject(new Error('Could not load '+src)); image.src=src;
});
const COLORS={running:'#c5df91',working:'#c5df91',done:'#87ceb1',completed:'#87ceb1',failed:'#f2a38b',blocked:'#f2a38b',review:'#ffd28c',queued:'#b6b1a3',idle:'#aaa996'};

// Each frame is normalized once, with a shared scale and bottom-center anchor.
// Keep the largest connected alpha shape so irregular generated atlas gutters
// cannot leak a neighbour's antenna or foot into a frame.
function isolateFrame(image, rect) {
  const canvas=document.createElement('canvas');canvas.width=rect.w;canvas.height=rect.h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,rect.x,rect.y,rect.w,rect.h,0,0,rect.w,rect.h);
  const pixels=ctx.getImageData(0,0,rect.w,rect.h), seen=new Uint8Array(rect.w*rect.h);let largest=[];
  for(let i=0;i<seen.length;i++){
    if(seen[i] || pixels.data[i*4+3]<16)continue;
    const queue=[i];seen[i]=1;
    for(let k=0;k<queue.length;k++){
      const pos=queue[k],x=pos%rect.w,y=Math.floor(pos/rect.w);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy,j=yy*rect.w+xx;
        if(xx>=0&&xx<rect.w&&yy>=0&&yy<rect.h&&!seen[j]&&pixels.data[j*4+3]>=16){seen[j]=1;queue.push(j);}
      }
    }
    if(queue.length>largest.length)largest=queue;
  }
  const keep=new Uint8Array(seen.length);for(const n of largest)keep[n]=1;
  for(let i=0;i<keep.length;i++)if(!keep[i])pixels.data[i*4+3]=0;
  ctx.putImageData(pixels,0,0);return canvas;
}

export class ColonyScene {
  constructor(canvas,labelsContainer,onSelect) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.labelsContainer=labelsContainer;this.onSelect=onSelect;
    this.settings={labels:true,trails:true,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,theme:'moss'};
    this.state={agents:[],tasks:[]};this.ants=new Map();this.zoom=1;this.camera={x:768,y:512};this.paused=false;this.time=0;this.lastTime=0;this.hovered=null;this.selected=null;this.destroyed=false;this.dirty=true;
    this.labelButtons=CHAMBERS.map(c=>{
      const button=document.createElement('button');button.className='chamber-label';button.textContent=c.name;button.title=c.subtitle;button.setAttribute('aria-label',c.name+': '+c.subtitle);
      button.addEventListener('click',()=>{this.selected=null;this.onSelect({type:'chamber',id:c.id});});
      this.labelsContainer.append(button);return button;
    });
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);
    this.abort=new AbortController();const opts={signal:this.abort.signal};
    canvas.addEventListener('pointerdown',e=>this.pointerDown(e),opts);
    canvas.addEventListener('pointermove',e=>this.pointerMove(e),opts);
    canvas.addEventListener('pointerup',e=>this.pointerUp(e),opts);
    canvas.addEventListener('pointercancel',()=>{this.drag=null;},opts);
    canvas.addEventListener('pointerleave',()=>{this.hovered=null;this.dirty=true;},opts);
    document.addEventListener('visibilitychange',()=>{this.lastTime=0;this.dirty=true;},opts);
    this.ready=this.load();this.resize();this.raf=requestAnimationFrame(t=>this.frame(t));
  }
  async load(){
    try{
      const [background,ants,work,props,growth,response]=await Promise.all([loadImage('assets/colony.png'),loadImage('assets/ants.png'),loadImage('assets/ants-work.png'),loadImage('assets/props.png'),loadImage('assets/colony-growth.png'),fetch('assets/atlas.json')]);
      if(!response.ok)throw new Error('Could not load atlas manifest');
      const manifest=await response.json();
      if(manifest.ants.frames.length!==16 || manifest.work.frames.length!==16 || manifest.props.frames.length!==16 || manifest.growth.frames.length!==8)throw new Error('Incomplete sprite atlas');
      this.background=background;
      this.antFrames=manifest.ants.frames.map(rect=>isolateFrame(ants,rect));
      this.workFrames=manifest.work.frames.map(rect=>isolateFrame(work,rect));
      // The same role shares one stable feet anchor across both animation sets.
      for(let row=0;row<4;row++){
        const frames=[...this.antFrames.slice(row*4,row*4+4),...this.workFrames.slice(row*4,row*4+4)];
        const width=Math.max(...frames.map(f=>f.width)),height=Math.max(...frames.map(f=>f.height));
        for(const set of [this.antFrames,this.workFrames])for(let i=row*4;i<row*4+4;i++){
          const frame=set[i],padded=document.createElement('canvas');padded.width=width;padded.height=height;
          padded.getContext('2d').drawImage(frame,Math.round((width-frame.width)/2),height-frame.height);set[i]=padded;
        }
      }
      this.propFrames=manifest.props.frames.map(rect=>isolateFrame(props,rect));
      this.growthFrames=manifest.growth.frames.map(rect=>isolateFrame(growth,rect));
      this.dirty=true;this.canvas.dataset.assets='ready';this.canvas.dispatchEvent(new CustomEvent('assets-ready'));
    }catch(error){
      this.assetError=error.message;this.canvas.dataset.assets='error';
      this.canvas.dispatchEvent(new CustomEvent('assets-error',{detail:error.message}));this.dirty=true;
    }
  }
  setState(state){
    const initial=this.ants.size===0;
    this.state=state;
    const ids=new Set();
    for(const agent of [...(state.agents||[])].sort((a,b)=>Number(['running','review','failed'].includes(b.status))-Number(['running','review','failed'].includes(a.status))||String(b.last_seen||'').localeCompare(String(a.last_seen||''))).slice(0,60)){
      ids.add(agent.id);const seed=hash(agent.id), dest=chamberFor(agent);
      let ant=this.ants.get(agent.id);
      if(!ant){
        const origin=initial?dest:"nursery",start=chamber(origin);ant={...agent,x:start.x+(seed%7-3)*26,y:start.y+(seed%3-1)*12,room:origin,destination:origin,path:[],facing:seed%2?1:-1,seed,walkPhase:seed%100};
        this.ants.set(agent.id,ant);
      }
      for(const key of ["name","role","status","task_id","tool","source","last_seen"])ant[key]=agent[key];
      if(dest!==ant.destination){
        // Finish the current tunnel segment before choosing a new route. Going
        // straight back to the last room can cut across the chamber walls.
        const nextRoomIndex=ant.path.findIndex(point=>CHAMBERS.some(c=>c.x===point.x&&c.y===point.y));
        if(nextRoomIndex>=0){
          const point=ant.path[nextRoomIndex];
          const nextRoom=CHAMBERS.find(c=>c.x===point.x&&c.y===point.y);
          ant.path=[...ant.path.slice(0,nextRoomIndex+1),...(nextRoom.id===dest?[]:routeBetween(nextRoom.id,dest))];
        }else{
          ant.path=[{x:chamber(ant.room).x,y:chamber(ant.room).y},...routeBetween(ant.room,dest)];
        }
        ant.destination=dest;

      }
      ant.spriteRow={scout:0,builder:1,verifier:2,planner:3}[roleOf(agent)];
    }
    for(const id of this.ants.keys())if(!ids.has(id))this.ants.delete(id);
    // Stable personal work spots spread workers across a floor instead of piling
    // every arrival onto the chamber center. Travel still follows the tunnel graph.
    for(const room of CHAMBERS){
      const residents=[...this.ants.values()].filter(a=>a.destination===room.id).sort((a,b)=>a.id.localeCompare(b.id));
      const columns=Math.min(5,residents.length),spacing=Math.min(84,272/Math.max(1,columns-1));
      residents.forEach((ant,i)=>{ant.slot={x:room.x+(i%5-(columns-1)/2)*spacing,y:room.y+Math.floor(i/5)%3*16-8};});
    }
    if(this.settings.reducedMotion)for(const ant of this.ants.values())this.settleAnt(ant);
    this.trails=trailsFromTasks(state.tasks||[],state.agents||[]);
    this.canvas.setAttribute('aria-label',(state.mode==='demo'?'Demo':'Live')+' ant colony with '+(state.agents||[]).length+' workers. Ant details are also available in the Ants tab.');
    this.dirty=true;
  }
  settleAnt(ant){
    const target=ant.slot||chamber(ant.destination);
    ant.x=target.x;ant.y=target.y;
    ant.room=ant.destination;ant.path=[];ant.moving=false;ant.restUntil=this.time+3;
  }
  setSettings(settings){
    const wasReduced=this.settings.reducedMotion;
    Object.assign(this.settings,settings);
    if(this.settings.reducedMotion&&!wasReduced)for(const ant of this.ants.values())this.settleAnt(ant);
    this.labelsContainer.hidden=!this.settings.labels;this.dirty=true;
  }
  setPaused(paused){this.paused=!!paused;this.dirty=true;this.lastTime=0;}
  getZoom(){return this.zoom;}
  setZoom(zoom){this.zoom=Math.min(2.5,Math.max(1,Number(zoom)||1));if(this.zoom===1)this.camera={x:768,y:512};this.canvas.style.touchAction=this.zoom>1?'none':'pan-y';this.resize();return this.zoom;}
  resize(){
    const rect=this.canvas.getBoundingClientRect();this.width=rect.width;this.height=rect.height;
    const dpr=Math.min(window.devicePixelRatio||1,2);this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);this.dpr=dpr;
    this.scale=Math.min(this.width/WORLD.width,this.height/WORLD.height)*this.zoom;
    if(this.scale>0)this.camera=clampCamera(this.camera,this.width,this.height,this.scale);
    this.offsetX=this.width/2-this.camera.x*this.scale;this.offsetY=this.height/2-this.camera.y*this.scale;
    CHAMBERS.forEach((c,i)=>{const x=this.offsetX+c.x*this.scale,y=this.offsetY+c.labelY*this.scale;const b=this.labelButtons[i];b.style.left=x+'px';b.style.top=y+'px';b.hidden=x<0||x>this.width||y<0||y>this.height;});
    this.dirty=true;
  }
  point(e){const r=this.canvas.getBoundingClientRect();return{x:(e.clientX-r.left-this.offsetX)/this.scale,y:(e.clientY-r.top-this.offsetY)/this.scale};}
  hit(point){return [...this.ants.values()].sort((a,b)=>a.y-b.y).reverse().find(a=>Math.abs(a.x-point.x)<49&&point.y<a.y+12&&point.y>a.y-66);}
  pointerDown(e){this.drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};if(this.zoom>1)this.canvas.setPointerCapture(e.pointerId);}
  pointerMove(e){
    if(this.drag&&this.zoom>1){
      const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
      if(Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)>5)this.drag.moved=true;
      this.camera.x-=dx/this.scale;this.camera.y-=dy/this.scale;
      this.drag.x=e.clientX;this.drag.y=e.clientY;this.resize();
    }else{
      const ant=this.hit(this.point(e));this.hovered=ant?.id||null;this.canvas.style.cursor=ant?'pointer':this.zoom>1?'grab':'default';this.dirty=true;
    }
  }
  pointerUp(e){
    if(!this.drag?.moved){const ant=this.hit(this.point(e));if(ant){this.selected=ant.id;this.onSelect({type:'agent',id:ant.id});this.dirty=true;}}
    this.drag=null;
  }
  update(dt){
    this.time+=dt;
    for(const ant of this.ants.values()){
      ant.moving=false;
      if(ant.path.length){
        const next=ant.path[0],dx=next.x-ant.x,dy=next.y-ant.y,d=Math.hypot(dx,dy),speed=104+(ant.seed%17);
        if(d<speed*dt+1){
          ant.x=next.x;ant.y=next.y;ant.path.shift();
          const arrived=CHAMBERS.find(c=>c.x===next.x&&c.y===next.y);
          if(arrived)ant.room=arrived.id;
          ant.moving=ant.path.length>0;
          if(!ant.path.length){ant.room=ant.destination;ant.restUntil=this.time+3;}
        }
        else{ant.x+=dx/d*speed*dt;ant.y+=dy/d*speed*dt;if(Math.abs(dx)>1)ant.facing=dx>0?1:-1;ant.moving=true;}
      }else if(this.time>(ant.restUntil||0)){
        const home=ant.slot||chamber(ant.room),phase=Math.floor(this.time/7)+(ant.seed%71);
        // A bounded little job motion inside the chamber, never through walls.
        const offset=Math.sin(phase*1.7)*12;
        ant.path=[{x:home.x+offset,y:home.y}];ant.restUntil=this.time+4+ant.seed%4;
      }
      if(ant.moving)ant.walkPhase+=dt*7;
    }
  }
  frame(timestamp){
    if(this.destroyed)return;
    const dt=this.lastTime?Math.min((timestamp-this.lastTime)/1000,.05):0;this.lastTime=timestamp;
    const active=!this.paused&&!this.settings.reducedMotion&&!document.hidden;
    if(active)this.update(dt);
    if((active&&timestamp-(this.lastDraw||0)>16)||this.dirty){this.draw();this.lastDraw=timestamp;this.dirty=false;}
    this.raf=requestAnimationFrame(t=>this.frame(t));
  }
  draw(){
    const ctx=this.ctx;if(!ctx||!this.width||!this.height)return;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.fillStyle='#11180f';ctx.fillRect(0,0,this.width,this.height);
    ctx.save();ctx.translate(this.offsetX,this.offsetY);ctx.scale(this.scale,this.scale);ctx.imageSmoothingEnabled=false;
    if(this.background)ctx.drawImage(this.background,0,0,WORLD.width,WORLD.height);
    else{ctx.fillStyle='#c5d58e';ctx.font='24px monospace';ctx.textAlign='center';ctx.fillText(this.assetError?'Assets unavailable — reload to retry':'Preparing the colony…',768,512);ctx.restore();return;}
    if(this.settings.theme==='midnight'){ctx.fillStyle='#0a254239';ctx.fillRect(0,0,1536,1024);}else if(this.settings.theme==='earth'){ctx.fillStyle='#79421118';ctx.fillRect(0,0,1536,1024);}
    if(this.settings.trails)this.drawTrails(ctx);
    this.drawProps(ctx);
    const ants=[...this.ants.values()].sort((a,b)=>a.y-b.y);
    for(const ant of ants)this.drawAnt(ctx,ant);
    if(!this.settings.reducedMotion)this.drawFireflies(ctx);
    ctx.restore();
  }
  drawTrails(ctx){
    ctx.save();ctx.lineWidth=3;ctx.lineCap='round';ctx.setLineDash([2,13]);
    for(const trail of this.trails||[]){
      if(trail.from===trail.to)continue;
      const start=chamber(trail.from),points=routeBetween(trail.from,trail.to);
      ctx.strokeStyle='rgba(184,231,122,'+(Math.min(.6,trail.strength*.6))+')';ctx.beginPath();ctx.moveTo(start.x,start.y+12);
      for(const p of points)ctx.lineTo(p.x,p.y+12);ctx.stroke();
    }ctx.restore();
  }
  drawProps(ctx){
    if(!this.propFrames)return;
    const done=(this.state.tasks||[]).filter(t=>t.status==='done').length;
    const objects=[[0,100,425,48],[5,1430,438,48],[10,1150,440,55],[8,375,812,46],[3,1430,805,45]];
    if(done>=3)objects.push([4,640,445,48]);
    if(done>=10)objects.push([11,595,113,50]);
    if(done>=25)objects.push([12,395,110,34]);
    for(const [i,x,y,w] of objects){const im=this.propFrames[i],h=im.height/im.width*w;ctx.drawImage(im,x-w/2,y-h,w,h);}
    // New colony structures grow from real completed work; demo uses its own counts.
    const growth=[[4,770,211,68],[6,1150,833,48]];
    if(done>=1)growth.push([0,106,817,65],[2,900,835,66]);
    if(done>=3)growth.push([1,1402,841,65],[3,906,443,52]);
    if(done>=10)growth.push([5,390,444,57]);
    if(done>=25)growth.push([7,635,833,65]);
    for(const [i,x,y,w] of growth){const im=this.growthFrames[i],h=im.height/im.width*w;ctx.drawImage(im,x-w/2,y-h,w,h);}
  }
  drawAnt(ctx,ant){
    if(!this.antFrames)return;
    const isSelected=this.selected===ant.id||this.hovered===ant.id;
    const working=!ant.moving&&['running','working','review'].includes(ant.status);
    const sequence=working?this.workFrames:this.antFrames;
    const index=ant.moving?Math.floor(ant.walkPhase)%4:working?Math.floor(this.time*3+ant.seed)%4:0;
    const frame=sequence[ant.spriteRow*4+index];
    const w=ant.spriteRow===3?100:94,h=frame.height/frame.width*w;
    ctx.save();ctx.translate(Math.round(ant.x),Math.round(ant.y));
    ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(0,2,w*.38,7,0,0,Math.PI*2);ctx.fill();
    if(isSelected){ctx.strokeStyle='#d2e69c';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,3,w*.48,11,0,0,Math.PI*2);ctx.stroke();}
    ctx.save();ctx.scale(ant.facing,1);ctx.drawImage(frame,-w/2,-h,w,h);ctx.restore();
    const color=COLORS[ant.status]||'#c5c4a5';
    ctx.fillStyle='#0d191ee8';ctx.fillRect(-5,-h-13,10,8);ctx.fillStyle=color;ctx.fillRect(-2,-h-11,4,4);
    if(isSelected){
      const name=String(ant.name||ant.id).slice(0,26),text=name+' · '+(ant.path.length&&ant.room!==ant.destination?'To '+chamber(ant.destination).name.toLowerCase():ant.status);
      ctx.font='13px "Geist Pixel",monospace';const width=ctx.measureText(text).width+20;
      ctx.fillStyle='#102015f2';ctx.fillRect(-width/2,-h-45,width,24);ctx.strokeStyle='#698051';ctx.lineWidth=1;ctx.strokeRect(-width/2,-h-45,width,24);
      ctx.fillStyle='#e2eccb';ctx.textAlign='center';ctx.fillText(text,0,-h-28);
    }
    if(!this.settings.reducedMotion&&ant.status==='running'&&!ant.moving){
      ctx.fillStyle='#d7dda4';for(let i=0;i<3;i++){const phase=(this.time*1.4+i*.35)%1;ctx.globalAlpha=1-phase;ctx.fillRect(ant.facing*38+(i-1)*7,-9-phase*25,3,3);}ctx.globalAlpha=1;
    }
    ctx.restore();
  }
  drawFireflies(ctx){
    for(let i=0;i<16;i++){const phase=this.time*.22+i*2.7,x=(i*97+Math.sin(phase)*14)%1500,y=35+(i*29)%80+Math.cos(phase)*8;ctx.globalAlpha=.2+Math.sin(phase)*.15;ctx.fillStyle=i%3?'#d5db81':'#9ccdcc';ctx.fillRect(x,y,3,3);}ctx.globalAlpha=1;
  }
  destroy(){this.destroyed=true;cancelAnimationFrame(this.raf);this.resizeObserver.disconnect();this.abort.abort();this.labelsContainer.replaceChildren();}
}
