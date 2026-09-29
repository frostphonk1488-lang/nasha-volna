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
  orders: [],
  ledger: [],
  employees: [],
  products: [],
  stock: [],
  purchases: [],
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
const serverWriteReady=()=>serverMode()&&!remote()?.view?.capabilities?.records;
const canWrite=collection=>!serverMode()||Boolean(remote()?.view?.capabilities?.records&&remote().view.capabilities.write.includes(collection));
let currentPage='AI';
const operationsRenderer=window.NVOperationsUI?.({state:()=>data,esc:v=>esc(v),layout:(...args)=>layout(...args),change:(...args)=>localChange(...args),nav:page=>nav(page),uid:p=>uid(p),icon:n=>icon(n),canWrite,today:()=>window.NVWorkspace.today()});
function adoptRemote(result){
  for(const key of Object.keys(data)) delete data[key];
  Object.assign(data, structuredClone(result.state));
  for(const key of Object.keys(defaults))if(!Array.isArray(data[key]))data[key]=[];
}

const save = (label='Изменение рабочих записей') => {storage.commit(data,label,savedSnapshot);savedSnapshot=structuredClone(data);};
const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const activeTasks = () => data.tasks.filter(x => x.status !== 'Выполнена').length;

const navigationGroups={'Задачи':'Работа','Проекты':'Работа','Клиенты':'Продажи','Заказы':'Продажи','Закупки':'Снабжение','Каталог':'Снабжение','Склад':'Снабжение','Команда':'Компания','Документы':'Компания','AI':'AI-ассистент','Память':'AI-ассистент','Подключение':'Настройки','Данные':'Настройки'};
function syncNavigation(page){
  document.querySelectorAll('nav a').forEach(a=>{
    const active=a.dataset.page===page;
    a.classList.toggle('active',active);
    if(active)a.setAttribute('aria-current','page');else a.removeAttribute?.('aria-current');
  });
  document.querySelectorAll('.nav-group').forEach(group=>{
    const active=Array.from(group.querySelectorAll('a')).some(a=>a.dataset.page===page);
    group.classList.toggle('has-active',active);
    group.open=active;
  });
  const crumb=$('#navBreadcrumb');
  if(crumb)crumb.innerHTML=esc(navigationGroups[page]||'Nasha Volna')+' <span>/ '+esc(page==='AI'?'Чат':page==='Команда'?'Сотрудники':page)+'</span>';
}
function nav(page){
  syncNavigation(page);
  const menu=$('#mobileMenu');if(menu?.open)menu.close();
  render(page);
}

function layout(title, subtitle, body){
  return '<div class="page-head"><div><div class="eyebrow">NASHA VOLNA AI</div><h1>'+title+'</h1><p>'+subtitle+'</p></div></div>'+body;
}

function render(page='AI'){
  currentPage=page;
  syncNavigation(page);
  const p = $('#page');
  if(!p) return;
  const pages={'Обзор':renderOverview,'AI':renderAI,'Память':renderMemory,'Задачи':renderTasks,'Проекты':renderProjects,'Клиенты':renderClients,'Заказы':renderOrders,'Финансы':renderFinance,'Документы':renderDocs,'Подключение':renderConnection,'Поиск':renderSearch,'Данные':renderData,'Команда':p=>operationsRenderer('Команда',p),'Каталог':p=>operationsRenderer('Каталог',p),'Склад':p=>operationsRenderer('Склад',p),'Закупки':p=>operationsRenderer('Закупки',p)};
  try{if(pages[page])pages[page](p);}catch(error){p.innerHTML=layout('Не удалось открыть раздел','Сохранённые данные не изменены.','<section class="panel full"><p role="alert">'+esc(error.message)+'</p><button class="secondary" id="openRecovery">Данные и резервная копия</button></section>');$('#openRecovery').onclick=()=>nav('Данные');}
  if(serverMode() && !['AI','Подключение'].includes(page)){
    const collection={'Клиенты':'clients','Заказы':'orders','Финансы':'ledger','Документы':'docs','Задачи':'tasks','Проекты':'projects','Память':'memories'}[page];
    if(collection&&!canWrite(collection))p.querySelectorAll('[data-status],[data-del],[data-edit-task],#addMemory,#addTask,#addProject,#addClient,#addDoc,#addOrder,#editOrder,#editClient,#clientOrder,#editDoc,#addEntry,[data-reverse],#projectTask').forEach(b=>{b.disabled=true;b.title='Нет прав для изменения раздела.';});
    const note=document.createElement('div');note.className='server-strip';
    note.innerHTML='<span>Общие данные · '+esc(remote().view.identity?.actor||'владелец')+'</span><button class="secondary" id="refreshWorkspace">Обновить данные</button>';p.prepend(note);
    $('#refreshWorkspace').onclick=async()=>{if(remoteBusy)return;try{adoptRemote(await remote().refresh());render(page);}catch(e){showError(e.message);}};
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
          '<button data-prompt="Финансовый обзор">Финансовый обзор</button>'+
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
  const financeAnswer=window.NVFinance.answer(text,data);if(financeAnswer!==null)return financeAnswer;
  if(/^(запиши|создай|добавь|зарегистрируй)\s+(расход|поступление|оплату|возврат|платеж|платёж)/i.test(text.trim()))return 'Для финансовой операции откройте «Финансы → Записать операцию». Проверьте сумму, заказ и дату, затем подтвердите запись. Финансовая операция через чат не создана.';
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
      '<section class="panel full"><div class="panel-title"><b>'+s.done.length+' из '+s.tasks.length+' задач выполнено</b><button id="allProjects">Все проекты</button></div><p>'+s.overdue.length+' просрочено · '+s.unscheduled.length+' без срока</p><progress max="'+Math.max(1,s.tasks.length)+'" value="'+s.done.length+'" aria-label="Прогресс проекта"></progress><div><button class="secondary" id="projectTask" '+(serverWriteReady()?'disabled':'')+'>Добавить задачу</button><button class="secondary" id="reviewProject">Обзор в чате</button></div>'+taskRows(s.tasks)+'</section>');
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

let selectedClientId=null,selectedOrderId=null,orderStage='all';
const money=value=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(value/100);
const options=(rows,selected,empty)=>'<option value="">'+empty+'</option>'+rows.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?'selected':'')+'>'+esc(x.name)+'</option>').join('');
function orderRows(orders){return orders.map(o=>{const tasks=data.tasks.filter(t=>t.orderId===o.id);return '<button class="project-card" data-order="'+esc(o.id)+'"><span class="tag">'+esc(o.status)+'</span><b>'+esc(o.name)+'</b><p>'+esc(data.clients.find(c=>c.id===o.clientId)?.name||'Клиент не найден')+'</p><strong>'+(o.amount?money(window.NVCRM.cents(o.amount)):'Сумма не указана')+'</strong><p>'+(o.dueDate?'Срок: '+esc(o.dueDate):'Без срока')+' · '+tasks.filter(t=>t.status==='Выполнена').length+'/'+tasks.length+' задач</p></button>';}).join('')||'<p class="empty">Заказов пока нет.</p>';}
function bindOrders(){document.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>{selectedOrderId=b.dataset.order;nav('Заказы');});}
function renderClients(p){
 const client=data.clients.find(c=>c.id===selectedClientId);
 if(client){
  const summary=window.NVCRM.summary(data,client.id);
  p.innerHTML=layout(esc(client.name),'Карточка клиента · контакты, заметки и связанные заказы',
   '<section class="panel full"><div class="panel-title"><b>Контакты</b><button id="allClients">Все клиенты</button></div><p class="preserve">'+esc(client.contact||'Контакты не указаны')+'</p><h3>Заметки</h3><p class="preserve">'+esc(client.notes||'Заметок пока нет')+'</p><p class="muted">'+(client.createdAt?'Создан: '+esc(new Date(client.createdAt).toLocaleDateString('ru-RU')):'Дата создания старой записи неизвестна')+(client.updatedAt?' · Изменён: '+esc(new Date(client.updatedAt).toLocaleDateString('ru-RU')):'')+'</p><button class="secondary" id="editClient" '+(serverWriteReady()?'disabled':'')+'>Редактировать клиента</button><button class="secondary" id="clientOrder" '+(serverWriteReady()?'disabled':'')+'>Новый заказ</button></section><section class="panel full history-panel"><div class="panel-title"><b>Заказы клиента · '+summary.orders.length+'</b></div><div class="project-cards">'+orderRows(summary.orders)+'</div></section>');
  $('#allClients').onclick=()=>{selectedClientId=null;render('Клиенты');};$('#editClient').onclick=()=>editClient(client.id);$('#clientOrder').onclick=()=>editOrder(null,client.id);bindOrders();return;
 }
 p.innerHTML=layout('Клиенты','Контакты, заметки и история заказов в одном месте.',
 '<section class="panel full"><div class="panel-title"><b>Клиенты · '+data.clients.length+'</b><button class="primary" id="addClient">'+icon('plus')+' Добавить клиента</button></div><div class="project-cards">'+(data.clients.map(c=>'<button class="project-card" data-client="'+esc(c.id)+'"><b>'+esc(c.name)+'</b><p>'+esc(c.contact||'Контакты не указаны')+'</p><small>'+window.NVCRM.summary(data,c.id).orders.length+' заказов</small></button>').join('')||'<p class="empty">Добавьте первого клиента, затем создайте для него заказ.</p>')+'</div></section>');
 $('#addClient').onclick=()=>editClient();document.querySelectorAll('[data-client]').forEach(b=>b.onclick=()=>{selectedClientId=b.dataset.client;render('Клиенты');});
}
function editClient(id=null){
 if(serverWriteReady())return;const current=data.clients.find(c=>c.id===id),c=current||{};
 $('#page').innerHTML=layout(id?'Редактировать клиента':'Новый клиент','Сохраните контакты и договорённости.',
 '<section class="panel full connection-panel"><form id="clientForm"><label>Название клиента<input id="clientName" maxlength="300" required value="'+esc(c.name)+'"></label><label>Контакты<textarea id="clientContact" maxlength="500" rows="2">'+esc(c.contact)+'</textarea></label><label>Заметки о клиенте<textarea id="clientNotes" maxlength="5000" rows="5">'+esc(c.notes)+'</textarea></label><p id="formError" role="alert"></p><button class="secondary" type="submit">Сохранить клиента</button><button class="secondary" type="button" id="cancelClient">Отмена</button>'+(current?'<button class="secondary danger" type="button" id="deleteClient">Удалить клиента</button>':'')+'</form></section>');
 $('#cancelClient').onclick=()=>nav('Клиенты');
 $('#clientForm').onsubmit=e=>{e.preventDefault();localChange(()=>{const values=window.NVCRM.client({name:$('#clientName').value,contact:$('#clientContact').value,notes:$('#clientNotes').value},data,id);const record={...c,...values,id:id||uid('client'),createdAt:c.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};if(current)data.clients[data.clients.indexOf(current)]=record;else data.clients.push(record);selectedClientId=record.id;},()=>nav('Клиенты'),id?'Изменён клиент':'Добавлен клиент');};
 if(current)$('#deleteClient').onclick=()=>{if(confirm('Удалить клиента «'+current.name+'»? Последнее изменение можно отменить в разделе «Данные».'))localChange(()=>window.NVCRM.removeClient(data,id),()=>{selectedClientId=null;nav('Клиенты');},'Удалён клиент');};
}
function renderOrders(p){

 const o=(data.orders||[]).find(x=>x.id===selectedOrderId);
 if(o){const tasks=data.tasks.filter(t=>t.orderId===o.id);
 p.innerHTML=layout(esc(o.name),'Заказ · '+esc(o.status),'<section class="panel full"><div class="panel-title"><b>'+(o.amount?money(window.NVCRM.cents(o.amount)):'Сумма не указана')+'</b><button id="allOrders">Все заказы</button></div><p>Клиент: <button class="secondary" id="orderClient">'+esc(data.clients.find(c=>c.id===o.clientId)?.name||'Клиент не найден')+'</button></p><p>Срок: '+esc(o.dueDate||'не указан')+' · Ответственный: '+esc(data.employees.find(e=>e.id===o.ownerId)?.name||o.owner||'не указан')+'</p><p>Оплата до: '+esc(o.paymentDueDate||'дата не задана')+'</p><p>Проект: '+esc(data.projects.find(x=>x.id===o.projectId)?.name||'не выбран')+'</p><p class="preserve">'+esc(o.notes||'Описание пока не добавлено')+'</p><button class="secondary" id="editOrder">Редактировать заказ</button><button class="secondary" id="orderTask">Добавить задачу</button></section><section class="panel full history-panel"><div class="panel-title"><b>Задачи заказа · '+tasks.filter(t=>t.status==='Выполнена').length+'/'+tasks.length+'</b></div>'+taskRows(tasks)+'</section>'+orderFinance(o));
 $('#allOrders').onclick=()=>{selectedOrderId=null;render('Заказы');};$('#orderClient').onclick=()=>{selectedClientId=o.clientId;nav('Клиенты');};$('#editOrder').onclick=()=>editOrder(o.id);$('#orderTask').onclick=()=>editTask(null,o.projectId,o.id);$('#orderFinance').onclick=()=>{financeFilter={from:'',to:'',orderId:o.id};nav('Финансы');};$('#orderIncome').onclick=()=>editEntry('income',o.id);$('#orderExpense').onclick=()=>editEntry('expense',o.id);$('#orderEconomy').onclick=()=>{nav('AI');$('#chatInput').value='Экономика заказа '+o.name;$('#chatInput').focus();};bindTaskEditors();return;}
 const summary=window.NVCRM.summary(data),orders=summary.orders.filter(o=>orderStage==='all'||o.status===orderStage);
 p.innerHTML=layout('Заказы','От договорённости с клиентом до выполненных задач.', '<div class="overview-metrics"><section class="panel overview-metric"><strong>'+summary.active.length+'</strong><span>Активных заказов</span></section><section class="panel overview-metric order-total"><strong>'+money(summary.amountCents)+'</strong><span>Сумма активных заказов · не выручка</span></section></div><section class="panel full"><div class="panel-title"><b>Заказы · '+orders.length+'</b><button class="primary" id="addOrder">'+icon('plus')+' Новый заказ</button></div><p class="muted">'+summary.unknown+' активных заказов без суммы. Поступления и расходы доступны в разделе «Финансы».</p><div class="filters"><label>Этап заказа<select id="orderStage"><option value="all">Все этапы</option>'+window.NVCRM.stages.map(v=>'<option '+(v===orderStage?'selected':'')+'>'+v+'</option>').join('')+'</select></label></div><div class="project-cards">'+orderRows(orders)+'</div></section>');
 $('#addOrder').onclick=()=>editOrder();$('#orderStage').onchange=e=>{orderStage=e.target.value;render('Заказы');};bindOrders();
}
function editOrder(id=null,clientId=''){
 if(serverWriteReady())return;const current=(data.orders||[]).find(o=>o.id===id),o=current||{clientId,status:'Новый'};
 $('#page').innerHTML=layout(id?'Редактировать заказ':'Новый заказ','Стоимость, этап, ответственный и сроки оплаты.',
 '<section class="panel full connection-panel"><form id="orderForm"><label>Название заказа<input id="orderName" maxlength="300" required value="'+esc(o.name)+'"></label><label>Клиент<select id="orderClientId" required>'+options(data.clients,o.clientId,'Выберите клиента')+'</select></label>'+(!data.clients.length?'<p class="muted">Сначала добавьте клиента в разделе «Клиенты».</p>':'')+'<div class="form-grid"><label>Сумма, ₽<input id="orderAmount" inputmode="decimal" placeholder="Не указана" value="'+esc(o.amount)+'"></label><label>Срок заказа<input id="orderDue" type="date" value="'+esc(o.dueDate)+'"></label></div><label>Этап<select id="orderStatus">'+window.NVCRM.stages.map(v=>'<option '+(v===o.status?'selected':'')+'>'+v+'</option>').join('')+'</select></label><label>Дата оплаты<input id="orderPaymentDue" type="date" value="'+esc(o.paymentDueDate)+'"></label><label>Сотрудник<select id="orderOwnerId">'+options(data.employees.filter(e=>e.status!=='Неактивен'),o.ownerId,'Не назначен')+'</select></label><label>Ответственный (примечание)<input id="orderOwner" maxlength="300" value="'+esc(o.owner)+'"></label><label>Связанный проект<select id="orderProject">'+options(data.projects,o.projectId,'Без проекта')+'</select></label><label>Описание заказа<textarea id="orderNotes" maxlength="5000" rows="4">'+esc(o.notes)+'</textarea></label><p class="muted">Смена этапа заказа не меняет статусы его задач автоматически.</p><p id="formError" role="alert"></p><button class="secondary" type="submit">Сохранить заказ</button><button class="secondary" type="button" id="cancelOrder">Отмена</button>'+(current?'<button class="secondary danger" type="button" id="deleteOrder">Удалить заказ</button>':'')+'</form></section>');
 $('#cancelOrder').onclick=()=>nav('Заказы');
 $('#orderForm').onsubmit=e=>{e.preventDefault();localChange(()=>{const values=window.NVCRM.order({name:$('#orderName').value,clientId:$('#orderClientId').value,amount:$('#orderAmount').value,dueDate:$('#orderDue').value,status:$('#orderStatus').value,owner:$('#orderOwner').value,ownerId:$('#orderOwnerId').value,paymentDueDate:$('#orderPaymentDue').value,projectId:$('#orderProject').value,notes:$('#orderNotes').value},data);const record={...o,...values,id:id||uid('order'),createdAt:o.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};if(current)data.orders[data.orders.indexOf(current)]=record;else data.orders.push(record);selectedOrderId=record.id;},()=>nav('Заказы'),id?'Изменён заказ':'Создан заказ');};
 if(current)$('#deleteOrder').onclick=()=>{if(confirm('Удалить заказ «'+current.name+'»? Последнее изменение можно отменить в разделе «Данные».'))localChange(()=>window.NVCRM.removeOrder(data,id),()=>{selectedOrderId=null;nav('Заказы');},'Удалён заказ');};
}

let selectedDocId=null;
function renderDocs(p){
 const d=data.docs.find(x=>x.id===selectedDocId);
 if(d){p.innerHTML=layout(esc(d.name),'Документ · '+esc(d.folder||'Общие'),'<section class="panel full"><div class="panel-title"><b>'+esc(data.projects.find(x=>x.id===d.projectId)?.name||'Без проекта')+'</b><button id="allDocs">Все документы</button></div><p class="muted">'+esc((data.orders||[]).find(x=>x.id===d.orderId)?.name||'Без заказа')+'</p><div class="document-body">'+esc(d.text||d.desc||'Текст не добавлен')+'</div><button class="secondary" id="editDoc" '+(serverWriteReady()?'disabled':'')+'>Редактировать документ</button></section>');$('#allDocs').onclick=()=>{selectedDocId=null;nav('Документы');};$('#editDoc').onclick=()=>editDoc(d.id);return;}
 p.innerHTML=layout('Документы','Тексты, договорённости и база знаний с привязкой к работе.', '<section class="panel full"><div class="panel-title"><b>Документы · '+data.docs.length+'</b><button id="addDoc" class="primary">'+icon('plus')+' Новый документ</button></div><div class="project-cards">'+(data.docs.map(d=>'<button class="project-card" data-doc="'+esc(d.id)+'"><span class="tag">'+esc(d.folder||'Общие')+'</span><b>'+esc(d.name)+'</b><p>'+esc((d.text||d.desc||'').slice(0,130))+'</p></button>').join('')||'<p class="empty">Добавьте техническое задание, условия заказа или инструкцию. Поиск и AI смогут находить фрагменты текста.</p>')+'</div></section>');$('#addDoc').onclick=()=>editDoc();document.querySelectorAll('[data-doc]').forEach(b=>b.onclick=()=>{selectedDocId=b.dataset.doc;render('Документы');});
}
function editDoc(id=null){
 if(serverWriteReady())return;const current=data.docs.find(d=>d.id===id),d=current||{};
 $('#page').innerHTML=layout(id?'Редактировать документ':'Новый документ','Обычный текст до 20 000 символов. HTML и скрипты не выполняются.', '<section class="panel full connection-panel"><form id="docForm"><label>Название документа<input id="docName" required maxlength="300" value="'+esc(d.name)+'"></label><label>Папка<input id="docFolder" maxlength="100" value="'+esc(d.folder||'Общие')+'"></label><div class="form-grid"><label>Проект документа<select id="docProject">'+projectOptions(d.projectId)+'</select></label><label>Заказ документа<select id="docOrder">'+options(data.orders||[],d.orderId,'Без заказа')+'</select></label></div><label>Текст документа<textarea id="docText" maxlength="20000" rows="12">'+esc(d.text||d.desc)+'</textarea></label><p id="formError" role="alert"></p><button class="secondary" type="submit">Сохранить документ</button><button class="secondary" type="button" id="cancelDoc">Отмена</button>'+(current?'<button class="secondary danger" type="button" id="deleteDoc">Удалить документ</button>':'')+'</form></section>');
 $('#cancelDoc').onclick=()=>nav('Документы');$('#docForm').onsubmit=e=>{e.preventDefault();localChange(()=>{const name=$('#docName').value.trim(),text=$('#docText').value,folder=$('#docFolder').value.trim(),projectId=$('#docProject').value,orderId=$('#docOrder').value;if(!name||name.length>300||text.length>20000||folder.length>100)throw Error('Проверьте название и длину полей.');if(projectId&&!data.projects.some(x=>x.id===projectId))throw Error('Проект не найден.');if(orderId&&!data.orders.some(x=>x.id===orderId))throw Error('Заказ не найден.');const record={...d,id:id||uid('doc'),name,text,folder:folder||'Общие',projectId,orderId,updatedAt:new Date().toISOString()};if(current)data.docs[data.docs.indexOf(current)]=record;else data.docs.push(record);selectedDocId=record.id;},()=>nav('Документы'),id?'Изменён документ':'Добавлен документ');};
 if(current)$('#deleteDoc').onclick=()=>{if(confirm('Удалить документ? Последнее действие можно отменить в разделе «Данные».'))localChange(()=>{data.docs=data.docs.filter(x=>x.id!==id);},()=>{selectedDocId=null;nav('Документы');},'Удалён документ');};
}

let financeFilter={from:'',to:'',orderId:''};
function metricCard(value,label,tone=''){return '<section class="panel finance-metric '+tone+'"><span>'+label+'</span><strong>'+money(value)+'</strong></section>';}
function financeCards(t){return '<div class="finance-metrics">'+metricCard(t.income,'Поступления','positive')+metricCard(t.refund,'Возвраты клиентам')+metricCard(t.expense,'Расходы')+metricCard(t.balance,'Денежный результат',t.balance<0?'negative':'positive')+'</div>';}
function orderFinance(o){const s=window.NVFinance.orderSummary(data,o);return '<section class="panel full history-panel"><div class="panel-title"><b>Экономика заказа</b><button id="orderFinance">Открыть операции</button></div><div class="finance-metrics compact">'+metricCard(s.netPaid,'Оплачено за вычетом возвратов')+metricCard(s.expense,'Расходы заказа')+metricCard(s.balance,'Денежный результат',s.balance<0?'negative':'positive')+(s.due===null?'<section class="panel finance-metric"><span>Осталось получить</span><strong>—</strong></section>':metricCard(s.due,'Осталось получить'))+'</div><p class="muted">Денежный результат = поступления − возвраты − расходы. Общие расходы без привязки не учтены. Это не бухгалтерская прибыль.</p>'+(s.overpaid?'<p class="attention">Переплата по записанным операциям: '+money(s.overpaid)+'. Проверьте сумму заказа и поступления.</p>':'')+'<button id="orderIncome" class="secondary">Записать поступление</button><button id="orderExpense" class="secondary">Записать расход</button><button id="orderEconomy" class="secondary">Объяснить в AI</button></section>';}
function ledgerRows(rows){return rows.slice().sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt).localeCompare(String(a.createdAt))).map(e=>{const reversed=(data.ledger||[]).some(r=>r.reversalOf===e.id);return '<article class="ledger-row"><div class="ledger-symbol '+(e.kind==='income'?'positive':'')+'">'+icon(e.kind==='income'?'arrow':'finance')+'</div><div class="ledger-copy"><div><span class="tag">'+esc(window.NVFinance.labels[e.kind])+'</span>'+(reversed?'<span class="muted"> · исправлена</span>':'')+'</div><b>'+esc(e.note)+'</b><p>'+esc(e.date)+' · '+esc(e.category)+(e.orderId?' · '+esc((data.orders||[]).find(o=>o.id===e.orderId)?.name||'Заказ не найден'):' · Общая операция')+'</p>'+(e.reversalOf?'<small class="muted">Исправляет запись '+esc(e.reversalOf)+'</small>':'')+'</div><div class="ledger-amount"><b>'+money(window.NVFinance.cents(e.amount))+'</b>'+(!reversed&&e.kind!=='reversal'?'<button class="secondary" data-reverse="'+esc(e.id)+'">Исправить</button>':'')+'</div></article>';}).join('')||'<div class="empty">Операций за выбранный период нет. Запишите поступление или расход.</div>';}
function renderFinance(p){

 const t=window.NVFinance.totals(data,financeFilter),portfolio=window.NVFinance.portfolio(data);
 p.innerHTML=layout('Финансы','Записанные поступления, расходы и возвраты · RUB · '+(financeFilter.from||'начало учёта')+' — '+(financeFilter.to||'сегодня'),
 '<div class="workspace-actions"><button class="primary" id="addEntry">'+icon('plus')+' Записать операцию</button><button class="secondary" id="exportLedger">Скачать CSV</button><button class="secondary" id="financeAI">Объяснить в AI</button></div>'+financeCards(t)+'<section class="panel full history-panel"><b>Просрочено по заданным датам оплаты: '+money(portfolio.overdue)+'</b><p class="muted">Заказы без даты оплаты не включаются в просрочку.</p></section>'+
 '<section class="panel full"><form class="filters finance-filters" id="financeFilters"><label>С даты<input type="date" id="financeFrom" value="'+esc(financeFilter.from)+'"></label><label>По дату<input type="date" id="financeTo" value="'+esc(financeFilter.to)+'"></label><label>Заказ<select id="financeOrder">'+options(data.orders||[],financeFilter.orderId,'Все заказы и общие операции')+'</select></label><button class="secondary" type="submit">Применить фильтр</button><button class="secondary" type="button" id="resetFinance">Сбросить</button></form><p id="formError" role="alert"></p><p class="muted">Это ручной управленческий учёт. Кнопки записывают данные и не переводят деньги. Исправления учитываются датой исправления; отрицательные итоги периода возможны.</p><div class="panel-title"><b>Операции · '+t.rows.length+'</b></div>'+ledgerRows(t.rows)+'</section>'+
 '<section class="panel full history-panel"><div class="panel-title"><b>Осталось получить по всем заказам</b><strong>'+money(portfolio.due)+'</strong></div><p class="muted">За всё время, независимо от фильтра. Исключены отменённые заказы. Это остаток к оплате, не просроченный долг. Без стоимости: '+portfolio.unknown+' заказов.</p>'+portfolio.unpaid.map(x=>'<div class="record"><div><b>'+esc(x.order.name)+'</b><p>'+esc(data.clients.find(c=>c.id===x.order.clientId)?.name||'')+'</p></div><strong>'+money(x.due)+'</strong><button data-finance-order="'+esc(x.order.id)+'">Открыть</button></div>').join('')+'</section>');
 $('#addEntry').onclick=()=>editEntry('income',financeFilter.orderId);$('#financeAI').onclick=()=>{nav('AI');$('#chatInput').value='Финансовый обзор';$('#chatInput').focus();};
 $('#exportLedger').onclick=()=>downloadFile(window.NVFinance.csv(data,financeFilter),'nasha-volna-finance.csv','text/csv;charset=utf-8');
 $('#resetFinance').onclick=()=>{financeFilter={from:'',to:'',orderId:''};render('Финансы');};
 $('#financeFilters').onsubmit=e=>{e.preventDefault();const from=$('#financeFrom').value,to=$('#financeTo').value;if((from&&!window.NVFinance.validDate(from))||(to&&!window.NVFinance.validDate(to))||(from&&to&&from>to)){$('#formError').textContent='Проверьте даты: начало периода должно быть не позже конца.';return;}financeFilter={from,to,orderId:$('#financeOrder').value};render('Финансы');};
 document.querySelectorAll('[data-reverse]').forEach(b=>b.onclick=()=>editReversal(b.dataset.reverse));document.querySelectorAll('[data-finance-order]').forEach(b=>b.onclick=()=>{selectedOrderId=b.dataset.financeOrder;nav('Заказы');});
}
function editEntry(kind='income',orderId=''){
 if(serverWriteReady())return;let draft=null;const today=window.NVWorkspace.today();
 $('#page').innerHTML=layout('Новая операция','Запишите уже совершённую операцию. Перевод денег не выполняется.',
 '<section class="panel full connection-panel"><form id="entryForm"><div class="form-grid"><label>Вид операции<select id="entryKind">'+['income','expense','refund'].map(k=>'<option value="'+k+'" '+(k===kind?'selected':'')+'>'+window.NVFinance.labels[k]+'</option>').join('')+'</select></label><label>Сумма, ₽<input id="entryAmount" inputmode="decimal" required placeholder="0,00"></label></div><label>Дата операции<input id="entryDate" type="date" required max="'+today+'" value="'+today+'"></label><label>Заказ операции<select id="entryOrder">'+options(data.orders||[],orderId,'Без заказа — только общий расход')+'</select></label><label>Статья<select id="entryCategory">'+window.NVFinance.categories.map(c=>'<option>'+c+'</option>').join('')+'</select></label><label>Назначение<textarea id="entryNote" maxlength="1000" rows="3" required></textarea></label><p id="formError" role="alert"></p><button class="secondary" type="submit">Проверить операцию</button><button class="secondary" type="button" id="cancelEntry">Отмена</button></form><div id="entryReview"></div></section>');
 $('#cancelEntry').onclick=()=>nav('Финансы');
 $('#entryForm').onsubmit=e=>{e.preventDefault();try{draft={...window.NVFinance.validate({kind:$('#entryKind').value,amount:$('#entryAmount').value,date:$('#entryDate').value,orderId:$('#entryOrder').value,category:$('#entryCategory').value,note:$('#entryNote').value},data,today),id:uid('entry'),createdAt:new Date().toISOString()};$('#formError').textContent='';$('#entryReview').innerHTML='<section class="action-plan"><h3>Проверьте запись</h3><p>'+esc(window.NVFinance.labels[draft.kind])+' · <b>'+money(window.NVFinance.cents(draft.amount))+'</b> · '+esc(draft.date)+'</p><p>'+esc((data.orders||[]).find(o=>o.id===draft.orderId)?.name||'Общий расход')+'<br>'+esc(draft.category)+'<br>'+esc(draft.note)+'</p><p class="muted">Запись изменит показатели. Для исправления позже можно создать обратную запись.</p><button class="secondary" id="confirmEntry">Подтвердить запись</button></section>';$('#confirmEntry').onclick=()=>localChange(()=>{if(data.ledger.some(e=>e.id===draft.id))throw Error('Операция уже сохранена.');data.ledger.push(draft);},()=>{financeFilter={from:'',to:'',orderId:draft.orderId};nav('Финансы');},'Записано: '+window.NVFinance.labels[draft.kind]);}catch(error){draft=null;$('#entryReview').innerHTML='';$('#formError').textContent=error.message;}};
 $('#entryForm').oninput=()=>{draft=null;$('#entryReview').innerHTML='';};$('#entryForm').onchange=()=>{draft=null;$('#entryReview').innerHTML='';};
}
function editReversal(id){
 if(serverWriteReady())return;const entry=data.ledger.find(e=>e.id===id);if(!entry)return;
 $('#page').innerHTML=layout('Исправить операцию','Исходная запись останется в истории. Обратная запись нейтрализует её сумму сегодняшней датой.',
 '<section class="panel full connection-panel"><p>'+esc(window.NVFinance.labels[entry.kind])+' · '+money(window.NVFinance.cents(entry.amount))+' · '+esc(entry.date)+'</p><p>'+esc(entry.note)+'</p><form id="reversalForm"><label>Причина исправления<textarea id="reversalReason" maxlength="1000" required rows="3"></textarea></label><p id="formError" role="alert"></p><button class="secondary" type="submit">Подтвердить исправление</button><button class="secondary" type="button" id="cancelReversal">Отмена</button></form></section>');
 $('#cancelReversal').onclick=()=>nav('Финансы');$('#reversalForm').onsubmit=e=>{e.preventDefault();localChange(()=>data.ledger.push({...window.NVFinance.reverse(data,id,$('#reversalReason').value,window.NVWorkspace.today()),id:uid('entry'),createdAt:new Date().toISOString()}),()=>nav('Финансы'),'Исправлена финансовая операция');};
}
function businessPanel(){const p=window.NVFinance.portfolio(data),t=window.NVFinance.totals(data),today=window.NVWorkspace.today(),late=(data.orders||[]).filter(o=>!['Выполнен','Отменён'].includes(o.status)&&o.dueDate&&o.dueDate<today);return '<section class="panel full business-panel"><div class="panel-title"><div><span class="eyebrow">БИЗНЕС В ЦИФРАХ</span><h2>От заказа к результату</h2></div><button id="openFinance">Финансовый обзор '+icon('arrow')+'</button></div><div class="finance-metrics compact">'+metricCard(p.due,'Осталось получить')+metricCard(t.balance,'Денежный результат',t.balance<0?'negative':'positive')+'<section class="panel finance-metric"><span>Заказы с нарушенным сроком</span><strong>'+late.length+'</strong></section></div><p class="muted">За всё время по введённым записям. Результат учитывает только записанные денежные операции.</p><div class="workspace-actions"><button class="secondary" id="businessClient">Добавить клиента</button><button class="secondary" id="businessOrder">Создать заказ</button><button class="secondary" id="businessEntry">Записать операцию</button></div>'+(late.length?'<div class="attention">Проверьте сроки: '+late.slice(0,3).map(o=>esc(o.name)).join(', ')+'.</div>':'')+'</section>';}
function bindBusiness(){$('#openFinance').onclick=()=>nav('Финансы');$('#businessClient').onclick=()=>editClient();$('#businessOrder').onclick=()=>editOrder();$('#businessEntry').onclick=()=>editEntry();}

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
    $('#importRemote').disabled=remote().view.revision!==0||!remote().view.capabilities?.import;
    if(!remote().view.capabilities?.records)$('#connectStatus').textContent='Для общих заказов и финансов обновите сервер до версии 0.4.';
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
  if(serverMode()){return serverChange(change,after,label);}
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
async function serverChange(change,after,label){
  if(remoteBusy){showError('Дождитесь сохранения текущей операции.');return;}
  const snapshot=structuredClone(data);let operations=[];
  try{
    if(serverWriteReady())throw Error('Обновите сервер до версии 0.4.');
    change();
    for(const collection of Object.keys(defaults).filter(k=>k!=='messages')){
      const old=new Map(snapshot[collection].map(x=>[x.id,x])),next=new Map(data[collection].map(x=>[x.id,x]));
      for(const [id,record] of next)if(JSON.stringify(record)!==JSON.stringify(old.get(id)))operations.push({collection,id,record});
      for(const id of old.keys())if(!next.has(id))operations.push({collection,id,delete:true});
    }
  }catch(e){replaceData(snapshot);if($('#formError'))$('#formError').textContent=e.message;else showError(e.message);return;}
  replaceData(snapshot);
  if(!operations.length){after();return;}
  remoteBusy=true;
  const buttons=Array.from($('#page').querySelectorAll('button'));buttons.forEach(b=>b.disabled=true);
  try{adoptRemote(await remote().post('/api/records',{operations}));after();}
  catch(e){
    if($('#formError'))$('#formError').textContent=e.message;else showError(e.message);
    if(remote().pending){const retry=document.createElement('button');retry.className='secondary';retry.textContent='Повторить сохранение';retry.onclick=async()=>{if(remoteBusy)return;remoteBusy=true;try{adoptRemote(await remote().retry());after();}catch(error){showError(error.message);}finally{remoteBusy=false;}};$('#page').prepend(retry);}
  }finally{remoteBusy=false;buttons.forEach(b=>b.disabled=false);}
}
function taskRows(tasks){
  const date=window.NVWorkspace.today();
  return tasks.map(t=>'<div class="record"><div><b>'+esc(t.title)+'</b><p>'+esc(t.status)+' · '+esc(window.NVWorkspace.reason(t,date))+(t.orderId?' · Заказ: '+esc((data.orders||[]).find(o=>o.id===t.orderId)?.name||'не найден'):'')+(t.projectId?' · '+esc(data.projects.find(p=>p.id===t.projectId)?.name||'Проект не найден'):'')+'</p></div><button data-edit-task="'+esc(t.id)+'" '+(serverWriteReady()?'disabled':'')+'>Изменить</button></div>').join('')||'<div class="empty">Задач в этом списке нет.</div>';
}
function bindTaskEditors(){document.querySelectorAll('[data-edit-task]').forEach(b=>b.onclick=()=>editTask(b.dataset.editTask));}
function editTask(id=null,projectId='',orderId=''){
  if(serverWriteReady())return;
  const current=id?data.tasks.find(t=>t.id===id):null;
  if(id&&!current)return;
  const t=current||{title:'',status:'Новая',projectId,orderId,dueDate:''};
  const p=$('#page');
  p.innerHTML=layout(id?'Изменить задачу':'Новая задача','Срок, проект и статус сохраняются вместе.',
    '<section class="panel full connection-panel"><form id="taskForm"><label>Название<input id="taskTitle" maxlength="300" required value="'+esc(t.title)+'"></label><div class="form-grid"><label>Срок по Москве<input type="date" id="taskDue" value="'+esc(t.dueDate||'')+'"></label><label>Статус<select id="taskStatus">'+['Новая','В работе','Выполнена'].map(v=>'<option '+(v===t.status?'selected':'')+'>'+v+'</option>').join('')+'</select></label></div><label>Исполнитель<select id="taskAssignee">'+options(data.employees.filter(e=>e.status!=='Неактивен'),t.assigneeId,'Не назначен')+'</select></label><label>Проект<select id="taskProject">'+projectOptions(t.projectId)+'</select></label><label>Заказ<select id="taskOrder">'+options(data.orders||[],t.orderId,'Без заказа')+'</select></label><p id="formError" role="alert"></p><button class="secondary" type="submit">Сохранить задачу</button><button class="secondary" id="cancelTask" type="button">Отмена</button></form></section>');
  $('#cancelTask').onclick=()=>nav('Задачи');
  $('#taskForm').onsubmit=e=>{e.preventDefault();localChange(()=>{
    const values=window.NVWorkspace.validateTask({title:$('#taskTitle').value,status:$('#taskStatus').value,dueDate:$('#taskDue').value,projectId:$('#taskProject').value},data,id);
    const linkedOrder=$('#taskOrder').value||'';if(linkedOrder&&!(data.orders||[]).some(o=>o.id===linkedOrder))throw Error('Заказ не найден.');
    const assigneeId=$('#taskAssignee').value||'';if(assigneeId&&!data.employees.some(e=>e.id===assigneeId))throw Error('Исполнитель не найден.');
    const record={...(current||{}),...values,assigneeId,orderId:linkedOrder,id:id||uid('task'),updatedAt:new Date().toISOString()};
    if(!linkedOrder)delete record.orderId;if(!values.dueDate)delete record.dueDate;if(!values.projectId)delete record.projectId;
    if(current)data.tasks[data.tasks.findIndex(x=>x.id===id)]=record;else data.tasks.unshift(record);
    data.taskContext={lastId:record.id,pending:null};
  },()=>{taskFilter='all';taskProject='';nav('Задачи');});};
}
function renderOverview(p){
  const s=window.NVWorkspace.inspect(data);
  const metric=(n,label,filter)=>'<button class="panel overview-metric" data-filter="'+filter+'"><strong>'+n+'</strong><span>'+label+'</span></button>';
  p.innerHTML=layout('Рабочий обзор','Состояние задач на '+s.date+' · Москва · '+(serverMode()?'снимок серверных данных':'данные этого браузера'),
    businessPanel()+'<div class="overview-metrics">'+metric(s.active.length,'Активные','active')+metric(s.overdue.length,'Просрочены','overdue')+metric(s.dueToday.length,'Срок сегодня','today')+metric(s.unscheduled.length,'Без срока','unscheduled')+'</div>'+
    '<div class="overview-grid"><section class="panel full"><div class="panel-title"><b>С чего начать</b><button id="dailyPlan">Объяснить порядок</button></div><p class="muted">Сначала просрочки, затем срок сегодня, работа в процессе и ближайшие сроки. Длительность задач пока не учитывается.</p>'+taskRows(s.ordered.slice(0,5))+'</section><section class="panel full"><div class="panel-title"><b>Нужно уточнить</b></div><p>'+s.unscheduled.length+' активных задач без корректного срока.</p><p>'+s.unlinked.length+' активных задач не связаны с существующим проектом.</p><p class="muted">Без этих данных обзор не показывает полную картину работы.</p><button class="secondary" id="openProjects">Открыть проекты</button><button class="secondary" id="newOverviewTask" '+(serverWriteReady()?'disabled':'')+'>Новая задача</button></section></div>');
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{taskFilter=b.dataset.filter;taskProject='';nav('Задачи');});
  $('#dailyPlan').onclick=()=>{nav('AI');$('#chatInput').value='План на сегодня';$('#chatInput').focus();};
  $('#openProjects').onclick=()=>{selectedProjectId=null;nav('Проекты');};
  $('#newOverviewTask').onclick=()=>editTask();bindTaskEditors();bindBusiness();
}
function editProject(){
  if(serverWriteReady())return;
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
function replaceData(state){for(const key of Object.keys(data))delete data[key];Object.assign(data,structuredClone(state));data.orders ||= [];data.ledger ||= [];}
function renderSearch(p){
 p.innerHTML=layout('Поиск по пространству','Задачи, проекты, память, клиенты и документы.',
 '<section class="panel full"><label class="search-field">'+icon('search')+'<input id="workspaceSearch" type="search" aria-label="Поиск по записям" placeholder="Название, контакт или фраза из документа…" maxlength="300"></label><p id="searchCount" class="muted" role="status">Введите слова для поиска.</p><div id="searchResults"></div></section>');
 const input=$('#workspaceSearch');input.focus();input.oninput=()=>{
 const hits=window.NVSearch.search(data,input.value);
 $('#searchCount').textContent=input.value.trim()?(hits.length?'Найдено: '+hits.length+(hits.length===100?' (первые 100)':''):'Совпадений нет.'):'Введите слова для поиска.';
 $('#searchResults').innerHTML=hits.map((x,i)=>'<button class="search-result" data-hit="'+i+'">'+icon(x.icon)+'<span><small>'+esc(x.page)+'</small><b>'+esc(x.title)+'</b><span>'+esc(x.detail)+'</span></span>'+icon('arrow')+'</button>').join('');
 document.querySelectorAll('[data-hit]').forEach(b=>b.onclick=()=>{const hit=hits[Number(b.dataset.hit)];if(hit.page==='Проекты')selectedProjectId=hit.id;if(hit.page==='Клиенты')selectedClientId=hit.id;if(hit.page==='Заказы')selectedOrderId=hit.id;if(hit.page==='Документы')selectedDocId=hit.id;if(hit.page==='Задачи'&&canWrite('tasks')){editTask(hit.id);return;}nav(hit.page);});
 };
}
function downloadFile(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadJSON(content,name){downloadFile(content,name,'application/json');}
function renderData(p){
 const local=data;
 p.innerHTML=layout('Данные и восстановление','Контроль локальных записей: копия, история и отмена последнего действия.',
 '<div class="overview-grid"><section class="panel full"><div class="section-symbol">'+icon('data')+'</div><h2>Ваши данные — под контролем</h2><p class="muted">Копия содержит текущий снимок записей и переписки. Ключи доступа в неё не входят. Сохраните файл в надёжном месте.</p><button id="exportBackup" class="secondary">Скачать копию</button><button id="undoChange" class="secondary" '+(serverMode()||!storage.canUndo()?'disabled':'')+'>Отменить последнее изменение</button><p class="muted">Отмена доступна для одного последнего сохранения, включая переписку. Это локальная история, не защищённый журнал аудита.</p></section>'+
 '<section class="panel full"><h2>Восстановить из копии</h2><p class="muted">После проверки и подтверждения файл заменит локальные записи. Замену можно отменить одним действием.</p><label class="file-label">Выбрать JSON-файл<input id="backupFile" type="file" accept=".json,application/json" '+(serverMode()||storage.problem()?'disabled':'')+'></label><p id="backupPreview" role="status"></p><button id="applyBackup" class="secondary" disabled>Заменить локальные записи</button><p id="formError" role="alert"></p></section></div>'+
 (serverMode()&&remote().view.identity?.role==='owner'?'<section class="panel full"><h2>Серверный журнал</h2><button class="secondary" id="loadAudit">Показать изменения</button><div id="auditEvents"></div></section>':'')+'<section class="panel full history-panel"><div class="panel-title"><b>Последние сохранения</b><span class="muted">До 30 событий</span></div>'+storage.history().map(x=>'<div class="record"><b>'+esc(x.label)+'</b><time>'+esc(new Date(x.at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}))+' МСК</time></div>').join('')+(storage.history().length?'':'<p class="muted">Новые сохранения появятся здесь.</p>')+'</section>');
 if(serverMode()&&remote().view.identity?.role==='owner')$('#loadAudit').onclick=async()=>{try{const result=await remote().audit();$('#auditEvents').innerHTML=result.events.map(e=>'<article class="record"><div><b>'+esc(e.detail.actor||'Владелец')+' · '+esc(e.event)+'</b><p>'+esc(new Date(e.created*1000).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}))+' МСК</p><details><summary>Изменения</summary><pre class="preserve">'+esc(JSON.stringify(e.detail,null,2))+'</pre></details></div></article>').join('')||'<p>Изменений пока нет.</p>';}catch(error){showError(error.message);}};
 $('#exportBackup').onclick=()=>downloadJSON(storage.problem()?storage.raw()||'':storage.export(local),'nasha-volna-'+new Date().toISOString().slice(0,10)+'.json');
 $('#undoChange').onclick=()=>{if(serverMode()||!storage.canUndo())return;try{const restored=storage.undo();storage.commit(restored,'Отменено последнее изменение',data,true);replaceData(restored);savedSnapshot=structuredClone(data);render('Данные');}catch(e){showError(e.message);}};
 let candidate=null,readSequence=0;
 $('#backupFile').onchange=async e=>{const sequence=++readSequence;candidate=null;$('#applyBackup').disabled=true;$('#formError').textContent='';const file=e.target.files[0];if(!file)return;try{if(file.size>5000000)throw Error('Размер файла превышает 5 МБ.');const parsed=window.NVStorage.parseBackup(await file.text());if(sequence!==readSequence)return;candidate=parsed;$('#backupPreview').textContent='Проверено: '+candidate.tasks.length+' задач, '+candidate.projects.length+' проектов, '+candidate.docs.length+' документов, '+candidate.clients.length+' клиентов, '+candidate.orders.length+' заказов, '+candidate.ledger.length+' финансовых операций, '+candidate.memories.length+' фактов, '+candidate.messages.length+' сообщений.';$('#applyBackup').disabled=false;}catch(error){if(sequence!==readSequence)return;$('#backupPreview').textContent='';$('#formError').textContent=error.message;}};
 $('#applyBackup').onclick=()=>{if(candidate)localChange(()=>replaceData(candidate),()=>render('Данные'),'Восстановлена резервная копия');};
 if(storage.problem())showError(storage.problem()+' Изменения заблокированы; исходный файл доступен по кнопке скачивания.');
}
const pageIcons={'Обзор':'overview','AI':'ai','Память':'memory','Задачи':'tasks','Проекты':'projects','Клиенты':'clients','Заказы':'orders','Финансы':'finance','Документы':'docs','Данные':'data','Команда':'clients','Каталог':'catalog','Склад':'warehouse','Закупки':'purchase','Подключение':'connection'};
document.querySelectorAll('nav a').forEach(a=>{a.innerHTML=icon(pageIcons[a.dataset.page])+'<span>'+esc(a.dataset.label||a.dataset.page)+'</span>';a.setAttribute('href','#'+encodeURIComponent(a.dataset.page));a.setAttribute('title',a.dataset.label||a.dataset.page);a.setAttribute('aria-label',a.dataset.label||a.dataset.page);a.onclick=e=>{e.preventDefault();nav(a.dataset.page);};});
document.querySelectorAll('[data-nav-icon]').forEach(el=>el.innerHTML=icon(el.dataset.navIcon));
document.querySelectorAll('.nav-group').forEach(group=>{
  group.addEventListener('toggle',()=>{if(group.open){const parent=group.parentElement;parent.querySelectorAll('.nav-group').forEach(other=>{if(other!==group)other.open=false;});}});
});
const menuToggle=$('#openMenu'),mobileMenu=$('#mobileMenu');
if(menuToggle&&mobileMenu?.showModal){
  menuToggle.innerHTML=icon('menu');$('#closeMenu').innerHTML=icon('close');
  menuToggle.onclick=()=>{mobileMenu.showModal();menuToggle.setAttribute('aria-expanded','true');};
  $('#closeMenu').onclick=()=>mobileMenu.close();
  mobileMenu.addEventListener('close',()=>menuToggle.setAttribute('aria-expanded','false'));
  mobileMenu.addEventListener('click',event=>{if(event.target===mobileMenu){const r=mobileMenu.getBoundingClientRect();if(event.clientX>r.right||event.clientX<r.left)mobileMenu.close();}});
  window.matchMedia?.('(min-width: 981px)').addEventListener('change',event=>{if(event.matches&&mobileMenu.open)mobileMenu.close();});
}
$('#brandMark').innerHTML=icon('wave');
$('#globalSearch').innerHTML=icon('search')+'<span>Поиск по пространству</span><kbd>Ctrl K</kbd>';
$('#globalSearch').onclick=()=>nav('Поиск');
document.addEventListener?.('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();nav('Поиск');}});
const theme=$('#theme');
try{if(localStorage.getItem('nv_theme')==='light')document.body.classList.add('light');}catch(e){/* Storage diagnostics are shown below. */}
theme.innerHTML=icon('sun');
theme.onclick=()=>{document.body.classList.toggle('light');try{localStorage.setItem('nv_theme',document.body.classList.contains('light')?'light':'dark');}catch(e){showError('Не удалось сохранить тему.');}};
syncNavigation('AI');
render('AI');
if(storage.problem())showError(storage.problem());
})();

