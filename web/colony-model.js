export const WORLD = { width: 1536, height: 1024 };
export function clampCamera(camera, width, height, scale) {
  const halfX = Math.min(WORLD.width / 2, width / (2 * scale));
  const halfY = Math.min(WORLD.height / 2, height / (2 * scale));
  return { x: Math.max(halfX, Math.min(WORLD.width - halfX, camera.x)), y: Math.max(halfY, Math.min(WORLD.height - halfY, camera.y)) };
}
export const CHAMBERS = [
  { id: 'scouts', name: 'FORAGING GROUNDS', subtitle: 'Research & discovery', x: 245, y: 425, labelY: 290, role: 'scout' },
  { id: 'queen', name: 'QUEEN’S CHAMBER', subtitle: 'Planning & shared context', x: 770, y: 425, labelY: 268, role: 'planner' },
  { id: 'workshop', name: 'THE WORKSHOP', subtitle: 'Build & repair', x: 1285, y: 425, labelY: 290, role: 'builder' },
  { id: 'review', name: 'INSPECTION ROOM', subtitle: 'Verify & test', x: 250, y: 795, labelY: 645, role: 'verifier' },
  { id: 'granary', name: 'THE GRANARY', subtitle: 'Completed work & memory', x: 770, y: 795, labelY: 655, role: 'archive' },
  { id: 'nursery', name: 'THE NURSERY', subtitle: 'Ready for the next mission', x: 1290, y: 795, labelY: 645, role: 'idle' },
];
const edges = [
  ['scouts','queen',[[425,425],[470,377],[525,389],[595,425]]],
  ['queen','workshop',[[949,425],[1005,379],[1052,389],[1110,425]]],
  ['review','granary',[[418,795],[485,720],[535,737],[602,795]]],
  ['granary','nursery',[[950,795],[1005,720],[1060,740],[1120,795]]],
  ['scouts','review',[[258,485],[260,538],[270,600],[369,670],[375,749]]],
  ['queen','granary',[[771,482],[781,533],[772,583],[859,689],[866,752]]],
  ['workshop','nursery',[[1295,485],[1300,540],[1293,603],[1365,720]]],
];
export function roleOf(agent) {
  const text = (String(agent.role || '') + ' ' + String(agent.id || '') + ' ' + String(agent.name || '')).toLowerCase();
  if (/planner|queen|prioriti|summary|synthesi/.test(text)) return 'planner';
  if (/verif|test|review|quality/.test(text)) return 'verifier';
  if (/develop|build|cod|fixer|setup/.test(text)) return 'builder';
  return 'scout';
}
export function chamberFor(agent) {
  if (agent.status === 'done' || agent.status === 'completed') return 'granary';
  if (['idle','queued','waiting','cancelled'].includes(agent.status)) return 'nursery';
  if (['failed','blocked','review'].includes(agent.status)) return 'review';
  return { scout:'scouts', planner:'queen', builder:'workshop', verifier:'review' }[roleOf(agent)];
}
export function chamber(id) { return CHAMBERS.find(c => c.id === id) || CHAMBERS[5]; }
export function hash(text) { let h=2166136261; for(const c of String(text)) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; }
export function routeBetween(from, to) {
  if(from===to) return [{x:chamber(to).x,y:chamber(to).y}];
  const queue=[{id:from,path:[]}], seen=new Set([from]);
  while(queue.length) {
    const item=queue.shift();
    for(const [a,b,points] of edges) {
      if(a!==item.id && b!==item.id) continue;
      const next=a===item.id?b:a;
      if(seen.has(next)) continue;
      const pointsHere=(a===item.id?points:[...points].reverse()).map(([x,y])=>({x,y}));
      const path=[...item.path,...pointsHere,{x:chamber(next).x,y:chamber(next).y}];
      if(next===to) return path;
      seen.add(next);queue.push({id:next,path});
    }
  }
  return [];
}
export function trailStrength(updated, now=Date.now()) {
  const time=typeof updated==='number'?updated:Date.parse(updated);
  if(!Number.isFinite(time)) return 0;
  return Math.exp(-Math.max(0,now-time)/(30*60*1000));
}
export function trailsFromTasks(tasks, agents, now=Date.now()) {
  const byId=new Map(tasks.map(t=>[t.id,t])), agentsById=new Map(agents.map(a=>[a.id,a]));
  const trails=[];
  for(const task of tasks) {
    for(const id of task.depends_on || []) {
      const previous=byId.get(id);
      if(!previous || previous.status!=='done') continue;
      const a=agentsById.get(previous.assigned_to) || {id:previous.assigned_to||previous.kind};
      const b=agentsById.get(task.assigned_to) || {id:task.assigned_to||task.kind};
      const room = role => ({scout:'scouts',planner:'queen',builder:'workshop',verifier:'review'}[roleOf(role)]);
      const strength=trailStrength(previous.updated_at,now);
      if(strength>.02) trails.push({from:room(a),to:task.status==='done'?'granary':room(b),strength,run_id:task.run_id});
    }
  }
  return trails;
}
