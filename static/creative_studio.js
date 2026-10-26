/* Creative Studio — stage workspace over /api/creative-studio. */
const CREATIVE_STAGES = [
  {id:'who', label:'Who', title:'Who — Outcome, Demographic, Facet, Segment'},
  {id:'what', label:'What', title:'What — Concept, Angle, UMP, UMS, Mechanism'},
  {id:'hook', label:'Hook', title:'How: Hook and Format'},
  {id:'casts', label:'Creative', title:'Creative (CASTS) — Conceit, Actor(s), Style, Terrain, Setup'},
  {id:'copy', label:'Copy', title:'Copy Blocks — Pain, Promise, Proof, Curiosity, Constraints, Conditions'},
];
const CREATIVE_STATUS = {
  not_started:'Empty',
  draft:'Draft',
  approved:'Approved',
  review_recommended:'Needs review',
  not_applicable:'Skipped',
};
const CREATIVE_SHORT = new Set(['outcome','demographic','facet','segment','concept','angle','ump','ums','hook_type','format','actors','style','terrain']);
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
let _creativeStage = 'who';
let _creativeChatOpen = true;
let _creativeFocusField = '';
let _creativeChatWidth = 340;
let _creativeChatError = '';
let _creativeChatBusy = false;
let _creativeExportOpen = false;
let _creativeSaveState = 'Saved';
let _creativeTimers = {};
let _creativePoll = null;
let _creativeAssistantOpen = false;
let _creativeDirty = false;
let _creativeCreating = false;
let _creativeOpenDetails = [];
let _creativeCatalog = [];
let _creativeProductMatches = [];

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
    root.innerHTML = '<div class="creative-list-empty">No creatives yet. <button type="button" class="creative-inline-btn" onclick="creativeNewProject()">New creative</button></div>';
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

async function creativeNewProject(){
  _creativeCreating = true;
  _creativeProject = null;
  creativeRenderWorkspace();
  try{
    const data = await api('/api/creative-studio/products');
    _creativeCatalog = data.products || [];
  }catch(_){
    _creativeCatalog = [];
  }
  if(!_creativeCreating) return;
  creativeRenderWorkspace();
  creativeFilterProducts();
  const name = document.getElementById('creativeCreateName');
  if(name) name.focus();
}

function creativeCancelCreate(){
  _creativeCreating = false;
  creativeRenderWorkspace();
}

function creativeFilterProducts(){
  const input = document.getElementById('creativeCreateProduct');
  const list = document.getElementById('creativeProductOptions');
  if(!input || !list) return;
  const query = input.value.trim().toLowerCase();
  _creativeProductMatches = _creativeCatalog.filter(item => !query || item.name.toLowerCase().includes(query)).slice(0, 6);
  const selected = (input.dataset.source || '').trim();
  list.hidden = _creativeProductMatches.length === 0;
  list.innerHTML = _creativeProductMatches.map((item, index) => {
    const on = selected && selected === (item.source || '') ? ' selected' : '';
    return `<button type="button" class="creative-product-option${on}" onmousedown="creativePickProductIndex(${index}); return false;"><span>${_creativeEsc(item.name)}</span><small>${_creativeEsc(item.kind || 'notes')}</small></button>`;
  }).join('');
}

function creativePickProductIndex(index){
  const item = (_creativeProductMatches || [])[index];
  if(!item) return;
  const input = document.getElementById('creativeCreateProduct');
  if(input){
    input.value = item.name;
    input.dataset.source = item.source || '';
  }
  creativeFilterProducts();
}

async function creativeSubmitCreate(){
  const form = document.getElementById('creativeCreateForm');
  if(!form) return;
  const name = (form.elements.name.value || '').trim();
  const error = document.getElementById('creativeCreateError');
  if(!name){
    if(error) error.textContent = 'A creative name is required.';
    return;
  }
  const productInput = document.getElementById('creativeCreateProduct');
  const product = (productInput && productInput.value || '').trim();
  const known = _creativeCatalog.find(item => item.name.toLowerCase() === product.toLowerCase());
  const productSource = (known && known.source) || (productInput && productInput.dataset.source) || '';
  const submit = form.querySelector('[type="submit"]');
  if(submit) submit.disabled = true;
  try{
    const project = await api('/api/creative-studio/projects', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name, product, product_source: productSource}),
    });
    _creativeCreating = false;
    _creativeStage = 'who';
    _creativeSaveState = 'Saved';
    await creativeOpenProject(project.id);
  }catch(err){
    if(submit) submit.disabled = false;
    if(error) error.textContent = err && err.message ? err.message : 'Could not create the creative.';
  }
}

async function creativeOpenProject(id, opts){
  const project = await api('/api/creative-studio/projects/' + id);
  _creativeProject = project;
  if(!(opts && opts.keepStage) || !CREATIVE_STAGES.some(stage => stage.id === _creativeStage)) _creativeStage = 'who';
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
  const lead = _creativeCatalog.length
    ? 'Hermes already knows these products. Choose one, or type a name. The notes stay where they are.'
    : 'Type the product name. When product notes show up in your vault, wiki, or skills, they will appear here to choose from.';
  return `<form id="creativeCreateForm" class="creative-wizard" onsubmit="creativeSubmitCreate(); return false;">
    <div class="creative-wizard-body">
      <p class="creative-wizard-kicker">New creative</p>
      <h2>Name it and choose a product</h2>
      <p class="creative-wizard-lead">${lead}</p>
      <label for="creativeCreateName">Creative name</label>
      <input id="creativeCreateName" name="name" required maxlength="160" autocomplete="off" placeholder="Spring launch">
      <label for="creativeCreateProduct">Product</label>
      <input id="creativeCreateProduct" name="product" autocomplete="off" placeholder="Search or type a product" oninput="creativeFilterProducts()" onfocus="creativeFilterProducts()">
      <div id="creativeProductOptions" class="creative-product-options" hidden></div>
      <p id="creativeCreateError" class="creative-save failed" role="alert"></p>
    </div>
    <div class="creative-wizard-footer">
      <button type="button" class="creative-ghost" onclick="creativeCancelCreate()">Back</button>
      <button type="submit" class="creative-primary">Continue</button>
    </div>
  </form>`;
}

function _creativeStatusLabel(status){
  return CREATIVE_STATUS[status] || 'Draft';
}

function creativeSetStage(stage){
  if(!CREATIVE_STAGES.some(item => item.id === stage)) return;
  if(stage !== _creativeStage) _creativeFocusField = '';
  Object.keys(_creativeTimers).forEach(field => {
    clearTimeout(_creativeTimers[field]);
    creativeSaveField(field);
  });
  _creativeStage = stage;
  creativeRenderWorkspace();
  const tab = document.getElementById('creativeTab-' + stage);
  if(tab) tab.focus();
}

function creativeStageKey(event){
  const keys = ['ArrowRight','ArrowLeft','Home','End'];
  if(!keys.includes(event.key)) return;
  event.preventDefault();
  const index = CREATIVE_STAGES.findIndex(stage => stage.id === _creativeStage);
  let next = index;
  if(event.key === 'ArrowRight') next = (index + 1) % CREATIVE_STAGES.length;
  if(event.key === 'ArrowLeft') next = (index - 1 + CREATIVE_STAGES.length) % CREATIVE_STAGES.length;
  if(event.key === 'Home') next = 0;
  if(event.key === 'End') next = CREATIVE_STAGES.length - 1;
  creativeSetStage(CREATIVE_STAGES[next].id);
}

function creativeMoveStage(delta){
  const index = CREATIVE_STAGES.findIndex(stage => stage.id === _creativeStage);
  const next = CREATIVE_STAGES[index + delta];
  if(!next) return;
  _creativeStage = next.id;
  creativeRenderWorkspace();
}

function _creativeDetailKey(node){
  const field = node.closest && node.closest('[data-field]');
  const summary = node.querySelector && node.querySelector('summary');
  if(!field || !summary) return '';
  return field.getAttribute('data-field') + '|' + summary.textContent;
}

function _creativeRememberOpenDetails(){
  const root = document.getElementById('creativeFields');
  if(!root) return;
  _creativeOpenDetails = Array.from(root.querySelectorAll('details[open]')).map(_creativeDetailKey).filter(Boolean);
}

function _creativeRestoreOpenDetails(){
  const root = document.getElementById('creativeFields');
  if(!root || !_creativeOpenDetails.length) return;
  const open = new Set(_creativeOpenDetails);
  root.querySelectorAll('details').forEach(node => {
    if(open.has(_creativeDetailKey(node))) node.open = true;
  });
}

function creativeRenderWorkspace(){
  const root = document.getElementById('creativeWorkspace');
  if(!root) return;
  closeCreativeModelDropdown();
  _creativeRememberOpenDetails();
  if(_creativeCreating){
    root.innerHTML = _creativeCreateMarkup();
    return;
  }
  if(!_creativeProject){
    root.innerHTML = '<div class="main-view-empty"><div class="main-view-empty-title">Creative Studio</div><div class="main-view-empty-sub">Start a creative with a name and a product. Hermes already has the product notes, so this step only records which one you mean.</div><button type="button" class="creative-inline-btn" onclick="creativeNewProject()">New creative</button></div>';
    return;
  }
  const project = _creativeProject;
  const stage = project.stages[_creativeStage] || {fields:{}, status:'not_started'};
  const chatClass = _creativeChatOpen ? 'creative-chat' : 'creative-chat collapsed';
  root.innerHTML = `
    <div class="creative-header">
      <div class="creative-project-chip">
        <svg class="creative-chip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 1 1 18 0z"/><path d="M12 8v8M8 12h8"/></svg>
        <span class="creative-project-name">${_creativeEsc(project.name)}</span>
        <span class="creative-save ${_creativeSaveState === 'Save failed' ? 'failed' : ''}" id="creativeSaveState">${_creativeEsc(_creativeSaveState)}</span>
        <button type="button" class="creative-icon-btn" aria-label="Project actions" aria-expanded="false" onclick="creativeToggleMenu(event)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
        </button>
        <div class="creative-menu" id="creativeProjectMenu" hidden>
          <button type="button" onclick="creativeRenameProject('${project.id}')">Rename</button>
          <button type="button" onclick="creativeDuplicateProject('${project.id}')">Duplicate</button>
          <button type="button" onclick="creativeToggleExport()">Export</button>
          ${_creativeSaveState === 'Save failed' ? '<button type="button" onclick="creativeRetrySave()">Retry save</button>' : ''}
          <button type="button" class="creative-menu-danger" onclick="creativeDeleteProject('${project.id}')">Delete</button>
        </div>
      </div>
      <div class="creative-stagebar" role="tablist" aria-label="Framework stages" onkeydown="creativeStageKey(event)">${CREATIVE_STAGES.map(item => {
      const status = (project.stages[item.id] && project.stages[item.id].status) || 'not_started';
      const selected = item.id === _creativeStage;
      return `<button type="button" role="tab" id="creativeTab-${item.id}" class="creative-stage-tab${selected ? ' active' : ''}" aria-selected="${selected ? 'true' : 'false'}" tabindex="${selected ? '0' : '-1'}" title="${_creativeEsc(item.title)}" onclick="creativeSetStage('${item.id}')"><span>${item.label}</span><i class="creative-dot creative-dot-${_creativeEsc(status)}" title="${_creativeEsc(_creativeStatusLabel(status))}"></i></button>`;
    }).join('')}</div>
      <div class="creative-header-tools">
        <button type="button" class="creative-icon-btn${_creativeChatOpen ? ' on' : ''}" aria-label="${_creativeChatOpen ? 'Hide chat' : 'Show chat'}" aria-pressed="${_creativeChatOpen ? 'true' : 'false'}" onclick="creativeToggleChat()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg>
        </button>
      </div>
    </div>
    <div class="creative-body${_creativeChatOpen ? '' : ' chat-closed'}" style="--creative-chat-width:${_creativeChatWidth}px">
      <div class="creative-fields" id="creativeFields" role="tabpanel" aria-labelledby="creativeTab-${_creativeStage}">${_creativeStageMarkup(stage)}</div>
      <div class="creative-chat-resizer" role="separator" aria-orientation="vertical" aria-label="Resize chat" onpointerdown="creativeChatResizeStart(event)"></div>
      <aside class="${chatClass}" id="creativeAssistant" aria-label="Project chat">
        ${_creativeChatMarkup()}
      </aside>
    </div>`;
  const log = document.getElementById('creativeChatLog');
  if(log) log.scrollTop = log.scrollHeight;
  _creativeRestoreOpenDetails();
  _creativeMountModelPicker();
  const fields = document.getElementById('creativeFields');
  if(fields && !fields.dataset.detailsBound){
    fields.dataset.detailsBound = '1';
    fields.addEventListener('toggle', event => {
      if(event.target && event.target.tagName === 'DETAILS') _creativeRememberOpenDetails();
    }, true);
  }
}

function creativeToggleMenu(event){
  if(event) event.stopPropagation();
  const menu = document.getElementById('creativeProjectMenu');
  const button = event && event.currentTarget;
  if(!menu) return;
  const open = menu.hidden;
  menu.hidden = !open;
  if(button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
  if(open){
    const close = (ev) => {
      if(menu.contains(ev.target) || (button && button.contains(ev.target))) return;
      menu.hidden = true;
      if(button) button.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', close);
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }
}

function creativeToggleChat(){
  _creativeChatOpen = !_creativeChatOpen;
  creativeRenderWorkspace();
}

function creativeChatResizeStart(event){
  if(window.matchMedia('(max-width: 860px)').matches) return;
  event.preventDefault();
  const startX = event.clientX;
  const startW = _creativeChatWidth;
  function move(ev){
    _creativeChatWidth = Math.max(260, Math.min(560, startW + (startX - ev.clientX)));
    const body = document.querySelector('#creativeWorkspace .creative-body');
    if(body) body.style.setProperty('--creative-chat-width', _creativeChatWidth + 'px');
  }
  function up(){
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function _creativeStageMarkup(stage){
  const meta = CREATIVE_STAGES.find(item => item.id === _creativeStage);
  const status = stage.status || 'not_started';
  const options = Object.keys(CREATIVE_STATUS).map(key =>
    `<option value="${key}" ${key === status ? 'selected' : ''}>${CREATIVE_STATUS[key]}</option>`
  ).join('');
  let extra = '';
  if(_creativeStage === 'what'){
    const checks = _creativeProject.concept_checks || {};
    const boxes = ['single_idea','plausibility','visualizability','villain'].map(key =>
      `<label><input type="checkbox" ${checks[key] ? 'checked' : ''} onchange="creativeToggleCheck('${key}', this.checked)"> ${_creativeEsc(key.replace(/_/g,' '))}</label>`
    ).join('');
    extra = `<div class="creative-card"><strong>Concept checks</strong><p class="creative-help">Single idea, plausibility, visualizability, and a clear villain or false solution.</p><div class="creative-checks">${boxes}</div></div>`;
  }
  const exportBox = _creativeExportOpen ? `<div class="creative-card" id="creativeExportCard"><pre id="creativeExportPreview"></pre><button type="button" class="creative-inline-btn" onclick="creativeCopyExport()">Copy Markdown</button></div>` : '';
  return `<div class="creative-stage-head"><div><h2>${_creativeEsc(meta ? meta.title : '')}</h2><p class="creative-help">Ask Hermes to suggest empty fields or revise filled ones. Nothing is selected for you until you replace a field.</p></div><label class="creative-status-select">Stage <select aria-label="Stage status" onchange="creativeMarkStage(this.value)">${options}</select></label></div>${exportBox}${extra}${_creativeFieldInputs(stage)}`;
}

function creativeIsolateField(field){
  _creativeFocusField = _creativeFocusField === field ? '' : field;
  _creativeChatOpen = true;
  creativeRenderWorkspace();
}

function _creativeChatMarkup(){
  const project = _creativeProject;
  const focus = _creativeFocusField;
  const messages = (project.chat || []).filter(item => {
    if(!item || !item.text) return false;
    if(!focus) return true;
    return item.field === focus;
  });
  const stageMeta = CREATIVE_STAGES.find(item => item.id === _creativeStage);
  const focusLabel = focus ? _creativeLabel(focus) : '';
  const history = messages.length ? messages.map(item => {
    return `<article class="creative-msg creative-msg-${_creativeEsc(item.role || 'assistant')}"><p>${_creativeEsc(item.text)}</p>${item.role === 'assistant' ? _creativeMessageSuggestions(item) : ''}</article>`;
  }).join('') : `<p class="creative-help" id="creativeChatEmpty">${focus ? `Nothing on ${ _creativeEsc(focusLabel) } yet.` : 'Ask Hermes to suggest the empty fields, or to revise the ones you already filled.'}</p>`;
  const pending = _creativeOpenProposals();
  const contextLine = focus
    ? `${project.name} · ${focusLabel}`
    : `${project.name} · ${stageMeta ? stageMeta.label : _creativeStage}`;
  const clear = focus ? `<button type="button" class="creative-text-btn" onclick="creativeIsolateField('${focus}')">Leave field</button>` : '';
  const scope = focus ? '' : `<button type="button" class="creative-scope-chip" id="creativeChatScope" aria-pressed="false" onclick="creativeToggleProjectScope(event)">Whole project</button>`;
  const placeholder = focus ? `Revise ${_creativeEsc(focusLabel)}` : 'Ask Hermes…';
  const modelPicker = `<div class="composer-model-wrap">
      <button class="composer-model-chip" id="creativeModelChip" type="button" onclick="toggleCreativeModelDropdown(event)" title="Conversation model" aria-label="Conversation model" aria-haspopup="listbox" aria-expanded="false" aria-controls="creativeModelDropdown">
        <span class="composer-model-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg></span>
        <span class="composer-model-label" id="creativeModelLabel">Model</span>
        <span class="composer-model-chevron" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
      </button>
      <select id="creativeModelSelect" class="composer-model-select" title="Conversation model" aria-hidden="true" tabindex="-1"></select>
      <div class="model-dropdown" id="creativeModelDropdown"></div>
    </div>`;
  return `<header class="creative-chat-head"><p>${_creativeEsc(contextLine)}</p>${clear}</header>
    <div class="creative-chat-log" id="creativeChatLog">${_creativeChatError ? `<p class="creative-save failed" role="alert">${_creativeEsc(_creativeChatError)}</p>` : ''}${history}${pending}</div>
    <form class="composer-wrap creative-composer" onsubmit="creativeSendChat(); return false;">
      <div class="composer-box" id="creativeComposerBox">
        <textarea id="creativeChatInput" dir="auto" rows="1" enterkeyhint="enter" placeholder="${placeholder}" onkeydown="creativeChatKey(event)" ${_creativeChatBusy ? 'disabled' : ''}></textarea>
        <div class="composer-footer">
          <div class="composer-left">${modelPicker}${scope}</div>
          <div class="composer-right">
            <button type="submit" class="send-btn" aria-label="Send" ${_creativeChatBusy ? 'disabled' : ''}>
              <svg viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M0.93 4.775L5.00143 0.5M5.00143 0.5L9.07286 4.775M5.00143 0.5V10" stroke="currentColor" stroke-width="0.7" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>
    </form>`;
}

function creativeToggleProjectScope(event){
  event.preventDefault();
  const button = event.currentTarget;
  const on = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function creativeChatKey(event){
  if(event.key === 'Enter' && !event.shiftKey){
    event.preventDefault();
    creativeSendChat();
  }
}

function _creativeLiveProposal(proposalId){
  const stages = (_creativeProject && _creativeProject.stages) || {};
  for(const stage of Object.values(stages)){
    for(const slot of Object.values((stage && stage.fields) || {})){
      for(const proposal of slot.proposals || []){
        if(proposal.id === proposalId) return proposal;
      }
    }
  }
  return null;
}

function _creativeMessageSuggestions(item){
  const cards = (item.proposals || []).map(itemProposal => {
    const live = _creativeLiveProposal(itemProposal.id);
    if(live && live.status !== 'proposed' && live.status !== 'in_discussion') return '';
    const label = _creativeLabel(itemProposal.field || '');
    const previous = (itemProposal.previous || '').trim();
    const next = ((live && (live.revised_text || live.text)) || itemProposal.text || '').trim();
    const before = previous
      ? `<div class="creative-suggest-block"><span>Now</span><p>${_creativeEsc(previous)}</p></div>`
      : `<div class="creative-suggest-block"><span>Now</span><p>Empty</p></div>`;
    return `<article class="creative-suggest" data-proposal="${_creativeEsc(itemProposal.id)}">
      <div class="creative-suggest-kicker">Replace ${_creativeEsc(label)}</div>
      ${before}
      <div class="creative-suggest-block creative-suggest-next"><span>Suggestion</span><p>${_creativeEsc(next)}</p></div>
      <div class="creative-actions">
        <button type="button" class="creative-primary" onclick="creativeProposalAction('${itemProposal.id}','accept')">Replace field</button>
        <button type="button" onclick="creativeProposalAction('${itemProposal.id}','dismiss')">Dismiss</button>
      </div>
    </article>`;
  }).join('');
  return cards;
}

function _creativeOpenProposals(){
  const stage = _creativeProject.stages[_creativeStage];
  if(!stage) return '';
  const cards = [];
  Object.entries(stage.fields || {}).forEach(([field, slot]) => {
    if(_creativeFocusField && field !== _creativeFocusField) return;
    (slot.proposals || []).forEach(proposal => {
      if(proposal.status === 'dismissed' || proposal.status === 'accepted' || proposal.status === 'edited_accepted') return;
      const label = _creativeLabel(field);
      const shownInThread = (_creativeProject.chat || []).some(message =>
        (message.proposals || []).some(item => item.id === proposal.id)
      );
      if(shownInThread) return;
      cards.push(`<article class="creative-suggest" data-proposal="${_creativeEsc(proposal.id)}">
        <div class="creative-suggest-kicker">Replace ${_creativeEsc(label)}</div>
        <div class="creative-suggest-block creative-suggest-next"><span>Suggestion</span><p>${_creativeEsc(proposal.revised_text || proposal.text)}</p></div>
        <div class="creative-actions">
          <button type="button" class="creative-primary" onclick="creativeProposalAction('${proposal.id}','accept')">Replace field</button>
          <button type="button" onclick="creativeProposalAction('${proposal.id}','dismiss')">Dismiss</button>
        </div>
      </article>`);
    });
  });
  return cards.join('');
}

function _creativeFieldInputs(stage){
  const names = CREATIVE_FIELDS[_creativeStage].slice();
  if(_creativeStage === 'copy'){
    names.sort((a,b) => (stage.fields[a].order||0) - (stage.fields[b].order||0));
  }
  return names.map(name => {
    const slot = stage.fields[name];
    const help = CREATIVE_HELP[name] ? `<p class="creative-help">${_creativeEsc(CREATIVE_HELP[name])}</p><details><summary>Examples stay copywriting examples, not evidence.</summary><p class="creative-help">Use project sources. Do not treat a framework sample line as proof.</p></details>` : '';
    const claim = (slot.claim === 'needs_verification' || slot.regulated) ? '<span class="creative-claim needs">Needs source</span>' : '';
    const copyTools = _creativeStage === 'copy' ? `<div class="creative-inline-tools"><label><input type="checkbox" ${slot.include ? 'checked' : ''} onchange="creativeToggleInclude('${name}', this.checked)"> Include</label> <button type="button" class="creative-inline-btn" onclick="creativeNudgeOrder('${name}', -1)">Up</button> <button type="button" class="creative-inline-btn" onclick="creativeNudgeOrder('${name}', 1)">Down</button></div>` : '';
    const control = CREATIVE_SHORT.has(name)
      ? `<input data-creative-field="${name}" value="${_creativeEsc(slot.text || '')}" oninput="creativeScheduleSave('${name}')">`
      : `<textarea data-creative-field="${name}" rows="4" oninput="creativeScheduleSave('${name}')">${_creativeEsc(slot.text || '')}</textarea>`;
    const isolated = _creativeFocusField === name;
    return `<div class="creative-field${isolated ? ' isolated' : ''}" data-field="${name}">
      <div class="creative-field-label">
        <label>${_creativeEsc(_creativeLabel(name))} ${claim}</label>
        <button type="button" class="creative-isolate${isolated ? ' on' : ''}" aria-pressed="${isolated ? 'true' : 'false'}" onclick="creativeIsolateField('${name}')">${isolated ? 'Isolated' : 'Isolate'}</button>
      </div>
      ${help ? `<details class="creative-help-more"><summary>What does this mean?</summary>${help}</details>` : ''}
      ${copyTools}
      ${control}
    </div>`;
  }).join('');
}

let _creativeModel = '';
let _creativeModelProvider = '';
let _creativeModelDropdownHome = null;

function _creativeSyncModelChip(){
  const sel = document.getElementById('creativeModelSelect');
  const label = document.getElementById('creativeModelLabel');
  const chip = document.getElementById('creativeModelChip');
  if(!sel || !label) return;
  const opt = sel.selectedOptions && sel.selectedOptions[0];
  const text = (opt && opt.textContent) || (typeof getModelLabel === 'function' ? getModelLabel(sel.value || '') : '') || 'Model';
  label.textContent = text.trim() || 'Model';
  if(chip) chip.title = sel.value || text;
}

function _creativeRememberModel(){
  const sel = document.getElementById('creativeModelSelect');
  if(!sel || !sel.value) return;
  const state = typeof _modelStateForSelect === 'function'
    ? _modelStateForSelect(sel, sel.value)
    : {model: sel.value, model_provider: ''};
  _creativeModel = state.model || sel.value;
  _creativeModelProvider = state.model_provider || '';
}

function _creativeCopyModelOptions(){
  const source = document.getElementById('modelSelect');
  const sel = document.getElementById('creativeModelSelect');
  if(!sel) return;
  if(source && source.options.length){
    sel.innerHTML = source.innerHTML;
  }else if(typeof populateModelDropdown === 'function'){
    populateModelDropdown().then(() => {
      const fresh = document.getElementById('modelSelect');
      const target = document.getElementById('creativeModelSelect');
      if(fresh && target && fresh.options.length){
        target.innerHTML = fresh.innerHTML;
        _creativeApplyRememberedModel();
      }
    }).catch(() => {});
  }
  _creativeApplyRememberedModel();
}

function _creativeApplyRememberedModel(){
  const sel = document.getElementById('creativeModelSelect');
  const source = document.getElementById('modelSelect');
  if(!sel) return;
  const model = _creativeModel || (source && source.value) || '';
  const provider = _creativeModel ? _creativeModelProvider : '';
  if(model && typeof _applyModelToDropdown === 'function'){
    const applied = _applyModelToDropdown(model, sel, provider || null);
    if(!applied && source && source.value) sel.value = source.value;
  }else if(source && source.value){
    sel.value = source.value;
  }
  _creativeRememberModel();
  _creativeSyncModelChip();
}

function _creativeMountModelPicker(){
  _creativeCopyModelOptions();
}

function _creativeRestoreModelDropdown(){
  const dd = document.getElementById('creativeModelDropdown');
  if(!dd) return;
  dd.classList.remove('open', 'model-dropdown--floating');
  dd.removeAttribute('style');
  const home = _creativeModelDropdownHome;
  if(home && home.parent && home.parent.isConnected && dd.parentNode !== home.parent){
    home.parent.insertBefore(dd, home.next);
  }
  _creativeModelDropdownHome = null;
}

function closeCreativeModelDropdown(){
  const chip = document.getElementById('creativeModelChip');
  _creativeRestoreModelDropdown();
  if(chip){
    chip.classList.remove('active');
    chip.setAttribute('aria-expanded', 'false');
  }
}

function _creativePositionModelDropdown(){
  const dd = document.getElementById('creativeModelDropdown');
  const chip = document.getElementById('creativeModelChip');
  if(!dd || !chip) return;
  if(!_creativeModelDropdownHome){
    _creativeModelDropdownHome = {parent: dd.parentNode, next: dd.nextSibling};
  }
  if(dd.parentNode !== document.body) document.body.appendChild(dd);
  dd.classList.add('model-dropdown--floating');
  const rect = chip.getBoundingClientRect();
  const margin = 8;
  const width = Math.min(420, Math.max(240, window.innerWidth - margin * 2));
  let left = rect.left;
  if(left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin);
  dd.style.left = left + 'px';
  dd.style.width = width + 'px';
  dd.style.right = 'auto';
  dd.style.bottom = 'auto';
  const spaceAbove = Math.max(160, rect.top - margin - 6);
  dd.style.maxHeight = Math.min(spaceAbove, Math.round(window.innerHeight * 0.7)) + 'px';
  const height = dd.offsetHeight || 280;
  dd.style.top = Math.max(margin, rect.top - height - 6) + 'px';
}

function selectCreativeModelFromDropdown(value, preferredProviderId){
  const sel = document.getElementById('creativeModelSelect');
  if(!sel){ closeCreativeModelDropdown(); return; }
  const provider = String(preferredProviderId || '').trim() || null;
  if(typeof _ensureModelOptionInDropdown === 'function'){
    _ensureModelOptionInDropdown(value, sel, provider);
  }else{
    sel.value = value;
  }
  _creativeRememberModel();
  if(provider) _creativeModelProvider = provider;
  _creativeSyncModelChip();
  closeCreativeModelDropdown();
}

function toggleCreativeModelDropdown(event){
  if(event){ event.preventDefault(); event.stopPropagation(); }
  const dd = document.getElementById('creativeModelDropdown');
  const chip = document.getElementById('creativeModelChip');
  const sel = document.getElementById('creativeModelSelect');
  if(!dd || !chip || !sel) return;
  if(dd.classList.contains('open')){ closeCreativeModelDropdown(); return; }
  if(typeof closeModelDropdown === 'function') closeModelDropdown();
  if(typeof closeSettingsModelDropdown === 'function') closeSettingsModelDropdown();
  _creativeCopyModelOptions();
  if(typeof renderModelDropdown !== 'function') return;
  renderModelDropdown({
    dropdownId: 'creativeModelDropdown',
    selectId: 'creativeModelSelect',
    forceOpenKey: 'creative',
    closeDropdown: closeCreativeModelDropdown,
    selectModel: selectCreativeModelFromDropdown,
    scopeNoteText: 'Used for Creative Studio chat replies.',
  });
  dd.classList.add('open');
  chip.classList.add('active');
  chip.setAttribute('aria-expanded', 'true');
  _creativePositionModelDropdown();
  const activeRow = dd.querySelector('.model-opt.active');
  if(activeRow && typeof activeRow.scrollIntoView === 'function') activeRow.scrollIntoView({block: 'nearest'});
}

document.addEventListener('click', event => {
  if(event.target.closest('#creativeModelChip') || event.target.closest('#creativeModelDropdown')) return;
  closeCreativeModelDropdown();
});

async function creativeSendChat(){
  if(!_creativeProject || _creativeChatBusy) return;
  const input = document.getElementById('creativeChatInput');
  const text = input ? input.value.trim() : '';
  if(!text) return;
  const scopeBox = document.getElementById('creativeChatScope');
  _creativeRememberModel();
  const model = _creativeModel;
  const modelProvider = _creativeModelProvider;
  _creativeChatBusy = true;
  _creativeChatError = '';
  creativeRenderWorkspace();
  try{
    const result = await api('/api/creative-studio/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        project_id:_creativeProject.id,
        stage:_creativeStage,
        text,
        scope: _creativeFocusField ? 'field' : (scopeBox && scopeBox.getAttribute('aria-pressed') === 'true' ? 'project' : 'stage'),
        field: _creativeFocusField || '',
        model,
        model_provider: modelProvider,
      }),
    });
    _creativeProject.chat = result.chat || _creativeProject.chat || [];
    if(result.proposals && result.proposals.length){
      await creativeReloadQuiet();
    }
  }catch(err){
    _creativeChatError = err && err.message ? err.message : 'Could not send the message.';
  }finally{
    _creativeChatBusy = false;
    creativeRenderWorkspace();
  }
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
  const active = document.activeElement;
  const focused = active && active.getAttribute && active.getAttribute('data-creative-field');
  if(focused || (active && active.id === 'creativeChatInput')) return;
  creativeRenderWorkspace();
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

async function creativeMarkStage(status){
  if(!status) return;
  let reason = '';
  if(status === 'not_applicable'){
    reason = window.prompt('Short reason for skipping this stage') || '';
    if(!reason.trim()) return;
  }
  await api('/api/creative-studio/projects/' + _creativeProject.id + '/stage', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({stage:_creativeStage, status, reason}),
  });
  await creativeOpenProject(_creativeProject.id, {keepStage:true});
}

function creativeToggleExport(){
  _creativeExportOpen = !_creativeExportOpen;
  creativeRenderWorkspace();
  if(_creativeExportOpen) creativeExport();
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
    _creativeExportOpen = true;
    creativeRenderWorkspace();
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
