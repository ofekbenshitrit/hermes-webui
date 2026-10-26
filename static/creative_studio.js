/* Creative Studio — stage workspace over /api/creative-studio. */
const CREATIVE_STAGES = [
  {id:'brief', label:'Brief'},
  {id:'who', label:'Who'},
  {id:'what', label:'What'},
  {id:'hook', label:'Hook'},
  {id:'casts', label:'CASTS'},
  {id:'copy', label:'Copy Blocks'},
  {id:'review', label:'Review'},
];
const CREATIVE_FIELDS = {
  brief:['product_offer','product_facts','audience_notes','objective','channel','format_length','assets','sources','summary_provided','summary_assumptions','summary_missing'],
  who:['outcome','demographic','facet','segment'],
  what:['concept','angle','ump','ums','mechanism'],
  hook:['hook_type','visual_hook','verbal_hook','core_trigger','caveman_simple','deep_fry','walk_it_back','make_it_bang','final_hook','format'],
  casts:['conceit','actors','style','terrain','setup'],
  copy:['pain','promise','proof','curiosity','constraints','conditions'],
  review:[],
};
const CREATIVE_HELP = {
  outcome:'The change the audience wants.',
  demographic:'Who they are in observable terms.',
  facet:'The situation or belief that makes the message land.',
  segment:'Outcome, demographic, and facet written as one audience.',
  concept:'One idea the ad is about.',
  angle:'The point of view on that idea.',
  ump:'Unique mechanism of the problem. Keep this separate from the solution.',
  ums:'Unique mechanism of the solution. Keep this separate from the problem.',
  mechanism:'How the product produces the outcome. Unsupported claims stay labeled Needs source/verification.',
  hook_type:'Choose a hook type, or ask for suggestions, before drafting alternatives.',
  final_hook:'The hook you are willing to use. Review checks alignment, the first five words, and claims. It is not a score.',
  conceit:'The central execution idea. A full storyboard is out of scope unless you ask in chat.',
};
let _creativeProjects = [];
let _creativeProject = null;
let _creativeStage = 'brief';
let _creativeSaveState = 'Saved';
let _creativeTimers = {};
let _creativePoll = null;
let _creativeAssistantOpen = false;
let _creativeDirty = false;
let _creativeCreating = false;

const CREATIVE_CREATE_FIELDS = [
  ['product_offer', 'Product / offer', 'What you are advertising.'],
  ['product_facts', 'Product facts', 'Only facts you can stand behind. Leave claims blank rather than guessing.'],
  ['audience_notes', 'Audience', 'Who this is for, if you already know.'],
  ['objective', 'Campaign objective', 'What the ad should get someone to do.'],
  ['channel', 'Channel', 'Where it will run.'],
  ['format_length', 'Format / length', 'Placement and length, if you know them.'],
  ['assets', 'Available assets', 'Footage, photos, logos, or other material you can use.'],
  ['sources', 'Source materials', 'Paste the text you want suggestions to rely on.'],
];

function _creativeEsc(value){
  return String(value == null ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _creativeLabel(field){
  return field.replace(/_/g,' ');
}

async function loadCreativeStudio(){
  await creativeRefreshList();
  if(_creativeProject && _creativeProject.id){
    await creativeOpenProject(_creativeProject.id, {keepStage:true});
  } else {
    creativeRenderWorkspace();
  }
  _creativeStartPoll();
}

async function creativeRefreshList(){
  const data = await api('/api/creative-studio/projects');
  _creativeProjects = data.projects || [];
  const root = document.getElementById('creativeProjectList');
  if(!root) return;
  if(!_creativeProjects.length){
    root.innerHTML = '<div style="padding:12px;color:var(--muted);font-size:12px">No creative projects yet. <button type="button" class="creative-inline-btn" onclick="creativeNewProject()">Create a project</button></div>';
    return;
  }
  root.innerHTML = _creativeProjects.map(row => {
    const progress = row.progress ? `${row.progress.done}/${row.progress.total}` : '';
    const active = _creativeProject && _creativeProject.id === row.id ? ' active' : '';
    return `<button type="button" class="creative-row${active}" onclick="creativeOpenProject('${row.id}')">
      <strong>${_creativeEsc(row.name)}</strong>
      <small>${_creativeEsc(row.product || 'No product')} · ${_creativeEsc(row.updated_at || '')} · ${progress}</small>
    </button>`;
  }).join('');
}

function creativeNewProject(){
  _creativeCreating = true;
  _creativeProject = null;
  creativeRenderWorkspace();
  const name = document.getElementById('creativeCreateName');
  if(name) name.focus();
}

function creativeCancelCreate(){
  _creativeCreating = false;
  creativeRenderWorkspace();
}

async function creativeSubmitCreate(){
  const form = document.getElementById('creativeCreateForm');
  if(!form) return;
  const name = (form.elements.name.value || '').trim();
  const error = document.getElementById('creativeCreateError');
  if(!name){
    if(error) error.textContent = 'A project name is required.';
    return;
  }
  const values = {};
  CREATIVE_CREATE_FIELDS.forEach(([field]) => {
    values[field] = (form.elements[field].value || '').trim();
  });
  const submit = form.querySelector('[type="submit"]');
  if(submit) submit.disabled = true;
  try{
    const project = await api('/api/creative-studio/projects', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name, product: values.product_offer}),
    });
    for(const [field, text] of Object.entries(values)){
      if(!text || field === 'product_offer') continue;
      await api('/api/creative-studio/projects/' + project.id + '/fields', {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({stage:'brief', field, text, author:'user'}),
      });
    }
    _creativeCreating = false;
    _creativeStage = 'brief';
    _creativeSaveState = 'Saved';
    await creativeOpenProject(project.id);
  }catch(err){
    if(submit) submit.disabled = false;
    if(error) error.textContent = err && err.message ? err.message : 'Could not create the project.';
  }
}

async function creativeOpenProject(id, opts){
  const project = await api('/api/creative-studio/projects/' + id);
  _creativeProject = project;
  if(!(opts && opts.keepStage)) _creativeStage = 'brief';
  await api('/api/creative-studio/active', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({project_id:id})});
  await creativeRefreshList();
  creativeRenderWorkspace();
}

async function creativeRenameProject(id){
  const name = window.prompt('Rename project', _creativeProject && _creativeProject.name || '');
  if(!name) return;
  await api('/api/creative-studio/projects/' + id + '/rename', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
  await creativeOpenProject(id, {keepStage:true});
}

async function creativeDuplicateProject(id){
  const copy = await api('/api/creative-studio/projects/' + id + '/duplicate', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
  await creativeOpenProject(copy.id);
}

async function creativeDeleteProject(id){
  if(!window.confirm('Delete this creative project?')) return;
  await api('/api/creative-studio/projects/' + id, {method:'DELETE'});
  if(_creativeProject && _creativeProject.id === id) _creativeProject = null;
  await creativeRefreshList();
  creativeRenderWorkspace();
}

function _creativeCreateMarkup(){
  const fields = CREATIVE_CREATE_FIELDS.map(([field, label, help]) => `<div class="creative-field">
      <label for="creativeCreate_${field}">${_creativeEsc(label)}</label>
      <p class="creative-help">${_creativeEsc(help)}</p>
      <textarea id="creativeCreate_${field}" name="${field}" rows="2"></textarea>
    </div>`).join('');
  return `<form id="creativeCreateForm" class="creative-create" onsubmit="creativeSubmitCreate(); return false;">
    <div class="creative-header"><strong>New creative project</strong></div>
    <div class="creative-fields">
      <p class="creative-help">Start with a name. The brief fields are the minimum context for later suggestions. Assumptions are not filled in for you.</p>
      <div class="creative-field">
        <label for="creativeCreateName">Project name</label>
        <input id="creativeCreateName" name="name" required maxlength="160" autocomplete="off">
      </div>
      ${fields}
      <p id="creativeCreateError" class="creative-save failed"></p>
      <div class="creative-actions">
        <button type="submit">Create project</button>
        <button type="button" onclick="creativeCancelCreate()">Cancel</button>
      </div>
    </div>
  </form>`;
}

function creativeSetStage(stage){
  _creativeStage = stage;
  creativeRenderWorkspace();
}

function creativeMoveStage(delta){
  const index = CREATIVE_STAGES.findIndex(stage => stage.id === _creativeStage);
  const next = CREATIVE_STAGES[index + delta];
  if(!next) return;
  _creativeStage = next.id;
  creativeRenderWorkspace();
}

function creativeRenderWorkspace(){
  const root = document.getElementById('creativeWorkspace');
  if(!root) return;
  if(_creativeCreating){
    root.innerHTML = _creativeCreateMarkup();
    return;
  }
  if(!_creativeProject){
    root.innerHTML = '<div class="main-view-empty"><div class="main-view-empty-title">Creative Studio</div><div class="main-view-empty-sub">Create a project and enter the brief. You can leave fields blank and fill them later. Continue never accepts agent text for you.</div><button type="button" class="creative-inline-btn" onclick="creativeNewProject()">Create a project</button></div>';
    return;
  }
  const project = _creativeProject;
  const stage = project.stages[_creativeStage];
  const assistantClass = _creativeAssistantOpen ? 'creative-assistant' : 'creative-assistant collapsed';
  root.innerHTML = `
    <div class="creative-header">
      <div>
        <strong>${_creativeEsc(project.name)}</strong>
        <span class="creative-save ${_creativeSaveState === 'Save failed' ? 'failed' : ''}" id="creativeSaveState">${_creativeEsc(_creativeSaveState)}</span>
      </div>
      <div class="creative-actions">
        <button type="button" onclick="creativeRenameProject('${project.id}')">Rename</button>
        <button type="button" onclick="creativeDuplicateProject('${project.id}')">Duplicate</button>
        <button type="button" onclick="creativeDeleteProject('${project.id}')">Delete</button>
        <button type="button" onclick="creativeExport()">Export</button>
        <button type="button" onclick="creativeRetrySave()">Retry</button>
      </div>
    </div>
    <div class="creative-body">
      <nav class="creative-stages" aria-label="Framework stages">${CREATIVE_STAGES.map(item => {
        const status = project.stages[item.id].status;
        return `<button type="button" class="creative-stage-btn${item.id === _creativeStage ? ' active' : ''}" onclick="creativeSetStage('${item.id}')"><span>${item.label}</span><small>${_creativeEsc(status)}</small></button>`;
      }).join('')}</nav>
      <div class="creative-fields" id="creativeFields">${_creativeStageMarkup(stage)}</div>
      <aside class="${assistantClass}" id="creativeAssistant">
        <strong>Assistant</strong>
        <p class="creative-help">Suggestions stay proposals until you choose Use or edit them into the field.</p>
        <div id="creativeAssistantBody"></div>
      </aside>
    </div>
    <div class="creative-footer">
      <button type="button" onclick="creativeMoveStage(-1)">Back</button>
      <button type="button" onclick="creativeMarkStage()">Stage status</button>
      <button type="button" onclick="creativeMoveStage(1)">Continue</button>
    </div>`;
  _creativeRenderAssistantCards();
}

function _creativeStageMarkup(stage){
  const actions = _creativeStage === 'review' ? '' : `
    <div class="creative-actions">
      <button type="button" onclick="creativeAssist('suggest')">Suggest directions</button>
      <button type="button" onclick="creativeAssist('clarify')">Clarify my thinking</button>
      <button type="button" onclick="creativeAssist('critique')">Critique this stage</button>
      <button type="button" onclick="creativeContinueAlone()">Continue on my own</button>
    </div>`;
  if(_creativeStage === 'brief'){
    return actions + _creativeFieldInputs(stage) + '<button type="button" class="creative-inline-btn" onclick="creativeSummarizeBrief()">Summarize brief</button> <button type="button" class="creative-inline-btn" onclick="creativeConfirmSummary()">Confirm summary</button>';
  }
  if(_creativeStage === 'what'){
    const checks = _creativeProject.concept_checks || {};
    const boxes = ['single_idea','plausibility','visualizability','villain'].map(key =>
      `<label><input type="checkbox" ${checks[key] ? 'checked' : ''} onchange="creativeToggleCheck('${key}', this.checked)"> ${_creativeEsc(key.replace(/_/g,' '))}</label>`
    ).join(' ');
    return actions + `<div class="creative-card"><strong>Concept checks</strong><p class="creative-help">Single idea, plausibility, visualizability, and a clear villain or false solution. This is a review panel, not a score.</p><div>${boxes}</div></div>` + _creativeFieldInputs(stage);
  }
  if(_creativeStage === 'review') return _creativeReviewMarkup();
  return actions + _creativeFieldInputs(stage);
}

function _creativeFieldInputs(stage){
  const names = CREATIVE_FIELDS[_creativeStage].slice();
  if(_creativeStage === 'copy'){
    names.sort((a,b) => (stage.fields[a].order||0) - (stage.fields[b].order||0));
  }
  return names.map(name => {
    const slot = stage.fields[name];
    const help = CREATIVE_HELP[name] ? `<p class="creative-help">${_creativeEsc(CREATIVE_HELP[name])}</p><details><summary>Examples stay copywriting examples, not evidence.</summary><p class="creative-help">Use project sources. Do not treat a framework sample line as proof.</p></details>` : '';
    const claimClass = slot.claim === 'needs_verification' || slot.regulated ? 'creative-claim needs' : 'creative-claim';
    const copyTools = _creativeStage === 'copy' ? `<label><input type="checkbox" ${slot.include ? 'checked' : ''} onchange="creativeToggleInclude('${name}', this.checked)"> Include</label> <button type="button" class="creative-inline-btn" onclick="creativeNudgeOrder('${name}', -1)">Up</button> <button type="button" class="creative-inline-btn" onclick="creativeNudgeOrder('${name}', 1)">Down</button> <button type="button" class="creative-inline-btn" onclick="creativeMarkVerification('${name}')">Needs source/verification</button>` : '';
    return `<div class="creative-field" data-field="${name}">
      <label>${_creativeEsc(_creativeLabel(name))} <span class="${claimClass}">${_creativeEsc(slot.claim || 'user_approved')}${slot.regulated ? ' · needs verification' : ''}</span></label>
      ${help}
      ${copyTools}
      <textarea data-creative-field="${name}" rows="${name.startsWith('summary_') ? 3 : 2}" oninput="creativeScheduleSave('${name}')">${_creativeEsc(slot.text || '')}</textarea>
      <div class="creative-proposals" data-proposals="${name}"></div>
    </div>`;
  }).join('');
}

function _creativeRenderAssistantCards(){
  const body = document.getElementById('creativeAssistantBody');
  if(!body || !_creativeProject) return;
  const stage = _creativeProject.stages[_creativeStage];
  const cards = [];
  Object.entries(stage.fields || {}).forEach(([field, slot]) => {
    (slot.proposals || []).forEach(proposal => {
      if(proposal.status === 'dismissed' || proposal.status === 'accepted' || proposal.status === 'edited_accepted') return;
      cards.push(`<article class="creative-card" data-proposal="${_creativeEsc(proposal.id)}">
        <div><strong>${_creativeEsc(field)}</strong> · ${_creativeEsc(proposal.status)}${proposal.exploratory ? ' · exploratory' : ''}</div>
        <p>${_creativeEsc(proposal.revised_text || proposal.text)}</p>
        ${proposal.discussion ? `<p class="creative-help">${_creativeEsc(proposal.discussion)}</p>` : ''}
        <div class="creative-actions">
          <button type="button" onclick="creativeProposalAction('${proposal.id}','accept')">Use</button>
          <button type="button" onclick="creativeEditProposal('${proposal.id}')">Edit</button>
          <button type="button" onclick="creativeProposalAction('${proposal.id}','alternative')">Save alternative</button>
          <button type="button" onclick="creativeProposalAction('${proposal.id}','dismiss')">Dismiss</button>
        </div>
      </article>`);
    });
  });
  body.innerHTML = cards.join('') || '<p class="creative-help">No open proposals on this stage.</p>';
  if(cards.length) _creativeAssistantOpen = true;
  const aside = document.getElementById('creativeAssistant');
  if(aside) aside.classList.toggle('collapsed', !_creativeAssistantOpen);
}

function creativeScheduleSave(field){
  _creativeDirty = true;
  _creativeSaveState = 'Saving…';
  const label = document.getElementById('creativeSaveState');
  if(label){ label.textContent = 'Saving…'; label.classList.remove('failed'); }
  clearTimeout(_creativeTimers[field]);
  _creativeTimers[field] = setTimeout(() => creativeSaveField(field), 450);
}

async function creativeSaveField(field){
  if(!_creativeProject) return;
  const input = document.querySelector(`[data-creative-field="${field}"]`);
  if(!input) return;
  try{
    const result = await api('/api/creative-studio/projects/' + _creativeProject.id + '/fields', {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({stage:_creativeStage, field, text:input.value, author:'user'}),
    });
    _creativeSaveState = 'Saved';
    _creativeDirty = false;
    const label = document.getElementById('creativeSaveState');
    if(label) label.textContent = 'Saved';
    if(result.review_recommended && result.review_recommended.length && typeof showToast === 'function'){
      showToast('Later stages marked Review recommended', 2200);
    }
    await creativeReloadQuiet();
  }catch(err){
    _creativeSaveState = 'Save failed';
    const label = document.getElementById('creativeSaveState');
    if(label){ label.textContent = 'Save failed'; label.classList.add('failed'); }
  }
}

async function creativeRetrySave(){
  const dirty = document.querySelector('[data-creative-field]');
  if(dirty) await creativeSaveField(dirty.getAttribute('data-creative-field'));
}

async function creativeReloadQuiet(){
  if(!_creativeProject || _creativeDirty) return;
  const fresh = await api('/api/creative-studio/projects/' + _creativeProject.id);
  _creativeProject = fresh;
  const focused = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-creative-field');
  if(focused){
    _creativeRenderAssistantCards();
    return;
  }
  creativeRenderWorkspace();
}

function creativeContinueAlone(){
  _creativeAssistantOpen = false;
  const aside = document.getElementById('creativeAssistant');
  if(aside) aside.classList.add('collapsed');
}

async function creativeAssist(action){
  if(!_creativeProject) return;
  _creativeAssistantOpen = true;
  const result = await api('/api/creative-studio/assist', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({project_id:_creativeProject.id, stage:_creativeStage, action}),
  });
  const box = document.getElementById('msg');
  if(box){
    box.value = result.message;
    if(typeof send === 'function') send();
  }
  const body = document.getElementById('creativeAssistantBody');
  if(body){
    const note = document.createElement('p');
    note.className = 'creative-help';
    note.textContent = 'Asked chat to ' + action + ' this stage. Proposals show up here after they are saved. Nothing is selected for you.';
    body.prepend(note);
  }
  const aside = document.getElementById('creativeAssistant');
  if(aside) aside.classList.remove('collapsed');
}

function creativeSummarizeBrief(){
  if(!_creativeProject) return;
  const box = document.getElementById('msg');
  if(!box) return;
  box.value = `Creative Studio project ${_creativeProject.id} (${_creativeProject.name}). Read the brief with get_creative_project. Then update_creative_field for summary_provided, summary_assumptions, and summary_missing. Do not copy assumptions into product facts or any other field. Label assumptions as assumptions.`;
  if(typeof send === 'function') send();
  _creativeAssistantOpen = true;
}

async function creativeConfirmSummary(){
  const read = name => {
    const node = document.querySelector(`[data-creative-field="${name}"]`);
    return node ? node.value : '';
  };
  await api('/api/creative-studio/projects/' + _creativeProject.id + '/summary', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      provided: read('summary_provided'),
      assumptions: read('summary_assumptions'),
      missing: read('summary_missing'),
    }),
  });
  _creativeSaveState = 'Saved';
  await creativeReloadQuiet();
}

async function creativeProposalAction(proposalId, action){
  await api(`/api/creative-studio/projects/${_creativeProject.id}/proposals/${proposalId}`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action}),
  });
  await creativeOpenProject(_creativeProject.id, {keepStage:true});
}

async function creativeEditProposal(proposalId){
  const text = window.prompt('Edit this proposal, then save it as the selected answer');
  if(!text) return;
  await api(`/api/creative-studio/projects/${_creativeProject.id}/proposals/${proposalId}`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'edit_accept', text}),
  });
  await creativeOpenProject(_creativeProject.id, {keepStage:true});
}

async function creativeToggleCheck(key, value){
  const checks = Object.assign({}, _creativeProject.concept_checks || {});
  checks[key] = value;
  await api('/api/creative-studio/projects/' + _creativeProject.id + '/checks', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({checks}),
  });
}

async function creativeToggleInclude(field, include){
  const slot = _creativeProject.stages.copy.fields[field];
  await api('/api/creative-studio/projects/' + _creativeProject.id + '/fields', {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({stage:'copy', field, text:slot.text || '', include}),
  });
  await creativeReloadQuiet();
}

async function creativeNudgeOrder(field, delta){
  const fields = _creativeProject.stages.copy.fields;
  const order = (fields[field].order || 0) + delta;
  await api('/api/creative-studio/projects/' + _creativeProject.id + '/fields', {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({stage:'copy', field, text:fields[field].text || '', order}),
  });
  await creativeOpenProject(_creativeProject.id, {keepStage:true});
}

async function creativeMarkVerification(field){
  const slot = _creativeProject.stages[_creativeStage].fields[field];
  await api('/api/creative-studio/projects/' + _creativeProject.id + '/fields', {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({stage:_creativeStage, field, text:slot.text || '', claim:'needs_verification'}),
  });
  await creativeOpenProject(_creativeProject.id, {keepStage:true});
}

async function creativeMarkStage(){
  const status = window.prompt('Stage status: draft, approved, review_recommended, not_applicable', _creativeProject.stages[_creativeStage].status);
  if(!status) return;
  let reason = '';
  if(status === 'not_applicable'){
    reason = window.prompt('Short reason') || '';
    if(!reason.trim()) return;
  }
  await api('/api/creative-studio/projects/' + _creativeProject.id + '/stage', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({stage:_creativeStage, status, reason}),
  });
  await creativeOpenProject(_creativeProject.id, {keepStage:true});
}

function _creativeReviewMarkup(){
  const options = _creativeProject.export_options || {};
  const groups = CREATIVE_STAGES.filter(stage => stage.id !== 'review').map(stage => {
    const row = _creativeProject.stages[stage.id];
    const fields = Object.entries(row.fields).map(([name, slot]) => {
      const alts = (slot.proposals || []).filter(item => item.status === 'alternative');
      return `<div class="creative-field"><strong>${_creativeEsc(_creativeLabel(name))}</strong>
        <span class="creative-claim">${_creativeEsc(slot.author || 'user')} · ${_creativeEsc(slot.claim || 'user_approved')}${slot.regulated ? ' · needs verification' : ''}</span>
        <p>${_creativeEsc(slot.text || '')}</p>
        ${alts.length ? `<p class="creative-help">${alts.length} saved alternative(s)</p>` : ''}
      </div>`;
    }).join('');
    return `<section><h3>${stage.label}</h3><p class="creative-help">${_creativeEsc(row.status)}</p>${fields}</section>`;
  }).join('');
  return `<label><input type="checkbox" id="creativeIncludeAlts" ${options.include_alternatives ? 'checked' : ''} onchange="creativeSetExportFlag(this.checked)"> Include saved alternatives</label>
    <div id="creativeReviewBody">${groups}</div>
    <pre id="creativeExportPreview" class="creative-card"></pre>
    <button type="button" class="creative-inline-btn" onclick="creativeExport()">Refresh Markdown</button>
    <button type="button" class="creative-inline-btn" onclick="creativeCopyExport()">Copy to clipboard</button>`;
}

async function creativeSetExportFlag(include){
  await api('/api/creative-studio/projects/' + _creativeProject.id + '/export-options', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({include_alternatives: include}),
  });
  await creativeExport();
}

async function creativeExport(){
  if(!_creativeProject) return;
  const include = document.getElementById('creativeIncludeAlts');
  const flag = include && include.checked ? '1' : '0';
  const data = await api(`/api/creative-studio/projects/${_creativeProject.id}/export?include_alternatives=${flag}`);
  let preview = document.getElementById('creativeExportPreview');
  if(!preview){
    creativeSetStage('review');
    preview = document.getElementById('creativeExportPreview');
  }
  if(preview) preview.textContent = data.markdown || '';
  window._creativeLastExport = data.markdown || '';
  return data;
}

async function creativeCopyExport(){
  const data = await creativeExport();
  const text = (data && data.markdown) || window._creativeLastExport || '';
  if(navigator.clipboard && navigator.clipboard.writeText){
    await navigator.clipboard.writeText(text);
    if(typeof showToast === 'function') showToast('Copied creative brief', 1600);
  }
}

function _creativeStartPoll(){
  if(_creativePoll) return;
  _creativePoll = setInterval(() => {
    if(typeof _currentPanel !== 'undefined' && _currentPanel === 'creative' && _creativeProject && !_creativeDirty){
      creativeReloadQuiet().catch(() => {});
    }
  }, 4000);
}
