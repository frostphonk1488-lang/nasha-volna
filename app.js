(() => {
'use strict';

const $ = s => document.querySelector(s);
const safeGet = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    localStorage.removeItem(key);
    return fallback;
  }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const uid = p => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,6);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const data = {
  messages: safeGet('nv_messages', []),
  memories: safeGet('nv_memories', [
    {id:'m1', type:'Проект', text:'Nasha Volna — основной продукт и AI-платформа.'},
    {id:'m2', type:'Принцип', text:'AI должен сохранять важные факты и использовать их позже.'}
  ]),
  tasks: safeGet('nv_tasks', [
    {id:'t1', title:'Собрать MVP AI-чата', project:'Nasha Volna', status:'В работе', priority:'Высокий'},
    {id:'t2', title:'Продумать структуру памяти', project:'Nasha Volna', status:'Новая', priority:'Высокий'}
  ]),
  projects: safeGet('nv_projects', [
    {id:'p1', name:'Nasha Volna', desc:'AI-платформа с долгосрочной памятью', progress:25}
  ]),
  clients: safeGet('nv_clients', []),
  docs: safeGet('nv_docs', [])
};

function persist() {
  save('nv_messages', data.messages);
  save('nv_memories', data.memories);
  save('nv_tasks', data.tasks);
  save('nv_projects', data.projects);
  save('nv_clients', data.clients);
  save('nv_docs', data.docs);
}

function showApp() {
  const auth = $('#auth');
  const app = $('#app');
  if (auth) auth.hidden = true;
  if (app) app.hidden = false;
  $('#userName').textContent = 'Александр';
  $('#userEmail').textContent = 'demo@nashavolna.ru';
  $('#avatar').textContent = 'А';
  render('Главная');
}

function shell(title, subtitle, body) {
  return '<div class="welcome"><label>NASHA VOLNA</label><h1>'+title+'</h1><p>'+subtitle+'</p></div>'+body;
}
function panel(title, body, cls='') {
  return '<article class="panel '+cls+'"><div class="title"><h2>'+title+'</h2></div>'+body+'</article>';
}

function render(page) {
  const p = $('#page');
  if (!p) return;
  if (page === 'Главная') return home(p);
  if (page === 'Чат с AI') return chat(p);
  if (page === 'Задачи') return tasks(p);
  if (page === 'Проекты') return projects(p);
  if (page === 'Клиенты') return clients(p);
  if (page === 'Документы') return documents(p);
  if (page === 'Память') return memory(p);
  p.innerHTML = shell(page, 'Модуль Nasha Volna', panel('В разработке','<p>Этот модуль будет подключён к серверной системе.</p>'));
}

function home(p) {
  const active = data.tasks.filter(t => t.status !== 'Выполнена').length;
  p.innerHTML = shell(
    'Добро пожаловать, Александр!',
    'Ваша AI-система готова к работе.',
    '<div class="stats">'+
      '<article><small>Активные задачи</small><b>'+active+'</b><em>В системе</em></article>'+
      '<article><small>Проекты</small><b>'+data.projects.length+'</b><em>Под управлением</em></article>'+
      '<article><small>Память AI</small><b>'+data.memories.length+'</b><em>Фактов сохранено</em></article>'+
      '<article><small>Клиенты</small><b>'+data.clients.length+'</b><em>В системе</em></article>'+
    '</div>'+
    '<div class="grid">'+
      panel('✦ AI Ассистент','<p>Быстрые команды для работы.</p><div class="buttons">'+
        '<button onclick="openChat(\'Какие у меня задачи?\')">✓ Мои задачи</button>'+
        '<button onclick="openChat(\'Что ты помнишь?\')">◈ Что ты помнишь?</button>'+
        '<button onclick="openChat(\'Создай план работы на сегодня\')">＋ План на сегодня</button>'+
        '<button onclick="openChat(\'Сделай отчёт по системе\')">▣ Отчёт</button>'+
      '</div>','ai')+
      panel('Быстрые действия',
        '<button onclick="addTask()">＋ Новая задача <span>›</span></button>'+
        '<button onclick="addProject()">▣ Новый проект <span>›</span></button>'+
        '<button onclick="addMemory()">✦ Запомнить факт <span>›</span></button>'+
        '<button onclick="render(\'Документы\')">▤ Документы <span>›</span></button>','quick')+
    '</div>'+
    '<div class="grid lower">'+
      panel('Последние задачи', data.tasks.slice(0,4).map(t =>
        '<div class="project"><i>✓</i><div><b>'+esc(t.title)+'</b><small>'+esc(t.project)+' · '+esc(t.status)+'</small></div><strong>'+esc(t.priority)+'</strong></div>'
      ).join('') || '<p>Задач пока нет.</p>')+
      panel('Память AI', data.memories.slice(-3).reverse().map(m =>
        '<div class="notice">● <b>'+esc(m.type)+'</b><small>'+esc(m.text)+'</small></div>'
      ).join('') || '<p>Память пуста.</p>')+
    '</div>'
  );
}

function chat(p) {
  const messages = data.messages.map(m =>
    '<div class="msg-row '+m.role+'"><div class="chat-msg">'+esc(m.text)+'</div></div>'
  ).join('');
  p.innerHTML = shell('Чат с AI','Диалог и долгосрочная память.',
    '<div class="chat-layout">'+
      '<div class="panel chat-panel"><div id="messages" class="messages">'+
        (messages || '<div class="chat-empty">✦<h2>Ваш AI-ассистент</h2><p>Напишите сообщение или команду.</p></div>')+
      '</div><div class="chat-input"><textarea id="chatInput" placeholder="Например: Запомни, что дедлайн — 15 октября"></textarea><button onclick="sendChat()">Отправить</button></div></div>'+
      panel('Память AI','<button onclick="render(\'Память\')">✦ Открыть память <span>›</span></button><button onclick="addMemory()">＋ Запомнить факт <span>›</span></button>','quick')+
    '</div>'
  );
  const input = $('#chatInput');
  if (input) input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
}

function reply(text) {
  const q = text.toLowerCase();
  if (/^(запомни|запиши|сохрани)/i.test(text)) {
    const fact = text.replace(/^(запомни|запиши|сохрани)[:\s-]*/i,'').trim();
    if (fact) {
      data.memories.push({id:uid('m'),type:'Факт',text:fact});
      persist();
      return 'Запомнил. Факт добавлен в долгосрочную память.';
    }
  }
  if (q.includes('задач')) return 'Активных задач: '+data.tasks.filter(t=>t.status!=='Выполнена').length+'.';
  if (q.includes('помни') || q.includes('памят')) return data.memories.length ? 'Я помню:\n• '+data.memories.slice(-5).map(m=>m.text).join('\n• ') : 'Память пока пуста.';
  if (q.includes('проект')) return 'Проекты: '+data.projects.map(p=>p.name).join(', ')+'.';
  if (q.includes('клиент')) return 'Клиентов в системе: '+data.clients.length+'.';
  if (q.includes('отчёт') || q.includes('отчет')) return 'Отчёт: '+data.projects.length+' проектов, '+data.tasks.filter(t=>t.status!=='Выполнена').length+' активных задач, '+data.memories.length+' фактов в памяти.';
  return 'Запрос получен. Сейчас я работаю как локальный MVP. Следующим этапом подключим настоящий серверный AI.';
}

window.openChat = text => {
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.page === 'Чат с AI'));
  render('Чат с AI');
  setTimeout(() => { const i=$('#chatInput'); if(i){i.value=text;i.focus();} }, 20);
};
window.sendChat = () => {
  const i=$('#chatInput'), text=i ? i.value.trim() : '';
  if (!text) return;
  data.messages.push({id:uid('msg'),role:'user',text});
  data.messages.push({id:uid('msg'),role:'assistant',text:reply(text)});
  persist();
  render('Чат с AI');
};

function tasks(p) {
  p.innerHTML=shell('Задачи','Управление задачами.',panel('Все задачи',
    '<button class="primary" onclick="addTask()">＋ Создать задачу</button><div class="list">'+
    (data.tasks.map(t => '<div class="list-item"><div><b>'+esc(t.title)+'</b><small>'+esc(t.project)+' · '+esc(t.priority)+'</small></div><select onchange="changeTask(\''+t.id+'\',this.value)"><option '+(t.status==='Новая'?'selected':'')+'>Новая</option><option '+(t.status==='В работе'?'selected':'')+'>В работе</option><option '+(t.status==='Выполнена'?'selected':'')+'>Выполнена</option></select></div>').join('') || '<p>Задач пока нет.</p>')+
    '</div>'));
}
window.addTask=()=>{const title=prompt('Название задачи');if(!title)return;data.tasks.unshift({id:uid('t'),title,project:'Nasha Volna',status:'Новая',priority:'Средний'});persist();render('Задачи');};
window.changeTask=(id,status)=>{const t=data.tasks.find(x=>x.id===id);if(t){t.status=status;persist();render('Задачи');}};

function projects(p) {
  p.innerHTML=shell('Проекты','Центр контекста AI.',panel('Проекты','<button class="primary" onclick="addProject()">＋ Создать проект</button><div class="list">'+
    data.projects.map(x=>'<div class="list-item"><div><b>'+esc(x.name)+'</b><small>'+esc(x.desc)+'</small><div class="bar"><i style="width:'+x.progress+'%"></i></div></div><strong>'+x.progress+'%</strong></div>').join('')+
  '</div>'));
}
window.addProject=()=>{const name=prompt('Название проекта');if(!name)return;const desc=prompt('Описание')||'';data.projects.push({id:uid('p'),name,desc,progress:0});persist();render('Проекты');};

function clients(p) {
  p.innerHTML=shell('Клиенты','Единая база клиентов.',panel('Клиенты','<button class="primary" onclick="addClient()">＋ Добавить клиента</button><div class="list">'+
    (data.clients.map(x=>'<div class="list-item"><div><b>'+esc(x.name)+'</b><small>'+esc(x.contact||'Контакт не указан')+'</small></div><strong>Клиент</strong></div>').join('')||'<p>Клиентов пока нет.</p>')+
  '</div>'));
}
window.addClient=()=>{const name=prompt('Название клиента');if(!name)return;const contact=prompt('Контакт / email')||'';data.clients.push({id:uid('c'),name,contact});persist();render('Клиенты');};

function memory(p) {
  p.innerHTML=shell('Память AI','Долгосрочные факты.',panel('Память',
    '<button class="primary" onclick="addMemory()">＋ Добавить факт</button><div class="list">'+
    (data.memories.map(m=>'<div class="list-item"><div><b>'+esc(m.type)+'</b><small>'+esc(m.text)+'</small></div><button onclick="deleteMemory(\''+m.id+'\')">Удалить</button></div>').join('')||'<p>Память пуста.</p>')+
  '</div>'));
}
window.addMemory=()=>{const text=prompt('Что запомнить?');if(!text)return;data.memories.push({id:uid('m'),type:'Факт',text});persist();render('Память');};
window.deleteMemory=id=>{data.memories=data.memories.filter(x=>x.id!==id);persist();render('Память');};

function documents(p) {
  p.innerHTML=shell('Документы','Реестр документов.',panel('Документы',
    '<button class="primary" onclick="addDocument()">＋ Добавить документ</button><div class="list">'+
    (data.docs.map(d=>'<div class="list-item"><div><b>'+esc(d.name)+'</b><small>'+esc(d.desc)+'</small></div><strong>Локально</strong></div>').join('')||'<p>Документов пока нет.</p>')+
  '</div>'));
}
window.addDocument=()=>{const name=prompt('Название документа');if(!name)return;data.docs.push({id:uid('d'),name,desc:'Добавлен в реестр'});persist();render('Документы');};

document.querySelectorAll('nav a').forEach(a => a.addEventListener('click', () => {
  document.querySelectorAll('nav a').forEach(x=>x.classList.remove('active'));
  a.classList.add('active');
  render(a.dataset.page);
}));

const savedTheme=localStorage.getItem('nv_theme');
if(savedTheme==='light') document.body.classList.add('light');
const theme=$('#theme');
if(theme) theme.onclick=()=>{document.body.classList.toggle('light');localStorage.setItem('nv_theme',document.body.classList.contains('light')?'light':'dark');theme.textContent=document.body.classList.contains('light')?'☾':'☀';};

showApp();

})();