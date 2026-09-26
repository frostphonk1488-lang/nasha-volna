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
const save = () => localStorage.setItem(KEY, JSON.stringify(data));
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
  if(page==='AI') return renderAI(p);
  if(page==='Память') return renderMemory(p);
  if(page==='Задачи') return renderTasks(p);
  if(page==='Проекты') return renderProjects(p);
  if(page==='Клиенты') return renderClients(p);
  if(page==='Документы') return renderDocs(p);
}

function renderAI(p){
  const recent = data.messages.slice(-100).map(m =>
    '<div class="message '+m.role+'"><div class="bubble">'+esc(m.text).replace(/\n/g,'<br>')+'</div></div>'
  ).join('');

  p.innerHTML = layout(
    'Ваш AI-ассистент',
    'Один интерфейс для разговора, памяти и действий.',
    '<div class="ai-grid">'+
      '<section class="ai-main panel">'+
        '<div class="ai-intro"><div class="ai-orb">✦</div><div><h2>Что нужно сделать?</h2><p>Локальное ядро: задачи, сроки и контекст диалога. Данные хранятся в этом браузере.</p></div></div>'+
        '<div id="messages" class="messages">'+
          (recent || '<div class="empty-chat"><span>✦</span><h2>Начните с команды</h2><p>Например: «Запомни, что наш первый продукт — AI с долговременной памятью».</p></div>')+
        '</div>'+
        '<div class="composer"><textarea aria-label="Сообщение AI" id="chatInput" placeholder="Напишите команду или вопрос…"></textarea><button id="sendBtn">Отправить <span>↗</span></button></div>'+
      '</section>'+
      '<aside class="context">'+
        '<section class="panel context-card"><div class="panel-title"><b>Память</b><button data-go="Память">Открыть</button></div>'+
          (data.memories.slice(-4).reverse().map(m => '<div class="memory-line"><i>●</i><div><b>'+esc(m.type)+'</b><p>'+esc(m.text)+'</p></div></div>').join('') || '<p class="muted">Память пуста.</p>')+
        '</section>'+
        '<section class="panel context-card"><div class="panel-title"><b>Сейчас</b></div>'+
          '<div class="metric"><span>Активные задачи</span><strong>'+activeTasks()+'</strong></div>'+
          '<div class="metric"><span>Проекты</span><strong>'+data.projects.length+'</strong></div>'+
          '<div class="metric"><span>Факты в памяти</span><strong>'+data.memories.length+'</strong></div>'+
        '</section>'+
        '<section class="panel context-card quick-commands"><div class="panel-title"><b>Примеры</b></div>'+
          '<button data-prompt="Какие у меня задачи?">Какие у меня задачи?</button>'+
          '<button data-prompt="Что ты помнишь?">Что ты помнишь?</button>'+
          '<button data-prompt="Создай задачу: проверить MVP">Создай задачу</button>'+
        '</section>'+
      '</aside>'+
    '</div>'
  );

  const messages = $('#messages');
  messages.scrollTop = messages.scrollHeight;
  const input = $('#chatInput');
  const send = () => {
    const text = input.value.trim();
    if(!text) return;
    const snapshot = structuredClone(data);
    try {
      data.messages.push({id:uid('m'), role:'user', text});
      data.messages.push({id:uid('m'), role:'assistant', text:process(text)});
      save();
    } catch (error) {
      for (const key of Object.keys(data)) delete data[key];
      Object.assign(data, snapshot);
      const notice = document.createElement('p');
      notice.setAttribute('role', 'alert');
      notice.textContent = 'Не удалось сохранить изменения. Действие отменено. Проверьте доступность хранилища браузера и попробуйте снова.';
      input.parentElement.appendChild(notice);
      return;
    }
    render('AI');
    setTimeout(() => { const i=$('#chatInput'); if(i){i.focus(); i.setSelectionRange(i.value.length,i.value.length);} }, 0);
  };
  $('#sendBtn').onclick = send;
  input.onkeydown = e => { if(e.key==='Enter' && !e.shiftKey){e.preventDefault();send();} };
  document.querySelectorAll('[data-prompt]').forEach(b => b.onclick = () => { input.value=b.dataset.prompt; input.focus(); });
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => nav(b.dataset.go));
}

function process(text){
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
  p.innerHTML = layout('Память','Сохранённые факты доступны в этом браузере. Между устройствами они пока не синхронизируются.',
    '<section class="panel full"><div class="panel-title"><div><b>Сохранённые факты</b><span class="muted"> '+data.memories.length+' записей</span></div><button class="primary" id="addMemory">＋ Добавить</button></div>'+
    '<div class="records">'+(data.memories.map(m =>
      '<div class="record"><div><span class="tag">'+esc(m.type)+'</span><p>'+esc(m.text)+'</p></div><button data-del="'+m.id+'">Удалить</button></div>'
    ).join('') || '<div class="empty">Память пока пуста.</div>')+'</div></section>'
  );
  $('#addMemory').onclick=()=>{const x=prompt('Что AI должен запомнить?');if(x){data.memories.push({id:uid('mem'),type:'Факт',text:x});save();render('Память');}};
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{data.memories=data.memories.filter(x=>x.id!==b.dataset.del);save();render('Память');});
}

function renderTasks(p){
  p.innerHTML=layout('Задачи','AI и человек работают с одним списком задач.',
    '<section class="panel full"><div class="panel-title"><b>Все задачи</b><button class="primary" id="addTask">＋ Новая задача</button></div><div class="records">'+
    (data.tasks.map(x=>'<div class="record"><div><b>'+esc(x.title)+'</b><p>'+esc(x.status)+(x.dueDate?' · Срок: '+esc(x.dueDate):'')+'</p></div><select data-status="'+x.id+'"><option '+(x.status==='Новая'?'selected':'')+'>Новая</option><option '+(x.status==='В работе'?'selected':'')+'>В работе</option><option '+(x.status==='Выполнена'?'selected':'')+'>Выполнена</option></select></div>').join('')||'<div class="empty">Задач нет.</div>')+
    '</div></section>');
  $('#addTask').onclick=()=>{const x=prompt('Название задачи');if(x){data.tasks.unshift({id:uid('task'),title:x,status:'Новая'});save();render('Задачи');}};
  document.querySelectorAll('[data-status]').forEach(s=>s.onchange=()=>{const x=data.tasks.find(x=>x.id===s.dataset.status);if(x){x.status=s.value;save();}});
}

function renderProjects(p){
  p.innerHTML=layout('Проекты','Контекст, вокруг которого AI сможет строить работу.',
    '<section class="panel full"><div class="panel-title"><b>Проекты</b><button class="primary" id="addProject">＋ Новый проект</button></div><div class="records">'+
    data.projects.map(x=>'<div class="record"><div><b>'+esc(x.name)+'</b><p>'+esc(x.desc)+'</p></div></div>').join('')+'</div></section>');
  $('#addProject').onclick=()=>{const x=prompt('Название проекта');if(x){data.projects.push({id:uid('p'),name:x,desc:'Новый проект'});save();render('Проекты');}};
}

function renderClients(p){
  p.innerHTML=layout('Клиенты','Будущая база контекста для AI.',
    '<section class="panel full"><div class="panel-title"><b>Клиенты</b><button class="primary" id="addClient">＋ Добавить</button></div><div class="records">'+
    (data.clients.map(x=>'<div class="record"><div><b>'+esc(x.name)+'</b><p>'+esc(x.contact||'Контакт не указан')+'</p></div></div>').join('')||'<div class="empty">Пока нет клиентов.</div>')+'</div></section>');
  $('#addClient').onclick=()=>{const x=prompt('Имя или название клиента');if(x){const c=prompt('Контакт')||'';data.clients.push({id:uid('c'),name:x,contact:c});save();render('Клиенты');}};
}

function renderDocs(p){
  p.innerHTML=layout('Документы','Следующий этап — поиск по документам через AI.',
    '<section class="panel full"><div class="panel-title"><b>Документы</b><button class="primary" id="addDoc">＋ Добавить запись</button></div><div class="records">'+
    (data.docs.map(x=>'<div class="record"><div><b>'+esc(x.name)+'</b><p>'+esc(x.desc)+'</p></div></div>').join('')||'<div class="empty">Документов пока нет.</div>')+'</div></section>');
  $('#addDoc').onclick=()=>{const x=prompt('Название документа');if(x){data.docs.push({id:uid('d'),name:x,desc:'Запись документа'});save();render('Документы');}};
}

document.querySelectorAll('nav a').forEach(a=>a.onclick=()=>nav(a.dataset.page));
const theme=$('#theme');
if(localStorage.getItem('nv_theme')==='light') document.body.classList.add('light');
theme.onclick=()=>{document.body.classList.toggle('light');localStorage.setItem('nv_theme',document.body.classList.contains('light')?'light':'dark');theme.textContent=document.body.classList.contains('light')?'☾':'☀';};
render('AI');
})();