'use strict';
const $ = id => document.getElementById(id);
let state, exportRev, updating = false, pending = false, recovering=false, repairs=0, reissuing=false, dashboardRun=0;
const previewRepairWarning='Preview session could not be restored. Allow loopback cookies, then choose Refresh preview.';
const message = text => { $('message').textContent = text; };

function preview() {
  if ($('page').value) {
    $('preview').src = state.previewUrl + '/' + $('page').value.split('/').map(encodeURIComponent).join('/') + '?rev=' + state.rev;
  }
}
async function refresh() {
  if (updating) { pending = true; return; }
  updating = true;
  try {
    const res = await fetch('/api/status',{headers:sessionHeaders()});
    if (!res.ok) throw Error('Dashboard session unavailable. Open the private launch link or restart Site Studio.');
    const oldRev = state?.rev,oldPreview=state?.previewUrl;
    state = await res.json();
    const issues=state.previewIssues||[];
    $('preview-message').textContent=issues.slice(-5).map(issue=>issue.path+': '+issue.message).join(' ')+(issues.length>5?' Additional preview notices: '+(issues.length-5)+'.':'');
    $('status').textContent = 'Revision ' + state.rev + ' · ' + (state.paused ? 'Editing paused' : 'Ready for edits');
    $('pause').textContent = state.paused ? 'Resume editing' : 'Pause editing';
    $('undo').disabled = !state.undo;
    $('redo').disabled = !state.redo;
    $('export').disabled = !state.exportConfigured;
    $('destination').textContent = state.exportConfigured ? 'Export to: ' + state.exportDestination : 'Set an export destination at startup to save a finished copy.';
    if (state.durabilityWarning || state.undoPruned) message([state.durabilityWarning, state.undoPruned].filter(Boolean).join(' '));

    const active = $('page').value;
    $('page').replaceChildren();
    for (const file of state.files.filter(f => f.kind === 'html')) {
      const option = document.createElement('option');
      option.value = file.path;
      option.textContent = file.path;
      $('page').append(option);
    }
    if ([...$('page').options].some(o => o.value === active)) $('page').value = active;
    $('checkpoints').replaceChildren();
    for (const cp of state.checkpoints) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.textContent = 'Restore ' + (cp.permanent?'':cp.actor==='human'?'Human checkpoint: ':'Agent checkpoint: ') + cp.label + ' (revision ' + cp.rev + ')';
      button.onclick = () => control('restore',{label:cp.label});
      li.append(button);
      if(!cp.permanent){
      const remove = document.createElement('button');
      remove.textContent = 'Delete ' + cp.label;
      remove.onclick = () => control('delete_checkpoint',{label:cp.label});
      li.append(remove);
      }
      $('checkpoints').append(li);
    }
    $('timeline').replaceChildren();
    for (const item of state.history.slice(-30).reverse()) {
      const li = document.createElement('li');
      li.className='actor-'+item.actor;
      li.textContent = 'r' + item.rev + ' · ' + item.actor + ' · ' + item.type + ' · ' + item.summary + (item.label?' · '+item.label:'');
      $('timeline').append(li);
    }
    if (oldRev !== state.rev || oldPreview!==state.previewUrl || !$('preview').getAttribute('src')) preview();
  } catch (e) { message(e.message); }
  finally {
    updating = false;
    if (pending) { pending = false; refresh(); }
  }
}
async function control(action,args = {}) {
  try {
    const response = await fetch('/api/control',{
      method:'POST',
      headers:{'Content-Type':'application/json',...sessionHeaders()},
      body:JSON.stringify({action,expectedRev:state.rev,...args}),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    message(action === 'export' ? 'Exported ' + result.files + ' files. ' + (result.backup ? 'Backup: ' + result.backup : '') : '');
    await refresh();
  } catch (e) { message(e.message); await refresh(); }
}
function showReplacement(link){
  $('replacement-link').href=link;$('replacement-session').hidden=false;
  $('new-session').disabled=$('move-session').disabled=true;
  message('Open or copy the replacement link to move browsers. If it was already used and you lost that session, restart Site Studio.');
}
$('replacement-link').onclick=event=>{
  event.preventDefault();const link=$('replacement-link').href;
  sessionStorage.setItem('site-studio-replacement',JSON.stringify({link,move:false}));
  $('replacement-session').hidden=true;reissuing=false;void openDashboard();
};
async function replaceSession(move){
  if(reissuing)return;
  reissuing=true;$('new-session').disabled=$('move-session').disabled=true;
  try{
    const response=await fetch('/api/session/reissue',{method:'POST',headers:{'Content-Type':'application/json',...sessionHeaders()},body:JSON.stringify({expectedRev:state.rev})});
    const result=await response.json();if(!response.ok)throw Error(result.error);
    sessionStorage.setItem('site-studio-replacement',JSON.stringify({link:result.launchUrl,move}));
    sessionStorage.removeItem('site-studio-session');
    if(move)showReplacement(result.launchUrl);
    else void openDashboard();
  }catch(e){reissuing=false;$('new-session').disabled=$('move-session').disabled=false;message(e.message);}
}
$('new-session').onclick=()=>replaceSession(false);
$('move-session').onclick=()=>replaceSession(true);
$('save-checkpoint').onclick=()=>control('checkpoint',{label:$('checkpoint-label').value});
$('page').onchange = preview;
$('refresh').onclick = () => {repairs=0;void recoverPreview(state?.previewUrl.split('/').at(-1));};
$('pause').onclick = () => control(state.paused ? 'resume' : 'pause');
$('undo').onclick = () => control('undo');
$('redo').onclick = () => control('redo');
$('export').onclick = () => {
  exportRev = state.rev;
  $('export-detail').textContent = 'Export revision ' + exportRev + ' to ' + state.exportDestination + '?';
  $('confirm').showModal();
};
$('cancel').onclick = () => $('confirm').close();
$('confirm-export').onclick = async () => {
  $('confirm').close();
  await control('export',{confirmed:true,expectedRev:exportRev});
};
async function issuePreview(previewId){
  const res=await fetch('/api/preview-session',{method:'POST',headers:{'Content-Type':'application/json',...sessionHeaders()},body:JSON.stringify(previewId?{previewId}:{})});
  if(!res.ok)throw Error('Preview session unavailable. Reload the dashboard.');
}
async function recoverPreview(previewId){
  if(recovering||!previewId)return;
  if(repairs>=2){message(previewRepairWarning);return;}
  recovering=true;repairs++;
  try{await issuePreview(previewId);if($('message').textContent===previewRepairWarning)message('');await refresh();preview();}
  catch(e){message(e.message);}finally{recovering=false;}
}
function sessionHeaders(){return {'X-Site-Studio-Control':sessionStorage.getItem('site-studio-session')||''};}
async function openDashboard(){
  const run=++dashboardRun;
  let fragment=location.hash;
  history.replaceState(null,'',location.pathname);
  try{
    const replacement=JSON.parse(sessionStorage.getItem('site-studio-replacement')||'null');
    if(!fragment&&replacement?.move){reissuing=true;showReplacement(replacement.link);return;}
    if(!fragment&&replacement)fragment=new URL(replacement.link).hash;
    if(fragment){
      const cap=new URLSearchParams(fragment.slice(1)).get('cap');
      const res=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cap})});
      if(!res.ok)throw Error('Launch link is invalid or consumed. Restart Site Studio for a new link.');
      sessionStorage.setItem('site-studio-session',(await res.json()).token);
      sessionStorage.removeItem('site-studio-replacement');
    }
    if(!sessionStorage.getItem('site-studio-session'))throw Error('Dashboard session unavailable. Restart Site Studio for a new private launch link.');
    await issuePreview();
    await refresh();
    reissuing=false;$('new-session').disabled=$('move-session').disabled=false;
    if(replacement)message('Dashboard session renewed.');
    const res=await fetch('/api/events',{headers:sessionHeaders()});
    if(!res.ok)throw Error('Live updates unavailable. Reload the dashboard.');
    const reader=res.body.getReader(),decoder=new TextDecoder();let events='';
    for(;;){
      const {done,value}=await reader.read();if(done||run!==dashboardRun)break;events+=decoder.decode(value,{stream:true});
      let at;while((at=events.indexOf('\n\n'))>=0){
        const raw=events.slice(0,at);events=events.slice(at+2);if(!raw.startsWith('data: '))continue;
        const event=JSON.parse(raw.slice(6));
        if(event.previewUnauthorized===state?.previewUrl.split('/').at(-1))await recoverPreview(event.previewUnauthorized);
        else await refresh();
      }
    }
    if(!reissuing&&run===dashboardRun)message('Site Studio closed. Restart it to open a new session.');
  }catch(e){if(run===dashboardRun)message(e.message);}
}
openDashboard();
