/* Creative Studio — guided wizard over /api/creative-studio. */
const CREATIVE_STEPS = [
  {id:'brief', label:'Strategy', title:'Audience & strategy', purpose:'Set the campaign goal and what is known about this audience. Hermes already has the product knowledge.'},
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
  brief:['product_offer','product_facts','audience_notes','objective','campaign_goal','awareness','mass_desire','sophistication','campaign_context','channel','format_length','assets','sources','summary_provided','summary_assumptions','summary_missing'],
  who:['outcome','demographic','facet','segment'],
  what:['concept','angle','ump','ums','mechanism','message_approach'],
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
  campaign_goal:'The business result for this creative. A studio default is not a fact inferred from the product.',
  awareness:'How aware this selected audience is. Unknown is not a confirmed level, and it does not choose the angle.',
  mass_desire:'The desire this audience already has. Apply a known source, or leave it blank until you accept a suggestion.',
  sophistication:'How exposed this market is to similar claims. This is not awareness.',
  campaign_context:'Whether this creative speaks to people who have not seen the product, or to people who have.',
  message_approach:'Optional attributes of the idea. These are not the campaign goal or the awareness level.',
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
  audience_notes:'Audience',
  objective:'Earlier objective',
  campaign_goal:'Campaign goal',
  awareness:'Awareness',
  mass_desire:'Core desire',
  sophistication:'Market sophistication',
  campaign_context:'Campaign context',
  message_approach:'Message approach',
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
const CREATIVE_GOAL_CHOICES = [
  {id:'purchase', label:'Purchase / conversion'},
  {id:'lead', label:'Lead'},
  {id:'traffic', label:'Traffic'},
  {id:'reach', label:'Reach / awareness'},
];
const CREATIVE_AWARENESS_CHOICES = [
  {id:'unaware', label:'Unaware'},
  {id:'problem_aware', label:'Problem aware'},
  {id:'solution_aware', label:'Solution aware'},
  {id:'product_aware', label:'Product aware'},
  {id:'most_aware', label:'Most aware'},
];
const CREATIVE_SOPHISTICATION_CHOICES = [
  {id:'stage_1', label:'Stage 1 — first to make this claim'},
  {id:'stage_2', label:'Stage 2 — a bigger version of a known claim'},
  {id:'stage_3', label:'Stage 3 — a new mechanism'},
  {id:'stage_4', label:'Stage 4 — a better mechanism'},
  {id:'stage_5', label:'Stage 5 — identification with the audience'},
];
const CREATIVE_CONTEXT_CHOICES = [
  {id:'', label:'Not specified'},
  {id:'cold', label:'Cold acquisition'},
  {id:'retargeting', label:'Retargeting'},
];
const CREATIVE_APPROACH_CHOICES = [
  {id:'educate', label:'Educate'},
  {id:'objections', label:'Handle objections'},
  {id:'urgency', label:'Urgency'},
];
const CREATIVE_STEP_FIELDS = {
  brief:[['brief','mass_desire']],
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
  brief:[],
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
let _creativeStrategyPrompt = '';
let _creativeAvatarComposer = false;
let _creativeSegmentBusy = false;
const CREATIVE_SEGMENT_HINT = 'Add an outcome, demographic, and facet first.';
const CREATIVE_BLOCK_FIELDS = [
  {field:'outcome', label:'Reuse a saved outcome'},
  {field:'demographic', label:'Reuse a saved demographic'},
  {field:'facet', label:'Reuse a saved facet'},
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
  _creativeStrategyPrompt = '';
  _creativeAvatarComposer = false;
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
  if(_creativeStage === 'who') return _creativeWhoBody();
  let extra = '';
  if(_creativeStage === 'what'){
    const checks = _creativeProject.concept_checks || {};
    const boxes = ['single_idea','plausibility','visualizability','villain'].map(key =>
      `<label><input type="checkbox" ${checks[key] ? 'checked' : ''} onchange="creativeToggleCheck('${key}', this.checked)"> ${_creativeEsc(key.replace(/_/g,' '))}</label>`
    ).join('');
    extra = `<div class="creative-card"><strong>Concept checks</strong><p class="creative-help">Single idea, plausibility, visualizability, and a villain that is not the customer. These are reminders, not a score.</p><div class="creative-checks">${boxes}</div></div>${_creativeMessageApproachControl()}`;
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
    ? `<div class="creative-card"><strong>Product knowledge</strong><p class="creative-help">Read from the Hermes product note and brand guidelines for ${_creativeEsc(name)}. Editing this project does not change that note.</p><pre class="creative-note">${_creativeEsc(note.excerpt || '')}</pre></div>`
    : '';
  const stored = CREATIVE_STORED_BRIEF.filter(fieldName => {
    const slot = _creativeProject.stages.brief.fields[fieldName] || {};
    return String(slot.text || '').trim();
  });
  const storedCard = stored.length
    ? `<details class="creative-card"><summary>Stored brief</summary>${stored.map(fieldName => _creativeFieldCard('brief', fieldName)).join('')}</details>`
    : '';
  const prompt = _creativeStrategyPrompt
    ? `<div class="creative-card"><strong>Send this in chat</strong><p>${_creativeEsc(_creativeStrategyPrompt)}</p><p class="creative-help">The suggestion stays separate until you choose Replace.</p></div>`
    : '';
  return `${noteCard}${_creativeGoalControl()}${_creativeAudienceControl()}${_creativeDiagnosisControl()}${_creativeLegacyObjective()}${prompt}${storedCard}`;
}

function _creativeWhoText(name){
  return String(((((_creativeProject.stages || {}).who || {}).fields || {})[name] || {}).text || '');
}

function _creativeWhoParentsReady(useLive){
  return CREATIVE_BLOCK_FIELDS.every(item => {
    if(!useLive) return _creativeWhoText(item.field).trim();
    const node = document.querySelector('#creativeFields [data-creative-field="' + item.field + '"]');
    const value = node ? node.value : _creativeWhoText(item.field);
    return String(value || '').trim();
  });
}

function _creativeBlockPicker(field, label){
  const rows = (((_creativeProject || {}).audience_blocks || {})[field]) || [];
  const current = _creativeWhoText(field).trim();
  const selected = rows.find(row => String(row.text || '').trim() === current);
  const groups = [['product', 'This product'], ['global', 'Other projects']];
  const options = groups.map(([scope, groupLabel]) => {
    const items = rows.filter(row => row.scope === scope);
    if(!items.length) return '';
    const choices = items.map(row => {
      const on = selected && selected.id === row.id;
      return `<option value="${_creativeEsc(row.id)}"${on ? ' selected' : ''}>${_creativeEsc(row.label || row.text)}</option>`;
    }).join('');
    return `<optgroup label="${_creativeEsc(groupLabel)}">${choices}</optgroup>`;
  }).join('');
  return `<select class="creative-block-picker" data-creative-block="${field}" aria-label="${_creativeEsc(label)}" onchange="creativePickBlock('${field}', this.value)">
    <option value=""${selected ? '' : ' selected'}>${_creativeEsc(label)}</option>
    ${options}
  </select>`;
}

function _creativeGenerateLead(){
  const ready = _creativeWhoParentsReady(false);
  const title = ready ? '' : CREATIVE_SEGMENT_HINT;
  return `<div class="creative-actions"><span id="creativeGenerateSegmentWrap" class="creative-generate-wrap" title="${_creativeEsc(title)}"><button type="button" class="creative-primary" id="creativeGenerateSegment" onclick="creativeGenerateSegment()" ${ready ? '' : 'disabled'}>Generate segment</button></span></div><p class="creative-segment-error" id="creativeSegmentError"></p>`;
}

function _creativeWhoBody(){
  const blocks = CREATIVE_BLOCK_FIELDS.map(item =>
    _creativeFieldCard('who', item.field, {picker: _creativeBlockPicker(item.field, item.label)})
  ).join('');
  return blocks + _creativeFieldCard('who', 'segment', {lead: _creativeGenerateLead()});
}

function _creativeSyncSegmentButton(){
  const button = document.getElementById('creativeGenerateSegment');
  const wrap = document.getElementById('creativeGenerateSegmentWrap');
  if(!button || !wrap) return;
  const ready = _creativeWhoParentsReady(true);
  button.disabled = !ready || _creativeSegmentBusy;
  wrap.title = ready ? '' : CREATIVE_SEGMENT_HINT;
}

async function creativePickBlock(field, id){
  if(!id){
    const select = document.querySelector('[data-creative-block="' + field + '"]');
    const rows = (((_creativeProject || {}).audience_blocks || {})[field]) || [];
    const current = _creativeWhoText(field).trim();
    const match = rows.find(row => String(row.text || '').trim() === current);
    if(select) select.value = match ? match.id : '';
    return;
  }
  const row = ((((_creativeProject || {}).audience_blocks || {})[field]) || []).find(item => item.id === id);
  if(!row) return;
  await creativePutField('who', field, row.text);
}

async function _creativeFlushFields(names){
  for(const name of names){
    if(!_creativeTimers[name]) continue;
    clearTimeout(_creativeTimers[name]);
    delete _creativeTimers[name];
    await creativeSaveField(name);
    if(_creativeSaveState === 'Save failed') throw new Error('Could not save the audience fields.');
  }
}

async function creativeGenerateSegment(){
  if(!_creativeProject || _creativeSegmentBusy) return;
  _creativeSyncSegmentButton();
  const button = document.getElementById('creativeGenerateSegment');
  if(!button || button.disabled) return;
  _creativeSegmentBusy = true;
  if(button) button.textContent = 'Generating…';
  _creativeSyncSegmentButton();
  const existing = document.getElementById('creativeSegmentError');
  if(existing) existing.textContent = '';
  let failed = '';
  try{
    await _creativeFlushFields(CREATIVE_BLOCK_FIELDS.map(item => item.field));
    const fresh = await api('/api/creative-studio/projects/' + _creativeProject.id + '/segment', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({}),
      retries:0,
      timeoutMs:60000,
    });
    _creativeApplyProject(fresh);
    _creativeDirty = Object.keys(_creativeTimers).length > 0;
    _creativeSaveState = _creativeDirty ? 'Saving…' : 'Saved';
  }catch(err){
    failed = (err && err.message) || 'Could not generate a segment.';
  }finally{
    _creativeSegmentBusy = false;
    const node = document.getElementById('creativeGenerateSegment');
    if(node) node.textContent = 'Generate segment';
    _creativeSyncLive();
    const error = document.getElementById('creativeSegmentError');
    if(error && failed) error.textContent = failed;
    _creativeSyncSegmentButton();
  }
}

function _creativeBriefSlot(name){
  return ((((_creativeProject.stages || {}).brief || {}).fields || {})[name]) || {text:'', proposals:[]};
}

function _creativeChoiceLabel(field, text){
  const lists = {
    campaign_goal:CREATIVE_GOAL_CHOICES,
    awareness:CREATIVE_AWARENESS_CHOICES,
    sophistication:CREATIVE_SOPHISTICATION_CHOICES,
    campaign_context:CREATIVE_CONTEXT_CHOICES,
    message_approach:CREATIVE_APPROACH_CHOICES,
  };
  if(field === 'message_approach'){
    return String(text || '').split(',').map(part => {
      const token = part.trim();
      const found = CREATIVE_APPROACH_CHOICES.find(item => item.id === token);
      return found ? found.label : token;
    }).filter(Boolean).join(', ');
  }
  const found = (lists[field] || []).find(item => item.id === text);
  if(found) return found.label;
  if(text === 'unknown') return 'Unknown';
  return text;
}

function _creativeChoiceGroup(field, legend, choices, current){
  const radios = choices.map(item => {
    const checked = current === item.id ? ' checked' : '';
    const id = 'creative-' + field + '-' + (item.id || 'none');
    return `<label class="creative-choice" for="${id}"><input type="radio" id="${id}" name="creative-${field}" value="${_creativeEsc(item.id)}"${checked} onchange="creativePickStrategy('${field}', this.value)"> <span>${_creativeEsc(item.label)}</span></label>`;
  }).join('');
  return `<div class="creative-choice-group" role="radiogroup" aria-label="${_creativeEsc(legend)}">${radios}</div>`;
}

function _creativeIsolateButton(field){
  const isolated = _creativeFocusField === field;
  return `<button type="button" class="creative-isolate${isolated ? ' on' : ''}" aria-pressed="${isolated ? 'true' : 'false'}" onclick="creativeIsolateField('${field}')">${isolated ? 'Isolated' : 'Isolate'}</button>`;
}

function _creativeGoalControl(){
  const slot = _creativeBriefSlot('campaign_goal');
  const current = String(slot.text || '').trim();
  const help = slot.origin === 'default'
    ? 'Studio default. Not inferred from this product.'
    : 'The business result for this creative. It is not the audience’s awareness.';
  return `<section class="creative-card creative-strategy-section" data-field="campaign_goal">
    <div class="creative-field-label"><h3>Campaign goal</h3>${_creativeIsolateButton('campaign_goal')}</div>
    <p class="creative-help">${_creativeEsc(help)}</p>
    ${_creativeChoiceGroup('campaign_goal', 'Campaign goal', CREATIVE_GOAL_CHOICES, current)}
    ${_creativeProposalMarkup(slot, 'campaign_goal')}
  </section>`;
}

function _creativeEvidenceRows(){
  const note = (_creativeProject && _creativeProject.product_note) || {};
  return [
    {id:'product', label:'Product note', text: note.available ? String(note.excerpt || '').trim() : ''},
    {id:'avatar', label:'Audience avatar', text: String((_creativeBriefSlot('audience_notes').text) || '').trim()},
    {id:'outcome', label:'Audience outcome', text: _creativeWhoText('outcome').trim()},
  ];
}

function _creativeEvidenceMarkup(){
  const rows = _creativeEvidenceRows().map(row => {
    const body = row.text
      ? `<p dir="auto">${_creativeEsc(row.text)}</p>`
      : '<p class="creative-help">Not on file.</p>';
    return `<li><strong>${_creativeEsc(row.label)}</strong>${body}</li>`;
  }).join('');
  return `<div class="creative-evidence-block"><strong>Project evidence</strong><p class="creative-help">A suggestion can use only this. It is not an inferred awareness level, desire, or sophistication stage.</p><ul class="creative-evidence">${rows}</ul></div>`;
}

function _creativeUnknownButton(field, current){
  const on = current === 'unknown';
  return `<button type="button" class="creative-unknown${on ? ' on' : ''}" aria-pressed="${on ? 'true' : 'false'}" onclick="creativeInfer('${field}')">Unknown / Help me infer</button>`;
}

function _creativeDiagnosisControl(){
  const awareness = _creativeBriefSlot('awareness');
  const awarenessText = String(awareness.text || '').trim();
  const avatar = String((_creativeBriefSlot('audience_notes').text) || '').trim();
  const avatarLine = avatar
    ? `Applies to this audience: ${avatar}`
    : 'Choose an audience above. Awareness belongs to that audience, not to the product.';
  const desire = _creativeBriefSlot('mass_desire');
  const sources = _creativeEvidenceRows().filter(row => row.text).map(row =>
    `<button type="button" onclick="creativeApplyDesire('${row.id}')">Use ${_creativeEsc(row.label)}</button>`
  ).join('');
  const sophistication = _creativeBriefSlot('sophistication');
  const sophisticationText = String(sophistication.text || '').trim();
  const context = _creativeBriefSlot('campaign_context');
  const contextText = String(context.text || '').trim();
  return `<section class="creative-card creative-strategy-section" data-field="awareness">
    <div class="creative-field-label"><h3>Audience diagnosis</h3>${_creativeIsolateButton('awareness')}</div>
    <p class="creative-help">${_creativeEsc(avatarLine)}</p>
    <p class="creative-help">Awareness</p>
    ${_creativeChoiceGroup('awareness', 'Awareness', CREATIVE_AWARENESS_CHOICES, awarenessText === 'unknown' ? '' : awarenessText)}
    ${_creativeUnknownButton('awareness', awarenessText)}
    ${_creativeProposalMarkup(awareness, 'awareness')}
    <div class="creative-field" data-field="mass_desire">
      <div class="creative-field-label"><label for="creativeMassDesire">Core desire</label>${_creativeIsolateButton('mass_desire')}</div>
      <p class="creative-help">${_creativeEsc(CREATIVE_HELP.mass_desire)}</p>
      <textarea id="creativeMassDesire" data-creative-stage="brief" data-creative-field="mass_desire" dir="auto" rows="3" oninput="creativeScheduleSave('mass_desire')">${_creativeEsc(desire.text || '')}</textarea>
      <div class="creative-actions">${sources}<button type="button" onclick="creativeInfer('mass_desire')">Help me infer</button></div>
      ${_creativeProposalMarkup(desire, 'mass_desire')}
    </div>
    ${_creativeEvidenceMarkup()}
    <details data-field="sophistication">
      <summary>Market sophistication (optional)</summary>
      <p class="creative-help">${_creativeEsc(CREATIVE_HELP.sophistication)}</p>
      ${_creativeChoiceGroup('sophistication', 'Market sophistication', CREATIVE_SOPHISTICATION_CHOICES, sophisticationText === 'unknown' ? '' : sophisticationText)}
      ${_creativeUnknownButton('sophistication', sophisticationText)}
      ${_creativeProposalMarkup(sophistication, 'sophistication')}
    </details>
    <details data-field="campaign_context">
      <summary>Campaign context (optional)</summary>
      <p class="creative-help">${_creativeEsc(CREATIVE_HELP.campaign_context)}</p>
      ${_creativeChoiceGroup('campaign_context', 'Campaign context', CREATIVE_CONTEXT_CHOICES, contextText)}
      ${_creativeProposalMarkup(context, 'campaign_context')}
    </details>
  </section>`;
}

function _creativeLegacyObjective(){
  const legacy = _creativeProject && _creativeProject.legacy_objective;
  if(!legacy || !String(legacy.text || '').trim()) return '';
  let action = '<p class="creative-help">This is kept from an earlier version. It is not a campaign goal or an awareness level.</p>';
  if(legacy.kind === 'campaign_context' && legacy.value && !legacy.applied){
    const label = legacy.value === 'cold' ? 'Cold acquisition' : 'Retargeting';
    action = `<p class="creative-help">This matches campaign context only. It does not set awareness or the campaign goal.</p><button type="button" onclick="creativePickStrategy('campaign_context','${legacy.value}')">Record as campaign context: ${_creativeEsc(label)}</button>`;
  }else if(legacy.applied){
    action = '<p class="creative-help">Recorded as campaign context. The earlier line is still kept.</p>';
  }
  return `<details class="creative-card" data-field="objective"><summary>Earlier objective (kept)</summary><p dir="auto">${_creativeEsc(legacy.text)}</p>${action}</details>`;
}

function _creativeMessageApproachControl(){
  const slot = ((((_creativeProject.stages || {}).what || {}).fields || {}).message_approach) || {text:'', proposals:[]};
  const selected = new Set(String(slot.text || '').split(',').map(part => part.trim()).filter(Boolean));
  const boxes = CREATIVE_APPROACH_CHOICES.map(item => {
    const id = 'creative-approach-' + item.id;
    return `<label class="creative-choice" for="${id}"><input type="checkbox" id="${id}" ${selected.has(item.id) ? 'checked' : ''} onchange="creativeToggleApproach('${item.id}', this.checked)"> <span>${_creativeEsc(item.label)}</span></label>`;
  }).join('');
  return `<fieldset class="creative-card creative-strategy-section"><legend>Message approach</legend><p class="creative-help">${_creativeEsc(CREATIVE_HELP.message_approach)}</p><div class="creative-choice-group">${boxes}</div>${_creativeProposalMarkup(slot, 'message_approach')}</fieldset>`;
}

function _creativeInferPrompt(field){
  const label = CREATIVE_LABELS[field] || field;
  const evidence = _creativeEvidenceRows().map(row => row.label + ': ' + (row.text || 'not on file')).join('\n');
  return 'Propose ' + label + ' for brief.' + field + '. Use only this project evidence:\n' + evidence + '\nSay what is uncertain. Save one proposal with save_creative_proposal. Do not update the selected field. If the evidence is missing, ask one focused question instead of inventing a level.';
}

async function creativePickStrategy(field, value){
  await creativePutField('brief', field, value);
}

async function creativeInfer(field){
  if(field === 'awareness' || field === 'sophistication'){
    await creativePutField('brief', field, 'unknown');
    if(_creativeSaveState === 'Save failed') return;
  }
  _creativeStrategyPrompt = _creativeInferPrompt(field);
  _creativeFocusField = field;
  _creativeChatOpen = true;
  creativeRenderWorkspace();
}

async function creativeApplyDesire(source){
  const row = _creativeEvidenceRows().find(item => item.id === source);
  if(!row || !String(row.text || '').trim()) return;
  await creativePutField('brief', 'mass_desire', row.text);
}

async function creativeToggleApproach(id, on){
  const slot = ((((_creativeProject.stages || {}).what || {}).fields || {}).message_approach) || {};
  const selected = new Set(String(slot.text || '').split(',').map(part => part.trim()).filter(Boolean));
  if(on) selected.add(id);
  else selected.delete(id);
  const text = CREATIVE_APPROACH_CHOICES.filter(item => selected.has(item.id)).map(item => item.id).join(', ');
  await creativePutField('what', 'message_approach', text);
}

function _creativeAudienceRows(){
  const rows = ((_creativeProject && _creativeProject.audience_avatars) || []).slice();
  const current = String(((((_creativeProject.stages || {}).brief || {}).fields || {}).audience_notes || {}).text || '').trim();
  if(current && !rows.some(row => String(row.text || '').trim() === current)){
    rows.unshift({id:'current', label:'Current avatar', text:current, source:'current'});
  }
  return rows;
}

function _creativeAudienceControl(){
  const slot = (((_creativeProject.stages.brief || {}).fields || {}).audience_notes) || {text:'', proposals:[]};
  const current = String(slot.text || '').trim();
  const rows = _creativeAudienceRows();
  const selected = rows.find(row => String(row.text || '').trim() === current);
  const groups = [
    ['preset', 'Product avatars'],
    ['saved', 'Saved for this product'],
    ['history', 'Used on recent ads'],
    ['current', 'This ad'],
  ];
  const options = groups.map(([source, label]) => {
    const items = rows.filter(row => row.source === source);
    if(!items.length) return '';
    const choices = items.map(row => {
      const on = selected && selected.id === row.id;
      return `<option value="${_creativeEsc(row.id)}"${on ? ' selected' : ''}>${_creativeEsc(row.label || row.text)}</option>`;
    }).join('');
    return `<optgroup label="${_creativeEsc(label)}">${choices}</optgroup>`;
  }).join('');
  const isolated = _creativeFocusField === 'audience_notes';
  const composer = _creativeAvatarComposer
    ? `<div class="creative-avatar-create">
        <label for="creativeAvatarLabel">Avatar name</label>
        <input id="creativeAvatarLabel" dir="auto" maxlength="80" autocomplete="off" placeholder="Night bakers">
        <label for="creativeAvatarText">Who they are</label>
        <textarea id="creativeAvatarText" dir="auto" rows="3" maxlength="2000" placeholder="People who bake after a night shift"></textarea>
        <p class="creative-help" id="creativeAvatarError"></p>
        <button type="button" class="creative-primary" onclick="creativeSaveAvatar()">Save avatar</button>
      </div>`
    : '';
  return `<div class="creative-field${isolated ? ' isolated' : ''}" data-field="audience_notes">
    <div class="creative-field-label">
      <label for="creativeAvatarSelect">Audience</label>
      <button type="button" class="creative-isolate${isolated ? ' on' : ''}" aria-pressed="${isolated ? 'true' : 'false'}" onclick="creativeIsolateField('audience_notes')">${isolated ? 'Isolated' : 'Isolate'}</button>
    </div>
    <p class="creative-help">Avatars saved for this product, including audiences used on recent ads.</p>
    <select id="creativeAvatarSelect" aria-label="Audience avatar" onchange="creativePickAvatar(this.value)">
      <option value=""${!selected && !_creativeAvatarComposer ? ' selected' : ''}>Choose an avatar</option>
      ${options}
      <option value="__new__"${_creativeAvatarComposer ? ' selected' : ''}>+ New Avatar</option>
    </select>
    ${composer}
    ${_creativeProposalMarkup(slot)}
  </div>`;
}

async function creativePickAvatar(id){
  if(id === '__new__'){
    _creativeAvatarComposer = true;
    _creativeRepaintFields();
    const node = document.getElementById('creativeAvatarLabel');
    if(node) node.focus();
    return;
  }
  _creativeAvatarComposer = false;
  if(!id){
    await creativePutField('brief', 'audience_notes', '');
    return;
  }
  const avatar = _creativeAudienceRows().find(item => item.id === id);
  if(!avatar) return;
  await creativePutField('brief', 'audience_notes', avatar.text);
}

async function creativeSaveAvatar(){
  if(!_creativeProject) return;
  const labelNode = document.getElementById('creativeAvatarLabel');
  const textNode = document.getElementById('creativeAvatarText');
  const error = document.getElementById('creativeAvatarError');
  const label = labelNode ? labelNode.value.trim() : '';
  const text = textNode ? textNode.value.trim() : '';
  if(!text){
    if(error) error.textContent = 'Describe the avatar.';
    return;
  }
  try{
    _creativeSaveState = 'Saving…';
    const fresh = await api('/api/creative-studio/projects/' + _creativeProject.id + '/avatars', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({label, text}),
    });
    _creativeAvatarComposer = false;
    _creativeSaveState = 'Saved';
    _creativeDirty = false;
    _creativeApplyProject(fresh);
    _creativeSyncLive();
  }catch(err){
    _creativeSaveState = 'Save failed';
    if(error) error.textContent = (err && err.message) || 'Could not save the avatar.';
    const state = document.getElementById('creativeSaveState');
    if(state){ state.textContent = 'Save failed'; state.classList.add('failed'); }
  }
}

async function creativePutField(stage, field, text){
  if(!_creativeProject) return;
  _creativeSaveState = 'Saving…';
  const state = document.getElementById('creativeSaveState');
  if(state){ state.textContent = 'Saving…'; state.classList.remove('failed'); }
  try{
    const result = await api('/api/creative-studio/projects/' + _creativeProject.id + '/fields', {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({stage, field, text, author:'user'}),
    });
    _creativeDirty = Object.keys(_creativeTimers).length > 0;
    _creativeSaveState = _creativeDirty ? 'Saving…' : 'Saved';
    if(result.review_fields && result.review_fields.length && typeof showToast === 'function'){
      const names = result.review_fields.map(item => CREATIVE_LABELS[item.field] || _creativeLabel(item.field || '')).join(', ');
      showToast('Needs review: ' + names, 2800);
    }
    const fresh = await api('/api/creative-studio/projects/' + _creativeProject.id);
    _creativeApplyProject(fresh);
    if(!_creativeDirty) _creativeSyncLive();
  }catch(err){
    _creativeDirty = false;
    _creativeSaveState = 'Save failed';
    if(state){ state.textContent = 'Save failed'; state.classList.add('failed'); }
    _creativeRepaintFields();
  }
}

function _creativeRepaintFields(){
  const fieldsRoot = document.getElementById('creativeFields');
  const stage = _creativeProject && _creativeProject.stages && _creativeProject.stages[_creativeStage];
  if(!fieldsRoot || !stage){
    creativeRenderWorkspace();
    return;
  }
  _creativeRememberOpenDetails();
  fieldsRoot.innerHTML = _creativeStageMarkup(stage);
  fieldsRoot.dataset.signature = _creativeFieldSignature(stage);
  _creativeRestoreOpenDetails();
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
    ['brief','awareness','Awareness'],
    ['brief','campaign_goal','Campaign goal'],
    ['what','concept','Core idea'],
    ['brief','product_offer','Product'],
  ];
  return `<ul class="creative-context-list">${bits.map(([stage, field, label]) => {
    const slot = (((_creativeProject.stages[stage] || {}).fields || {})[field]) || {};
    const text = String(slot.text || '').trim();
    let display = text ? _creativeChoiceLabel(field, text) : 'Missing';
    if(field === 'campaign_goal' && slot.origin === 'default' && text) display += ' (studio default)';
    if(text === 'unknown') display = 'Unknown';
    return `<li class="${text ? 'present' : 'missing'}"><span>${label}</span> ${_creativeEsc(display)}</li>`;
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
    strategyPrompt: _creativeStrategyPrompt,
    anchor: ['what.concept','who.segment','brief.campaign_goal','brief.awareness','brief.product_offer'].map(_creativeFilled),
    avatarComposer: _creativeAvatarComposer,
    strategy: ['campaign_goal','awareness','mass_desire','sophistication','campaign_context','objective'].map(name => {
      const slot = (((_creativeProject.stages.brief || {}).fields || {})[name]) || {};
      const pending = (slot.proposals || []).filter(item => item.status === 'proposed' || item.status === 'in_discussion').length;
      return [name, slot.text || '', slot.origin || '', pending, !!slot.needs_review];
    }),
    approach: String(((((_creativeProject.stages || {}).what || {}).fields || {}).message_approach || {}).text || ''),
    legacy: _creativeProject.legacy_objective || null,
    audience: String((((_creativeProject.stages.brief || {}).fields || {}).audience_notes || {}).text || ''),
    avatars: ((_creativeProject.audience_avatars || []).map(row => row.id + ':' + row.source + ':' + row.text)).join('|'),
    blocks: CREATIVE_BLOCK_FIELDS.map(item => {
      const rows = ((_creativeProject.audience_blocks || {})[item.field]) || [];
      return rows.map(row => row.scope + ':' + row.id + ':' + row.text).join('|');
    }),
    review: CREATIVE_STEPS.map(step => {
      const row = (_creativeProject.stages || {})[step.id] || {};
      const fields = row.fields || {};
      return [step.id, row.status || '', Object.keys(fields).filter(name => fields[name] && fields[name].needs_review).join(',')];
    }),
    note: !!(_creativeProject.product_note && _creativeProject.product_note.available),
    fields: pairs.map(([owner, name]) => {
      const slot = (((_creativeProject.stages || {})[owner] || {}).fields || {})[name] || {};
      const pending = (slot.proposals || []).filter(item => item.status === 'proposed' || item.status === 'in_discussion').length;
      return [owner, name, slot.claim || '', !!slot.include, slot.order || 0, !!slot.regulated, !!slot.needs_review, pending];
    }),
  });
}

function _creativeSyncLive(){
  if(_creativeSegmentBusy) return;
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

function _creativeProposalMarkup(slot, field){
  return ((slot && slot.proposals) || []).filter(item => item.status === 'proposed' || item.status === 'in_discussion').map(proposal => {
    const next = ((proposal.revised_text || proposal.text) || '').trim();
    const shown = field ? _creativeChoiceLabel(field, next) : next;
    const note = (proposal.discussion || '').trim();
    const kicker = proposal.exploratory ? 'Exploratory suggestion' : 'Suggestion';
    const reason = note ? `<p class="creative-suggest-note" dir="auto">${_creativeEsc(note)}</p>` : '';
    return `<article class="creative-suggest" data-proposal="${_creativeEsc(proposal.id)}">
      <div class="creative-suggest-head">
        <span class="creative-suggest-kicker">${kicker}</span>
      </div>
      ${reason}
      <p class="creative-suggest-next" dir="auto">${_creativeEsc(shown)}</p>
      <div class="creative-actions">
        <button type="button" class="creative-suggest-dismiss" onclick="creativeProposalAction('${proposal.id}','dismiss')">Dismiss</button>
        <button type="button" class="creative-suggest-apply" onclick="creativeProposalAction('${proposal.id}','accept')">Replace</button>
      </div>
    </article>`;
  }).join('');
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
  const picker = options.picker || '';
  const lead = options.lead || '';
  const control = `<textarea data-creative-stage="${stageId}" data-creative-field="${name}" dir="auto" rows="4" oninput="creativeScheduleSave('${name}')">${_creativeEsc(slot.text || '')}</textarea>`;
  const proposals = _creativeProposalMarkup(slot);
  const isolated = _creativeFocusField === name;
  const label = CREATIVE_LABELS[name] || _creativeLabel(name);
  return `<div class="creative-field${isolated ? ' isolated' : ''}" data-field="${name}">
    <div class="creative-field-label">
      <label>${_creativeEsc(label)} ${optional}${claim}${review}</label>
      <button type="button" class="creative-isolate${isolated ? ' on' : ''}" aria-pressed="${isolated ? 'true' : 'false'}" onclick="creativeIsolateField('${name}')">${isolated ? 'Isolated' : 'Isolate'}</button>
    </div>
    ${help}
    ${picker}
    ${lead}
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
  _creativeSyncSegmentButton();
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
