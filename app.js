const $=s=>document.querySelector(s);
const store={
  get:(k,f)=>JSON.parse(localStorage.getItem(k)||JSON.stringify(f)),
  set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))
};
const usersKey='nv_users', sessionKey='nv_session';
let users=store.get(usersKey,[]);
const testUser={id:'test-account',name:'Тестовый пользователь',email:'test@nashavolna.ru',password:'Test1234!'};
if(!users.some(u=>u.email===testUser.email)){users.push(testUser);store.set(usersKey,users);}

const data={
  messages:store.get('nv_messages',[]),
  memories:store.get('nv_memories',[
    {id:'m1',text:'Nasha Volna — основной продукт и AI-платформа.',type:'Проект'},
    {id:'m2',text:'AI должен уметь сохранять важные факты и использовать их позже.',type:'Принцип'}
  ]),
  tasks:store.get('nv_tasks',[
    {id:'t1',title:'Собрать MVP AI-чата',project:'Nasha Volna',status:'В работе',priority:'Высокий'},
    {id:'t2',title:'Продумать структуру памяти',project:'Nasha Volna',status:'Новая',priority:'Высокий'}
  ]),
  projects:store.get('nv_projects',[{id:'p1',name:'Nasha Volna',desc:'AI-платформа с долгосрочной памятью',progress:25}]),
  clients:store.get('nv_clients',[]),
  docs:store.get('nv_docs',[])
};
function persist(){
  store.set('nv_messages',data.messages);store.set('nv_memories',data.memories);
  store.set('nv_tasks',data.tasks);store.set('nv_projects',data.projects);
  store.set('nv_clients',data.clients);store.set('nv_docs',data.docs);
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function uid(p='id'){return p+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)}
function showAuth(){document.querySelector('#auth').hidden=false;document.querySelector('#app').hidden=true}
function showApp(u){$('#auth').hidden=true;$('#app').hidden=false;$('#userName').textContent=u.name;$('#userEmail').textContent=u.email;$('#avatar').textContent=(u.name||'A')[0].toUpperCase();render('Главная')}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');const reg=t.dataset.mode==='register';$('#loginForm').hidden=reg;$('#registerForm').hidden=!reg});
$('#registerBtn').onclick=()=>{const name=$('#regName').value.trim(),email=$('#regEmail').value.trim().toLowerCase(),password=$('#regPassword').value;if(!name||!email||password.length<6)return $('#regMsg').textContent='Заполните поля. Пароль — минимум 6 символов.';if(users.some(u=>u.email===email))return $('#regMsg').textContent='Пользователь уже существует.';const u={id:crypto.randomUUID(),name,email,password};users.push(u);store.set(usersKey,users);store.set(sessionKey,u.id);showApp(u)};
$('#loginBtn').onclick=()=>{const email=$('#loginEmail').value.trim().toLowerCase(),password=$('#loginPassword').value,u=users.find(x=>x.email===email&&x.password===password);if(!u)return $('#loginMsg').textContent='Неверный email или пароль.';store.set(sessionKey,u.id);showApp(u)};
$('#logout').onclick=()=>{localStorage.removeItem(sessionKey);showAuth()};
document.querySelectorAll('nav a').forEach(a=>a.onclick=()=>{document.querySelectorAll('nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active');render(a.dataset.page)});

function shell(title,sub,body){return '<div class="welcome"><label>NASHA VOLNA</label><h1>'+title+'</h1><p>'+sub+'</p></div>'+body}
function panel(title,body,cls=''){return '<article class="panel '+cls+'"><div class="title"><h2>'+title+'</h2></div>'+body+'</article>'}
function render(page){
  const p=$('#page');
  if(page==='Главная')return renderHome(p);
  if(page==='Чат с AI')return renderChat(p);
  if(page==='Задачи')return renderTasks(p);
  if(page==='Проекты')return renderProjects(p);
  if(page==='Клиенты')return renderClients(p);
  if(page==='Документы')return renderDocs(p);
  if(page==='Память')return renderMemory(p);
  p.innerHTML=shell(page,'Раздел уже подключён к архитектуре MVP.',panel('В разработке','<p>Следующий этап — полноценный рабочий модуль.</p>'));
}
function renderHome(p){
  const open=data.tasks.filter(x=>x.status!=='Выполнена').length;
  p.innerHTML=shell('Добро пожаловать, '+esc($('#userName').textContent)+'!','AI-система готова к работе.',
  '<div class="stats"><article><small>Активные задачи</small><b>'+open+'</b><em>В памяти системы</em></article><article><small>Проекты</small><b>'+data.projects.length+'</b><em>Под управлением</em></article><article><small>Память AI</small><b>'+data.memories.length+'</b><em>Сохранённых фактов</em></article><article><small>Клиенты</small><b>'+data.clients.length+'</b><em>В системе</em></article></div>'+
  '<div class="grid"><article class="panel ai"><h2>✦ AI Ассистент</h2><p>Начните работу с командой.</p><div class="buttons"><button onclick="openChat('Создай план работы на сегодня')">＋ План на сегодня</button><button onclick="openChat('Какие у меня задачи?')">✓ Мои задачи</button><button onclick="openChat('Что ты помнишь о проекте?')">◈ Что ты помнишь?</button><button onclick="openChat('Сделай краткий отчёт по системе')">▣ Отчёт</button></div></article>'+
  panel('Быстрые действия','<button onclick="addTaskPrompt()">＋ Новая задача <span>›</span></button><button onclick="addProjectPrompt()">▣ Новый проект <span>›</span></button><button onclick="addMemoryPrompt()">✦ Запомнить факт <span>›</span></button><button onclick="render('Документы')">▤ Добавить документ <span>›</span></button>','quick')+
  '</div><div class="grid lower">'+panel('Последние задачи',data.tasks.slice(0,4).map(t=>'<div class="project"><i>✓</i><div><b>'+esc(t.title)+'</b><small>'+esc(t.project)+' · '+esc(t.status)+'</small></div><strong>'+esc(t.priority)+'</strong></div>').join('')||'<p>Задач пока нет.</p>')+
  panel('Память AI',data.memories.slice(-3).reverse().map(m=>'<div class="notice">● <b>'+esc(m.type)+'</b><small>'+esc(m.text)+'</small></div>').join('')||'<p>Память пуста.</p>')+'</div>';
}
function renderChat(p){
  const msgs=data.messages.map(m=>'<div class="msg-row '+m.role+'"><div class="chat-msg">'+esc(m.text)+'</div></div>').join('');
  p.innerHTML=shell('Чат с AI','Диалог, память и команды в одном месте.',
  '<div class="chat-layout">'+
  '<div class="panel chat-panel"><div id="messages" class="messages">'+(msgs||'<div class="chat-empty">✦<h2>Ваш AI-ассистент</h2><p>Напишите команду или вопрос. Важные факты можно сохранить в долгосрочную память.</p></div>')+'</div>'+
  '<div class="chat-input"><textarea id="chatInput" placeholder="Например: Запомни, что дедлайн Nasha Volna — 15 октября"></textarea><button onclick="sendChat()">Отправить</button></div></div>'+
  panel('Память AI','<button onclick="render(\'Память\')">✦ Открыть память <span>›</span></button><button onclick="addMemoryPrompt()">＋ Запомнить факт <span>›</span></button>','quick')+'</div>');
  const input=$('#chatInput');if(input)input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}});
  const box=$('#messages');if(box)box.scrollTop=box.scrollHeight;
}
function aiReply(text){
  const q=text.toLowerCase();
  if(q.includes('запомни')||q.includes('запиши')||q.includes('сохрани')){
    const clean=text.replace(/^(запомни|запиши|сохрани)[:\s-]*/i,'').trim();
    if(clean){data.memories.push({id:uid('m'),text:clean,type:'Факт'});persist();return 'Запомнил. Этот факт добавлен в долгосрочную память.'}
  }
  if(q.includes('задач'))return 'Сейчас в системе '+data.tasks.filter(t=>t.status!=='Выполнена').length+' активных задач. Например: '+data.tasks.slice(0,3).map(t=>t.title).join('; ')+'.';
  if(q.includes('помни')||q.includes('памят'))return data.memories.length?'Я помню:\n• '+data.memories.slice(-5).map(m=>m.text).join('\n• '):'Память пока пуста.';
  if(q.includes('проект'))return 'В системе '+data.projects.length+' проект(ов): '+data.projects.map(x=>x.name).join(', ')+'.';
  if(q.includes('клиент'))return 'В системе '+data.clients.length+' клиентов.';
  if(q.includes('отчёт')||q.includes('отчет'))return 'Краткий отчёт: '+data.projects.length+' проектов, '+data.tasks.filter(t=>t.status!=='Выполнена').length+' активных задач, '+data.memories.length+' фактов в памяти.';
  return 'Я понял запрос. В текущем MVP я уже умею работать с задачами, проектами, клиентами и долгосрочной памятью. Для сложного действия позже подключим серверный AI и инструменты.';
}
function openChat(text){document.querySelectorAll('nav a').forEach(x=>x.classList.toggle('active',x.dataset.page==='Чат с AI'));render('Чат с AI');setTimeout(()=>{const i=$('#chatInput');i.value=text;i.focus()},30)}
function sendChat(){
  const i=$('#chatInput'),text=i?.value.trim();if(!text)return;
  data.messages.push({id:uid('msg'),role:'user',text});const reply=aiReply(text);data.messages.push({id:uid('msg'),role:'assistant',text:reply});persist();render('Чат с AI');
}
function renderTasks(p){
  p.innerHTML=shell('Задачи','Создание и управление задачами.',
  panel('Все задачи','<button class="primary" onclick="addTaskPrompt()">＋ Создать задачу</button><div class="list">'+(data.tasks.map(t=>'<div class="list-item"><div><b>'+esc(t.title)+'</b><small>'+esc(t.project)+' · '+esc(t.priority)+'</small></div><select onchange="changeTask(\''+t.id+'\',this.value)"><option '+(t.status==='Новая'?'selected':'')+'>Новая</option><option '+(t.status==='В работе'?'selected':'')+'>В работе</option><option '+(t.status==='Выполнена'?'selected':'')+'>Выполнена</option></select></div>').join('')||'<p>Задач пока нет.</p>')+'</div>'));
}
function addTaskPrompt(){const title=prompt('Название задачи');if(!title)return;data.tasks.unshift({id:uid('t'),title,project:'Nasha Volna',status:'Новая',priority:'Средний'});persist();render('Задачи')}
function changeTask(id,status){const t=data.tasks.find(x=>x.id===id);if(t){t.status=status;persist();render('Задачи')}}
function renderProjects(p){
  p.innerHTML=shell('Проекты','Центр контекста для AI и команды.',panel('Проекты','<button class="primary" onclick="addProjectPrompt()">＋ Создать проект</button><div class="list">'+data.projects.map(x=>'<div class="list-item"><div><b>'+esc(x.name)+'</b><small>'+esc(x.desc)+'</small><div class="bar"><i style="width:'+x.progress+'%"></i></div></div><strong>'+x.progress+'%</strong></div>').join('')+'</div>'));
}
function addProjectPrompt(){const name=prompt('Название проекта');if(!name)return;const desc=prompt('Краткое описание')||'';data.projects.push({id:uid('p'),name,desc,progress:0});persist();render('Проекты')}
function renderClients(p){
  p.innerHTML=shell('Клиенты','Единая база клиентов.',panel('Клиенты','<button class="primary" onclick="addClientPrompt()">＋ Добавить клиента</button><div class="list">'+(data.clients.map(x=>'<div class="list-item"><div><b>'+esc(x.name)+'</b><small>'+esc(x.contact||'Контакт не указан')+'</small></div><strong>Клиент</strong></div>').join('')||'<p>Клиентов пока нет.</p>')+'</div>'));
}
function addClientPrompt(){const name=prompt('Название клиента');if(!name)return;const contact=prompt('Контакт / email')||'';data.clients.push({id:uid('c'),name,contact});persist();render('Клиенты')}
function renderMemory(p){
  p.innerHTML=shell('Память AI','Факты, которые AI может использовать в будущих диалогах.',panel('Долгосрочная память','<button class="primary" onclick="addMemoryPrompt()">＋ Добавить факт</button><div class="list">'+(data.memories.map(m=>'<div class="list-item"><div><b>'+esc(m.type)+'</b><small>'+esc(m.text)+'</small></div><button onclick="deleteMemory(\''+m.id+'\')">Удалить</button></div>').join('')||'<p>Память пуста.</p>')+'</div>'));
}
function addMemoryPrompt(){const text=prompt('Что нужно запомнить?');if(!text)return;data.memories.push({id:uid('m'),text,type:'Факт'});persist();render('Память')}
function deleteMemory(id){data.memories=data.memories.filter(x=>x.id!==id);persist();render('Память')}
function renderDocs(p){
  p.innerHTML=shell('Документы','Пока локальный реестр документов. Загрузка файлов подключим на серверном этапе.',panel('Документы','<button class="primary" onclick="addDocPrompt()">＋ Добавить документ</button><div class="list">'+(data.docs.map(x=>'<div class="list-item"><div><b>'+esc(x.name)+'</b><small>'+esc(x.desc)+'</small></div><strong>Локально</strong></div>').join('')||'<p>Документов пока нет.</p>')+'</div>'));
}
function addDocPrompt(){const name=prompt('Название документа');if(!name)return;data.docs.push({id:uid('d'),name,desc:'Добавлен в реестр'});persist();render('Документы')}

const saved=localStorage.getItem('nv_theme');if(saved==='light')document.body.classList.add('light');
const th=$('#theme');th.onclick=()=>{document.body.classList.toggle('light');localStorage.setItem('nv_theme',document.body.classList.contains('light')?'light':'dark');th.textContent=document.body.classList.contains('light')?'☾':'☀'};
showApp({name:'Александр',email:'demo@nashavolna.ru'});