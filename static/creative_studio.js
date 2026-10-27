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
let _creativeExportOpen = false;
let _creativeSaveState = 'Saved';
let _creativeTimers = {};
let _creativePoll = null;
let _creativeDirty = false;
let _creativeCreating = false;
let _creativeOpenDetails = [];
let _creativeHomeSession = '';
let _creativeChatHosted = false;
let _creativeShowToken = 0;
let _creativeShowing = '';
let _creativeSessionProjectIdCache = '';
let _creativeFocusJob = Promise.resolve();
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
  if(next) creativeSetStage(next.id);
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
  _creativeParkChat();
  _creativeRememberOpenDetails();
  if(_creativeCreating){
    root.innerHTML = _creativeCreateMarkup();
    void creativeReleaseChat();
    return;
  }
  if(!_creativeProject){
    root.innerHTML = '<div class="main-view-empty"><div class="main-view-empty-title">Creative Studio</div><div class="main-view-empty-sub">Start a creative with a name and a product. Hermes already has the product notes, so this step only records which one you mean.</div><button type="button" class="creative-inline-btn" onclick="creativeNewProject()">New creative</button></div>';
    void creativeReleaseChat();
    return;
  }
  const project = _creativeProject;
  const stage = project.stages[_creativeStage] || {fields:{}, status:'not_started'};
  const chatPane = _creativeChatOpen ? `${_creativeChatTabsMarkup()}
      <div class="creative-chat-resizer" role="separator" aria-orientation="vertical" aria-label="Resize chat" onpointerdown="creativeChatResizeStart(event)"></div>
      <aside class="creative-chat" id="creativeAssistant" aria-label="Project chat">
        <div id="creativeChatMount"></div>
      </aside>` : '';
  root.innerHTML = `
    <div class="creative-frame${_creativeChatOpen ? '' : ' chat-closed'}" style="--creative-chat-width:${_creativeChatWidth}px">
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
      <div class="creative-fields" id="creativeFields" role="tabpanel" aria-labelledby="creativeTab-${_creativeStage}">${_creativeStageMarkup(stage)}</div>
      ${chatPane}
    </div>`;
  const paintedFields = document.getElementById('creativeFields');
  if(paintedFields && _creativeProject && _creativeProject.stages){
    paintedFields.dataset.signature = _creativeFieldSignature(_creativeProject.stages[_creativeStage] || {fields:{}});
  }
  _creativeRestoreOpenDetails();
  if(_creativeChatOpen) void _creativeShowBoundChat();
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
    const body = document.querySelector('#creativeWorkspace .creative-frame');
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

function _creativeParkChat(){
  const chat = document.getElementById('mainChat');
  const main = document.querySelector('main.main');
  if(!chat || !main || chat.parentElement === main) return;
  main.insertBefore(chat, main.firstChild);
}

function _creativeMountChat(){
  const mount = document.getElementById('creativeChatMount');
  const chat = document.getElementById('mainChat');
  if(!mount || !chat) return;
  if(!_creativeChatHosted){
    _creativeHomeSession = (typeof S !== 'undefined' && S.session && S.session.session_id) || '';
    try{
      if(!_creativeHomeSession) _creativeHomeSession = localStorage.getItem('hermes-webui-session') || '';
    }catch(_){}
    _creativeChatHosted = true;
  }
  if(chat.parentElement !== mount) mount.appendChild(chat);
}

async function creativeReleaseChat(){
  _creativeShowToken++;
  _creativeParkChat();
  const home = _creativeHomeSession;
  const hosted = _creativeChatHosted;
  _creativeChatHosted = false;
  _creativeShowing = '';
  if(!hosted || !home || typeof loadSession !== 'function') return;
  if(typeof S !== 'undefined' && S.session && S.session.session_id === home) return;
  await loadSession(home);
}

function _creativeScope(){
  if(_creativeFocusField) return {scope:'field', stage:_creativeStage, field:_creativeFocusField};
  return {scope:'project', stage:_creativeStage, field:''};
}

function _creativeChatIcon(){
  return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h11a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H6.5L4 13.2V11h-1.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/></svg>';
}

function _creativeTabTitle(thread){
  const sid = (thread && thread.session_id) || '';
  let title = '';
  if(sid && typeof S !== 'undefined' && S.session && S.session.session_id === sid && S.session.title) title = S.session.title;
  if(!title && sid && typeof _allSessions !== 'undefined' && Array.isArray(_allSessions)){
    const listed = _allSessions.find(row => row && row.session_id === sid);
    if(listed && listed.title) title = listed.title;
  }
  if(!title) title = (thread && thread.title) || '';
  title = String(title || '').trim();
  if(!title || title === 'Untitled') return 'New chat';
  return title;
}

function _creativeActiveChat(){
  const project = _creativeProject;
  const chats = (project && project.threads) || [];
  return chats.find(row => row && row.id === project.active_thread) || null;
}

function _creativeApplyThreads(data){
  if(!_creativeProject || !data) return;
  if(Array.isArray(data.threads)){
    _creativeProject.threads = data.threads.map(row => ({
      id: row.id,
      title: row.title || 'New chat',
      session_id: row.session_id || '',
    }));
  }
  if(typeof data.active_thread === 'string') _creativeProject.active_thread = data.active_thread;
  const active = _creativeActiveChat();
  if(active && active.session_id) _creativeProject.chat_session_id = active.session_id;
}

function _creativeChatTabsMarkup(){
  const project = _creativeProject;
  const chats = (project && project.threads) || [];
  const activeId = project && project.active_thread;
  const tabs = chats.map(thread => {
    const active = !_creativeFocusField && thread.id === activeId;
    const title = _creativeTabTitle(thread);
    return `<div class="creative-chat-tab${active ? ' active' : ''}" role="tab" aria-selected="${active ? 'true' : 'false'}">
      <button type="button" class="creative-chat-tab-main" title="${_creativeEsc(title)}" onclick="creativeSelectChat('${thread.id}')">${_creativeChatIcon()}<span>${_creativeEsc(title)}</span></button>
      <button type="button" class="creative-chat-tab-x" aria-label="Close" onclick="creativeCloseChat(event, '${thread.id}')">&times;</button>
    </div>`;
  }).join('');
  const fieldTab = _creativeFocusField ? `<div class="creative-chat-tab active" role="tab" aria-selected="true">
      <button type="button" class="creative-chat-tab-main" title="${_creativeEsc(_creativeLabel(_creativeFocusField))}">${_creativeChatIcon()}<span>${_creativeEsc(_creativeLabel(_creativeFocusField))}</span></button>
      <button type="button" class="creative-chat-tab-x" aria-label="Close" onclick="creativeCloseFieldTab(event)">&times;</button>
    </div>` : '';
  const sessions = chats.map(thread => `<div class="creative-chat-menu-row"><button type="button" onclick="creativeSelectChat('${thread.id}')">${_creativeEsc(_creativeTabTitle(thread))}</button></div>`).join('');
  const menu = `<button type="button" onclick="creativeToggleWorkspacePanel()">Workspace panel</button>${sessions ? `<div class="creative-chat-menu-sep"></div>${sessions}` : ''}`;
  return `<div class="creative-chat-tabs">
    <div class="creative-chat-tab-scroll" role="tablist" aria-label="Chat sessions">${tabs}${fieldTab}</div>
    <button type="button" class="creative-chat-tab-tool" aria-label="New chat" onclick="creativeNewChatTab()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
    <button type="button" class="creative-chat-tab-tool" aria-label="All chats" aria-expanded="false" onclick="creativeToggleChatMenu(event)"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>
    <div class="creative-menu creative-chat-menu" id="creativeChatMenu" hidden>${menu}</div>
  </div>`;
}

function _creativePaintChatTabs(){
  const frame = document.querySelector('#creativeWorkspace .creative-frame');
  if(!frame) return;
  const existing = frame.querySelector('.creative-chat-tabs');
  const html = _creativeChatTabsMarkup();
  if(existing) existing.outerHTML = html;
  else {
    const header = frame.querySelector('.creative-header');
    if(header) header.insertAdjacentHTML('afterend', html);
  }
}

function creativeToggleWorkspacePanel(){
  const menu = document.getElementById('creativeChatMenu');
  if(menu) menu.hidden = true;
  if(typeof toggleWorkspacePanel === 'function') toggleWorkspacePanel();
}

function creativeToggleChatMenu(event){
  if(event) event.stopPropagation();
  const menu = document.getElementById('creativeChatMenu');
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

async function creativeSelectChat(id){
  const menu = document.getElementById('creativeChatMenu');
  if(menu) menu.hidden = true;
  if(!_creativeProject || !id) return;
  if(_creativeFocusField){
    _creativeFocusField = '';
    _creativeSyncLive();
  }
  try{
    const data = await api('/api/creative-studio/projects/' + _creativeProject.id + '/threads/active', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({thread_id:id}),
    });
    _creativeApplyThreads(data);
  }catch(err){
    if(typeof showToast === 'function') showToast((err && err.message) || 'Could not switch chat', 3000, 'error');
    return;
  }
  _creativeShowing = '';
  _creativePaintChatTabs();
  await _creativeShowBoundChat();
}

async function creativeCloseChat(event, id){
  if(event){ event.preventDefault(); event.stopPropagation(); }
  if(!_creativeProject || !id) return;
  try{
    const data = await api('/api/creative-studio/projects/' + _creativeProject.id + '/threads/close', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({thread_id:id}),
    });
    _creativeApplyThreads(data);
  }catch(err){
    if(typeof showToast === 'function') showToast((err && err.message) || 'Could not close chat', 3000, 'error');
    return;
  }
  _creativeFocusField = '';
  _creativeShowing = '';
  _creativePaintChatTabs();
  await _creativeShowBoundChat();
}

function creativeCloseFieldTab(event){
  if(event){ event.preventDefault(); event.stopPropagation(); }
  if(_creativeFocusField) creativeIsolateField(_creativeFocusField);
}

async function creativeNewChatTab(){
  if(!_creativeProject) return;
  if(_creativeFocusField){
    _creativeFocusField = '';
    _creativeSyncLive();
  }
  try{
    const data = await api('/api/creative-studio/projects/' + _creativeProject.id + '/threads', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:'{}',
    });
    _creativeApplyThreads(data);
  }catch(err){
    if(typeof showToast === 'function') showToast((err && err.message) || 'Could not open a chat', 3000, 'error');
    return;
  }
  _creativeShowing = '';
  _creativePaintChatTabs();
  await _creativeShowBoundChat();
}

function _creativeBoundId(scope){
  const project = _creativeProject;
  if(!project) return '';
  if(scope.scope === 'field'){
    const stage = project.stages && project.stages[scope.stage];
    const slot = stage && stage.fields && stage.fields[scope.field];
    return (slot && slot.chat_session_id) || '';
  }
  const active = _creativeActiveChat();
  if(active) return active.session_id || '';
  return project.chat_session_id || '';
}

async function _creativeSessionProjectId(){
  if(_creativeSessionProjectIdCache) return _creativeSessionProjectIdCache;
  try{
    const data = await api('/api/projects');
    const rows = (data && data.projects) || [];
    const found = rows.find(row => row && row.name === 'Creative Studio');
    if(found && found.project_id){
      _creativeSessionProjectIdCache = found.project_id;
      return found.project_id;
    }
    const created = await api('/api/projects/create', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'Creative Studio', color:'#c47b2b'}),
    });
    _creativeSessionProjectIdCache = (created && created.project && created.project.project_id) || '';
    return _creativeSessionProjectIdCache;
  }catch(_){
    return '';
  }
}

async function _creativeEnsureBoundSession(){
  const scope = _creativeScope();
  const existing = _creativeBoundId(scope);
  if(existing) return existing;
  const grouped = await _creativeSessionProjectId();
  const created = await api('/api/session/new', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    timeoutMs:60000,
    body:JSON.stringify({
      worktree:false,
      profile:(typeof S !== 'undefined' && S.activeProfile) || 'default',
      project_id: grouped || undefined,
    }),
  });
  const sessionId = created && created.session && created.session.session_id;
  if(!sessionId) throw new Error('Could not start a chat.');
  const active = scope.scope === 'field' ? null : _creativeActiveChat();
  if(active && !active.session_id){
    const bound = await api('/api/creative-studio/projects/' + _creativeProject.id + '/threads/session', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({thread_id:active.id, session_id:sessionId}),
    });
    _creativeApplyThreads(bound);
    active.session_id = sessionId;
    _creativeProject.chat_session_id = sessionId;
  }else{
    const bound = await api('/api/creative-studio/projects/' + _creativeProject.id + '/chat-session', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        session_id:sessionId,
        scope:scope.scope,
        stage:scope.stage,
        field:scope.field,
      }),
    });
    if(scope.scope === 'field'){
      const slot = _creativeProject.stages[scope.stage].fields[scope.field];
      if(slot) slot.chat_session_id = sessionId;
    }else{
      _creativeApplyThreads(bound);
      _creativeProject.chat_session_id = sessionId;
    }
  }
  if(typeof renderSessionList === 'function') void renderSessionList();
  return sessionId;
}

function _creativeApplyProject(fresh){
  if(!fresh || !fresh.id) return;
  const current = _creativeProject;
  if(current && current.id === fresh.id && current.updated_at && fresh.updated_at && fresh.updated_at < current.updated_at) return;
  _creativeProject = fresh;
}

function _creativePublishFocus(sessionId){
  const projectId = _creativeProject && _creativeProject.id;
  const run = async () => {
    const project = _creativeProject;
    if(!project || project.id !== projectId || !sessionId) return;
    const scope = _creativeScope();
    if(scope.scope === 'field') return;
    if((project.chat_session_id || '') !== sessionId) return;
    if((project.chat_stage || '') === (scope.stage || '') && !(project.chat_field || '')) return;
    try{
      await api('/api/creative-studio/projects/' + projectId + '/chat-focus', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({session_id:sessionId, stage:scope.stage, field:''}),
      });
      if(_creativeProject && _creativeProject.id === projectId && _creativeScope().stage === scope.stage && !_creativeFocusField){
        _creativeProject.chat_stage = scope.stage;
        _creativeProject.chat_field = '';
      }
    }catch(_){}
  };
  const next = _creativeFocusJob.then(run, run);
  _creativeFocusJob = next;
  return next;
}

async function _creativeShowBoundChat(){
  const token = ++_creativeShowToken;
  try{
    _creativeMountChat();
    const id = await _creativeEnsureBoundSession();
    if(token !== _creativeShowToken || !id) return;
    await _creativePublishFocus(id);
    if(token !== _creativeShowToken) return;
    if(_creativeShowing === id || (typeof S !== 'undefined' && S.session && S.session.session_id === id)){
      _creativeShowing = id;
      return;
    }
    _creativeShowing = id;
    if(typeof loadSession === 'function') await loadSession(id, {preserveHome:true});
    if(token !== _creativeShowToken) return;
    _creativePaintChatTabs();
  }catch(err){
    if(_creativeShowing && token === _creativeShowToken) _creativeShowing = '';
    if(token !== _creativeShowToken) return;
    const message = (err && err.message) || 'Could not open the studio chat';
    if(typeof showToast === 'function') showToast(message, 3000, 'error');
  }
}

function _creativeWorkspaceLive(){
  return !!(
    _creativeProject
    && !_creativeCreating
    && document.getElementById('creativeFields')
    && document.getElementById('creativeChatMount')
  );
}

function _creativeFieldSignature(stage){
  const names = (CREATIVE_FIELDS[_creativeStage] || []).slice();
  const fields = (stage && stage.fields) || {};
  if(_creativeStage === 'copy') names.sort((a, b) => ((fields[a] && fields[a].order) || 0) - ((fields[b] && fields[b].order) || 0));
  return JSON.stringify({
    status: stage && stage.status,
    checks: _creativeProject.concept_checks || {},
    export: _creativeExportOpen,
    focus: _creativeFocusField,
    fields: names.map(name => {
      const slot = fields[name] || {};
      const pending = (slot.proposals || []).filter(item => item.status === 'proposed' || item.status === 'in_discussion').length;
      return [name, slot.claim || '', !!slot.include, slot.order || 0, !!slot.regulated, pending];
    }),
  });
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
    const proposals = (slot.proposals || []).filter(item => item.status === 'proposed' || item.status === 'in_discussion').map(proposal => {
      const next = ((proposal.revised_text || proposal.text) || '').trim();
      return `<article class="creative-suggest" data-proposal="${_creativeEsc(proposal.id)}">
        <p class="creative-suggest-next" dir="auto">${_creativeEsc(next)}</p>
        <div class="creative-actions">
          <button type="button" class="creative-suggest-apply" onclick="creativeProposalAction('${proposal.id}','accept')">Replace</button>
          <button type="button" class="creative-suggest-dismiss" onclick="creativeProposalAction('${proposal.id}','dismiss')">Dismiss</button>
        </div>
      </article>`;
    }).join('');
    const isolated = _creativeFocusField === name;
    return `<div class="creative-field${isolated ? ' isolated' : ''}" data-field="${name}">
      <div class="creative-field-label">
        <label>${_creativeEsc(_creativeLabel(name))} ${claim}</label>
        <button type="button" class="creative-isolate${isolated ? ' on' : ''}" aria-pressed="${isolated ? 'true' : 'false'}" onclick="creativeIsolateField('${name}')">${isolated ? 'Isolated' : 'Isolate'}</button>
      </div>
      ${help ? `<details class="creative-help-more"><summary>What does this mean?</summary>${help}</details>` : ''}
      ${copyTools}
      ${control}
      ${proposals}
    </div>`;
  }).join('');
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
    _creativeApplyProject(fresh);
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
  _creativeApplyProject(fresh);
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
