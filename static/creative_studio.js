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
  concept:'One idea, not the feature list: the false belief colliding with the real mechanism. One sentence, showable, with a villain that is not the customer.',
  angle:'The point of view: a false solution, the root-cause mechanism, us vs them, a daily moment, a counter-intuitive warning, or a functional before/after.',
  ump:'Why the problem actually happens. Keep this separate from the solution.',
  ums:'How this product physically fixes that fault. Keep this separate from the problem.',
  mechanism:'UMP plus UMS: how the product produces the outcome. Unsupported claims stay labeled Needs source/verification.',
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
let _creativeAgentLog = [];
let _creativeAgentStream = null;
let _creativeExportOpen = false;
let _creativeSaveState = 'Saved';
let _creativeTimers = {};
let _creativePoll = null;
let _creativeAssistantOpen = false;
let _creativeDirty = false;
let _creativeCreating = false;
let _creativeOpenDetails = [];
let _creativePaintedLog = '';
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
    if(error) error.textContent = 'A creative name is required.';
    return;
  }
  const productInput = document.getElementById('creativeCreateProduct');
  const product = (productInput && productInput.value || '').trim();
  const submit = form.querySelector('[type="submit"]');
  if(submit) submit.disabled = true;
  try{
    const project = await api('/api/creative-studio/projects', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name, product}),
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
  await _creativeLoadAgentTranscript();
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
  return `<form id="creativeCreateForm" class="creative-wizard" onsubmit="creativeSubmitCreate(); return false;">
    <div class="creative-wizard-body">
      <p class="creative-wizard-kicker">New creative</p>
      <h2>Name it and name the product</h2>
      <p class="creative-wizard-lead">Type the product name. Every chat in this creative includes that name, and Hermes looks the product up the way it already knows it.</p>
      <label for="creativeCreateName">Creative name</label>
      <input id="creativeCreateName" name="name" dir="auto" required maxlength="160" autocomplete="off" placeholder="Spring launch">
      <label for="creativeCreateProduct">Product</label>
      <input id="creativeCreateProduct" name="product" dir="auto" autocomplete="off" placeholder="Product name">
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
  if(log){
    _creativePaintedLog = _creativeChatLogBody(_creativeChatHistory(), _creativeOpenProposals());
    log.scrollTop = log.scrollHeight;
  }
  const paintedFields = document.getElementById('creativeFields');
  if(paintedFields && _creativeProject && _creativeProject.stages){
    paintedFields.dataset.signature = _creativeFieldSignature(_creativeProject.stages[_creativeStage] || {fields:{}});
  }
  const paintedTabs = document.querySelector('#creativeAssistant .creative-chat-tabs');
  if(paintedTabs) paintedTabs.dataset.signature = _creativeTabSignature();
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
  const stageMeta = CREATIVE_STAGES.find(item => item.id === _creativeStage);
  const focusLabel = focus ? _creativeLabel(focus) : '';
  const history = _creativeChatHistory();
  const pending = _creativeOpenProposals();
  const contextLine = focus
    ? `${project.name} · ${focusLabel}`
    : `${project.name} · ${stageMeta ? stageMeta.label : _creativeStage}`;
  const clear = focus ? `<button type="button" class="creative-text-btn" onclick="creativeIsolateField('${focus}')">Leave field</button>` : '';
  const scope = focus ? '' : `<button type="button" class="creative-scope-chip" id="creativeChatScope" aria-pressed="false" onclick="creativeToggleProjectScope(event)">Whole project</button>`;
  const placeholder = focus ? `Revise ${_creativeEsc(focusLabel)}` : 'Ask Hermes…';
  const chevron = `<span class="composer-session-chevron" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>`;
  const modelPicker = `<div class="composer-session-wrap" id="creativeSessionWrap">
      <button class="composer-session-chip" id="creativeSessionChip" type="button" onclick="toggleCreativeSessionMenu(event)" title="Model and thinking level" aria-label="Model and thinking level" aria-haspopup="menu" aria-expanded="false" aria-controls="creativeSessionMenu">
        <span class="composer-session-model" id="creativeSessionModel">Model</span>
        <span class="composer-session-effort" id="creativeSessionEffort"></span>
        ${chevron}
      </button>
    </div>
    <select id="creativeModelSelect" class="composer-model-select" title="Conversation model" aria-hidden="true" tabindex="-1"></select>
    <span id="creativeModelLabel" hidden></span>
    <div class="composer-session-menu" id="creativeSessionMenu" role="menu" aria-label="Model, thinking, profile, and workspace" hidden>
      <div class="composer-session-row" id="creativeSessionProfileRow">
        <span class="composer-session-row-label">Profile</span>
        <span class="composer-session-row-value" id="creativeSessionProfileValue">copywriting</span>
      </div>
      <button class="composer-session-row" id="creativeSessionWorkspaceRow" type="button" role="menuitem" data-session-action="workspace" aria-haspopup="menu" aria-expanded="false" onclick="openCreativeSessionAction(event,'workspace')">
        <span class="composer-session-row-label">Workspace</span>
        <span class="composer-session-row-value" id="creativeSessionWorkspaceValue"></span>
        <span class="composer-session-row-chevron" aria-hidden="true">›</span>
      </button>
      <button class="composer-session-row" id="creativeSessionThinkingRow" type="button" role="menuitem" data-session-action="thinking" aria-haspopup="menu" aria-expanded="false" onclick="openCreativeSessionAction(event,'thinking')">
        <span class="composer-session-row-label">Thinking</span>
        <span class="composer-session-row-value" id="creativeSessionThinkingValue"></span>
        <span class="composer-session-row-chevron" aria-hidden="true">›</span>
      </button>
      <button class="composer-session-row" id="creativeSessionModelRow" type="button" role="menuitem" data-session-action="model" aria-haspopup="menu" aria-expanded="false" onclick="openCreativeSessionAction(event,'model')">
        <span class="composer-session-row-label">Model</span>
        <span class="composer-session-row-value" id="creativeSessionModelValue"></span>
        <span class="composer-session-row-chevron" aria-hidden="true">›</span>
      </button>
    </div>
    <div class="model-dropdown" id="creativeModelDropdown"></div>
    <div class="composer-reasoning-dropdown" id="creativeThinkingDropdown"></div>
    <div class="ws-dropdown" id="creativeWsDropdown" hidden aria-hidden="true"></div>`;
  return `${_creativeChatTabs()}<header class="creative-chat-head"><p id="creativeChatContext">${_creativeEsc(contextLine)}</p>${clear}</header>
    <div class="creative-chat-log" id="creativeChatLog">${_creativeChatLogBody(history, pending)}</div>
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

function _creativeChatLogBody(history, pending){
  const error = _creativeChatError ? `<p class="creative-save failed" role="alert">${_creativeEsc(_creativeChatError)}</p>` : '';
  return `${error}${history}${pending}`;
}

function _creativeActiveThread(){
  const project = _creativeProject;
  if(!project) return null;
  const threads = project.threads || [];
  return threads.find(row => row.id === project.active_thread) || threads[threads.length - 1] || null;
}

function _creativeMessageText(item){
  const raw = item && (item.content != null ? item.content : item.text);
  if(typeof raw === 'string') return raw;
  if(Array.isArray(raw)){
    return raw.map(part => {
      if(typeof part === 'string') return part;
      return part && (part.text || part.content) || '';
    }).join('');
  }
  return '';
}

function _creativeSavedContext(){
  const stages = (_creativeProject && _creativeProject.stages) || {};
  const lines = [];
  Object.entries(stages).forEach(([stage, row]) => {
    Object.entries((row && row.fields) || {}).forEach(([name, slot]) => {
      const text = String((slot && slot.text) || '').trim();
      if(text) lines.push(stage + '.' + name + ': ' + text.slice(0, 500));
    });
  });
  return lines.slice(0, 40).join('\n');
}

function _creativeVisibleTurn(text){
  return String(text || '').replace(/\n*\[studio project=[\s\S]*$/, '').trim();
}

async function _creativeLoadAgentTranscript(){
  const thread = _creativeActiveThread();
  _creativeAgentLog = [];
  if(!thread || !thread.session_id) return;
  const sessionId = thread.session_id;
  try{
    const data = await api('/api/session?session_id=' + encodeURIComponent(sessionId));
    if(!_creativeActiveThread() || _creativeActiveThread().session_id !== sessionId) return;
    const rows = (data.session && data.session.messages) || [];
    _creativeAgentLog = rows.map(item => {
      const role = item.role === 'user' ? 'user' : (item.role === 'assistant' ? 'assistant' : '');
      if(!role) return null;
      const text = _creativeVisibleTurn(_creativeMessageText(item));
      if(!text) return null;
      return {role, text};
    }).filter(Boolean);
  }catch(err){
    _creativeChatError = err && err.message ? err.message : 'Could not load the agent session.';
  }
}

function _creativeChatHistory(){
  const project = _creativeProject;
  const focus = _creativeFocusField;
  const thread = _creativeActiveThread();
  const source = thread && thread.session_id
    ? _creativeAgentLog
    : (project.chat || []);
  const messages = source.filter(item => {
    if(!item || !item.text) return false;
    if(thread && thread.session_id) return true;
    if(!focus) return true;
    return item.field === focus;
  });
  const focusLabel = focus ? _creativeLabel(focus) : '';
  if(!messages.length){
    return `<p class="creative-help" id="creativeChatEmpty">${focus ? `Nothing on ${ _creativeEsc(focusLabel) } yet.` : 'Ask Hermes to suggest the empty fields, or to revise the ones you already filled.'}</p>`;
  }
  return messages.map(item => {
    return `<article class="creative-msg creative-msg-${_creativeEsc(item.role || 'assistant')}"><p>${_creativeEsc(item.text)}</p>${item.role === 'assistant' ? _creativeMessageSuggestions(item) : ''}</article>`;
  }).join('');
}

function _creativeWorkspaceLive(){
  return !!(
    _creativeProject
    && !_creativeCreating
    && document.getElementById('creativeFields')
    && document.getElementById('creativeChatLog')
    && document.getElementById('creativeComposerBox')
  );
}

function _creativeTabSignature(){
  const project = _creativeProject || {};
  const threads = (project.threads && project.threads.length)
    ? project.threads
    : [{id:'', title:'New chat'}];
  const active = project.active_thread || '';
  return active + '\n' + threads.map(thread => `${thread.id}|${thread.title || ''}`).join('\n');
}

function _creativeFieldSignature(stage){
  const names = (CREATIVE_FIELDS[_creativeStage] || []).slice();
  const fields = (stage && stage.fields) || {};
  if(_creativeStage === 'copy') names.sort((a, b) => ((fields[a] && fields[a].order) || 0) - ((fields[b] && fields[b].order) || 0));
  return JSON.stringify({
    status: stage && stage.status,
    checks: _creativeProject.concept_checks || {},
    export: _creativeExportOpen,
    fields: names.map(name => {
      const slot = fields[name] || {};
      return [name, slot.claim || '', !!slot.include, slot.order || 0, !!slot.regulated];
    }),
  });
}

function _creativeSyncBusy(){
  const input = document.getElementById('creativeChatInput');
  const send = document.querySelector('#creativeComposerBox .send-btn');
  if(input) input.disabled = !!_creativeChatBusy;
  if(send) send.disabled = !!_creativeChatBusy;
}

function _creativeSyncLive(){
  if(!_creativeWorkspaceLive()){
    creativeRenderWorkspace();
    return;
  }
  const project = _creativeProject;
  const stage = project.stages[_creativeStage] || {fields:{}, status:'not_started'};
  const active = document.activeElement;
  const name = document.querySelector('#creativeWorkspace .creative-project-name');
  if(name) name.textContent = project.name || '';
  const save = document.getElementById('creativeSaveState');
  if(save){
    save.textContent = _creativeSaveState;
    save.classList.toggle('failed', _creativeSaveState === 'Save failed');
  }
  CREATIVE_STAGES.forEach(item => {
    const dot = document.querySelector(`#creativeTab-${item.id} .creative-dot`);
    if(!dot) return;
    const status = (project.stages[item.id] && project.stages[item.id].status) || 'not_started';
    dot.className = `creative-dot creative-dot-${status}`;
    dot.title = _creativeStatusLabel(status);
  });
  const fieldsRoot = document.getElementById('creativeFields');
  const fieldSig = _creativeFieldSignature(stage);
  const typing = _creativeDirty || (active && active.getAttribute && active.getAttribute('data-creative-field'));
  if(fieldsRoot && fieldSig !== fieldsRoot.dataset.signature && !typing){
    _creativeRememberOpenDetails();
    fieldsRoot.innerHTML = _creativeStageMarkup(stage);
    fieldsRoot.dataset.signature = fieldSig;
    _creativeRestoreOpenDetails();
  }else if(!_creativeDirty){
    const statusSelect = document.querySelector('#creativeFields .creative-status-select select');
    if(statusSelect && statusSelect !== active) statusSelect.value = stage.status || 'not_started';
    (CREATIVE_FIELDS[_creativeStage] || []).forEach(field => {
      const node = document.querySelector(`[data-creative-field="${field}"]`);
      if(!node || node === active || _creativeTimers[field]) return;
      const text = (stage.fields[field] && stage.fields[field].text) || '';
      if(node.value !== text) node.value = text;
    });
  }
  const context = document.getElementById('creativeChatContext');
  if(context){
    const stageMeta = CREATIVE_STAGES.find(item => item.id === _creativeStage);
    const focusLabel = _creativeFocusField ? _creativeLabel(_creativeFocusField) : '';
    context.textContent = _creativeFocusField
      ? `${project.name} · ${focusLabel}`
      : `${project.name} · ${stageMeta ? stageMeta.label : _creativeStage}`;
  }
  const log = document.getElementById('creativeChatLog');
  if(log){
    const nextLog = _creativeChatLogBody(_creativeChatHistory(), _creativeOpenProposals());
    if(_creativePaintedLog !== nextLog){
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
      log.innerHTML = nextLog;
      _creativePaintedLog = nextLog;
      if(atBottom) log.scrollTop = log.scrollHeight;
    }
  }
  const tabMenu = document.getElementById('creativeChatTabMenu');
  const tabs = document.querySelector('#creativeAssistant .creative-chat-tabs');
  const tabSig = _creativeTabSignature();
  if(tabs && tabs.dataset.signature !== tabSig && (!tabMenu || tabMenu.hidden)){
    tabs.outerHTML = _creativeChatTabs();
    const freshTabs = document.querySelector('#creativeAssistant .creative-chat-tabs');
    if(freshTabs) freshTabs.dataset.signature = tabSig;
  }
  _creativeSyncBusy();
}

function _creativeApplyThreads(view){
  if(!_creativeProject || !view) return;
  if(Array.isArray(view.threads)) _creativeProject.threads = view.threads;
  if(Array.isArray(view.chat)) _creativeProject.chat = view.chat;
  if(view.active_thread) _creativeProject.active_thread = view.active_thread;
}

function _creativeChatTabs(){
  const project = _creativeProject;
  const threads = (project.threads && project.threads.length)
    ? project.threads
    : [{id:'', title:'New chat', messages: project.chat || []}];
  const active = project.active_thread || (threads[threads.length - 1] && threads[threads.length - 1].id) || '';
  const icon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 1 1 18 0z"/></svg>`;
  const tabs = threads.map(thread => {
    const on = thread.id === active;
    const title = thread.title || 'New chat';
    const close = `<button type="button" class="creative-chat-tab-x" aria-label="Close ${ _creativeEsc(title) }" onclick="creativeCloseChatTab(event, '${thread.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    return `<div class="creative-chat-tab${on ? ' active' : ''}" role="tab" aria-selected="${on ? 'true' : 'false'}"><button type="button" class="creative-chat-tab-main" onclick="creativeSelectChatTab('${thread.id}')">${icon}<span dir="auto">${_creativeEsc(title)}</span></button>${thread.id ? close : ''}</div>`;
  }).join('');
  const menu = threads.map(thread => {
    const title = thread.title || 'New chat';
    const close = thread.id
      ? `<button type="button" class="creative-chat-menu-x" aria-label="Close ${ _creativeEsc(title) }" onclick="creativeCloseChatTab(event, '${thread.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`
      : '';
    return `<div class="creative-chat-menu-row"><button type="button" onclick="creativeSelectChatTab('${thread.id}')">${_creativeEsc(title)}</button>${close}</div>`;
  }).join('');
  return `<div class="creative-chat-tabs" role="tablist" aria-label="Chats"><div class="creative-chat-tab-scroll">${tabs}</div><button type="button" class="creative-chat-tab-tool" aria-label="New chat" onclick="creativeNewChatTab()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button><button type="button" class="creative-chat-tab-tool" aria-label="All chats" aria-expanded="false" onclick="creativeToggleChatMenu(event)"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button><div class="creative-menu creative-chat-menu" id="creativeChatTabMenu" hidden>${menu}</div></div>`;
}

async function creativeNewChatTab(){
  if(!_creativeProject || _creativeChatBusy) return;
  const view = await api('/api/creative-studio/projects/' + _creativeProject.id + '/threads', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
  _creativeApplyThreads(view);
  _creativeChatError = '';
  await _creativeLoadAgentTranscript();
  _creativeSyncLive();
  const input = document.getElementById('creativeChatInput');
  if(input) input.focus();
}

async function creativeSelectChatTab(id){
  if(!_creativeProject || !id || id === _creativeProject.active_thread) return;
  const view = await api('/api/creative-studio/projects/' + _creativeProject.id + '/threads/active', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({thread_id:id})});
  _creativeApplyThreads(view);
  _creativeChatError = '';
  await _creativeLoadAgentTranscript();
  _creativeSyncLive();
}

async function creativeCloseChatTab(event, id){
  if(event) event.stopPropagation();
  if(!_creativeProject || !id) return;
  const view = await api('/api/creative-studio/projects/' + _creativeProject.id + '/threads/close', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({thread_id:id})});
  _creativeApplyThreads(view);
  await _creativeLoadAgentTranscript();
  _creativeSyncLive();
}

function creativeToggleChatMenu(event){
  if(event) event.stopPropagation();
  const menu = document.getElementById('creativeChatTabMenu');
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
      ? `<p class="creative-suggest-now" dir="auto">${_creativeEsc(previous)}</p>`
      : '';
    return `<article class="creative-suggest" data-proposal="${_creativeEsc(itemProposal.id)}">
      <p class="creative-suggest-kicker">${_creativeEsc(label)}</p>
      ${before}
      <p class="creative-suggest-next" dir="auto">${_creativeEsc(next)}</p>
      <div class="creative-actions">
        <button type="button" class="creative-suggest-apply" onclick="creativeProposalAction('${itemProposal.id}','accept')">Replace</button>
        <button type="button" class="creative-suggest-dismiss" onclick="creativeProposalAction('${itemProposal.id}','dismiss')">Dismiss</button>
      </div>
    </article>`;
  }).join('');
  return cards;
}

function _creativeProposalThread(proposal){
  if(proposal && proposal.thread_id) return proposal.thread_id;
  const threads = (_creativeProject && _creativeProject.threads) || [];
  const id = proposal && proposal.id;
  for(const thread of threads){
    const messages = thread.messages || [];
    if(messages.some(message => (message.proposals || []).some(item => item.id === id))) return thread.id;
  }
  return '';
}

function _creativeOpenProposals(){
  const stage = _creativeProject.stages[_creativeStage];
  if(!stage) return '';
  const cards = [];
  const active = _creativeProject.active_thread || '';
  Object.entries(stage.fields || {}).forEach(([field, slot]) => {
    if(_creativeFocusField && field !== _creativeFocusField) return;
    (slot.proposals || []).forEach(proposal => {
      if(proposal.status === 'dismissed' || proposal.status === 'accepted' || proposal.status === 'edited_accepted') return;
      const owner = _creativeProposalThread(proposal);
      if(owner && owner !== active) return;
      const label = _creativeLabel(field);
      const shownInThread = (_creativeProject.chat || []).some(message =>
        (message.proposals || []).some(item => item.id === proposal.id)
      );
      if(shownInThread) return;
      cards.push(`<article class="creative-suggest" data-proposal="${_creativeEsc(proposal.id)}">
        <p class="creative-suggest-kicker">${_creativeEsc(label)}</p>
        <p class="creative-suggest-next" dir="auto">${_creativeEsc(proposal.revised_text || proposal.text)}</p>
        <div class="creative-actions">
          <button type="button" class="creative-suggest-apply" onclick="creativeProposalAction('${proposal.id}','accept')">Replace</button>
          <button type="button" class="creative-suggest-dismiss" onclick="creativeProposalAction('${proposal.id}','dismiss')">Dismiss</button>
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
    const control = `<textarea data-creative-field="${name}" dir="auto" rows="4" oninput="creativeScheduleSave('${name}')">${_creativeEsc(slot.text || '')}</textarea>`;
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

const CREATIVE_AGENT_PROFILE = 'copywriting';
const CREATIVE_PROFILE_DEFAULT_MODEL = 'google/gemini-3.8-flash';
let _creativeModel = '';
let _creativeModelProvider = '';
let _creativeModelChosen = false;
let _creativeProfileModel = CREATIVE_PROFILE_DEFAULT_MODEL;
let _creativeProfileProvider = '';
let _creativeProfileModelRequested = false;
let _creativeModelDropdownHome = null;

function _creativeSyncModelChip(){
  const sel = document.getElementById('creativeModelSelect');
  const label = document.getElementById('creativeModelLabel');
  if(!sel || !label) return;
  const opt = sel.selectedOptions && sel.selectedOptions[0];
  const text = (opt && opt.textContent) || (typeof getModelLabel === 'function' ? getModelLabel(sel.value || '') : '') || 'Model';
  label.textContent = text.trim() || 'Model';
  _creativeSyncSessionChip();
}

function _creativeSyncSessionChip(){
  const label = document.getElementById('creativeModelLabel');
  const modelText = (label && label.textContent) || 'Model';
  const mainThinking = document.getElementById('composerSessionThinkingRow');
  const effortShown = !(mainThinking && mainThinking.hidden);
  const effortLabel = document.getElementById('composerReasoningLabel');
  const effortText = effortShown ? ((effortLabel && effortLabel.textContent) || '') : '';
  const modelEl = document.getElementById('creativeSessionModel');
  const effortEl = document.getElementById('creativeSessionEffort');
  const modelValue = document.getElementById('creativeSessionModelValue');
  const thinkingValue = document.getElementById('creativeSessionThinkingValue');
  const workspaceValue = document.getElementById('creativeSessionWorkspaceValue');
  const thinkingRow = document.getElementById('creativeSessionThinkingRow');
  const chip = document.getElementById('creativeSessionChip');
  if(modelEl) modelEl.textContent = modelText;
  if(effortEl) effortEl.textContent = effortText;
  if(modelValue) modelValue.textContent = modelText;
  if(thinkingValue) thinkingValue.textContent = effortText;
  if(thinkingRow) thinkingRow.hidden = !effortShown;
  const workspace = document.getElementById('composerWorkspaceLabel');
  if(workspaceValue) workspaceValue.textContent = (workspace && workspace.textContent) || '';
  if(chip) chip.title = modelText;
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

function _creativeStudioModel(){
  if(_creativeModelChosen && _creativeModel){
    return {model: _creativeModel, provider: _creativeModelProvider || ''};
  }
  return {model: _creativeProfileModel || '', provider: _creativeProfileModel ? (_creativeProfileProvider || '') : ''};
}

function _creativeApplyRememberedModel(){
  const sel = document.getElementById('creativeModelSelect');
  if(!sel) return;
  const choice = _creativeStudioModel();
  if(choice.model && typeof _ensureModelOptionInDropdown === 'function'){
    _ensureModelOptionInDropdown(choice.model, sel, choice.provider || null);
  }else if(choice.model && typeof _applyModelToDropdown === 'function'){
    _applyModelToDropdown(choice.model, sel, choice.provider || null);
  }else if(!choice.model){
    sel.selectedIndex = -1;
  }
  _creativeSyncModelChip();
}

function _creativeLoadProfileModel(){
  if(_creativeProfileModelRequested || typeof api !== 'function') return;
  _creativeProfileModelRequested = true;
  api('/api/profiles', {timeoutToast:false}).then(data => {
    const rows = data && Array.isArray(data.profiles) ? data.profiles : [];
    const profile = rows.find(row => row && row.name === CREATIVE_AGENT_PROFILE);
    if(profile && profile.model){
      _creativeProfileModel = profile.model;
      _creativeProfileProvider = profile.provider || '';
    }
    if(!_creativeModelChosen) _creativeApplyRememberedModel();
  }).catch(() => {});
}

function _creativeMountModelPicker(){
  _creativeCopyModelOptions();
  _creativeLoadProfileModel();
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
  _creativeRestoreModelDropdown();
  const row = document.getElementById('creativeSessionModelRow');
  if(row) row.setAttribute('aria-expanded', 'false');
}

function _creativeCloseThinking(){
  const dd = document.getElementById('creativeThinkingDropdown');
  if(!dd) return;
  dd.classList.remove('open', 'composer-session-flyout');
  dd.removeAttribute('style');
  const row = document.getElementById('creativeSessionThinkingRow');
  if(row) row.setAttribute('aria-expanded', 'false');
}

function _creativeCloseWorkspace(){
  const dd = document.getElementById('creativeWsDropdown');
  if(!dd) return;
  dd.classList.remove('open', 'composer-session-flyout');
  dd.hidden = true;
  dd.setAttribute('aria-hidden', 'true');
  dd.removeAttribute('style');
  const row = document.getElementById('creativeSessionWorkspaceRow');
  if(row) row.setAttribute('aria-expanded', 'false');
}

function _creativeCloseSessionFlyouts(){
  closeCreativeModelDropdown();
  _creativeCloseThinking();
  _creativeCloseWorkspace();
  document.querySelectorAll('#creativeSessionMenu .composer-session-row.active').forEach(row => row.classList.remove('active'));
}

function _creativePositionFlyout(dd, row){
  if(!dd || !row) return;
  const menu = document.getElementById('creativeSessionMenu');
  const menuRect = menu ? menu.getBoundingClientRect() : row.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const margin = 8;
  const gap = 8;
  dd.style.position = 'fixed';
  dd.style.right = 'auto';
  dd.style.bottom = 'auto';
  dd.style.zIndex = '220';
  const width = Math.min(dd.offsetWidth || 280, window.innerWidth - margin * 2);
  const spaceRight = window.innerWidth - menuRect.right - margin;
  const placeLeft = spaceRight < width + gap;
  let left = placeLeft ? menuRect.left - gap - width : menuRect.right + gap;
  left = Math.max(margin, Math.min(left, window.innerWidth - margin - width));
  const height = dd.offsetHeight || 240;
  let top = rowRect.top;
  top = Math.max(margin, Math.min(top, window.innerHeight - margin - height));
  dd.style.left = left + 'px';
  dd.style.top = top + 'px';
  dd.style.width = width + 'px';
  dd.classList.add('composer-session-flyout');
  dd.classList.toggle('composer-session-flyout-left', placeLeft);
}

function _creativePositionSessionMenu(){
  const menu = document.getElementById('creativeSessionMenu');
  const chip = document.getElementById('creativeSessionChip');
  if(!menu || !chip) return;
  const rect = chip.getBoundingClientRect();
  const margin = 8;
  menu.style.position = 'fixed';
  menu.style.bottom = 'auto';
  const width = menu.offsetWidth || 280;
  let left = rect.left;
  if(left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin);
  menu.style.left = left + 'px';
  menu.style.top = Math.max(margin, rect.top - (menu.offsetHeight || 160) - 8) + 'px';
}

function _creativeMarkSessionRow(action){
  document.querySelectorAll('#creativeSessionMenu .composer-session-row').forEach(row => {
    const on = row.getAttribute('data-session-action') === action;
    row.classList.toggle('active', on);
    row.setAttribute('aria-expanded', on ? 'true' : 'false');
  });
}

function _creativePositionModelDropdown(){
  const dd = document.getElementById('creativeModelDropdown');
  const row = document.getElementById('creativeSessionModelRow');
  if(!dd || !row) return;
  if(!_creativeModelDropdownHome){
    _creativeModelDropdownHome = {parent: dd.parentNode, next: dd.nextSibling};
  }
  if(dd.parentNode !== document.body) document.body.appendChild(dd);
  dd.classList.add('model-dropdown--floating');
  const margin = 8;
  const width = Math.min(420, Math.max(240, window.innerWidth - margin * 2));
  dd.style.width = width + 'px';
  dd.style.maxHeight = Math.round(window.innerHeight * 0.7) + 'px';
  _creativePositionFlyout(dd, row);
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
  _creativeModelChosen = true;
  _creativeRememberModel();
  if(provider) _creativeModelProvider = provider;
  _creativeSyncModelChip();
  closeCreativeModelDropdown();
}

function toggleCreativeModelDropdown(event){
  if(event){ event.preventDefault(); event.stopPropagation(); }
  const dd = document.getElementById('creativeModelDropdown');
  const sel = document.getElementById('creativeModelSelect');
  if(!dd || !sel) return;
  if(dd.classList.contains('open')){ closeCreativeModelDropdown(); return; }
  _creativeCloseThinking();
  _creativeCloseWorkspace();
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
  _creativeMarkSessionRow('model');
  _creativePositionModelDropdown();
  const activeRow = dd.querySelector('.model-opt.active');
  if(activeRow && typeof activeRow.scrollIntoView === 'function') activeRow.scrollIntoView({block: 'nearest'});
}

function _creativeOpenThinking(){
  const source = document.getElementById('composerReasoningDropdown');
  const dd = document.getElementById('creativeThinkingDropdown');
  const row = document.getElementById('creativeSessionThinkingRow');
  if(!source || !dd || !row || row.hidden) return;
  if(dd.classList.contains('open')){ _creativeCloseThinking(); return; }
  closeCreativeModelDropdown();
  _creativeCloseWorkspace();
  dd.innerHTML = source.innerHTML;
  dd.classList.add('open');
  _creativeMarkSessionRow('thinking');
  _creativePositionFlyout(dd, row);
}

function _creativeOpenWorkspace(){
  const dd = document.getElementById('creativeWsDropdown');
  const row = document.getElementById('creativeSessionWorkspaceRow');
  if(!dd || !row || typeof loadWorkspaceList !== 'function' || typeof renderWorkspaceDropdownInto !== 'function') return;
  if(dd.classList.contains('open')){ _creativeCloseWorkspace(); return; }
  closeCreativeModelDropdown();
  _creativeCloseThinking();
  const current = (typeof S !== 'undefined' && S.session && S.session.workspace) || '';
  loadWorkspaceList().then(data => {
    if(!document.getElementById('creativeSessionMenu') || document.getElementById('creativeSessionMenu').hidden) return;
    renderWorkspaceDropdownInto(dd, data.workspaces || [], current || data.last || '');
    dd.hidden = false;
    dd.setAttribute('aria-hidden', 'false');
    dd.classList.add('open');
    _creativeMarkSessionRow('workspace');
    _creativePositionFlyout(dd, row);
  }).catch(() => {});
}

function closeCreativeSessionMenu(){
  const menu = document.getElementById('creativeSessionMenu');
  const chip = document.getElementById('creativeSessionChip');
  if(menu) menu.hidden = true;
  if(chip){
    chip.classList.remove('active');
    chip.setAttribute('aria-expanded', 'false');
  }
  _creativeCloseSessionFlyouts();
}

function toggleCreativeSessionMenu(event){
  if(event){ event.preventDefault(); event.stopPropagation(); }
  const menu = document.getElementById('creativeSessionMenu');
  const chip = document.getElementById('creativeSessionChip');
  if(!menu || !chip) return;
  if(!menu.hidden){ closeCreativeSessionMenu(); return; }
  if(typeof closeComposerSessionMenu === 'function') closeComposerSessionMenu();
  if(typeof closeModelDropdown === 'function') closeModelDropdown();
  if(typeof closeReasoningDropdown === 'function') closeReasoningDropdown();
  if(typeof closeWsDropdown === 'function') closeWsDropdown();
  _creativeSyncSessionChip();
  menu.hidden = false;
  chip.classList.add('active');
  chip.setAttribute('aria-expanded', 'true');
  _creativePositionSessionMenu();
}

function openCreativeSessionAction(event, action){
  if(event){ event.preventDefault(); event.stopPropagation(); }
  if(action === 'model') toggleCreativeModelDropdown(event);
  else if(action === 'thinking') _creativeOpenThinking();
  else if(action === 'workspace') _creativeOpenWorkspace();
}

document.addEventListener('click', event => {
  if(event.target.closest('#creativeSessionChip') || event.target.closest('#creativeSessionMenu') || event.target.closest('#creativeModelDropdown') || event.target.closest('#creativeThinkingDropdown') || event.target.closest('#creativeWsDropdown')){
    if(event.target.closest('#creativeThinkingDropdown .reasoning-option')){
      const option = event.target.closest('.reasoning-option');
      const thinkingValue = document.getElementById('creativeSessionThinkingValue');
      const effortEl = document.getElementById('creativeSessionEffort');
      const text = option ? option.textContent.trim() : '';
      if(thinkingValue) thinkingValue.textContent = text;
      if(effortEl) effortEl.textContent = text;
      _creativeCloseThinking();
    }
    if(event.target.closest('#creativeWsDropdown .ws-opt')) closeCreativeSessionMenu();
    return;
  }
  closeCreativeSessionMenu();
});

function _creativeStopAgentStream(){
  if(_creativeAgentStream){
    _creativeAgentStream.close();
    _creativeAgentStream = null;
  }
}

async function creativeSendChat(){
  if(!_creativeProject || _creativeChatBusy) return;
  const input = document.getElementById('creativeChatInput');
  const text = input ? input.value.trim() : '';
  if(!text) return;
  const scopeBox = document.getElementById('creativeChatScope');
  const choice = _creativeStudioModel();
  const model = choice.model;
  const modelProvider = choice.provider;
  const scope = _creativeFocusField ? 'field' : (scopeBox && scopeBox.getAttribute('aria-pressed') === 'true' ? 'project' : 'stage');
  const field = _creativeFocusField || '';
  _creativeChatBusy = true;
  _creativeChatError = '';
  if(input) input.value = '';
  _creativeAgentLog.push({role:'user', text, pending:true});
  _creativeSyncLive();
  let sessionId = '';
  try{
    let thread = _creativeActiveThread();
    if(!thread || !thread.id) throw new Error('Open a chat first.');
    sessionId = thread.session_id || '';
    if(!sessionId){
      const created = await api('/api/session/new', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        timeoutMs:60000,
        body:JSON.stringify({
          worktree:false,
          profile:(typeof S !== 'undefined' && S.activeProfile) || 'default',
          model: model || undefined,
          model_provider: modelProvider || undefined,
          enabled_toolsets: ['file', 'skills', 'memory'],
        }),
      });
      sessionId = created && created.session && created.session.session_id;
      if(!sessionId) throw new Error('Could not start an agent session.');
      const view = await api('/api/creative-studio/projects/' + _creativeProject.id + '/threads/session', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({thread_id:thread.id, session_id:sessionId}),
      });
      _creativeApplyThreads(view);
      if(typeof renderSessionList === 'function') void renderSessionList();
    }
    await api('/api/session/toolsets', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      timeoutMs:15000,
      timeoutToast:false,
      body:JSON.stringify({session_id:sessionId, toolsets:['file', 'skills', 'memory']}),
    });
    const saved = _creativeSavedContext();
    let pack = {};
    try{
      pack = await api('/api/creative-studio/projects/' + _creativeProject.id + '/prompt?stage=' + encodeURIComponent(_creativeStage), {timeoutToast:false});
    }catch(_){ pack = {}; }
    const marker = `[studio project=${_creativeProject.id} stage=${_creativeStage} scope=${scope}${field ? ' field=' + field : ''}]`;
    const roots = (pack.search_roots || []).join('\n');
    const message = text + '\n\n' + marker
      + '\nProduct notes already loaded:\n' + (pack.product_note || '(none loaded)')
      + '\n\nLuke Iha purposes for this stage:\n' + (pack.framework || '(none)')
      + '\n\nSaved fields:\n' + (saved || '(none yet)')
      + '\n\nHermes files you may search:\n' + (roots || '(skills, memory, and product notes)')
      + '\n\nIf the loaded notes are not enough, search those Hermes files for the product or the framework. Read only what the question needs, then answer. Do not run commands and do not search the workspace.';
    const start = await api('/api/chat/start', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      timeoutMs:60000,
      body:JSON.stringify({
        session_id:sessionId,
        message,
        model: model || undefined,
        model_provider: modelProvider || undefined,
        profile:(typeof S !== 'undefined' && S.activeProfile) || 'default',
      }),
    });
    const streamId = start && start.stream_id;
    if(!streamId) throw new Error('The agent did not start.');
    _creativeAgentLog.push({role:'assistant', text:''});
    await new Promise(resolve => {
      _creativeStopAgentStream();
      const src = new EventSource(
        new URL('api/chat/stream?stream_id=' + encodeURIComponent(streamId), document.baseURI || location.href).href,
        {withCredentials:true},
      );
      _creativeAgentStream = src;
      let settled = false;
      let seenActive = false;
      let quietPolls = 0;
      const started = Date.now();
      let timer = null;
      const finish = () => {
        if(settled) return;
        settled = true;
        if(timer) clearInterval(timer);
        src.close();
        if(_creativeAgentStream === src) _creativeAgentStream = null;
        resolve();
      };
      src.addEventListener('token', event => {
        try{
          const data = JSON.parse(event.data);
          const last = _creativeAgentLog[_creativeAgentLog.length - 1];
          if(last && last.role === 'assistant') last.text += data.text || '';
          _creativeSyncLive();
        }catch(_){ }
      });
      src.addEventListener('done', finish);
      src.addEventListener('stream_end', finish);
      src.addEventListener('apperror', finish);
      // A proxy often drops the live stream and the browser reports that as
      // an error. The run is still going, so wait until the server says it
      // has finished, then load the session transcript.
      const watch = async () => {
        if(settled) return;
        if(Date.now() - started > 180000){ finish(); return; }
        let active = null;
        try{
          const status = await api('/api/chat/stream/status?stream_id=' + encodeURIComponent(streamId), {timeoutToast:false, retries:0});
          active = !!(status && status.active);
        }catch(_){
          return;
        }
        if(active){
          seenActive = true;
          quietPolls = 0;
          return;
        }
        if(!seenActive && Date.now() - started < 15000) return;
        quietPolls += 1;
        if(quietPolls >= 2) finish();
      };
      src.onerror = () => { void watch(); };
      timer = setInterval(() => { void watch(); }, 2000);
    });
    await _creativeLoadAgentTranscript();
    await creativeReloadQuiet();
  }catch(err){
    _creativeChatError = err && err.message ? err.message : 'Could not send the message.';
    if(input) input.value = text;
    _creativeAgentLog = _creativeAgentLog.filter(item => !(item && item.pending && item.text === text));
    if(sessionId){
      try{ await _creativeLoadAgentTranscript(); }catch(_){ }
    }
  }finally{
    _creativeChatBusy = false;
    _creativeSyncLive();
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
    const fresh = await api('/api/creative-studio/projects/' + _creativeProject.id);
    _creativeProject = fresh;
    _creativeSyncLive();
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
  if(_creativeDirty) return;
  _creativeProject = fresh;
  _creativeSyncLive();
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
  await creativeReloadQuiet();
}

async function creativeEditProposal(proposalId){
  const text = window.prompt('Edit this proposal, then save it as the selected answer');
  if(!text) return;
  await api(`/api/creative-studio/projects/${_creativeProject.id}/proposals/${proposalId}`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'edit_accept', text}),
  });
  await creativeReloadQuiet();
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
  await creativeReloadQuiet();
}

async function creativeMarkVerification(field){
  const slot = _creativeProject.stages[_creativeStage].fields[field];
  await api('/api/creative-studio/projects/' + _creativeProject.id + '/fields', {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({stage:_creativeStage, field, text:slot.text || '', claim:'needs_verification'}),
  });
  await creativeReloadQuiet();
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
  await creativeReloadQuiet();
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
