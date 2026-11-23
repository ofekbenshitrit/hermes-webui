/* Text documents beside the regular chat. The agent is not required to open, type, or restore. */
let _chatDoc = null;
let _chatDocSession = '';
let _chatDocFixtures = false;
let _chatDocTimer = 0;
let _chatDocCreativeId = '';
let _chatDocCreativeName = '';

function _chatDocSessionId(){
  return (typeof S !== 'undefined' && S.session && S.session.session_id) || '';
}

function _chatDocEsc(value){
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

async function refreshChatDocuments(){
  const sessionId = _chatDocSessionId();
  _chatDocSession = sessionId;
  if(!sessionId){
    _chatDoc = null;
    _chatDocCreativeId = '';
    _paintChatDocument();
    return;
  }
  try{
    const data = await api('/api/chat-documents?session_id=' + encodeURIComponent(sessionId));
    _chatDocFixtures = !!(data && data.fixtures);
    _chatDocCreativeId = (data && data.creative_id) || '';
    const active = (data && data.active_id) || '';
    if(active) _chatDoc = await api('/api/chat-documents/' + active);
    else _chatDoc = null;
    if(_chatDocCreativeId){
      try{
        const project = await api('/api/creative-studio/projects/' + _chatDocCreativeId);
        _chatDocCreativeName = (project && project.name) || 'Creative';
      }catch(_){
        _chatDocCreativeName = 'Creative';
      }
    }else{
      _chatDocCreativeName = '';
    }
  }catch(_){
    _chatDoc = null;
    _chatDocCreativeId = '';
    _chatDocCreativeName = '';
  }
  _paintChatDocument();
}

function _paintChatDocument(){
  const panel = document.getElementById('chatDocumentPanel');
  const main = document.getElementById('mainChat');
  const chip = document.getElementById('composerCreativeChip');
  if(chip){
    if(_chatDocCreativeId){
      chip.hidden = false;
      chip.innerHTML = _chatDocEsc(_chatDocCreativeName || 'Creative') + ' <span aria-hidden="true">×</span>';
      chip.onclick = () => { void detachChatCreative(); };
      chip.title = 'Remove creative';
    }else{
      chip.hidden = true;
      chip.innerHTML = '';
    }
  }
  if(!panel || !main) return;
  if(!_chatDoc){
    panel.hidden = true;
    panel.innerHTML = '';
    main.classList.remove('document-open');
    _paintDocumentCard();
    return;
  }
  const doc = _chatDoc;
  const index = doc.version_index || 0;
  const count = doc.version_count || 1;
  panel.hidden = false;
  main.classList.add('document-open');
  panel.innerHTML = `
    <header class="chat-document-bar">
      <input id="chatDocumentTitle" aria-label="Document title" maxlength="160">
      <span class="chat-document-kind">${doc.kind === 'script' ? 'Script' : 'Document'}</span>
      <button type="button" id="chatDocBack" aria-label="Previous version" ${index <= 0 ? 'disabled' : ''}>←</button>
      <button type="button" id="chatDocForward" aria-label="Next version" ${index >= count - 1 ? 'disabled' : ''}>→</button>
      <button type="button" id="chatDocClose" aria-label="Close document">×</button>
    </header>
    <div class="chat-document-tools">
      <button type="button" data-shortcut="shorter">Shorter</button>
      <button type="button" data-shortcut="longer">Longer</button>
      <button type="button" data-shortcut="polish">Polish</button>
      <button type="button" data-shortcut="emoji">Emoji</button>
      <button type="button" data-shortcut="suggest">Suggest</button>
      <button type="button" id="chatDocLink">${doc.creative_id ? 'Linked' : 'Add to creative'}</button>
    </div>
    <textarea id="chatDocumentBody" dir="auto" aria-label="Document body"></textarea>
    <div id="chatDocumentPopover" class="chat-document-popover" hidden>
      <input id="chatDocumentAsk" placeholder="Change this selection" aria-label="Edit selection">
      <button type="button" id="chatDocumentAskSend">Edit</button>
      <button type="button" id="chatDocumentAskNote">Feedback</button>
    </div>`;
  const title = document.getElementById('chatDocumentTitle');
  const body = document.getElementById('chatDocumentBody');
  title.value = doc.title || '';
  body.value = doc.text || '';
  title.addEventListener('change', () => { void _saveChatDocument(); });
  body.addEventListener('input', () => {
    clearTimeout(_chatDocTimer);
    _chatDocTimer = setTimeout(() => { void _saveChatDocument(); }, 400);
  });
  body.addEventListener('mouseup', _showSelectionPopover);
  body.addEventListener('keyup', _showSelectionPopover);
  document.getElementById('chatDocBack').onclick = () => { void restoreChatDocument(index - 1); };
  document.getElementById('chatDocForward').onclick = () => { void restoreChatDocument(index + 1); };
  document.getElementById('chatDocClose').onclick = closeChatDocument;
  document.getElementById('chatDocLink').onclick = () => { void linkOpenDocument(); };
  document.getElementById('chatDocumentAskSend').onclick = () => { void askSelection(false); };
  document.getElementById('chatDocumentAskNote').onclick = () => { void askSelection(true); };
  panel.querySelectorAll('[data-shortcut]').forEach(button => {
    button.onclick = () => { void applyDocumentShortcut(button.getAttribute('data-shortcut')); };
  });
  const selection = doc.selection;
  if(selection && body){
    body.focus();
    body.setSelectionRange(selection.start, selection.end);
  }
  _paintDocumentCard();
}

function _paintDocumentCard(){
  const shell = document.querySelector('#mainChat .messages-shell');
  if(!shell) return;
  let card = document.getElementById('chatDocumentCard');
  if(!_chatDoc){
    if(card) card.remove();
    return;
  }
  if(!card){
    card = document.createElement('button');
    card.type = 'button';
    card.id = 'chatDocumentCard';
    card.className = 'chat-document-card';
    shell.insertBefore(card, shell.firstChild);
  }
  card.textContent = (_chatDoc.kind === 'script' ? 'Script' : 'Writing') + ' · ' + (_chatDoc.title || 'Untitled');
  card.onclick = () => {
    const panel = document.getElementById('chatDocumentPanel');
    if(panel && panel.hidden){
      panel.hidden = false;
      document.getElementById('mainChat').classList.add('document-open');
    }
    const body = document.getElementById('chatDocumentBody');
    if(body) body.focus();
  };
}

function closeChatDocument(){
  const panel = document.getElementById('chatDocumentPanel');
  const main = document.getElementById('mainChat');
  if(panel) panel.hidden = true;
  if(main) main.classList.remove('document-open');
}

async function _saveChatDocument(){
  if(!_chatDoc) return;
  const body = document.getElementById('chatDocumentBody');
  const title = document.getElementById('chatDocumentTitle');
  if(!body) return;
  const text = body.value;
  const name = title ? title.value : _chatDoc.title;
  if(text === (_chatDoc.text || '') && name === _chatDoc.title) return;
  const saved = await api('/api/chat-documents/' + _chatDoc.id + '/text', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text, title:name}),
  });
  _chatDoc = saved;
  _paintDocumentCard();
}

async function openChatDocument(id){
  _chatDoc = await api('/api/chat-documents/' + id + '/focus', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
  _paintChatDocument();
}

async function createChatDocument(opts){
  const sessionId = _chatDocSessionId();
  if(!sessionId){
    if(typeof showToast === 'function') showToast('Open a chat first', 2500, 'error');
    return null;
  }
  const doc = await api('/api/chat-documents', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      session_id:sessionId,
      title:(opts && opts.title) || '',
      text:(opts && opts.text) || '',
      kind:(opts && opts.kind) || 'document',
      creative_id:(opts && opts.creative_id) || '',
    }),
  });
  _chatDoc = doc;
  _paintChatDocument();
  return doc;
}

async function restoreChatDocument(index){
  if(!_chatDoc) return;
  _chatDoc = await api('/api/chat-documents/' + _chatDoc.id + '/restore', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({index}),
  });
  _paintChatDocument();
}

function _selectionInBody(){
  const body = document.getElementById('chatDocumentBody');
  if(!body) return null;
  const start = body.selectionStart;
  const end = body.selectionEnd;
  if(end <= start) return null;
  return {start, end, text:body.value.slice(start, end)};
}

function _showSelectionPopover(){
  const pop = document.getElementById('chatDocumentPopover');
  const body = document.getElementById('chatDocumentBody');
  const selection = _selectionInBody();
  if(!pop || !body) return;
  if(!selection){
    pop.hidden = true;
    return;
  }
  pop.hidden = false;
  void api('/api/chat-documents/' + _chatDoc.id + '/selection', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({start:selection.start, end:selection.end}),
  }).catch(() => {});
}

async function askSelection(feedback){
  const selection = _selectionInBody();
  const input = document.getElementById('chatDocumentAsk');
  const instruction = (input && input.value || '').trim() || (feedback ? 'Does this sound convincing?' : 'Make this clearer');
  if(!selection || !_chatDoc) return;
  if(feedback){
    const box = document.getElementById('msg');
    if(box) box.value = instruction + '\n\n"' + selection.text + '"';
    if(typeof showToast === 'function') showToast('Asked in the chat. The document stays as it is.', 2600);
    return;
  }
  if(_chatDocFixtures){
    const shorter = selection.text.replace(/\s+/g, ' ').trim();
    const preview = shorter.length > 80 ? shorter.slice(0, 77).trim() + '.' : shorter;
    const result = await api('/api/chat-documents/' + _chatDoc.id + '/events', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        type:'apply',
        scope:'selection',
        source:'fixture',
        text:preview,
        selection:{start:selection.start, end:selection.end},
      }),
    });
    _chatDoc = result.document;
    _paintChatDocument();
    return;
  }
  const box = document.getElementById('msg');
  if(box) box.value = instruction;
  if(typeof showToast === 'function') showToast('Send it. The attached document and selection go with the turn.', 2800);
}

function _fixtureTransform(action, text){
  if(action === 'shorter'){
    return text.split(/\n{2,}/).map(part => {
      const sentence = part.split(/(?<=[.!?])\s/)[0] || part;
      return sentence.trim();
    }).filter(Boolean).join('\n\n');
  }
  if(action === 'longer') return text.replace(/([.!?])(\s|$)/g, '$1 One more concrete detail.$2');
  if(action === 'polish') return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + (text.trim() ? '\n' : '');
  if(action === 'emoji') return text.replace(/^/m, '✦ ');
  return text;
}

async function applyDocumentShortcut(action){
  if(!_chatDoc) return;
  await _saveChatDocument();
  const body = document.getElementById('chatDocumentBody');
  const selection = _selectionInBody();
  const source = selection ? selection.text : (body ? body.value : _chatDoc.text || '');
  const labels = {
    shorter:'Make this shorter.',
    longer:'Make this longer.',
    polish:'Polish the spelling, grammar, and clarity without changing the voice.',
    emoji:'Add a few relevant emojis.',
    suggest:'Suggest edits. Leave the document unchanged until I accept one.',
  };
  if(action === 'suggest' || !_chatDocFixtures){
    const box = document.getElementById('msg');
    if(box) box.value = labels[action] || labels.suggest;
    if(typeof showToast === 'function') showToast(action === 'suggest' ? 'Suggestions stay in the chat until you apply one.' : 'Send it to apply this to the document.', 2600);
    return;
  }
  const next = _fixtureTransform(action, source);
  const payload = selection
    ? {type:'apply', scope:'selection', source:'fixture', text:next, selection:{start:selection.start, end:selection.end}}
    : {type:'apply', scope:'document', source:'fixture', text:next};
  const result = await api('/api/chat-documents/' + _chatDoc.id + '/events', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload),
  });
  _chatDoc = result.document;
  _paintChatDocument();
}

async function linkOpenDocument(){
  if(!_chatDoc) return;
  let projectId = _chatDocCreativeId;
  if(!projectId){
    const data = await api('/api/creative-studio/projects');
    const rows = (data && data.projects) || [];
    if(!rows.length){
      if(typeof showToast === 'function') showToast('Create a creative first', 2500);
      return;
    }
    projectId = rows[0].id;
  }
  _chatDoc = await api('/api/chat-documents/' + _chatDoc.id + '/link', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({project_id:projectId}),
  });
  _paintChatDocument();
}

function _assistantPlainText(content){
  if(typeof content === 'string') return content;
  if(!Array.isArray(content)) return '';
  return content.map(part => {
    if(typeof part === 'string') return part;
    if(part && part.type === 'text') return part.text || '';
    return '';
  }).join('\n');
}

function _sameDocumentText(left, right){
  return String(left || '').replace(/\s+/g, ' ').trim() === String(right || '').replace(/\s+/g, ' ').trim();
}

function _looksLikeLongDocument(text){
  const raw = String(text || '').trim();
  if(raw.length < 800) return false;
  if(/^\*\*(Error|No response)/.test(raw)) return false;
  const prose = raw.replace(/```[\s\S]*?```/g, '').trim();
  if(prose.length < 700 || prose.length * 2 < raw.length) return false;
  const paragraphs = prose.split(/\n{2,}/).filter(part => part.trim().length > 40);
  const headings = (prose.match(/^#{1,3}\s+\S/gm) || []).length + (prose.match(/\*\*[^*]{3,80}\*\*/g) || []).length;
  return paragraphs.length >= 3 || (headings >= 1 && prose.length >= 700);
}

function _documentTitleFromText(text){
  const heading = String(text || '').match(/^#{1,3}\s+(.+)$/m);
  if(heading) return heading[1].replace(/[*_#]/g, '').trim().slice(0, 80);
  const bold = String(text || '').match(/\*\*([^*]{3,80})\*\*/);
  if(bold) return bold[1].trim();
  const line = String(text || '').split('\n').map(row => row.trim()).find(row => row && row !== '***');
  return (line || 'Untitled').replace(/^#+\s*/, '').slice(0, 80);
}

async function captureLongAssistantDocument(content){
  try{
    const text = _assistantPlainText(content).trim();
    if(!_looksLikeLongDocument(text)) return;
    if(_chatDoc && _sameDocumentText(_chatDoc.text, text)){
      _paintChatDocument();
      return;
    }
    const title = _documentTitleFromText(text);
    if(_chatDoc && !String(_chatDoc.text || '').trim()){
      const saved = await api('/api/chat-documents/' + _chatDoc.id + '/text', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text, title: _chatDoc.title || title}),
      });
      _chatDoc = saved;
      _paintChatDocument();
      return;
    }
    await createChatDocument({title, text});
  }catch(_){}
}

function _documentIntent(text){
  if(/\b(new document|מסמך חדש)\b/i.test(text)) return 'explicit';
  if(/\b(open (this|it) in (a )?(canvas|document)|use canvas|כתוב מסמך|פתח מסמך|write (a|the) (complete|full|detailed))\b/i.test(text)) return 'explicit';
  if(text.length > 900 && /\b(edit|improve|rewrite|תערוך|שפר)\b/i.test(text)) return 'paste';
  return '';
}

async function maybeOpenDocumentForMessage(text){
  const intent = _documentIntent(text || '');
  if(!intent || _chatDoc) return;
  const title = (text.split('\n')[0] || 'Untitled').slice(0, 80);
  await createChatDocument({title, text:intent === 'paste' ? text : ''});
}

function openComposerAttachMenu(event){
  if(event) event.stopPropagation();
  const menu = document.getElementById('composerAttachMenu');
  const button = document.getElementById('btnAttach');
  if(!menu) return;
  if(!menu.hidden){
    menu.hidden = true;
    if(button) button.setAttribute('aria-expanded', 'false');
    return;
  }
  menu.innerHTML = `
    <button type="button" role="menuitem" id="attachMenuFiles">Files</button>
    <button type="button" role="menuitem" id="attachMenuDocument">Document</button>
    <button type="button" role="menuitem" id="attachMenuCreative">Creative</button>
    <div id="attachMenuCreatives" hidden></div>`;
  menu.hidden = false;
  if(menu.parentElement !== document.body) document.body.appendChild(menu);
  if(button){
    button.setAttribute('aria-expanded', 'true');
    const rect = button.getBoundingClientRect();
    const box = document.getElementById('composerWrap') || button;
    const boxTop = box.getBoundingClientRect().top;
    menu.style.position = 'fixed';
    menu.style.zIndex = '80';
    menu.style.left = Math.max(8, rect.left) + 'px';
    menu.style.top = 'auto';
    menu.style.bottom = (window.innerHeight - boxTop + 8) + 'px';
  }
  document.getElementById('attachMenuFiles').onclick = () => {
    menu.hidden = true;
    const input = document.getElementById('fileInput');
    if(input){ input.value = ''; input.click(); }
  };
  document.getElementById('attachMenuDocument').onclick = () => {
    menu.hidden = true;
    void createChatDocument({title:'Untitled'});
  };
  document.getElementById('attachMenuCreative').onclick = async () => {
    const list = document.getElementById('attachMenuCreatives');
    const data = await api('/api/creative-studio/projects');
    const rows = (data && data.projects) || [];
    list.hidden = false;
    list.innerHTML = rows.length
      ? rows.map(row => `<button type="button" data-creative="${row.id}">${_chatDocEsc(row.name)}</button>`).join('')
      : '<p>No creatives yet</p>';
    list.querySelectorAll('[data-creative]').forEach(item => {
      item.onclick = () => { void attachChatCreative(item.getAttribute('data-creative')); menu.hidden = true; };
    });
  };
  const close = (ev) => {
    if(menu.contains(ev.target) || (button && button.contains(ev.target))) return;
    menu.hidden = true;
    if(button) button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', close);
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

async function attachChatCreative(projectId){
  const sessionId = _chatDocSessionId();
  if(!sessionId){
    if(typeof showToast === 'function') showToast('Open a chat first', 2500, 'error');
    return;
  }
  await api('/api/chat-bindings', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({session_id:sessionId, project_id:projectId}),
  });
  await refreshChatDocuments();
}

async function detachChatCreative(){
  const sessionId = _chatDocSessionId();
  if(!sessionId) return;
  await api('/api/chat-bindings', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({session_id:sessionId, project_id:''}),
  });
  await refreshChatDocuments();
}

if(typeof loadSession === 'function'){
  const _loadSession = loadSession;
  loadSession = async function(){
    const result = await _loadSession.apply(this, arguments);
    void refreshChatDocuments();
    return result;
  };
}
if(typeof send === 'function'){
  const _send = send;
  send = async function(){
    try{
      const text = (document.getElementById('msg') && document.getElementById('msg').value || '').trim();
      if(text) void maybeOpenDocumentForMessage(text);
    }catch(_){}
    return _send.apply(this, arguments);
  };
}
