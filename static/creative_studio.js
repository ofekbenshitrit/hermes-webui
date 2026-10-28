/* Creative Studio — guided wizard over /api/creative-studio. */
const CREATIVE_STEPS = [
  {id:'brief', label:'Product', title:'Product & objective', purpose:'Establish the product facts and what this ad should do.'},
  {id:'who', label:'Audience', title:'Audience', purpose:'Define who the ad is for and the situation or belief that makes the message land.'},
  {id:'what', label:'Idea', title:'Core idea', purpose:'Choose the single idea, then keep the problem mechanism separate from the solution mechanism.'},
  {id:'hook', label:'Hook', title:'Hook', purpose:'Develop one opening from that idea, ground it in the facts, and polish the line you will ship.'},
  {id:'casts', label:'Execution', title:'Execution', purpose:'Specify how the selected idea and hook appear in the ad.'},
  {id:'copy', label:'Copy', title:'Copy & export', purpose:'Assemble the copy blocks and export a handoff of the selected work.'},
];
const CREATIVE_STAGES = CREATIVE_STEPS;
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
  hook_type:'Optional hook approach. This is not the format, and it is not required before the idea is clear.',
  format:'Where and how the ad runs, including length or placement. This is not the hook approach.',
  channel:'Where the ad will run, if you know it.',
  format_length:'Length or placement limits the hook has to fit.',
  caveman_simple:'A plain version of the one idea. A working note, not the final line.',
  core_trigger:'The one idea the hook commits to.',
  verbal_hook:'The spoken or written opening. Leave it empty when this format has no words.',
  visual_hook:'The pictured opening. Leave it empty when this format has no picture.',
  deep_fry:'An exploratory draft. Not a final claim.',
  walk_it_back:'The exploratory draft walked back to what the facts support.',
  make_it_bang:'Polish notes. Not a score.',
  final_hook:'The opening you are willing to ship. Review is qualitative: first words, one idea, format, and whether the claim is supported or still needs a source. It is not a score.',
  conceit:'The central execution idea. A full storyboard is out of scope unless you ask in chat.',
};
const CREATIVE_LABELS = {
  product_facts:'Product facts',
  audience_notes:'Audience notes',
  objective:'Objective',
  outcome:'Outcome',
  demographic:'Demographic',
  facet:'Facet',
  segment:'Audience segment',
  angle:'Angle',
  pain:'Pain',
  promise:'Promise',
  proof:'Proof',
  curiosity:'Curiosity',
  constraints:'Constraints',
  conditions:'Conditions',
  conceit:'Conceit',
  actors:'Actors',
  style:'Style',
  terrain:'Terrain',
  setup:'Setup',
  channel:'Channel',
  format_length:'Length and placement',
  hook_type:'Hook approach',
  format:'Format / placement',
  ump:'Problem mechanism (UMP)',
  ums:'Solution mechanism (UMS)',
  mechanism:'Mechanism summary',
  concept:'Core idea',
  caveman_simple:'Caveman-simple',
  core_trigger:'One central idea',
  deep_fry:'Exploratory draft',
  walk_it_back:'Grounded draft',
  make_it_bang:'Polish notes',
  final_hook:'Final hook',
  visual_hook:'Visual hook',
  verbal_hook:'Verbal hook',
};
const CREATIVE_STEP_FIELDS = {
  brief:[['brief','product_facts'],['brief','objective'],['brief','audience_notes']],
  who:[['who','outcome'],['who','demographic'],['who','facet'],['who','segment']],
  what:[['what','concept'],['what','angle'],['what','ump'],['what','ums'],['what','mechanism']],
  hook:[
    ['brief','channel'],['brief','format_length'],['hook','format'],['hook','hook_type'],
    ['hook','caveman_simple'],['hook','core_trigger'],
    ['hook','verbal_hook'],['hook','visual_hook'],['hook','deep_fry'],['hook','walk_it_back'],
    ['hook','final_hook'],['hook','make_it_bang'],
  ],
  casts:[['casts','conceit'],['casts','actors'],['casts','style'],['casts','terrain'],['casts','setup']],
  copy:[['copy','pain'],['copy','promise'],['copy','proof'],['copy','curiosity'],['copy','constraints'],['copy','conditions']],
};
const CREATIVE_STORED_BRIEF = ['summary_provided','summary_assumptions','summary_missing','assets','sources'];
const CREATIVE_PREREQ_FIELDS = {
  brief:['product_facts','objective'],
  who:['segment'],
  what:['concept','ump','ums','mechanism'],
  hook:['format','final_hook'],
  casts:['conceit'],
  copy:['pain','promise'],
};
let _creativeProjects = [];
let _creativeProject = null;
let _creativeStage = 'brief';
let _creativeChatOpen = true;
let _creativeFocusField = '';
let _creativeChatWidth = 340;
let _creativeExportOpen = false;
let _creativeExportMode = 'handoff';
let _creativeHookPrompt = '';
let _creativeSaveState = 'Saved';
let _creativeTimers = {};
let _creativePoll = null;
let _creativeSeenProposals = new Set();
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
    _creativeStage = 'brief';
    _creativeExportMode = 'handoff';
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
  _creativeSeenProposals = new Set(_creativeProposalIds(project));
  const storedMode = project.export_options && project.export_options.mode;
  if(storedMode === 'full' || storedMode === 'handoff') _creativeExportMode = storedMode;
  if(!(opts && opts.keepStage) || !CREATIVE_STEPS.some(stage => stage.id === _creativeStage)) _creativeStage = 'brief';
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

function creativeSetStage(stage, opts){
  if(!CREATIVE_STEPS.some(item => item.id === stage)) return;
  if(stage !== _creativeStage && !(opts && opts.keepFocus)) _creativeFocusField = '';
  Object.keys(_creativeTimers).forEach(field => {
    clearTimeout(_creativeTimers[field]);
    creativeSaveField(field);
  });
  _creativeStage = stage;
  creativeRenderWorkspace();
  if(opts && opts.keepFocus && _creativeFocusField){
    const field = document.querySelector('#creativeFields [data-creative-field="' + _creativeFocusField + '"]');
    if(field){
      field.scrollIntoView({block:'center'});
      field.focus();
      return;
    }
  }
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
      <div class="creative-stagebar" role="tablist" aria-label="Creative steps" onkeydown="creativeStageKey(event)">${CREATIVE_STEPS.map(item => {
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
  if(document.getElementById('creativeExportPreview')) void creativeExport();
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
  const meta = CREATIVE_STEPS.find(item => item.id === _creativeStage);
  const status = stage.status || 'not_started';
  const options = Object.keys(CREATIVE_STATUS).map(key =>
    `<option value="${key}" ${key === status ? 'selected' : ''}>${CREATIVE_STATUS[key]}</option>`
  ).join('');
  const index = CREATIVE_STEPS.findIndex(item => item.id === _creativeStage);
  const nav = `<div class="creative-step-nav"><button type="button" class="creative-ghost" onclick="creativeMoveStage(-1)" ${index <= 0 ? 'disabled' : ''}>Back</button><button type="button" class="creative-primary" onclick="creativeMoveStage(1)" ${index >= CREATIVE_STEPS.length - 1 ? 'disabled' : ''}>Continue</button></div>`;
  const exportBox = (_creativeStage === 'copy' || _creativeExportOpen) ? _creativeExportCard() : '';
  return `<div class="creative-stage-head"><div><p class="creative-wizard-kicker">Step ${index + 1} of ${CREATIVE_STEPS.length}</p><h2>${_creativeEsc(meta ? meta.title : '')}</h2><p class="creative-help">${_creativeEsc(meta ? meta.purpose : '')} Ask Hermes to suggest a field. Nothing is selected for you until you replace a field.</p></div><label class="creative-status-select">Step <select aria-label="Step status" onchange="creativeMarkStage(this.value)">${options}</select></label></div>${_creativeReviewNotice()}${_creativePrereqMarkup()}${_creativeStepBody(stage)}${exportBox}${nav}`;
}

function _creativeStepBody(stage){
  if(_creativeStage === 'brief') return _creativeBriefBody(stage);
  if(_creativeStage === 'hook') return _creativeHookBody();
  let extra = '';
  if(_creativeStage === 'what'){
    const checks = _creativeProject.concept_checks || {};
    const boxes = ['single_idea','plausibility','visualizability','villain'].map(key =>
      `<label><input type="checkbox" ${checks[key] ? 'checked' : ''} onchange="creativeToggleCheck('${key}', this.checked)"> ${_creativeEsc(key.replace(/_/g,' '))}</label>`
    ).join('');
    extra = `<div class="creative-card"><strong>Concept checks</strong><p class="creative-help">Single idea, plausibility, visualizability, and a villain that is not the customer. These are reminders, not a score.</p><div class="creative-checks">${boxes}</div></div>`;
  }
  const names = (CREATIVE_STEP_FIELDS[_creativeStage] || []).filter(pair => pair[0] === _creativeStage).map(pair => pair[1]);
  if(_creativeStage === 'copy'){
    names.sort((a, b) => ((stage.fields[a] && stage.fields[a].order) || 0) - ((stage.fields[b] && stage.fields[b].order) || 0));
  }
  return extra + names.map(name => _creativeFieldCard(_creativeStage, name)).join('');
}

function _creativeBriefBody(){
  const note = _creativeProject.product_note || {};
  const offer = ((_creativeProject.stages.brief.fields.product_offer || {}).text) || '';
  const name = note.name || offer || 'this product';
  const noteCard = note.available
    ? `<div class="creative-card"><strong>Product note</strong><p class="creative-help">Read from the Hermes product note for ${_creativeEsc(name)}. Editing this project does not change that note.</p><pre class="creative-note">${_creativeEsc(note.excerpt || '')}</pre></div>`
    : `<div class="creative-card"><strong>Product note</strong><p class="creative-help">No product note is on file for ${_creativeEsc(name || 'this product')}. Nothing here is being treated as a known fact.</p></div>`;
  const explore = _creativeProject.exploratory_product
    ? `<div class="creative-review-notice" role="status"><strong>Exploratory.</strong> <span>Product facts are not on file. Later suggestions should stay labelled exploratory until you add facts or a product note.</span></div>`
    : '';
  const stored = CREATIVE_STORED_BRIEF.filter(name => {
    const slot = _creativeProject.stages.brief.fields[name] || {};
    return String(slot.text || '').trim();
  });
  const storedCard = stored.length
    ? `<details class="creative-card"><summary>Stored brief</summary>${stored.map(name => _creativeFieldCard('brief', name)).join('')}</details>`
    : '';
  return `${noteCard}${explore}${_creativeFieldCard('brief','product_facts')}${_creativeFieldCard('brief','objective')}${_creativeFieldCard('brief','audience_notes', {optional:true})}${storedCard}`;
}

function _creativeHookBody(){
  const prompt = _creativeHookPrompt
    ? `<div class="creative-card creative-hook-prompt"><strong>Send this in chat</strong><p>${_creativeEsc(_creativeHookPrompt)}</p><p class="creative-help">The draft stays in its field until you replace it.</p></div>`
    : '';
  const ideaText = [
    ((_creativeProject.stages.hook.fields.caveman_simple || {}).text) || '',
    ((_creativeProject.stages.hook.fields.core_trigger || {}).text) || '',
  ].join(' ');
  const split = _creativeManyIdeas(ideaText)
    ? `<p class="creative-help">This draft may contain more than one idea. Pick the one the hook should commit to.</p>`
    : '';
  const anchor = String(((_creativeProject.stages.what.fields.concept || {}).text) || '').trim();
  const anchorCard = `<p class="creative-help">Core idea: ${_creativeEsc(anchor || 'Not chosen yet.')}</p>`;
  return `${prompt}
    <section class="creative-card" data-hook-group="direction"><strong>Hook direction</strong><p class="creative-help">Format is where the ad runs. Hook approach is how it opens. They stay separate.</p>${_creativeContextChips()}${_creativeFieldCard('brief','channel')}${_creativeFieldCard('brief','format_length')}${_creativeFieldCard('hook','format')}${_creativeFieldCard('hook','hook_type', {optional:true})}</section>
    <section class="creative-card" data-hook-group="idea"><strong>Find the hook idea</strong>${anchorCard}${split}${_creativeFieldCard('hook','caveman_simple')}${_creativeFieldCard('hook','core_trigger')}</section>
    <section class="creative-card" data-hook-group="explore"><strong>Working drafts</strong><p class="creative-help">Exploratory lines stay drafts. Grounding keeps the original and does not turn an unsupported claim into a fact.</p><div class="creative-actions"><button type="button" onclick="creativeHookAction('deep_fry','Explore a more provocative version of the committed idea. Keep it as a draft, and do not treat it as a verified claim.')">Explore</button><button type="button" onclick="creativeHookAction('walk_it_back','Walk the exploratory draft back to the strongest version the product facts support. Keep the original draft. If support is missing, mark the claim as needing a source.')">Ground</button></div>${_creativeFieldCard('hook','verbal_hook')}${_creativeFieldCard('hook','visual_hook')}${_creativeFieldCard('hook','deep_fry', {accept:true})}${_creativeFieldCard('hook','walk_it_back', {accept:true})}</section>
    <section class="creative-card" data-hook-group="polish"><strong>Polish and select</strong><p class="creative-help">Does it open with the compelling part, stay specific, keep one idea, fit the format, and stay supported or marked as needing a source? The visual line should complement the verbal line. This is not a score.</p><div class="creative-actions"><button type="button" onclick="creativeHookAction('final_hook','Polish the selected hook for one clear idea, the chosen format, and a claim that is supported or explicitly needs a source. Do not score it.')">Polish</button></div>${_creativeFieldCard('hook','final_hook')}<details><summary>Polish notes</summary>${_creativeFieldCard('hook','make_it_bang')}</details></section>`;
}

function _creativeContextChips(){
  const bits = [
    ['who','segment','Audience'],
    ['what','concept','Core idea'],
    ['brief','objective','Objective'],
    ['brief','product_facts','Product facts'],
  ];
  return `<ul class="creative-context-list">${bits.map(([stage, field, label]) => {
    const text = String((((_creativeProject.stages[stage] || {}).fields || {})[field] || {}).text || '').trim();
    return `<li class="${text ? 'present' : 'missing'}"><span>${label}</span> ${_creativeEsc(text || 'Missing')}</li>`;
  }).join('')}</ul>`;
}

function _creativeManyIdeas(text){
  const value = String(text || '').trim();
  if(!value) return false;
  if(/\band\b/i.test(value)) return true;
  return value.split(/[.!?]+/).filter(part => part.trim()).length > 1;
}

function _creativeFilled(key){
  const parts = String(key || '').split('.');
  if(parts.length !== 2 || !_creativeProject) return false;
  const slot = (((_creativeProject.stages || {})[parts[0]] || {}).fields || {})[parts[1]] || {};
  return !!String(slot.text || '').trim();
}

function _creativePrereqMarkup(){
  const names = CREATIVE_PREREQ_FIELDS[_creativeStage] || [];
  const ctx = (_creativeProject && _creativeProject.field_context) || {};
  const required = new Map();
  const helpful = new Map();
  names.forEach(name => {
    const spec = ctx[name] || {};
    (spec.required || []).forEach(key => required.set(key, _creativeFilled(key)));
    (spec.helpful || []).forEach(key => {
      if(!required.has(key)) helpful.set(key, _creativeFilled(key));
    });
  });
  if(!required.size && !helpful.size) return '';
  const row = (key, ok, kind) => {
    const field = String(key).split('.')[1] || key;
    const label = CREATIVE_LABELS[field] || _creativeLabel(field);
    const state = ok ? 'Present' : (kind === 'required' ? 'Missing, required' : 'Missing, optional');
    return `<li class="${ok ? 'present' : 'missing'}">${_creativeEsc(label)} <span>${state}</span></li>`;
  };
  const explore = [...required.values()].some(ok => !ok)
    ? '<p class="creative-help">A suggestion from this step will be exploratory until every required input is present.</p>'
    : '';
  return `<div class="creative-card creative-prereq"><strong>Uses earlier work</strong>${explore}<ul>${[...required].map(([key, ok]) => row(key, ok, 'required')).join('')}${[...helpful].map(([key, ok]) => row(key, ok, 'helpful')).join('')}</ul></div>`;
}

function _creativeReviewNotice(){
  if(!_creativeProject || !_creativeProject.stages) return '';
  const items = [];
  CREATIVE_STEPS.forEach(step => {
    const row = _creativeProject.stages[step.id];
    if(!row || !row.fields) return;
    const flagged = Object.keys(row.fields).filter(name => row.fields[name] && row.fields[name].needs_review);
    if(flagged.length){
      flagged.forEach(name => items.push({stage:step.id, field:name}));
      return;
    }
    const hasKeys = Object.values(row.fields).some(slot => slot && Object.prototype.hasOwnProperty.call(slot, 'needs_review'));
    if(row.status === 'review_recommended' && !hasKeys){
      const filled = Object.keys(row.fields).filter(name => String((row.fields[name] && row.fields[name].text) || '').trim());
      (filled.length ? filled : ['']).forEach(name => items.push({stage:step.id, field:name}));
    }
  });
  if(!items.length) return '';
  const buttons = items.map(item => {
    const label = item.field ? (CREATIVE_LABELS[item.field] || _creativeLabel(item.field)) : (CREATIVE_STEPS.find(step => step.id === item.stage) || {}).label;
    return `<button type="button" onclick="creativeJumpReview('${item.stage}','${item.field}')">${_creativeEsc(label)}</button>`;
  }).join('');
  return `<div class="creative-review-notice" role="status"><strong>Needs review.</strong> <span>Upstream work changed. The text is still here.</span><div class="creative-actions">${buttons}</div></div>`;
}

function creativeJumpReview(stage, field){
  _creativeFocusField = field || '';
  creativeSetStage(stage, {keepFocus:true});
}

function creativeHookAction(field, prompt){
  _creativeFocusField = field;
  _creativeHookPrompt = prompt || '';
  _creativeChatOpen = true;
  creativeRenderWorkspace();
}

async function creativeAcceptFinal(sourceField){
  if(!_creativeProject) return;
  const node = document.querySelector(`[data-creative-field="${sourceField}"]`);
  const slot = (((_creativeProject.stages.hook || {}).fields || {})[sourceField]) || {};
  const text = node ? node.value : (slot.text || '');
  if(!String(text).trim()) return;
  await api('/api/creative-studio/projects/' + _creativeProject.id + '/fields', {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({stage:'hook', field:'final_hook', text, author:'user'}),
  });
  await creativeReloadQuiet();
}

function _creativeExportCard(){
  const full = _creativeExportMode === 'full';
  const alts = full ? '<label class="creative-inline-tools"><input id="creativeIncludeAlts" type="checkbox" onchange="creativeExport()"> Include saved alternatives</label>' : '';
  return `<div class="creative-card" id="creativeExportCard"><strong>Export</strong><p class="creative-help">Creative handoff is the selected final material. Full working document keeps statuses, notes, and intermediate fields.</p><div class="creative-actions"><button type="button" class="${full ? 'creative-ghost' : 'creative-primary'}" data-export-mode="handoff" aria-pressed="${full ? 'false' : 'true'}" onclick="creativeSetExportMode('handoff')">Creative handoff</button><button type="button" class="${full ? 'creative-primary' : 'creative-ghost'}" data-export-mode="full" aria-pressed="${full ? 'true' : 'false'}" onclick="creativeSetExportMode('full')">Full working document</button></div>${alts}<pre id="creativeExportPreview"></pre><button type="button" class="creative-inline-btn" onclick="creativeCopyExport()">Copy Markdown</button></div>`;
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

function _creativeOwnerStage(field){
  const node = document.querySelector(`[data-creative-field="${field}"]`);
  const marked = node && node.getAttribute('data-creative-stage');
  if(marked) return marked;
  for(const step of CREATIVE_STEPS){
    if((CREATIVE_FIELDS[step.id] || []).includes(field)) return step.id;
  }
  return _creativeStage;
}

function _creativeScope(){
  if(_creativeFocusField) return {scope:'field', stage:_creativeOwnerStage(_creativeFocusField), field:_creativeFocusField};
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

function _creativeVisiblePairs(){
  const pairs = (CREATIVE_STEP_FIELDS[_creativeStage] || []).slice();
  if(_creativeStage === 'brief' && _creativeProject && _creativeProject.stages && _creativeProject.stages.brief){
    CREATIVE_STORED_BRIEF.forEach(name => {
      const slot = _creativeProject.stages.brief.fields[name] || {};
      if(String(slot.text || '').trim()) pairs.push(['brief', name]);
    });
  }
  return pairs;
}

function _creativeFieldSignature(stage){
  const pairs = _creativeVisiblePairs();
  return JSON.stringify({
    status: stage && stage.status,
    checks: _creativeProject.concept_checks || {},
    export: _creativeExportOpen,
    mode: _creativeExportMode,
    focus: _creativeFocusField,
    prompt: _creativeHookPrompt,
    anchor: ['what.concept','who.segment','brief.objective','brief.product_facts'].map(_creativeFilled),
    review: CREATIVE_STEPS.map(step => {
      const row = (_creativeProject.stages || {})[step.id] || {};
      const fields = row.fields || {};
      return [step.id, row.status || '', Object.keys(fields).filter(name => fields[name] && fields[name].needs_review).join(',')];
    }),
    note: !!(_creativeProject.product_note && _creativeProject.product_note.available),
    explore: !!_creativeProject.exploratory_product,
    fields: pairs.map(([owner, name]) => {
      const slot = (((_creativeProject.stages || {})[owner] || {}).fields || {})[name] || {};
      const pending = (slot.proposals || []).filter(item => item.status === 'proposed' || item.status === 'in_discussion').length;
      return [owner, name, slot.claim || '', !!slot.include, slot.order || 0, !!slot.regulated, !!slot.needs_review, pending];
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
    _creativeVisiblePairs().forEach(([owner, field]) => {
      const node = document.querySelector(`[data-creative-field="${field}"]`);
      if(!node || node === active || _creativeTimers[field]) return;
      const slot = (((project.stages || {})[owner] || {}).fields || {})[field] || {};
      if(node.value !== (slot.text || '')) node.value = slot.text || '';
    });
  }
}

function _creativeFieldCard(stageId, name, options){
  options = options || {};
  const stage = (_creativeProject.stages && _creativeProject.stages[stageId]) || {fields:{}};
  const slot = (stage.fields && stage.fields[name]) || {text:'', proposals:[], include:true, order:0};
  const help = CREATIVE_HELP[name] ? `<p class="creative-help">${_creativeEsc(CREATIVE_HELP[name])}</p>` : '';
  const claim = (slot.claim === 'needs_verification' || slot.regulated) ? '<span class="creative-claim needs">Needs source</span>' : '';
  const review = slot.needs_review ? '<span class="creative-claim needs">Needs review</span>' : '';
  const optional = options.optional ? '<span class="creative-claim">Optional</span>' : '';
  const copyTools = stageId === 'copy' ? `<div class="creative-inline-tools"><label><input type="checkbox" ${slot.include !== false ? 'checked' : ''} onchange="creativeToggleInclude('${name}', this.checked)"> Include</label> <button type="button" class="creative-inline-btn" onclick="creativeNudgeOrder('${name}', -1)">Up</button> <button type="button" class="creative-inline-btn" onclick="creativeNudgeOrder('${name}', 1)">Down</button></div>` : '';
  const accept = options.accept ? `<button type="button" class="creative-inline-btn" onclick="creativeAcceptFinal('${name}')">Accept as final</button>` : '';
  const control = `<textarea data-creative-stage="${stageId}" data-creative-field="${name}" dir="auto" rows="4" oninput="creativeScheduleSave('${name}')">${_creativeEsc(slot.text || '')}</textarea>`;
  const proposals = (slot.proposals || []).filter(item => item.status === 'proposed' || item.status === 'in_discussion').map(proposal => {
    const next = ((proposal.revised_text || proposal.text) || '').trim();
    const note = (proposal.discussion || '').trim();
    const kicker = proposal.exploratory ? 'Exploratory suggestion' : 'Suggestion';
    const reason = note ? `<p class="creative-suggest-note" dir="auto">${_creativeEsc(note)}</p>` : '';
    return `<article class="creative-suggest" data-proposal="${_creativeEsc(proposal.id)}">
      <div class="creative-suggest-head">
        <span class="creative-suggest-kicker">${kicker}</span>
      </div>
      ${reason}
      <p class="creative-suggest-next" dir="auto">${_creativeEsc(next)}</p>
      <div class="creative-actions">
        <button type="button" class="creative-suggest-dismiss" onclick="creativeProposalAction('${proposal.id}','dismiss')">Dismiss</button>
        <button type="button" class="creative-suggest-apply" onclick="creativeProposalAction('${proposal.id}','accept')">Replace</button>
      </div>
    </article>`;
  }).join('');
  const isolated = _creativeFocusField === name;
  const label = CREATIVE_LABELS[name] || _creativeLabel(name);
  return `<div class="creative-field${isolated ? ' isolated' : ''}" data-field="${name}">
    <div class="creative-field-label">
      <label>${_creativeEsc(label)} ${optional}${claim}${review}</label>
      <button type="button" class="creative-isolate${isolated ? ' on' : ''}" aria-pressed="${isolated ? 'true' : 'false'}" onclick="creativeIsolateField('${name}')">${isolated ? 'Isolated' : 'Isolate'}</button>
    </div>
    ${help}
    ${copyTools}
    ${accept}
    ${control}
    ${proposals}
  </div>`;
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
    const stage = input.getAttribute('data-creative-stage') || _creativeOwnerStage(field);
    const result = await api('/api/creative-studio/projects/' + _creativeProject.id + '/fields', {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({stage, field, text:input.value, author:'user'}),
    });
    delete _creativeTimers[field];
    _creativeDirty = Object.keys(_creativeTimers).length > 0;
    _creativeSaveState = _creativeDirty ? 'Saving…' : 'Saved';
    const label = document.getElementById('creativeSaveState');
    if(label) label.textContent = _creativeSaveState;
    if(result.review_fields && result.review_fields.length && typeof showToast === 'function'){
      const names = result.review_fields.map(item => CREATIVE_LABELS[item.field] || _creativeLabel(item.field || '')).join(', ');
      showToast('Needs review: ' + names, 2800);
    }
    const fresh = await api('/api/creative-studio/projects/' + _creativeProject.id);
    _creativeApplyProject(fresh);
    if(!_creativeDirty) _creativeSyncLive();
  }catch(err){
    delete _creativeTimers[field];
    _creativeDirty = true;
    _creativeSaveState = 'Save failed';
    const label = document.getElementById('creativeSaveState');
    if(label){ label.textContent = 'Save failed'; label.classList.add('failed'); }
  }
}

async function creativeRetrySave(){
  const dirty = document.querySelector('[data-creative-field]');
  if(dirty) await creativeSaveField(dirty.getAttribute('data-creative-field'));
}

function _creativeProposalIds(project){
  const ids = [];
  if(!project || !project.stages) return ids;
  CREATIVE_STAGES.forEach(item => {
    const fields = (project.stages[item.id] && project.stages[item.id].fields) || {};
    Object.keys(fields).forEach(name => {
      ((fields[name] && fields[name].proposals) || []).forEach(proposal => {
        if(proposal && (proposal.status === 'proposed' || proposal.status === 'in_discussion') && proposal.id) ids.push(proposal.id);
      });
    });
  });
  return ids;
}

function _creativeStageForProposal(project, id){
  for(const item of CREATIVE_STAGES){
    const fields = (project.stages[item.id] && project.stages[item.id].fields) || {};
    for(const slot of Object.values(fields)){
      if((slot.proposals || []).some(proposal => proposal && proposal.id === id)) return item.id;
    }
  }
  return '';
}

async function creativeReloadQuiet(){
  if(!_creativeProject || _creativeDirty) return;
  const fresh = await api('/api/creative-studio/projects/' + _creativeProject.id);
  if(_creativeDirty) return;
  const unseen = _creativeProposalIds(fresh).find(id => !_creativeSeenProposals.has(id));
  _creativeSeenProposals = new Set(_creativeProposalIds(fresh));
  _creativeApplyProject(fresh);
  if(unseen && !_creativeDirty){
    const stage = _creativeStageForProposal(fresh, unseen);
    if(stage && stage !== _creativeStage){
      _creativeStage = stage;
      creativeRenderWorkspace();
      return;
    }
  }
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

async function creativeSetExportMode(mode){
  _creativeExportMode = mode === 'full' ? 'full' : 'handoff';
  if(_creativeProject){
    try{
      await api('/api/creative-studio/projects/' + _creativeProject.id + '/export-options', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({mode:_creativeExportMode}),
      });
      _creativeProject.export_options = Object.assign({}, _creativeProject.export_options, {mode:_creativeExportMode});
    }catch(_){}
  }
  creativeRenderWorkspace();
}

async function creativeExport(){
  if(!_creativeProject) return;
  const mode = _creativeExportMode === 'full' ? 'full' : 'handoff';
  const include = document.getElementById('creativeIncludeAlts');
  const flag = mode === 'full' && include && include.checked ? '1' : '0';
  let data;
  try{
    data = await api(`/api/creative-studio/projects/${_creativeProject.id}/export?include_alternatives=${flag}&mode=${encodeURIComponent(mode)}`);
  }catch(_){
    return null;
  }
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
  }, 1000);
}
