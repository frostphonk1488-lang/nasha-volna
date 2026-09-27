(() => {
'use strict';

const $ = s => document.querySelector(s);
const KEY = 'nv_mvp_v2';
const defaults = {
  messages: [],
  memories: [
    {id:'m1', type:'Проект', text:'Nasha Volna — AI-платформа с долгосрочной памятью.'},
    {id:'m2', type:'Принцип', text:'AI должен понимать человека, сохранять важный контекст и использовать его позже.'}
  ],
  tasks: [
    {id:'t1', title:'Собрать настоящее AI-ядро', status:'В работе'},
    {id:'t2', title:'Подключить серверную память', status:'Новая'}
  ],
  projects: [{id:'p1', name:'Nasha Volna', desc:'AI + память + действия'}],
  clients: [],
  employees: [],
  docs: []
};

function load(){
  try {
    const x = JSON.parse(localStorage.getItem(KEY));
    const restored = structuredClone(defaults);
    if (x && typeof x === 'object') {
      for (const key of Object.keys(defaults)) if (Array.isArray(x[key])) restored[key] = x[key].filter(item => item && typeof item === 'object');
      if (x.taskContext && typeof x.taskContext === 'object') restored.taskContext = x.taskContext;
    }
    return restored;
  } catch(e){ return structuredClone(defaults); }
}
const data = load();
const storage=window.NVStorage.open(localStorage,KEY);
let savedSnapshot=structuredClone(data);
const icon=window.NVIcon;
let localSnapshot = null;
let remoteBusy = false;
let remoteError = '';
const remote = () => window.NVRemote;
const serverMode = () => Boolean(remote()?.connected);
function adoptRemote(result){
  for(const key of Object.keys(data)) delete data[key];
  Object.assign(data, structuredClone(result.state));
}

const save = (label='Изменение рабочих записей') => {storage.commit(data,label,savedSnapshot);savedSnapshot=structuredClone(data);};
const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const activeTasks = () => data.tasks.filter(x => x.status !== 'Выполнена').length;

function nav(page){
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  render(page);
}

function layout(title, subtitle, body){
  return '<div class="page-head"><div><div class="eyebrow">NASHA VOLNA AI</div><h1>'+title+'</h1><p>'+subtitle+'</p></div></div>'+body;
}

function render(page='AI'){
  const p = $('#page');
  if(!p) return;
  const pages={'Обзор':renderOverview,'AI':renderAI,'Память':renderMemory,'Задачи':renderTasks,'Проекты':renderProjects,'Клиенты':renderClients,'Документы':renderDocs,'Подключение':renderConnection,'Поиск':renderSearch,'Данные':renderData};
  if(pages[page]) pages[page](p);
  if(serverMode() && !['AI','Подключение'].includes(page)){
    p.querySelectorAll('[data-status],[data-del],#addMemory,#addTask,#addProject,#addClient,#addDoc').forEach(b=>{b.disabled=true;b.title='В серверном режиме изменения доступны через AI с проверкой плана.';});
    const note=document.createElement('p');note.className='muted';note.textContent='Серверные данные. Изменения — через AI с проверкой плана. Для свежих данных откройте AI → Обновить.';p.prepend(note);
  }
}

function renderAI(p){
  const recent = data.messages.slice(-100).map(m =>
    '<div class="message '+(m.role==='user'?'user':'assistant')+'"><div class="bubble">'+esc(m.text).replace(/\n/g,'<br>')+'</div></div>'
  ).join('');

  p.innerHTML = layout(
    'Ваш AI-ассистент',
    'Один интерфейс для разговора, памяти и действий.',
    '<div class="ai-grid">'+
      '<section class="ai-main panel">'+
        '<div class="ai-intro"><div class="ai-orb">'+icon('ai')+'</div><div><h2>Что нужно сделать?</h2><p>'+ (serverMode()?'Серверный режим: разговор, память и планы действий.':'Локальное ядро: задачи, сроки и контекст диалога. Данные хранятся в этом браузере.') +'</p></div></div>'+
        '<div id="messages" class="messages">'+
          (recent || '<div class="empty-chat"><span>'+icon('wave')+'</span><h2>Начните с команды</h2><p>Например: «Запомни, что наш первый продукт — AI с долговременной памятью».</p></div>')+
        '</div>'+
        remotePlansHTML()+
        (remoteError?'<p role="alert" class="remote-error">'+esc(remoteError)+'</p>':'')+
        '<div class="composer"><textarea aria-label="Сообщение AI" id="chatInput" placeholder="Напишите команду или вопрос…"></textarea><button id="sendBtn">Отправить '+icon('arrow')+'</button></div>'+
      '</section>'+
      '<aside class="context">'+
        '<section class="panel context-card"><div class="panel-title"><b>'+(serverMode()?'Сервер подключён':'Локальный режим')+'</b></div><p class="muted">'+(serverMode()?'Данные хранятся на подключённом сервере.': 'Для свободного разговора подключите сервер с языковой моделью.')+'</p><button id="connectionBtn" class="secondary">'+(serverMode()?'Подключение':'Подключить AI')+'</button>'+(serverMode()?'<button id="refreshRemote" class="secondary">Обновить</button>':'')+'</section>'+
        '<section class="panel context-card"><div class="panel-title"><b>Память</b><button data-go="Память">Открыть</button></div>'+
          (data.memories.slice(-4).reverse().map(m => '<div class="memory-line"><i>●</i><div><b>'+esc(m.type)+'</b><p>'+esc(m.text)+'</p></div></div>').join('') || '<p class="muted">Память пуста.</p>')+
        '</section>'+
        '<section class="panel context-card"><div class="panel-title"><b>Сейчас</b></div>'+
          '<div class="metric"><span>Активные задачи</span><strong>'+activeTasks()+'</strong></div>'+
          '<div class="metric"><span>Проекты</span><strong>'+data.projects.length+'</strong></div>'+
          '<div class="metric"><span>Факты в памяти</span><strong>'+data.memories.length+'</strong></div>'+
        '</section>'+
        '<section class="panel context-card quick-commands"><div class="panel-title"><b>Примеры</b></div>'+
          '<button id="overviewBtn">Рабочий обзор</button>'+
          '<button data-prompt="План на сегодня">План на сегодня</button>'+
          '<button data-prompt="Какие у меня задачи?">Какие у меня задачи?</button>'+
          '<button data-prompt="Что ты помнишь?">Что ты помнишь?</button>'+
          '<button data-prompt="Создай задачу: проверить MVP">Создай задачу</button>'+
        '</section>'+
      '</aside>'+
    '</div>'
  );

  $('#overviewBtn').onclick=()=>nav('Обзор');
  const messages = $('#messages');
  messages.scrollTop = messages.scrollHeight;
  const input = $('#chatInput');
  const send = () => {
    const text = input.value.trim();
    if(!text || remoteBusy) return;
    if(serverMode()){sendRemote(text);return;}
    const snapshot = structuredClone(data);
    try {
      data.messages.push({id:uid('m'), role:'user', text});
      data.messages.push({id:uid('m'), role:'assistant', text:process(text)});
      save('Диалог и действия AI');
    } catch (error) {
      for (const key of Object.keys(data)) delete data[key];
      Object.assign(data, snapshot);
      const notice = document.createElement('p');
      notice.setAttribute('role', 'alert');
      notice.textContent = 'Не удалось сохранить изменения. Действие отменено. '+error.message;
      input.parentElement.appendChild(notice);
      return;
    }
    render('AI');
    setTimeout(() => { const i=$('#chatInput'); if(i){i.focus(); i.setSelectionRange(i.value.length,i.value.length);} }, 0);
  };
  $('#sendBtn').onclick = send;
  $('#sendBtn').disabled=remoteBusy;
  input.disabled=remoteBusy;
  if(remoteBusy) $('#sendBtn').textContent='Обрабатываю…';
  const connectionButton=$('#connectionBtn');
  if(connectionButton) connectionButton.onclick=()=>nav('Подключение');
  if($('#refreshRemote')) $('#refreshRemote').onclick=()=>remoteRequest(()=>remote().refresh());
  document.querySelectorAll('[data-plan-confirm]').forEach(b=>b.onclick=()=>remoteRequest(()=>remote().post('/api/plans/'+encodeURIComponent(b.dataset.planConfirm)+'/confirm',{})));
  document.querySelectorAll('[data-plan-cancel]').forEach(b=>b.onclick=()=>remoteRequest(()=>remote().post('/api/plans/'+encodeURIComponent(b.dataset.planCancel)+'/cancel',{})));
  document.querySelectorAll('[data-plan-confirm],[data-plan-cancel],#refreshRemote,#connectionBtn').forEach(b=>b.disabled=remoteBusy);
  input.onkeydown = e => { if(e.key==='Enter' && !e.shiftKey){e.preventDefault();send();} };
  document.querySelectorAll('[data-prompt]').forEach(b => b.onclick = () => { input.value=b.dataset.prompt; input.focus(); });
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => nav(b.dataset.go));
}

function process(text){
  const workspaceAnswer=window.NVWorkspace?.answer(text,data);
  if(workspaceAnswer!==null && workspaceAnswer!==undefined)return workspaceAnswer;
  if (!window.NVTaskCore) return 'Не удалось загрузить ядро задач. Обновите страницу и попробуйте снова.';
  const taskResult = window.NVTaskCore.handle(text, data, uid);
  if (taskResult) return taskResult.message;
  const t = text.trim();
  const q = t.toLowerCase();

  const memoryMatch = t.match(/^(запомни|сохрани|запиши)\s*[:,-]?\s*(.+)$/i);
  if(memoryMatch){
    const fact = memoryMatch[2].trim();
    data.memories.push({id:uid('mem'), type:'Факт', text:fact});
    return 'Запомнил. Факт сохранён в этом браузере и доступен в разделе «Память».';
  }

  const projectMatch = t.match(/^(создай|добавь)\s+проект\s*[:,-]?\s*(.+)$/i);
  if(projectMatch){
    const name = projectMatch[2].trim();
    data.projects.push({id:uid('project'), name, desc:'Создано через AI'});
    return 'Проект создан: «'+name+'».';
  }

  const clientMatch = t.match(/^(добавь|создай)\s+клиента\s*[:,-]?\s*(.+)$/i);
  if(clientMatch){
    const name = clientMatch[2].trim();
    data.clients.push({id:uid('client'), name, contact:''});
    return 'Клиент добавлен: «'+name+'».';
  }

  const findMatch = t.match(/^(найди|покажи)\s+(.+)$/i);
  if(findMatch){
    const needle = findMatch[2].trim().toLowerCase();
    const memories = data.memories.filter(x => x.text.toLowerCase().includes(needle));
    const tasks = data.tasks.filter(x => x.title.toLowerCase().includes(needle));
    const projects = data.projects.filter(x => (x.name+' '+x.desc).toLowerCase().includes(needle));
    const found = [];
    if(memories.length) found.push('Память: '+memories.map(x=>x.text).join('; '));
    if(tasks.length) found.push('Задачи: '+tasks.map(x=>x.title+' ('+x.status+')').join('; '));
    if(projects.length) found.push('Проекты: '+projects.map(x=>x.name).join('; '));
    return found.length ? 'Нашёл:\n• '+found.join('\n• ') : 'Ничего не нашёл по запросу «'+findMatch[2].trim()+'».';
  }

  if(q.includes('задач')){
    if(!activeTasks()) return 'Активных задач нет.';
    return 'Сейчас у тебя '+activeTasks()+' активных задач:\n• '+data.tasks.filter(x=>x.status!=='Выполнена').map(x=>x.title+' — '+x.status).join('\n• ');
  }

  if(q.includes('помни') || q.includes('памят')){
    return data.memories.length ? 'Я помню:\n• '+data.memories.slice(-8).map(x=>x.text).join('\n• ') : 'Память пока пуста.';
  }

  if(q.includes('проект')){
    return 'Проекты:\n• '+data.projects.map(x=>x.name).join('\n• ');
  }

  if(q.includes('сотрудник') || q.includes('работник') || q.includes('команда')){
    const count = Array.isArray(data.employees) ? data.employees.length : 0;
    return count
      ? 'Сейчас в системе '+count+' сотрудников.\n• '+data.employees.map(x => x.name + (x.role ? ' — '+x.role : '')).join('\n• ')
      : 'Сейчас сотрудников не добавлено. Есть аккаунт основателя, но он не считается сотрудником. Командный режим позволит добавлять сотрудников и роли.';
  }

  if(q.match(/^(привет|здравствуй|добрый день|доброе утро|добрый вечер|хай|hello|hi)(?:[\s!,.?]|$)/i)){
    return 'Привет! Я Nasha Volna AI. Могу работать с памятью, задачами, проектами и клиентами. Что делаем?';
  }

  if(q.match(/^(ладно|ок|окей|хорошо|понял|понятно|ясно)(?:[\s!,.?]|$)/i)){
    return 'Хорошо. Я готов продолжать.';
  }

  if(q.includes('кто ты') || q.includes('что ты умеешь')){
    return 'Я Nasha Volna AI. Сейчас я работаю как локальный MVP: храню память, ищу информацию, создаю и закрываю задачи, работаю с проектами и клиентами. Следующий этап — подключение настоящего AI-ядра и серверной памяти.';
  }

  if(q.includes('сколько') && (q.includes('нас') || q.includes('компани') || q.includes('проект')) && q.includes('сотруд')){
    const count = Array.isArray(data.employees) ? data.employees.length : 0;
    return count ? 'В системе указано сотрудников: '+count+'.' : 'В системе пока не указаны сотрудники.';
  }

  if(q.includes('клиент')){
    return data.clients.length ? 'Клиенты:\n• '+data.clients.map(x=>x.name).join('\n• ') : 'Клиентов пока нет.';
  }

  if(q.includes('отчёт') || q.includes('отчет')){
    return 'Краткий отчёт:\n• '+data.projects.length+' проект(а)\n• '+activeTasks()+' активных задач\n• '+data.memories.length+' фактов в памяти\n• '+data.clients.length+' клиентов\n• '+(Array.isArray(data.employees)?data.employees.length:0)+' сотрудников\n• '+data.docs.length+' документов';
  }

  return 'Я пока не умею надёжно отвечать на такой свободный запрос без подключённой языковой модели. Но я понимаю команды памяти, задач, проектов, клиентов и команды. Например: «Запомни…», «Найди…», «Создай задачу…», «Какие у меня задачи?», «Сколько сотрудников?». Следующий этап — подключить настоящий NVC AI Core, чтобы такие вопросы обрабатывались естественно.';
}

function renderMemory(p){
  p.innerHTML = layout('Память',serverMode()?'Факты из подключённого рабочего пространства.':'Сохранённые факты доступны в этом браузере. Между устройствами они пока не синхронизируются.',
    '<section class="panel full"><div class="panel-title"><div><b>Сохранённые факты</b><span class="muted"> '+data.memories.length+' записей</span></div><button class="primary" id="addMemory">'+icon('plus')+' Добавить</button></div>'+
    '<div class="records">'+(data.memories.map(m =>
      '<div class="record"><div><span class="tag">'+esc(m.type)+'</span><p>'+esc(m.text)+'</p></div><button data-del="'+esc(m.id)+'">Удалить</button></div>'
    ).join('') || '<div class="empty">Память пока пуста.</div>')+'</div></section>'
  );
  $('#addMemory').onclick=()=>{const x=prompt('Что AI должен запомнить?');if(x)localChange(()=>data.memories.push({id:uid('mem'),type:'Факт',text:x}),()=>render('Память'),'Добавлен факт');};
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>localChange(()=>{data.memories=data.memories.filter(x=>x.id!==b.dataset.del);},()=>render('Память'),'Удалён факт'));
}

function renderTasks(p){
  const s=window.NVWorkspace.inspect(data);
  const groups={all:s.tasks,active:s.active,overdue:s.overdue,today:s.dueToday,unscheduled:s.unscheduled,done:s.done};
  const tasks=(groups[taskFilter]||s.tasks).filter(t=>!taskProject||t.projectId===taskProject);
  const labels={all:'Все',active:'Активные',overdue:'Просрочены',today:'Срок сегодня',unscheduled:'Без срока',done:'Выполнены'};
  p.innerHTML=layout('Задачи','Проекты, сроки и статусы в одном списке.',
    '<section class="panel full"><div class="panel-title"><b>Задачи · '+tasks.length+'</b><button class="primary" id="addTask">'+icon('plus')+' Новая задача</button></div><div class="filters"><label>Статус и срок<select id="filterTasks">'+Object.entries(labels).map(([key,label])=>'<option value="'+key+'" '+(taskFilter===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label>Проект<select id="filterProjects"><option value="">Все проекты</option>'+data.projects.map(x=>'<option value="'+esc(x.id)+'" '+(taskProject===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label></div>'+taskRows(tasks)+'</section>');
  $('#addTask').onclick=()=>editTask(null,taskProject);
  $('#filterTasks').onchange=e=>{taskFilter=e.target.value;render('Задачи');};
  $('#filterProjects').onchange=e=>{taskProject=e.target.value;render('Задачи');};
  bindTaskEditors();
}
function renderProjects(p){
  const project=data.projects.find(x=>x.id===selectedProjectId);
  if(project){
    const s=window.NVWorkspace.inspect(data,new Date(),project.id);
    p.innerHTML=layout(esc(project.name),esc(project.desc||'Цель проекта пока не указана.'),
      '<section class="panel full"><div class="panel-title"><b>'+s.done.length+' из '+s.tasks.length+' задач выполнено</b><button id="allProjects">Все проекты</button></div><p>'+s.overdue.length+' просрочено · '+s.unscheduled.length+' без срока</p><progress max="'+Math.max(1,s.tasks.length)+'" value="'+s.done.length+'" aria-label="Прогресс проекта"></progress><div><button class="secondary" id="projectTask" '+(serverMode()?'disabled':'')+'>Добавить задачу</button><button class="secondary" id="reviewProject">Обзор в чате</button></div>'+taskRows(s.tasks)+'</section>');
    $('#allProjects').onclick=()=>{selectedProjectId=null;render('Проекты');};
    $('#projectTask').onclick=()=>editTask(null,project.id);
    $('#reviewProject').onclick=()=>{nav('AI');$('#chatInput').value='Обзор проекта '+project.name;$('#chatInput').focus();};
    bindTaskEditors();return;
  }
  p.innerHTML=layout('Проекты','Прогресс и сроки по связанным задачам.',
    '<section class="panel full"><div class="panel-title"><b>Проекты · '+data.projects.length+'</b><button class="primary" id="addProject">'+icon('plus')+' Новый проект</button></div><div class="project-cards">'+
    (data.projects.map(x=>{const s=window.NVWorkspace.inspect(data,new Date(),x.id);return '<button class="project-card" data-project="'+esc(x.id)+'"><b>'+esc(x.name)+'</b><p>'+esc(x.desc||'Цель пока не указана')+'</p><span>'+s.done.length+' / '+s.tasks.length+' выполнено</span><progress aria-label="Выполненные задачи" max="'+Math.max(1,s.tasks.length)+'" value="'+s.done.length+'"></progress><small>'+(s.overdue.length?s.overdue.length+' просрочено':s.tasks.length?'Просроченных задач нет':'Добавьте первую задачу')+'</small></button>';}).join('')||'<p class="empty">Создайте проект и соберите его задачи в одном месте.</p>')+'</div></section>');
  $('#addProject').onclick=editProject;
  document.querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>{selectedProjectId=b.dataset.project;render('Проекты');});
}

function renderClients(p){
  p.innerHTML=layout('Клиенты','Будущая база контекста для AI.',
    '<section class="panel full"><div class="panel-title"><b>Клиенты</b><button class="primary" id="addClient">'+icon('plus')+' Добавить</button></div><div class="records">'+
    (data.clients.map(x=>'<div class="record"><div><b>'+esc(x.name)+'</b><p>'+esc(x.contact||'Контакт не указан')+'</p></div></div>').join('')||'<div class="empty">Пока нет клиентов.</div>')+'</div></section>');
  $('#addClient').onclick=()=>{const x=prompt('Имя или название клиента');if(x){const c=prompt('Контакт')||'';localChange(()=>data.clients.push({id:uid('c'),name:x,contact:c}),()=>render('Клиенты'),'Добавлен клиент');}};
}

function renderDocs(p){
  p.innerHTML=layout('Документы',serverMode()?'AI использует текст этих записей и указывает источники.':'Добавьте текст документа, чтобы затем импортировать его в серверный AI.',
    '<section class="panel full"><div class="panel-title"><b>Документы</b><button class="primary" id="addDoc">'+icon('plus')+' Добавить запись</button></div><div class="records">'+
    (data.docs.map(x=>'<div class="record"><div><b>'+esc(x.name)+'</b><p>'+esc(x.text||x.desc)+'</p></div></div>').join('')||'<div class="empty">Документов пока нет.</div>')+'</div></section>');
  $('#addDoc').onclick=()=>{const x=prompt('Название документа');if(x){const body=prompt('Текст документа (до 20 000 символов)')||'';if(body.length>20000){alert('Максимум 20 000 символов.');return;}localChange(()=>data.docs.push({id:uid('d'),name:x,text:body,desc:body?'':'Текст пока не добавлен'}),()=>render('Документы'),'Добавлен документ');}};
}

function remotePlansHTML(){
  if(!serverMode())return '';
  const labels={'task.create':'Создать задачу','task.update':'Изменить задачу','memory.save':'Запомнить','memory.update':'Изменить память','memory.delete':'Удалить факт','project.create':'Создать проект','client.create':'Добавить клиента','document.create':'Добавить документ'};
  return remote().view.plans.map(plan=>'<section class="action-plan"><h3>План изменений</h3><ol>'+plan.actions.map(a=>{
    const existing=[...data.tasks,...data.memories,...data.projects,...data.docs].find(x=>x.id===a.id);
    const fields=[a.id?'Запись: '+(existing?.title||existing?.name||existing?.text||a.id):'',a.title?'Название: '+a.title:'',a.text?'Текст: '+a.text:'',a.status?'Статус: '+a.status:'',a.dueDate?'Срок: '+a.dueDate:'',a.projectName?'Проект: '+a.projectName:'',a.projectId?'Проект: '+(data.projects.find(p=>p.id===a.projectId)?.name||a.projectId):''].filter(Boolean);
    return '<li><b>'+esc(labels[a.kind]||a.kind)+'</b><p>'+fields.map(esc).join('<br>')+'</p></li>';
  }).join('')+'</ol><p class="muted">Применяется целиком после проверки. План действует один час и до следующего изменения данных.</p><button class="secondary" data-plan-confirm="'+esc(plan.id)+'">Применить план</button><button class="secondary" data-plan-cancel="'+esc(plan.id)+'">Отменить</button></section>').join('');
}
async function remoteRequest(operation){
  if(remoteBusy)return;
  remoteBusy=true;remoteError='';render('AI');
  try{adoptRemote(await operation());}
  catch(error){remoteError=error.message;}
  finally{remoteBusy=false;render('AI');}
}
async function sendRemote(message){
  await remoteRequest(()=>remote().post('/api/chat',{message}));
  if(remoteError && $('#chatInput')) $('#chatInput').value=message;
}
function renderConnection(p){
  p.innerHTML=layout('Подключение AI','Локальный режим работает без сервера. Для свободного разговора нужен сервер с подключённой моделью.',
    '<section class="panel full connection-panel">'+(serverMode()?
      '<p>Сервер подключён. Ключ доступа хранится только до закрытия или обновления страницы.</p><p>'+(remote().view.modelReady?'Настройки модели заданы. Доступ к API проверяется при отправке сообщения.':'Модель на сервере пока не настроена.')+'</p><button id="disconnectRemote" class="secondary">Вернуться в локальный режим</button><button id="importRemote" class="secondary">Импортировать локальные записи</button><p class="muted">Импорт доступен только в пустую серверную базу. Локальные записи сохраняются; история локального чата не переносится.</p>':
      '<p>Администратор должен запустить сервер Nasha Volna и выдать ключ рабочего пространства. API-ключ модели хранится на сервере.</p><form id="connectForm"><label>Адрес сервера<input id="serverUrl" type="url" placeholder="https://ai.example.ru" required></label><label>Ключ рабочего пространства<input id="workspaceToken" type="password" autocomplete="off" required></label><p class="muted">Разговоры и импортированные записи будут передаваться на указанный сервер, а контекст запросов — подключённому поставщику модели. Используйте свой доверенный сервер.</p><button class="secondary" type="submit">Подключить</button></form>')+
      '<p id="connectStatus" role="status"></p><button id="backToAI" class="secondary">Вернуться к чату</button></section>');
  $('#backToAI').onclick=()=>nav('AI');
  if(serverMode()){
    $('#disconnectRemote').onclick=()=>{remote().disconnect();for(const k of Object.keys(data))delete data[k];Object.assign(data,localSnapshot||load());localSnapshot=null;remoteError='';nav('AI');};
    $('#importRemote').onclick=()=>remoteRequest(()=>remote().post('/api/import',{data:localSnapshot||load()}));
    $('#importRemote').disabled=remote().view.revision!==0;
  }else{
    const form=$('#connectForm');
    form.onsubmit=async event=>{
      event.preventDefault();
      const button=form.querySelector('button');button.disabled=true;
      $('#connectStatus').textContent='Подключаюсь…';
      try{
        const result=await remote().connect($('#serverUrl').value,$('#workspaceToken').value);
        localSnapshot=structuredClone(data);adoptRemote(result);remoteError='';nav('AI');
      }catch(error){$('#connectStatus').textContent=error.message;button.disabled=false;}
    };
  }
}

let selectedProjectId=null;
let taskFilter='all';
let taskProject='';
function projectOptions(selected=''){
  return '<option value="">Без проекта</option>'+data.projects.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?'selected':'')+'>'+esc(x.name)+'</option>').join('');
}
function localChange(change,after,label='Изменение задач или проектов'){
  if(serverMode())return;
  const snapshot=structuredClone(data);
  try{change();save(label);}
  catch(error){
    for(const key of Object.keys(data))delete data[key];Object.assign(data,snapshot);
    const message='Изменения не сохранены. '+(error.name==='QuotaExceededError'?'Хранилище браузера заполнено.':error.message);
    if($('#formError'))$('#formError').textContent=message;else showError(message);
    return;
  }
  after();
}
function taskRows(tasks){
  const date=window.NVWorkspace.today();
  return tasks.map(t=>'<div class="record"><div><b>'+esc(t.title)+'</b><p>'+esc(t.status)+' · '+esc(window.NVWorkspace.reason(t,date))+(t.projectId?' · '+esc(data.projects.find(p=>p.id===t.projectId)?.name||'Проект не найден'):'')+'</p></div><button data-edit-task="'+esc(t.id)+'" '+(serverMode()?'disabled':'')+'>Изменить</button></div>').join('')||'<div class="empty">Задач в этом списке нет.</div>';
}
function bindTaskEditors(){document.querySelectorAll('[data-edit-task]').forEach(b=>b.onclick=()=>editTask(b.dataset.editTask));}
function editTask(id=null,projectId=''){
  if(serverMode())return;
  const current=id?data.tasks.find(t=>t.id===id):null;
  if(id&&!current)return;
  const t=current||{title:'',status:'Новая',projectId,dueDate:''};
  const p=$('#page');
  p.innerHTML=layout(id?'Изменить задачу':'Новая задача','Срок, проект и статус сохраняются вместе.',
    '<section class="panel full connection-panel"><form id="taskForm"><label>Название<input id="taskTitle" maxlength="300" required value="'+esc(t.title)+'"></label><div class="form-grid"><label>Срок по Москве<input type="date" id="taskDue" value="'+esc(t.dueDate||'')+'"></label><label>Статус<select id="taskStatus">'+['Новая','В работе','Выполнена'].map(v=>'<option '+(v===t.status?'selected':'')+'>'+v+'</option>').join('')+'</select></label></div><label>Проект<select id="taskProject">'+projectOptions(t.projectId)+'</select></label><p id="formError" role="alert"></p><button class="secondary" type="submit">Сохранить задачу</button><button class="secondary" id="cancelTask" type="button">Отмена</button></form></section>');
  $('#cancelTask').onclick=()=>nav('Задачи');
  $('#taskForm').onsubmit=e=>{e.preventDefault();localChange(()=>{
    const values=window.NVWorkspace.validateTask({title:$('#taskTitle').value,status:$('#taskStatus').value,dueDate:$('#taskDue').value,projectId:$('#taskProject').value},data,id);
    const record={...(current||{}),...values,id:id||uid('task'),updatedAt:new Date().toISOString()};
    if(!values.dueDate)delete record.dueDate;if(!values.projectId)delete record.projectId;
    if(current)data.tasks[data.tasks.findIndex(x=>x.id===id)]=record;else data.tasks.unshift(record);
    data.taskContext={lastId:record.id,pending:null};
  },()=>{taskFilter='all';taskProject='';nav('Задачи');});};
}
function renderOverview(p){
  const s=window.NVWorkspace.inspect(data);
  const metric=(n,label,filter)=>'<button class="panel overview-metric" data-filter="'+filter+'"><strong>'+n+'</strong><span>'+label+'</span></button>';
  p.innerHTML=layout('Рабочий обзор','Состояние задач на '+s.date+' · Москва · '+(serverMode()?'снимок серверных данных':'данные этого браузера'),
    '<div class="overview-metrics">'+metric(s.active.length,'Активные','active')+metric(s.overdue.length,'Просрочены','overdue')+metric(s.dueToday.length,'Срок сегодня','today')+metric(s.unscheduled.length,'Без срока','unscheduled')+'</div>'+
    '<div class="overview-grid"><section class="panel full"><div class="panel-title"><b>С чего начать</b><button id="dailyPlan">Объяснить порядок</button></div><p class="muted">Сначала просрочки, затем срок сегодня, работа в процессе и ближайшие сроки. Длительность задач пока не учитывается.</p>'+taskRows(s.ordered.slice(0,5))+'</section><section class="panel full"><div class="panel-title"><b>Нужно уточнить</b></div><p>'+s.unscheduled.length+' активных задач без корректного срока.</p><p>'+s.unlinked.length+' активных задач не связаны с существующим проектом.</p><p class="muted">Без этих данных обзор не показывает полную картину работы.</p><button class="secondary" id="openProjects">Открыть проекты</button><button class="secondary" id="newOverviewTask" '+(serverMode()?'disabled':'')+'>Новая задача</button></section></div>');
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{taskFilter=b.dataset.filter;taskProject='';nav('Задачи');});
  $('#dailyPlan').onclick=()=>{nav('AI');$('#chatInput').value='План на сегодня';$('#chatInput').focus();};
  $('#openProjects').onclick=()=>{selectedProjectId=null;nav('Проекты');};
  $('#newOverviewTask').onclick=()=>editTask();bindTaskEditors();
}
function editProject(){
  if(serverMode())return;
  $('#page').innerHTML=layout('Новый проект','Задайте название и цель, затем добавьте задачи.',
    '<section class="panel full connection-panel"><form id="projectForm"><label>Название<input id="projectName" maxlength="300" required></label><label>Цель проекта<textarea id="projectDescription" maxlength="2000" rows="4"></textarea></label><p id="formError" role="alert"></p><button type="submit" class="secondary">Создать проект</button><button type="button" id="cancelProject" class="secondary">Отмена</button></form></section>');
  $('#cancelProject').onclick=()=>nav('Проекты');
  $('#projectForm').onsubmit=e=>{e.preventDefault();localChange(()=>{
    const name=$('#projectName').value.trim();if(!name||name.length>300)throw Error('Укажите название до 300 символов.');
    if(data.projects.some(x=>x.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))throw Error('Проект с таким названием уже существует.');
    const desc=$('#projectDescription').value.trim();if(desc.length>2000)throw Error('Описание слишком длинное.');
    selectedProjectId=uid('project');data.projects.push({id:selectedProjectId,name,desc});
  },()=>nav('Проекты'));};
}

function showError(message){const notice=document.createElement('p');notice.className='remote-error';notice.setAttribute('role','alert');notice.textContent=message;$('#page').prepend(notice);}
function replaceData(state){for(const key of Object.keys(data))delete data[key];Object.assign(data,structuredClone(state));}
function renderSearch(p){
 p.innerHTML=layout('Поиск по пространству','Задачи, проекты, память, клиенты и документы.',
 '<section class="panel full"><label class="search-field">'+icon('search')+'<input id="workspaceSearch" type="search" aria-label="Поиск по записям" placeholder="Название, контакт или фраза из документа…" maxlength="300"></label><p id="searchCount" class="muted" role="status">Введите слова для поиска.</p><div id="searchResults"></div></section>');
 const input=$('#workspaceSearch');input.focus();input.oninput=()=>{
 const hits=window.NVSearch.search(data,input.value);
 $('#searchCount').textContent=input.value.trim()?(hits.length?'Найдено: '+hits.length+(hits.length===100?' (первые 100)':''):'Совпадений нет.'):'Введите слова для поиска.';
 $('#searchResults').innerHTML=hits.map((x,i)=>'<button class="search-result" data-hit="'+i+'">'+icon(x.icon)+'<span><small>'+esc(x.page)+'</small><b>'+esc(x.title)+'</b><span>'+esc(x.detail)+'</span></span>'+icon('arrow')+'</button>').join('');
 document.querySelectorAll('[data-hit]').forEach(b=>b.onclick=()=>{const hit=hits[Number(b.dataset.hit)];if(hit.page==='Проекты')selectedProjectId=hit.id;if(hit.page==='Задачи'&&!serverMode()){editTask(hit.id);return;}nav(hit.page);});
 };
}
function downloadJSON(content,name){const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function renderData(p){
 const local=serverMode()?localSnapshot:data;
 p.innerHTML=layout('Данные и восстановление','Контроль локальных записей: копия, история и отмена последнего действия.',
 '<div class="overview-grid"><section class="panel full"><div class="section-symbol">'+icon('data')+'</div><h2>Ваши данные — под контролем</h2><p class="muted">Копия содержит записи и переписку этого браузера. Ключи доступа в неё не входят. Сохраните файл в надёжном месте.</p><button id="exportBackup" class="secondary">Скачать копию</button><button id="undoChange" class="secondary" '+(serverMode()||!storage.canUndo()?'disabled':'')+'>Отменить последнее изменение</button><p class="muted">Отмена доступна для одного последнего сохранения, включая переписку. Это локальная история, не защищённый журнал аудита.</p></section>'+
 '<section class="panel full"><h2>Восстановить из копии</h2><p class="muted">После проверки и подтверждения файл заменит локальные записи. Замену можно отменить одним действием.</p><label class="file-label">Выбрать JSON-файл<input id="backupFile" type="file" accept=".json,application/json" '+(serverMode()||storage.problem()?'disabled':'')+'></label><p id="backupPreview" role="status"></p><button id="applyBackup" class="secondary" disabled>Заменить локальные записи</button><p id="formError" role="alert"></p></section></div>'+
 '<section class="panel full history-panel"><div class="panel-title"><b>Последние сохранения</b><span class="muted">До 30 событий</span></div>'+storage.history().map(x=>'<div class="record"><b>'+esc(x.label)+'</b><time>'+esc(new Date(x.at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}))+' МСК</time></div>').join('')+(storage.history().length?'':'<p class="muted">Новые сохранения появятся здесь.</p>')+'</section>');
 $('#exportBackup').onclick=()=>downloadJSON(storage.problem()?storage.raw()||'':storage.export(local),'nasha-volna-'+new Date().toISOString().slice(0,10)+'.json');
 $('#undoChange').onclick=()=>{if(serverMode()||!storage.canUndo())return;try{const restored=storage.undo();storage.commit(restored,'Отменено последнее изменение',data,true);replaceData(restored);savedSnapshot=structuredClone(data);render('Данные');}catch(e){showError(e.message);}};
 let candidate=null;
 $('#backupFile').onchange=async e=>{candidate=null;$('#applyBackup').disabled=true;$('#formError').textContent='';const file=e.target.files[0];if(!file)return;try{if(file.size>5000000)throw Error('Размер файла превышает 5 МБ.');candidate=window.NVStorage.parseBackup(await file.text());$('#backupPreview').textContent='Проверено: '+candidate.tasks.length+' задач, '+candidate.projects.length+' проектов, '+candidate.docs.length+' документов, '+candidate.clients.length+' клиентов, '+candidate.memories.length+' фактов, '+candidate.messages.length+' сообщений.';$('#applyBackup').disabled=false;}catch(error){$('#backupPreview').textContent='';$('#formError').textContent=error.message;}};
 $('#applyBackup').onclick=()=>{if(candidate)localChange(()=>replaceData(candidate),()=>render('Данные'),'Восстановлена резервная копия');};
 if(storage.problem())showError(storage.problem()+' Изменения заблокированы; исходный файл доступен по кнопке скачивания.');
}
const pageIcons={'Обзор':'overview','AI':'ai','Память':'memory','Задачи':'tasks','Проекты':'projects','Клиенты':'clients','Документы':'docs','Данные':'data'};
document.querySelectorAll('nav a').forEach(a=>{a.innerHTML=icon(pageIcons[a.dataset.page])+'<span>'+esc(a.dataset.page)+'</span>';a.setAttribute('href','#'+encodeURIComponent(a.dataset.page));a.setAttribute('title',a.dataset.page);a.setAttribute('aria-label',a.dataset.page);a.onclick=e=>{e.preventDefault();nav(a.dataset.page);};});
$('#brandMark').innerHTML=icon('wave');
$('#globalSearch').innerHTML=icon('search')+'<span>Поиск по пространству</span><kbd>Ctrl K</kbd>';
$('#globalSearch').onclick=()=>nav('Поиск');
document.addEventListener?.('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();nav('Поиск');}});
const theme=$('#theme');
if(localStorage.getItem('nv_theme')==='light') document.body.classList.add('light');
theme.innerHTML=icon('sun');
theme.onclick=()=>{document.body.classList.toggle('light');try{localStorage.setItem('nv_theme',document.body.classList.contains('light')?'light':'dark');}catch(e){showError('Не удалось сохранить тему.');}};
render('AI');
if(storage.problem())showError(storage.problem());
})();
