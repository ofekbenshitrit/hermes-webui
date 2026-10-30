/* Creative Studio — guided wizard over /api/creative-studio. */
const CREATIVE_STEPS = [
  {id:'brief', label:'Strategy', title:'Audience & strategy', purpose:'The goal, the audience, and how aware they are.'},
  {id:'who', label:'Audience', title:'Audience', purpose:'Who the ad is for, in one sentence.'},
  {id:'what', label:'Idea', title:'Core idea', purpose:'One idea, then the problem and how the product fixes it.'},
  {id:'hook', label:'Hook', title:'Hook', purpose:'One line, and the picture that opens the ad.'},
  {id:'casts', label:'Execution', title:'Execution', purpose:'How that idea shows up in the ad.'},
  {id:'copy', label:'Copy', title:'Copy', purpose:'The lines to hand off, in the order they should run.'},
];
const CREATIVE_STAGES = CREATIVE_STEPS;
const CREATIVE_STATUS = {
  not_started:'Empty',
  draft:'Draft',
  approved:'Approved',
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
  mass_desire:'The desire this audience already has.',
  sophistication:'How exposed this market is to similar claims. This is not awareness.',
  campaign_context:'Whether this creative speaks to people who have not seen the product, or to people who have.',
  message_approach:'Optional attributes of the idea. These are not the campaign goal or the awareness level.',
  concept:'One idea, not the feature list: the false belief colliding with the real mechanism. One sentence, showable, with a villain that is not the customer.',
  angle:'The point of view: a false solution, the root-cause mechanism, us vs them, a daily moment, a counter-intuitive warning, or a functional before/after.',
  ump:'Why the problem actually happens. Keep this separate from the solution.',
  ums:'How this product physically fixes that fault. Keep this separate from the problem.',
  mechanism:'UMP plus UMS: how the product produces the outcome. Unsupported claims stay labeled Needs source/verification.',
  hook_type:'The move that fries the concept. It is not the format, and it comes after the one idea.',
  format:'The asset and its constraint together: UGC, founder, static, reel, or feed, plus length or placement.',
  channel:'Where the ad will run, if you know it.',
  format_length:'Length or placement limits the hook has to fit.',
  caveman_simple:'An earlier plain note. The committed idea is the core concept.',
  core_trigger:'One idea, in caveman language. One short sentence. A second idea, or a sentence joined with and, has to be cut.',
  verbal_hook:'The first spoken or written line. The idea leads the first words. One idea, specific, no generic question.',
  visual_hook:'The opening image or first three seconds. It contrasts with or reinforces the verbal line.',
  deep_fry:'The concept pushed through the chosen move. A draft, not a verified claim.',
  walk_it_back:'The fried angle walked back to what the mechanism supports. The fried draft stays.',
  make_it_bang:'Earlier polish notes. Not the line, and not a score.',
  final_hook:'The verbal line and the visual opening together. One idea, supported or marked as needing a source. Not a score.',
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
  hook_type:'Deep-fry move',
  format:'Format and placement',
  ump:'Problem mechanism (UMP)',
  ums:'Solution mechanism (UMS)',
  mechanism:'Mechanism summary',
  concept:'Core idea',
  caveman_simple:'Earlier caveman note',
  core_trigger:'Core concept',
  deep_fry:'Deep-fried angle',
  walk_it_back:'Grounded claim',
  make_it_bang:'Earlier polish notes',
  final_hook:'Final hook pair',
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
  {id:'stage_1', label:'First to make this claim'},
  {id:'stage_2', label:'A bigger version of a known claim'},
  {id:'stage_3', label:'A new mechanism'},
  {id:'stage_4', label:'A better mechanism'},
  {id:'stage_5', label:'Identification with the audience'},
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
const CREATIVE_MOVE_CHOICES = [
  {id:'good_is_bad', label:'Good thing is bad'},
  {id:'bad_is_good', label:'Bad thing is good'},
  {id:'ineffective_harmful', label:'Ineffective is harmful'},
  {id:'identity_contrast', label:'Identity contrast'},
  {id:'reverse_causation', label:'Reverse causation'},
  {id:'rename', label:'Rename'},
];
const CREATIVE_STEP_FIELDS = {
  brief:[['brief','mass_desire']],
  who:[['who','outcome'],['who','demographic'],['who','facet'],['who','segment']],
  what:[['what','concept'],['what','angle'],['what','ump'],['what','ums'],['what','mechanism']],
  hook:[
    ['hook','core_trigger'],['hook','hook_type'],['hook','deep_fry'],['hook','walk_it_back'],
    ['hook','format'],['hook','verbal_hook'],['hook','visual_hook'],['hook','final_hook'],
  ],
  casts:[['casts','conceit'],['casts','actors'],['casts','style'],['casts','terrain'],['casts','setup']],
  copy:[['copy','pain'],['copy','promise'],['copy','proof'],['copy','curiosity'],['copy','constraints'],['copy','conditions']],
};
const CREATIVE_STORED_BRIEF = ['summary_provided','summary_assumptions','summary_missing','assets','sources'];
const CREATIVE_PREREQ_FIELDS = {
  brief:[],
  who:['segment'],
  what:['concept','ump','ums','mechanism'],
  hook:['final_hook'],
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
let _creativeExportReturn = null;
let _creativeExportMode = 'handoff';
let _creativeHookPrompt = '';
let _creativeSaveState = 'Saved';
let _creativeTimers = {};
let _creativePoll = null;
let _creativeSeenProposals = new Set();
let _creativeDirty = false;
let _creativeCreating = false;
let _creativeBrowsing = true;
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
  if(_creativeProject && _creativeProject.id && !_creativeBrowsing){
    await creativeOpenProject(_creativeProject.id, {keepStage:true});
  } else {
    _creativeBrowsing = true;
    creativeRenderWorkspace();
  }
  _creativeStartPoll();
}

async function creativeRefreshList(){
  const data = await api('/api/creative-studio/projects');
  _creativeProjects = data.projects || [];
}

function _creativeWhen(value){
  if(!value) return '';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {month:'short', day:'numeric'});
}

function _creativeNewButton(){
  return `<button type="button" class="creative-icon-btn" aria-label="New project" title="New project" onclick="creativeNewProject()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`;
}

function _creativeRecentMenu(){
  const rows = _creativeProjects.slice(0, 8);
  const items = rows.length
    ? rows.map(row => {
        const current = _creativeProject && _creativeProject.id === row.id;
        const product = (row.product || '').trim();
        return `<button type="button" onclick="creativeOpenProject('${row.id}')"${current ? ' aria-current="true"' : ''}><span>${_creativeEsc(row.name)}</span>${product ? `<small>${_creativeEsc(product)}</small>` : ''}</button>`;
      }).join('')
    : '<p class="creative-recent-empty">No projects yet</p>';
  const all = _creativeBrowsing ? '' : '<button type="button" class="creative-recent-all" onclick="creativeShowProjects()">All projects</button>';
  return `<div class="creative-menu creative-recent" id="creativeRecentMenu" role="menu" hidden>${items}${all}</div>`;
}

function _creativeProjectsCluster(label){
  return `<span class="creative-crumb-projects">${label}<button type="button" class="creative-crumb-chevron" aria-label="Recent projects" aria-haspopup="menu" aria-expanded="false" aria-controls="creativeRecentMenu" onclick="creativeToggleRecent(event)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>${_creativeRecentMenu()}</span>`;
}

function _creativeCrumb(current){
  const projects = _creativeProjectsCluster(current
    ? '<button type="button" class="creative-crumb-link" onclick="creativeShowProjects()">Projects</button>'
    : '<span class="creative-crumb-current">Projects</span>');
  if(!current) return projects;
  return `${projects}<span class="creative-crumb-sep" aria-hidden="true">/</span><span class="creative-crumb-current">${_creativeEsc(current)}</span>`;
}

function _creativePageHeader(current, tools){
  return `<header class="creative-header"><nav class="creative-crumb" aria-label="Projects">${_creativeCrumb(current)}</nav><div class="creative-header-tools">${tools || ''}</div></header>`;
}

function _creativeIndexMarkup(){
  const cards = _creativeProjects.map(row => {
    const open = _creativeProject && _creativeProject.id === row.id ? ' is-open' : '';
    const product = (row.product || '').trim();
    const when = _creativeWhen(row.updated_at);
    const progress = row.progress ? `${row.progress.done} of ${row.progress.total} steps` : '';
    const meta = [product || 'No product', progress, when].filter(Boolean).join(' · ');
    return `<button type="button" class="creative-project-card${open}" onclick="creativeOpenProject('${row.id}')"><strong>${_creativeEsc(row.name)}</strong><small>${_creativeEsc(meta)}</small></button>`;
  }).join('');
  const body = cards
    ? `<div class="creative-project-grid">${cards}</div>`
    : '<div class="main-view-empty"><div class="main-view-empty-title">No projects yet</div><div class="main-view-empty-sub">Name a creative and the product. Hermes looks the product up from the notes it already has.</div><button type="button" class="creative-primary" onclick="creativeNewProject()">New project</button></div>';
  return `<div class="creative-index">${_creativePageHeader('', _creativeNewButton())}${body}</div>`;
}

async function creativeShowProjects(){
  _creativeCreating = false;
  _creativeBrowsing = true;
  try{ await creativeRefreshList(); }catch(_){}
  creativeRenderWorkspace();
}

async function creativeNewProject(){
  _creativeCreating = true;
  _creativeBrowsing = false;
  _creativeProject = null;
  creativeRenderWorkspace();
  const name = document.getElementById('creativeCreateName');
  if(name) name.focus();
}

function creativeCancelCreate(){
  _creativeCreating = false;
  _creativeBrowsing = true;
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
    _creativeBrowsing = false;
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
  _creativeCreating = false;
  _creativeBrowsing = false;
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
  _creativeCreating = false;
  _creativeBrowsing = true;
  await creativeRefreshList();
  creativeRenderWorkspace();
}

function _creativeCreateMarkup(){
  return `<div class="creative-index">${_creativePageHeader('New project')}<form id="creativeCreateForm" class="creative-wizard" onsubmit="creativeSubmitCreate(); return false;">
    <div class="creative-wizard-body">
      <p class="creative-wizard-kicker">New creative</p>
      <h2>Name it and name the product</h2>
      <p class="creative-wizard-lead">Name the creative and the product. Hermes looks the product up from the notes it already has.</p>
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
  </form></div>`;
}

function _creativeShownStatus(status){
  if(status === 'review_recommended') return 'draft';
  return status || 'not_started';
}

function _creativeStatusLabel(status){
  return CREATIVE_STATUS[_creativeShownStatus(status)] || 'Draft';
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
  if(_creativeBrowsing || !_creativeProject){
    _creativeBrowsing = true;
    root.innerHTML = _creativeIndexMarkup();
    void creativeReleaseChat();
    return;
  }
  const project = _creativeProject;
  const stage = project.stages[_creativeStage] || {fields:{}, status:'not_started'};
  const saveText = _creativeSaveState === 'Saved' ? '' : _creativeSaveState;
  const chatPane = _creativeChatOpen ? `${_creativeChatTabsMarkup()}
      <div class="creative-chat-resizer" role="separator" aria-orientation="vertical" aria-label="Resize chat" onpointerdown="creativeChatResizeStart(event)"></div>
      <aside class="creative-chat" id="creativeAssistant" aria-label="Project chat">
        <div id="creativeChatMount"></div>
      </aside>` : '';
  root.innerHTML = `
    <div class="creative-frame${_creativeChatOpen ? '' : ' chat-closed'}" style="--creative-chat-width:${_creativeChatWidth}px">
    <div class="creative-header">
      <div class="creative-project-chip">
        <nav class="creative-crumb" aria-label="Projects">${_creativeCrumb(project.name)}</nav>
        <span class="creative-save ${_creativeSaveState === 'Save failed' ? 'failed' : ''}" id="creativeSaveState">${_creativeEsc(saveText)}</span>
        <button type="button" class="creative-icon-btn" aria-label="Project actions" aria-expanded="false" onclick="creativeToggleMenu(event)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
        </button>
        <div class="creative-menu" id="creativeProjectMenu" hidden>
          <button type="button" onclick="creativeRenameProject('${project.id}')">Rename</button>
          <button type="button" onclick="creativeDuplicateProject('${project.id}')">Duplicate</button>
          <button type="button" onclick="creativeOpenExport()">Export</button>
          ${_creativeSaveState === 'Save failed' ? '<button type="button" onclick="creativeRetrySave()">Retry save</button>' : ''}
          <button type="button" class="creative-menu-danger" onclick="creativeDeleteProject('${project.id}')">Delete</button>
        </div>
      </div>
      <div class="creative-header-tools">
        <button type="button" class="creative-icon-btn${_creativeChatOpen ? ' on' : ''}" aria-label="${_creativeChatOpen ? 'Hide chat' : 'Show chat'}" aria-pressed="${_creativeChatOpen ? 'true' : 'false'}" onclick="creativeToggleChat()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg>
        </button>
      </div>
    </div>
    <div class="creative-stagebar" role="tablist" aria-label="Creative steps" onkeydown="creativeStageKey(event)">${CREATIVE_STEPS.map(item => {
      const status = _creativeShownStatus((project.stages[item.id] && project.stages[item.id].status) || 'not_started');
      const statusLabel = _creativeStatusLabel(status);
      const selected = item.id === _creativeStage;
      return `<button type="button" role="tab" id="creativeTab-${item.id}" class="creative-stage-tab${selected ? ' active' : ''}" aria-selected="${selected ? 'true' : 'false'}" aria-label="${_creativeEsc(item.label + ', ' + statusLabel)}" tabindex="${selected ? '0' : '-1'}" title="${_creativeEsc(statusLabel)}" onclick="creativeSetStage('${item.id}')"><span>${item.label}</span><i class="creative-dot creative-dot-${_creativeEsc(status)}"></i></button>`;
    }).join('')}</div>
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

function creativeToggleRecent(event){
  if(event) event.stopPropagation();
  const menu = document.getElementById('creativeRecentMenu');
  const button = event && event.currentTarget;
  if(!menu) return;
  const projectMenu = document.getElementById('creativeProjectMenu');
  if(projectMenu) projectMenu.hidden = true;
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

function creativeToggleMenu(event){
  if(event) event.stopPropagation();
  const menu = document.getElementById('creativeProjectMenu');
  const button = event && event.currentTarget;
  if(!menu) return;
  const recent = document.getElementById('creativeRecentMenu');
  if(recent){
    recent.hidden = true;
    const chevron = document.querySelector('.creative-crumb-chevron');
    if(chevron) chevron.setAttribute('aria-expanded', 'false');
  }
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
  const index = CREATIVE_STEPS.findIndex(item => item.id === _creativeStage);
  const nav = `<div class="creative-step-nav"><button type="button" class="creative-ghost" onclick="creativeMoveStage(-1)" ${index <= 0 ? 'disabled' : ''}>Back</button><button type="button" class="creative-primary" onclick="creativeMoveStage(1)" ${index >= CREATIVE_STEPS.length - 1 ? 'disabled' : ''}>Continue</button></div>`;
  const purpose = meta && meta.purpose ? `<p class="creative-help">${_creativeEsc(meta.purpose)}</p>` : '';
  return `<div class="creative-stage"><header class="creative-stage-head"><div><h2>${_creativeEsc(meta ? meta.title : '')}</h2>${purpose}</div></header>${_creativePrereqMarkup()}<div class="creative-stage-body">${_creativeStepBody(stage)}</div>${nav}</div>`;
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
    extra = `${_creativeMessageApproachControl()}<div class="creative-checks-row"><span>Reminders</span><div class="creative-checks">${boxes}</div></div>`;
  }
  const names = (CREATIVE_STEP_FIELDS[_creativeStage] || []).filter(pair => pair[0] === _creativeStage).map(pair => pair[1]);
  if(_creativeStage === 'copy'){
    names.sort((a, b) => ((stage.fields[a] && stage.fields[a].order) || 0) - ((stage.fields[b] && stage.fields[b].order) || 0));
  }
  return names.map(name => _creativeFieldCard(_creativeStage, name)).join('') + extra;
}

function _creativeBriefBody(){
  const note = _creativeProject.product_note || {};
  const offer = ((_creativeProject.stages.brief.fields.product_offer || {}).text) || '';
  const name = note.name || offer || 'this product';
  const noteCard = note.available
    ? `<details class="creative-fold" data-field="product_note"><summary>Product knowledge</summary><p class="creative-help">From the Hermes note for ${_creativeEsc(name)}. Editing here does not change that note.</p><pre class="creative-note">${_creativeEsc(note.excerpt || '')}</pre></details>`
    : '';
  const stored = CREATIVE_STORED_BRIEF.filter(fieldName => {
    const slot = _creativeProject.stages.brief.fields[fieldName] || {};
    return String(slot.text || '').trim();
  });
  const storedCard = stored.length
    ? `<details class="creative-fold" data-field="stored_brief"><summary>Earlier brief notes</summary>${stored.map(fieldName => _creativeFieldCard('brief', fieldName)).join('')}</details>`
    : '';
  const prompt = _creativePromptBar(_creativeStrategyPrompt);
  return `${prompt}${_creativeGoalControl()}${_creativeAudienceControl()}${_creativeDiagnosisControl()}${_creativeLegacyObjective()}${noteCard}${storedCard}`;
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

function _creativeMenuText(row){
  const text = String((row && row.text) || '').trim();
  const label = String((row && row.label) || '').trim();
  if(!text) return label;
  if(!label || text === label || text.startsWith(label)) return text;
  return label + '\n' + text;
}

function _creativeBoxDir(text){
  if(typeof bidiDirForText === 'function') return bidiDirForText(text) || 'auto';
  return 'auto';
}

const CREATIVE_HISTORY_ICON = '<svg class="creative-history-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

function _creativePicker(options){
  const selectedId = options.selectedId || '';
  const groups = (options.groups || []).map(([label, items]) => {
    if(!items.length) return '';
    const choices = items.map(row => {
      const on = row.id === selectedId;
      return `<button type="button" role="option" class="creative-picker-option" data-value="${_creativeEsc(row.id)}" aria-selected="${on ? 'true' : 'false'}" onclick="creativePickerChoose(this)"><span dir="auto">${_creativeEsc(row.label)}</span></button>`;
    }).join('');
    return `<div class="creative-picker-group" role="group" aria-label="${_creativeEsc(label)}"><div class="creative-picker-label">${_creativeEsc(label)}</div>${choices}</div>`;
  }).join('');
  const extras = (options.extras || []).map(row => {
    const on = row.id === selectedId;
    return `<button type="button" role="option" class="creative-picker-option" data-value="${_creativeEsc(row.id)}" aria-selected="${on ? 'true' : 'false'}" onclick="creativePickerChoose(this)"><span dir="auto">${_creativeEsc(row.label)}</span></button>`;
  }).join('');
  const triggerId = options.triggerId ? ` id="${_creativeEsc(options.triggerId)}"` : '';
  const menu = `${options.leading || ''}${groups}${extras}`;
  const history = options.variant === 'history';
  const trigger = history
    ? `<button type="button" class="creative-history-trigger"${triggerId} aria-haspopup="listbox" aria-expanded="false" aria-controls="${_creativeEsc(options.listId)}" aria-label="${_creativeEsc(options.ariaLabel)}" title="${_creativeEsc(options.ariaLabel)}" onclick="creativePickerToggle(this)">${CREATIVE_HISTORY_ICON}</button>`
    : `<button type="button" class="creative-picker-trigger"${triggerId} aria-haspopup="listbox" aria-expanded="false" aria-controls="${_creativeEsc(options.listId)}" aria-label="${_creativeEsc(options.ariaLabel)}" onclick="creativePickerToggle(this)">
      <span class="creative-picker-value" dir="auto">${_creativeEsc(options.selectedLabel || options.placeholder)}</span>
      <svg class="creative-picker-chevron" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>`;
  return `<div class="creative-picker${history ? ' creative-history-picker' : ''}${options.className ? ' ' + options.className : ''}" data-creative-picker="${_creativeEsc(options.kind)}"${options.field ? ` data-field="${_creativeEsc(options.field)}"` : ''}>
    ${trigger}
    <div class="creative-picker-panel" id="${_creativeEsc(options.listId)}" role="listbox" hidden>
      ${menu}
    </div>
  </div>`;
}

function creativePickerToggle(button){
  const picker = button.closest('.creative-picker');
  const panel = picker && picker.querySelector('.creative-picker-panel');
  if(!panel) return;
  const willOpen = panel.hidden;
  document.querySelectorAll('.creative-picker-panel').forEach(node => {
    node.hidden = true;
    const trigger = node.parentElement && node.parentElement.querySelector('.creative-picker-trigger, .creative-history-trigger');
    if(trigger) trigger.setAttribute('aria-expanded', 'false');
  });
  if(!willOpen) return;
  panel.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  const close = (event) => {
    if(event.type === 'keydown' && event.key !== 'Escape') return;
    if(event.type === 'click' && picker.contains(event.target)) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', close);
    document.removeEventListener('keydown', close);
  };
  setTimeout(() => {
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
  }, 0);
}

function creativePickerChoose(button){
  const picker = button.closest('.creative-picker');
  if(!picker) return;
  const panel = picker.querySelector('.creative-picker-panel');
  const trigger = picker.querySelector('.creative-picker-trigger, .creative-history-trigger');
  if(panel) panel.hidden = true;
  if(trigger) trigger.setAttribute('aria-expanded', 'false');
  const value = button.getAttribute('data-value') || '';
  if(picker.getAttribute('data-creative-picker') === 'avatar') creativePickAvatar(value);
  else creativePickBlock(picker.getAttribute('data-field'), value);
}

function _creativeBlockPicker(field, label){
  const rows = (((_creativeProject || {}).audience_blocks || {})[field]) || [];
  if(!rows.length) return '';
  const current = _creativeWhoText(field).trim();
  const selected = rows.find(row => String(row.text || '').trim() === current);
  const groups = [['product', 'This product'], ['global', 'Other projects']].map(([scope, groupLabel]) => [
    groupLabel,
    rows.filter(row => row.scope === scope).map(row => ({id: row.id, label: _creativeMenuText(row)})),
  ]);
  return _creativePicker({
    kind: 'block',
    variant: 'history',
    field,
    className: 'creative-block-picker',
    listId: 'creativeBlockList-' + field,
    ariaLabel: label,
    placeholder: label,
    selectedId: selected ? selected.id : '',
    groups,
  });
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
  if(!id) return;
  const row = ((((_creativeProject || {}).audience_blocks || {})[field]) || []).find(item => item.id === id);
  if(!row) return;
  await creativePutField('who', field, row.text);
  const input = document.querySelector(`[data-creative-field="${field}"]`);
  if(!input) return;
  _creativeSyncBoxDir(field);
  input.focus();
  const end = input.value.length;
  if(typeof input.setSelectionRange === 'function') input.setSelectionRange(end, end);
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
    hook_type:CREATIVE_MOVE_CHOICES,
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

function _creativeChoiceGroup(field, legend, choices, current, stage, compact){
  const owner = stage || 'brief';
  const radios = choices.map(item => {
    const checked = current === item.id ? ' checked' : '';
    const id = 'creative-' + field + '-' + (item.id || 'none');
    return `<label class="creative-choice" for="${id}"><input type="radio" id="${id}" name="creative-${field}" value="${_creativeEsc(item.id)}"${checked} onchange="creativePickChoice('${owner}','${field}', this.value)"> <span>${_creativeEsc(item.label)}</span></label>`;
  }).join('');
  return `<div class="creative-choice-group${compact ? ' compact' : ''}" role="radiogroup" aria-label="${_creativeEsc(legend)}">${radios}</div>`;
}

function _creativeGuideButton(field){
  if(typeof CREATIVE_GUIDE === 'undefined' || !CREATIVE_GUIDE[field]) return '';
  const label = CREATIVE_LABELS[field] || _creativeLabel(field);
  const text = 'Explain ' + label;
  return `<button type="button" class="creative-guide" data-creative-guide="${field}" aria-haspopup="dialog" aria-label="${_creativeEsc(text)}" title="${_creativeEsc(text)}" onclick="creativeOpenGuide('${field}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5h.01"/></svg></button>`;
}

function _creativeGuideItem(item){
  if(typeof item === 'string') return `<li dir="auto">${_creativeEsc(item)}</li>`;
  const lead = item.lead ? `<strong>${_creativeEsc(item.lead)}</strong>` : '';
  const text = item.text ? `${lead ? ' ' : ''}${_creativeEsc(item.text)}` : '';
  const sub = item.sub ? `<ul>${item.sub.map(_creativeGuideItem).join('')}</ul>` : '';
  return `<li dir="auto">${lead}${text}${sub}</li>`;
}

function _creativeGuideBlocks(blocks){
  return (blocks || []).map(block => {
    if(block.h2) return `<h3 dir="auto">${_creativeEsc(block.h2)}</h3>`;
    if(block.h3) return `<h4 dir="auto">${_creativeEsc(block.h3)}</h4>`;
    if(block.p) return `<p dir="auto">${_creativeEsc(block.p)}</p>`;
    if(block.em) return `<p dir="auto"><em>${_creativeEsc(block.em)}</em></p>`;
    if(block.ul) return `<ul>${block.ul.map(_creativeGuideItem).join('')}</ul>`;
    if(block.ol) return `<ol>${block.ol.map(_creativeGuideItem).join('')}</ol>`;
    return '';
  }).join('');
}

function _creativeGuideMarkup(field){
  const guide = (typeof CREATIVE_GUIDE !== 'undefined' && CREATIVE_GUIDE[field]) || null;
  if(!guide) return '';
  return `<div class="creative-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="creativeGuideTitle" tabindex="-1">
    <div class="creative-guide-head">
      <div>
        <p class="creative-guide-kicker" dir="auto">${_creativeEsc(guide.kicker || '')}</p>
        <h2 id="creativeGuideTitle" dir="auto">${_creativeEsc(guide.title || '')}</h2>
      </div>
      <button type="button" class="creative-guide-close" aria-label="Close" onclick="creativeCloseGuide()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="creative-guide-body">${_creativeGuideBlocks(guide.blocks)}</div>
  </div>`;
}

let _creativeGuideField = '';
let _creativeGuideReturn = null;

function _creativeGuideOnKey(event){
  if(event.key !== 'Escape' || !_creativeGuideField) return;
  event.preventDefault();
  event.stopPropagation();
  creativeCloseGuide();
}

function creativeOpenGuide(field){
  if(typeof CREATIVE_GUIDE === 'undefined' || !CREATIVE_GUIDE[field]) return;
  _creativeGuideField = field;
  _creativeGuideReturn = document.activeElement;
  const host = document.getElementById('mainCreative') || document.body;
  let layer = document.getElementById('creativeGuideLayer');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'creativeGuideLayer';
    layer.className = 'creative-guide-layer';
    layer.addEventListener('click', event => {
      if(event.target === layer) creativeCloseGuide();
    });
    host.appendChild(layer);
  }
  layer.innerHTML = _creativeGuideMarkup(field);
  document.removeEventListener('keydown', _creativeGuideOnKey);
  document.addEventListener('keydown', _creativeGuideOnKey);
  const dialog = layer.querySelector('.creative-guide-dialog');
  if(dialog && typeof dialog.focus === 'function') dialog.focus();
}

function creativeCloseGuide(){
  _creativeGuideField = '';
  const layer = document.getElementById('creativeGuideLayer');
  if(layer) layer.remove();
  document.removeEventListener('keydown', _creativeGuideOnKey);
  const back = _creativeGuideReturn;
  _creativeGuideReturn = null;
  if(back && typeof back.focus === 'function') back.focus();
}

function _creativeIsolateButton(field){
  const isolated = _creativeFocusField === field;
  const label = CREATIVE_LABELS[field] || _creativeLabel(field);
  const text = isolated ? 'Stop focusing ' + label : 'Focus chat on ' + label;
  return `<button type="button" class="creative-isolate${isolated ? ' on' : ''}" aria-pressed="${isolated ? 'true' : 'false'}" aria-label="${_creativeEsc(text)}" title="${_creativeEsc(text)}" onclick="creativeIsolateField('${field}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button>`;
}

function _creativePromptBar(text){
  const value = String(text || '').trim();
  if(!value) return '';
  return `<div class="creative-prompt-bar" role="status"><span>Prompt ready</span><button type="button" onclick="creativeUsePrompt()">Use in chat</button><details><summary>Preview</summary><p>${_creativeEsc(value)}</p></details></div>`;
}

function creativeUsePrompt(){
  const text = String((_creativeStage === 'hook' ? _creativeHookPrompt : _creativeStrategyPrompt) || '').trim();
  if(!text) return;
  _creativeChatOpen = true;
  const mount = document.getElementById('creativeChatMount');
  if(!mount){
    creativeRenderWorkspace();
  }
  const msg = document.getElementById('msg');
  if(!msg) return;
  msg.value = text;
  if(typeof autoResize === 'function') autoResize();
  else if(typeof updateSendBtn === 'function') updateSendBtn();
  if(typeof msg.focus === 'function') msg.focus();
}

function _creativeGoalControl(){
  const slot = _creativeBriefSlot('campaign_goal');
  const current = String(slot.text || '').trim();
  const help = slot.origin === 'default'
    ? 'Studio default. Not inferred from this product.'
    : 'The business result for this creative. It is not the audience’s awareness.';
  return `<section class="creative-section" data-field="campaign_goal">
    <div class="creative-field-label"><h3>Campaign goal</h3>${_creativeIsolateButton('campaign_goal')}</div>
    <p class="creative-help">${_creativeEsc(help)}</p>
    ${_creativeChoiceGroup('campaign_goal', 'Campaign goal', CREATIVE_GOAL_CHOICES, current, 'brief', true)}
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

function _creativeUnknownButton(field, current){
  const on = current === 'unknown';
  return `<button type="button" class="creative-unknown${on ? ' on' : ''}" aria-pressed="${on ? 'true' : 'false'}" onclick="creativeInfer('${field}')">Unknown / Help me infer</button>`;
}

function _creativeDiagnosisControl(){
  const awareness = _creativeBriefSlot('awareness');
  const awarenessText = String(awareness.text || '').trim();
  const avatar = String((_creativeBriefSlot('audience_notes').text) || '').trim();
  const avatarLine = avatar
    ? avatar
    : 'Choose an audience above. Awareness belongs to that audience.';
  const desire = _creativeBriefSlot('mass_desire');
  const sources = _creativeEvidenceRows().filter(row => row.text).map(row =>
    `<button type="button" class="creative-quiet" onclick="creativeApplyDesire('${row.id}')">Use ${_creativeEsc(row.label)}</button>`
  ).join('');
  const sophistication = _creativeBriefSlot('sophistication');
  const sophisticationText = String(sophistication.text || '').trim();
  const context = _creativeBriefSlot('campaign_context');
  const contextText = String(context.text || '').trim();
  return `<section class="creative-section" data-field="awareness">
    <div class="creative-field-label"><h3>Audience diagnosis</h3>${_creativeIsolateButton('awareness')}</div>
    <p class="creative-help">${_creativeEsc(avatarLine)}</p>
    <p class="creative-help">Awareness</p>
    ${_creativeChoiceGroup('awareness', 'Awareness', CREATIVE_AWARENESS_CHOICES, awarenessText === 'unknown' ? '' : awarenessText, 'brief', true)}
    ${_creativeUnknownButton('awareness', awarenessText)}
    ${_creativeProposalMarkup(awareness, 'awareness')}
    <div class="creative-field" data-field="mass_desire">
      <div class="creative-field-label"><label for="creativeMassDesire">Core desire</label>${_creativeIsolateButton('mass_desire')}</div>
      <p class="creative-help">${_creativeEsc(CREATIVE_HELP.mass_desire)}</p>
      <textarea id="creativeMassDesire" data-creative-stage="brief" data-creative-field="mass_desire" dir="auto" rows="2" oninput="creativeScheduleSave('mass_desire')">${_creativeEsc(desire.text || '')}</textarea>
      <div class="creative-actions creative-quiet-row">${sources}<button type="button" class="creative-quiet" onclick="creativeInfer('mass_desire')">Help me infer</button></div>
      ${_creativeProposalMarkup(desire, 'mass_desire')}
    </div>
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
      ${_creativeChoiceGroup('campaign_context', 'Campaign context', CREATIVE_CONTEXT_CHOICES, contextText, 'brief', true)}
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
  return `<fieldset class="creative-section"><legend>Message approach</legend><p class="creative-help">${_creativeEsc(CREATIVE_HELP.message_approach)}</p><div class="creative-choice-group inline">${boxes}</div>${_creativeProposalMarkup(slot, 'message_approach')}</fieldset>`;
}

function _creativeInferPrompt(field){
  const label = CREATIVE_LABELS[field] || field;
  return 'Propose ' + label + ' for brief.' + field + '. Use the product profile, this creative, and the conversation. Say what is uncertain. Save one proposal with save_creative_proposal. Do not update the selected field.';
}

async function creativePickChoice(stage, field, value){
  await creativePutField(stage, field, value);
}

async function creativePickStrategy(field, value){
  await creativePickChoice('brief', field, value);
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
  const menuGroups = groups.map(([source, label]) => [
    label,
    rows.filter(row => row.source === source).map(row => ({id: row.id, label: _creativeMenuText(row)})),
  ]);
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
      ${_creativeIsolateButton('audience_notes')}
    </div>
    <p class="creative-help">Saved for this product, including audiences from recent ads.</p>
    ${_creativePicker({
      kind: 'avatar',
      triggerId: 'creativeAvatarSelect',
      listId: 'creativeAvatarList',
      ariaLabel: 'Audience avatar',
      placeholder: 'Choose an avatar',
      selectedId: _creativeAvatarComposer ? '__new__' : (selected ? selected.id : ''),
      selectedLabel: _creativeAvatarComposer ? '+ New Avatar' : (selected ? _creativeMenuText(selected) : 'Choose an avatar'),
      groups: menuGroups,
      leading: `<button type="button" role="option" class="creative-picker-option" data-value="" aria-selected="${!selected && !_creativeAvatarComposer ? 'true' : 'false'}" onclick="creativePickerChoose(this)"><span>Choose an avatar</span></button>`,
      extras: [{id: '__new__', label: '+ New Avatar'}],
    })}
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
    await api('/api/creative-studio/projects/' + _creativeProject.id + '/fields', {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({stage, field, text, author:'user'}),
    });
    _creativeDirty = Object.keys(_creativeTimers).length > 0;
    _creativeSaveState = _creativeDirty ? 'Saving…' : 'Saved';
    const fresh = await api('/api/creative-studio/projects/' + _creativeProject.id);
    _creativeApplyProject(fresh);
    if(!_creativeDirty) _creativeSyncLive();
    _creativeSyncSegmentButton();
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

function _creativeHookSlot(name){
  return (((_creativeProject.stages.hook || {}).fields || {})[name]) || {text:'', proposals:[]};
}

function _creativeMoveLabel(){
  const current = String((_creativeHookSlot('hook_type').text) || '').trim();
  const found = CREATIVE_MOVE_CHOICES.find(item => item.id === current);
  return found ? found.label : (current || '');
}

function _creativeMoveControl(){
  const slot = _creativeHookSlot('hook_type');
  const current = String(slot.text || '').trim();
  const known = CREATIVE_MOVE_CHOICES.some(item => item.id === current);
  const legacy = current && !known
    ? `<p class="creative-help">Current note: ${_creativeEsc(current)}. Pick a move to replace it.</p>`
    : '';
  return `<div class="creative-field" data-field="hook_type">
    <div class="creative-field-label"><label>Deep-fry move</label><span class="creative-field-tools">${_creativeGuideButton('hook_type')}${_creativeIsolateButton('hook_type')}</span></div>
    <p class="creative-help">${_creativeEsc(CREATIVE_HELP.hook_type)}</p>
    ${_creativeChoiceGroup('hook_type', 'Deep-fry move', CREATIVE_MOVE_CHOICES, known ? current : '', 'hook', true)}
    ${legacy}
    ${_creativeProposalMarkup(slot, 'hook_type')}
  </div>`;
}

function _creativeHookQuote(field, label){
  const text = String((_creativeHookSlot(field).text) || '').trim();
  return `<div class="creative-quote"><strong>${_creativeEsc(label)}</strong><p>${_creativeEsc(text || 'Not written yet.')}</p></div>`;
}

function _creativeHookBody(){
  const prompt = _creativePromptBar(_creativeHookPrompt);
  const concept = String((_creativeHookSlot('core_trigger').text) || '');
  const blocked = _creativeManyIdeas(concept);
  const block = `<p id="creativeConceptBlock" class="creative-help"${blocked ? '' : ' hidden'}>Pick one idea. The core concept is one short sentence.</p>`;
  const anchor = String((((_creativeProject.stages.what || {}).fields || {}).concept || {}).text || '').trim();
  const move = _creativeMoveLabel();
  const fryPrompt = move
    ? `Fry the core concept with this move: ${move}. Push the psychology past the facts. Save the draft on hook.deep_fry. Do not treat it as a verified claim, and do not walk it back yet.`
    : 'No deep-fry move is selected. Propose one move for hook.hook_type and the fried angle for hook.deep_fry. Do not treat the angle as a verified claim.';
  const groundPrompt = 'Walk the deep-fried angle back to the strongest claim the product mechanism supports. Keep the fried draft. If support is missing, mark the claim as needing a source. Save the grounded claim on hook.walk_it_back.';
  const bangPrompt = 'Turn the grounded claim into a scroll-stopping pair. Write hook.verbal_hook so the first words carry one specific idea. Write hook.visual_hook so the picture contrasts with or reinforces that line. Save the pair together on hook.final_hook. Do not score it.';
  return `${prompt}
    <section class="creative-section" data-hook-group="isolate"><strong>Isolate and commit</strong><p class="creative-help">One short sentence. Core idea: ${_creativeEsc(anchor || 'Not chosen yet.')}</p>${_creativeFieldCard('hook','core_trigger')}${block}</section>
    <section class="creative-section" data-hook-group="fry"><strong>Deep fry</strong><p class="creative-help">Push that idea through one move.</p>${_creativeMoveControl()}<div class="creative-actions"><button type="button" onclick="creativeHookAction('deep_fry',${JSON.stringify(fryPrompt).replace(/"/g, '&quot;')})">Fry</button></div>${_creativeFieldCard('hook','deep_fry')}</section>
    <section class="creative-section" data-hook-group="ground"><strong>Walk it back</strong><p class="creative-help">Keep the fried angle. Bring the claim back to what the mechanism supports.</p><div class="creative-actions"><button type="button" onclick="creativeHookAction('walk_it_back',${JSON.stringify(groundPrompt).replace(/"/g, '&quot;')})">Walk it back</button></div><div class="creative-pair">${_creativeHookQuote('deep_fry','Deep-fried angle')}${_creativeFieldCard('hook','walk_it_back', {accept:true, acceptLabel:'Use as the line'})}</div></section>
    <section class="creative-section" data-hook-group="bang"><strong>Make it bang</strong><p class="creative-help">The first line and the opening picture. Format comes after the idea.</p>${_creativeFieldCard('hook','format')}<div class="creative-pair">${_creativeFieldCard('hook','verbal_hook')}${_creativeFieldCard('hook','visual_hook')}</div><div class="creative-actions"><button type="button" onclick="creativeHookAction('final_hook',${JSON.stringify(bangPrompt).replace(/"/g, '&quot;')})">Make it bang</button></div>${_creativeFieldCard('hook','final_hook')}</section>`;
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

function _creativeOnThisStep(key){
  const parts = String(key || '').split('.');
  if(parts.length !== 2) return false;
  const [stage, field] = parts;
  if(stage === _creativeStage) return true;
  return (CREATIVE_STEP_FIELDS[_creativeStage] || []).some(pair => pair[0] === stage && pair[1] === field);
}

function _creativePrereqMarkup(){
  const names = CREATIVE_PREREQ_FIELDS[_creativeStage] || [];
  const ctx = (_creativeProject && _creativeProject.field_context) || {};
  const required = new Map();
  const helpful = new Map();
  names.forEach(name => {
    const spec = ctx[name] || {};
    (spec.required || []).forEach(key => {
      if(!_creativeOnThisStep(key)) required.set(key, _creativeFilled(key));
    });
    (spec.helpful || []).forEach(key => {
      if(!_creativeOnThisStep(key) && !required.has(key)) helpful.set(key, _creativeFilled(key));
    });
  });
  if(!required.size && !helpful.size) return '';
  const row = (key, ok, kind) => {
    const field = String(key).split('.')[1] || key;
    const label = CREATIVE_LABELS[field] || _creativeLabel(field);
    const state = ok ? 'Present' : (kind === 'required' ? 'Missing, required' : 'Missing, optional');
    return `<li class="${ok ? 'present' : 'missing'}">${_creativeEsc(label)} <span>${state}</span></li>`;
  };
  const missingRequired = [...required.values()].filter(ok => !ok).length;
  const summary = missingRequired
    ? `Earlier work, ${missingRequired} required still open`
    : 'Earlier work';
  const explore = missingRequired
    ? '<p class="creative-help">Suggestions stay exploratory until the required fields are filled.</p>'
    : '';
  const open = missingRequired ? ' open' : '';
  return `<details class="creative-prereq" data-field="earlier"${open}><summary>${summary}</summary>${explore}<ul>${[...required].map(([key, ok]) => row(key, ok, 'required')).join('')}${[...helpful].map(([key, ok]) => row(key, ok, 'helpful')).join('')}</ul></details>`;
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

function _creativeExportCopy(){
  const full = _creativeExportMode === 'full';
  return {
    full,
    blurb: full
      ? 'Statuses, notes, intermediate fields, and sources stay in. Saved alternatives stay out until you include them.'
      : 'The selected final material: goal, audience, idea, hook, execution, and the copy you included.',
  };
}

function _creativeExportDialogMarkup(){
  const copy = _creativeExportCopy();
  const name = (_creativeProject && _creativeProject.name) || 'Creative';
  const pressed = mode => copy.full === (mode === 'full') ? 'true' : 'false';
  return `<div class="creative-export-dialog" role="dialog" aria-modal="true" aria-labelledby="creativeExportTitle" tabindex="-1">
    <header class="creative-export-head">
      <div>
        <p class="creative-export-kicker">${_creativeEsc(name)}</p>
        <h2 id="creativeExportTitle">Export</h2>
      </div>
      <button type="button" class="creative-export-close" aria-label="Close" onclick="creativeCloseExport()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </header>
    <div class="creative-export-toolbar">
      <div class="creative-export-modes" role="group" aria-label="Export format">
        <button type="button" data-export-mode="handoff" aria-pressed="${pressed('handoff')}" onclick="creativeSetExportMode('handoff')">Creative handoff</button>
        <button type="button" data-export-mode="full" aria-pressed="${pressed('full')}" onclick="creativeSetExportMode('full')">Full working document</button>
      </div>
      <p class="creative-export-blurb" id="creativeExportBlurb">${_creativeEsc(copy.blurb)}</p>
      <label class="creative-export-alts" id="creativeExportAlts"${copy.full ? '' : ' hidden'}><input id="creativeIncludeAlts" type="checkbox" onchange="creativeExport()"> Include saved alternatives</label>
    </div>
    <div id="creativeExportPreview" class="preview-md"></div>
    <footer class="creative-export-foot">
      <button type="button" class="creative-primary" onclick="creativeCopyExport()">Copy Markdown</button>
    </footer>
  </div>`;
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
    checks: _creativeProject.concept_checks || {},
    focus: _creativeFocusField,
    prompt: _creativeHookPrompt,
    concept: String(((((_creativeProject.stages || {}).hook || {}).fields || {}).core_trigger || {}).text || ''),
    move: String(((((_creativeProject.stages || {}).hook || {}).fields || {}).hook_type || {}).text || ''),
    strategyPrompt: _creativeStrategyPrompt,
    anchor: ['what.concept','who.segment','brief.campaign_goal','brief.awareness','brief.product_offer'].map(_creativeFilled),
    avatarComposer: _creativeAvatarComposer,
    strategy: ['campaign_goal','awareness','mass_desire','sophistication','campaign_context','objective'].map(name => {
      const slot = (((_creativeProject.stages.brief || {}).fields || {})[name]) || {};
      const pending = (slot.proposals || []).filter(item => item.status === 'proposed' || item.status === 'in_discussion').length;
      return [name, slot.text || '', slot.origin || '', pending];
    }),
    approach: String(((((_creativeProject.stages || {}).what || {}).fields || {}).message_approach || {}).text || ''),
    legacy: _creativeProject.legacy_objective || null,
    audience: String((((_creativeProject.stages.brief || {}).fields || {}).audience_notes || {}).text || ''),
    avatars: ((_creativeProject.audience_avatars || []).map(row => row.id + ':' + row.source + ':' + row.text)).join('|'),
    blocks: CREATIVE_BLOCK_FIELDS.map(item => {
      const rows = ((_creativeProject.audience_blocks || {})[item.field]) || [];
      return rows.map(row => row.scope + ':' + row.id + ':' + row.text).join('|');
    }),
    note: !!(_creativeProject.product_note && _creativeProject.product_note.available),
    fields: pairs.map(([owner, name]) => {
      const slot = (((_creativeProject.stages || {})[owner] || {}).fields || {})[name] || {};
      const pending = (slot.proposals || []).filter(item => item.status === 'proposed' || item.status === 'in_discussion').length;
      return [owner, name, slot.claim || '', !!slot.include, slot.order || 0, !!slot.regulated, pending];
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
    save.textContent = _creativeSaveState === 'Saved' ? '' : _creativeSaveState;
    save.classList.toggle('failed', _creativeSaveState === 'Save failed');
  }
  CREATIVE_STAGES.forEach(item => {
    const dot = document.querySelector(`#creativeTab-${item.id} .creative-dot`);
    if(!dot) return;
    const status = _creativeShownStatus((project.stages[item.id] && project.stages[item.id].status) || 'not_started');
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
    _creativeVisiblePairs().forEach(([owner, field]) => {
      const node = document.querySelector(`[data-creative-field="${field}"]`);
      if(!node || node === active || _creativeTimers[field]) return;
      const slot = (((project.stages || {})[owner] || {}).fields || {})[field] || {};
      if(node.value !== (slot.text || '')) node.value = slot.text || '';
      _creativeSyncBoxDir(field);
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
      <p class="creative-suggest-note">Nothing is selected for you until you replace a field.</p>
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
  const optional = options.optional ? '<span class="creative-claim">Optional</span>' : '';
  const copyTools = stageId === 'copy' ? `<span class="creative-inline-tools"><label><input type="checkbox" ${slot.include !== false ? 'checked' : ''} onchange="creativeToggleInclude('${name}', this.checked)"> Include</label><button type="button" onclick="creativeNudgeOrder('${name}', -1)">Up</button><button type="button" onclick="creativeNudgeOrder('${name}', 1)">Down</button></span>` : '';
  const accept = options.accept ? `<button type="button" class="creative-inline-btn" onclick="creativeAcceptFinal('${name}')">${_creativeEsc(options.acceptLabel || 'Accept as final')}</button>` : '';
  const picker = options.picker || '';
  const lead = options.lead || '';
  const boxDir = _creativeBoxDir(slot.text || '');
  const control = `<textarea data-creative-stage="${stageId}" data-creative-field="${name}" dir="${boxDir}" rows="2" oninput="creativeScheduleSave('${name}')">${_creativeEsc(slot.text || '')}</textarea>`;
  const editor = picker
    ? `<div class="creative-input-combo" dir="${boxDir}">${control}${picker}</div>`
    : control;
  const proposals = _creativeProposalMarkup(slot);
  const isolated = _creativeFocusField === name;
  const label = CREATIVE_LABELS[name] || _creativeLabel(name);
  return `<div class="creative-field${isolated ? ' isolated' : ''}" data-field="${name}">
    <div class="creative-field-label">
      <label>${_creativeEsc(label)} ${optional}${claim}</label>
      <span class="creative-field-tools">${_creativeGuideButton(name)}${copyTools}${_creativeIsolateButton(name)}</span>
    </div>
    ${help}
    ${lead}
    ${accept}
    ${editor}
    ${proposals}
  </div>`;
}

function _creativeSyncBoxDir(field){
  const input = document.querySelector(`[data-creative-field="${field}"]`);
  if(!input) return;
  const dir = _creativeBoxDir(input.value);
  if(input.getAttribute('dir') !== dir) input.setAttribute('dir', dir);
  const combo = input.closest('.creative-input-combo');
  if(combo && combo.getAttribute('dir') !== dir) combo.setAttribute('dir', dir);
}

function creativeScheduleSave(field){
  _creativeSyncBoxDir(field);
  if(field === 'core_trigger'){
    const input = document.querySelector('[data-creative-field="core_trigger"]');
    const note = document.getElementById('creativeConceptBlock');
    const blocked = !!(input && _creativeManyIdeas(input.value));
    if(note) note.hidden = !blocked;
    if(blocked){
      clearTimeout(_creativeTimers[field]);
      delete _creativeTimers[field];
      _creativeDirty = Object.keys(_creativeTimers).length > 0;
      return;
    }
  }
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
    await api('/api/creative-studio/projects/' + _creativeProject.id + '/fields', {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({stage, field, text:input.value, author:'user'}),
    });
    delete _creativeTimers[field];
    _creativeDirty = Object.keys(_creativeTimers).length > 0;
    _creativeSaveState = _creativeDirty ? 'Saving…' : 'Saved';
    const label = document.getElementById('creativeSaveState');
    if(label) label.textContent = _creativeSaveState === 'Saved' ? '' : _creativeSaveState;
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
  if(_creativeBrowsing) return;
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

function _creativeExportOnKey(event){
  if(event.key !== 'Escape' || !_creativeExportOpen) return;
  event.preventDefault();
  event.stopPropagation();
  creativeCloseExport();
}

function _creativeMountExport(){
  const host = document.getElementById('mainCreative') || document.body;
  let layer = document.getElementById('creativeExportLayer');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'creativeExportLayer';
    layer.className = 'creative-export-layer';
    layer.addEventListener('click', event => {
      if(event.target === layer) creativeCloseExport();
    });
    host.appendChild(layer);
  }
  layer.innerHTML = _creativeExportDialogMarkup();
  document.removeEventListener('keydown', _creativeExportOnKey);
  document.addEventListener('keydown', _creativeExportOnKey);
  const dialog = layer.querySelector('.creative-export-dialog');
  if(dialog) dialog.focus();
}

function _creativeSyncExportChrome(){
  const copy = _creativeExportCopy();
  document.querySelectorAll('#creativeExportLayer [data-export-mode]').forEach(button => {
    const on = button.getAttribute('data-export-mode') === (copy.full ? 'full' : 'handoff');
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const blurb = document.getElementById('creativeExportBlurb');
  if(blurb) blurb.textContent = copy.blurb;
  const alts = document.getElementById('creativeExportAlts');
  if(alts) alts.hidden = !copy.full;
}

function creativeOpenExport(){
  if(!_creativeProject) return;
  const menu = document.getElementById('creativeProjectMenu');
  const trigger = document.querySelector('#creativeWorkspace .creative-project-chip .creative-icon-btn');
  if(menu) menu.hidden = true;
  if(trigger) trigger.setAttribute('aria-expanded', 'false');
  _creativeExportReturn = trigger || document.activeElement;
  _creativeExportOpen = true;
  _creativeMountExport();
  void creativeExport();
}

function creativeCloseExport(){
  _creativeExportOpen = false;
  const layer = document.getElementById('creativeExportLayer');
  if(layer) layer.remove();
  document.removeEventListener('keydown', _creativeExportOnKey);
  const back = _creativeExportReturn;
  _creativeExportReturn = null;
  if(back && typeof back.focus === 'function') back.focus();
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
  if(document.getElementById('creativeExportLayer')){
    _creativeSyncExportChrome();
    void creativeExport();
  }
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
  if(!_creativeExportOpen) return data;
  let preview = document.getElementById('creativeExportPreview');
  if(!preview){
    _creativeMountExport();
    preview = document.getElementById('creativeExportPreview');
  }
  _creativePaintExportPreview(preview, data.markdown || '');
  return data;
}

function _creativePaintExportPreview(preview, markdown){
  const text = markdown || '';
  window._creativeLastExport = text;
  if(!preview) return;
  if(typeof renderMd !== 'function'){
    preview.textContent = text;
    return;
  }
  try{
    preview.innerHTML = renderMd(text);
  }catch(_){
    preview.textContent = text;
    return;
  }
  [...preview.childNodes].forEach(node => {
    if(node.nodeType !== 3 || !node.textContent.trim()) return;
    const lines = node.textContent.split('\n').map(line => line.trim()).filter(Boolean);
    const fragment = document.createDocumentFragment();
    lines.forEach(line => {
      const note = document.createElement('p');
      note.className = 'creative-export-note';
      note.textContent = line;
      fragment.appendChild(note);
    });
    node.replaceWith(fragment);
  });
  const lead = preview.querySelector('p');
  if(lead && !lead.classList.contains('creative-export-note')) lead.classList.add('creative-export-lead');
  if(typeof applyBidiAutoDir === 'function') applyBidiAutoDir(preview);
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
    if(typeof _currentPanel !== 'undefined' && _currentPanel === 'creative' && _creativeProject && !_creativeBrowsing && !_creativeDirty){
      creativeReloadQuiet().catch(() => {});
    }
  }, 1000);
}
