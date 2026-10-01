'use strict';
const $ = id => document.getElementById(id);
let state, exportRev, updating = false, pending = false;
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
    const oldRev = state?.rev;
    state = await res.json();
    $('status').textContent = 'Revision ' + state.rev + ' · ' + (state.paused ? 'Editing paused' : 'Ready for edits');
    $('pause').textContent = state.paused ? 'Resume editing' : 'Pause editing';
    $('undo').disabled = !state.undo;
    $('redo').disabled = !state.redo;
    $('export').disabled = !state.exportConfigured;
    $('destination').textContent = state.exportConfigured ? 'Export to: ' + state.exportDestination : 'Set an export destination at startup to save a finished copy.';
    if (state.durabilityWarning) message(state.durabilityWarning);

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
    if (oldRev !== state.rev || !$('preview').getAttribute('src')) preview();
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
$('save-checkpoint').onclick=()=>control('checkpoint',{label:$('checkpoint-label').value});
$('page').onchange = preview;
$('refresh').onclick = preview;
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
function sessionHeaders(){return {'X-Site-Studio-Control':sessionStorage.getItem('site-studio-session')||''};}
async function openDashboard(){
  const fragment=location.hash;
  history.replaceState(null,'',location.pathname);
  try{
    if(fragment){
      const cap=new URLSearchParams(fragment.slice(1)).get('cap');
      const res=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cap})});
      if(!res.ok)throw Error('Launch link is invalid or consumed. Restart Site Studio for a new link.');
      sessionStorage.setItem('site-studio-session',(await res.json()).token);
    }
    if(!sessionStorage.getItem('site-studio-session'))throw Error('Open the private launch link from local startup diagnostics.');
    const issued=await fetch('/api/preview-session',{method:'POST',headers:{'Content-Type':'application/json',...sessionHeaders()},body:'{}'});
    if(!issued.ok)throw Error('Preview session unavailable. Restart Site Studio for a new link.');
    await refresh();
    const res=await fetch('/api/events',{headers:sessionHeaders()});
    if(!res.ok)throw Error('Live updates unavailable. Reload the dashboard.');
    const reader=res.body.getReader();
    for(;;){const {done}=await reader.read();if(done)break;await refresh();}
    message('Site Studio closed. Restart it to open a new session.');
  }catch(e){message(e.message);}
}
openDashboard();
