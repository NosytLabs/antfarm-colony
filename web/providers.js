const get=selector=>document.querySelector(selector);
let models=[];
const quote=value=>`'${value.replaceAll("'", "'\\''")}'`;
function selectedModel(){
  const model=models.find(item=>item.id===get('#antseed-model').value);
  if(!model)return;
  get('#antseed-config-command').textContent=`npm run antseed -- config --model ${quote(model.id)}`;
  get('#antseed-model-note').textContent=`${model.zeroTokenPrice?'A seller advertises zero token prices.':'No zero-token-price offer reported; Colony’s starter caps will reject paid token rates.'} Tool use: ${model.toolUse===true?'advertised':model.toolUse===false?'not supported':'not reported — verify before assigning code work'}.`;
}
get('#antseed-check').addEventListener('click',async()=>{
  const button=get('#antseed-check');button.disabled=true;
  get('#antseed-status').textContent='Checking the local Antseed model catalog…';
  get('#antseed-models-panel').hidden=true;
  try {
    const response=await fetch('/api/providers/antseed',{signal:AbortSignal.timeout(5000),cache:'no-store'});
    if(!response.ok)throw new Error(`Colony returned HTTP ${response.status}`);
    const status=await response.json();
    get('#antseed-status').textContent=status.message;
    get('#antseed-badge').textContent=status.configured&&!status.zeroTokenCaps?'Check price caps':status.connected?'Proxy reachable':status.configured?'Proxy offline':'Setup needed';
    get('#antseed-badge').classList.toggle('is-ready',status.connected);
    models=[...(status.models||[])].sort((a,b)=>Number(b.zeroTokenPrice)-Number(a.zeroTokenPrice)||a.id.localeCompare(b.id));
    get('#antseed-model').replaceChildren(...models.map(model=>{
      const option=document.createElement('option');option.value=model.id;option.textContent=model.id+(model.zeroTokenPrice?' · zero token offer':'');return option;
    }));
    get('#antseed-models-panel').hidden=!models.length;
    selectedModel();
  } catch(error) {
    get('#antseed-badge').textContent='Check failed';get('#antseed-badge').classList.remove('is-ready');
    get('#antseed-status').textContent=`Could not check Antseed: ${error.message}. Start Colony with npm start and try again.`;
  } finally {button.disabled=false;}
});
get('#antseed-model').addEventListener('change',selectedModel);
get('#antseed-copy').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText(get('#antseed-config-command').textContent);get('#antseed-copy').textContent='Copied';setTimeout(()=>get('#antseed-copy').textContent='Copy',1500);}
  catch {get('#antseed-status').textContent='Copy unavailable. Select the command manually.';}
});
