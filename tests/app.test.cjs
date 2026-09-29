const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function boot(initial,remoteApi){
  const store=new Map(initial ? [['nv_mvp_v2',JSON.stringify(initial)]] : []);
  let fail=false;
  const alerts=[];
  const elements={};
  const element=()=>({innerHTML:'',value:'',dataset:{},classList:{toggle(){},add(){},contains(){return false;}},focus(){},setSelectionRange(){},setAttribute(){},querySelector:s=>document.querySelector(s),querySelectorAll:()=>[],prepend(){},parentElement:{appendChild(x){alerts.push(x.textContent);}}});
  const document={querySelector:s=>elements[s]||(elements[s]=element()),querySelectorAll:s=>s==='nav a'?navElements:[],createElement:element,body:element()};
  const navElements=['Клиенты','Заказы','Задачи','Данные','Финансы','Документы','Обзор','AI'].map(page=>Object.assign(element(),{dataset:{page}}));
  const context={document,localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>{if(fail)throw Error('quota');store.set(key,value);}},structuredClone,setTimeout:fn=>fn(),console};
  context.window=context;context.NVRemote=remoteApi;
  vm.createContext(context);
  for(const file of ['icons.js','crm-core.js','finance-core.js','storage-core.js','search-core.js','workspace-core.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
  vm.runInContext(fs.readFileSync('task-core.js','utf8'),context);
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  return {store,alerts,elements,document,go:page=>navElements.find(a=>a.dataset.page===page).onclick({preventDefault(){}}),fail:()=>{fail=true;},recover:()=>{fail=false;},send:text=>{elements['#chatInput'].value=text;elements['#sendBtn'].onclick();}};
}
test('chat integrates task core, retains existing records and reloads context',()=>{
  const app=boot({tasks:[{id:'old',title:'Старая задача',status:'Новая'}]});
  app.send('Создай задачу: Проверка интеграции');
  app.send('Переименуй её в Проверено');
  let data=JSON.parse(app.store.get('nv_mvp_v2'));
  assert.equal(data.tasks.length,2);assert.equal(data.tasks[0].title,'Проверено');
  const restored=boot(data);restored.send('Заверши её');
  data=JSON.parse(restored.store.get('nv_mvp_v2'));
  assert.equal(data.tasks[0].status,'Выполнена');
  assert.match(restored.elements['#page'].innerHTML,/отмечена|Сохранено/);
});
test('storage failure rolls back task and conversation; retry is not duplicate',()=>{
  const app=boot();app.send('Привет');
  const before=app.store.get('nv_mvp_v2');
  app.fail();app.send('Создай задачу: Не сохранена');
  assert.equal(app.store.get('nv_mvp_v2'),before);
  assert.match(app.alerts[0],/Действие отменено/);
  app.recover();app.send('Создай задачу: Не сохранена');
  const data=JSON.parse(app.store.get('nv_mvp_v2'));
  assert.equal(data.tasks.filter(t=>t.title==='Не сохранена').length,1);
  assert.match(data.messages.at(-1).text,/Задача создана/);
});
test('renders untrusted titles as text and tolerates malformed array fields',()=>{
  const app=boot({tasks:null,messages:{},memories:null});
  app.send('Создай задачу: <img src=x onerror=alert(1)>');
  assert.ok(!app.elements['#page'].innerHTML.includes('<img src=x'));
  assert.ok(app.elements['#page'].innerHTML.includes('&lt;img'));
});

test('server mode uses remote state without overwriting local records; disconnect restores local',async()=>{
  const local={tasks:[{id:'local',title:'Локальная задача',status:'Новая'}]};
  const state={tasks:[{id:'server',title:'Серверная задача',status:'Новая'}],messages:[],memories:[],projects:[],clients:[],employees:[],docs:[]};
  const api={connected:false,view:{state,revision:0,plans:[],modelReady:true},
    async connect(){this.connected=true;return this.view;},disconnect(){this.connected=false;},
    async post(path,body){assert.equal(path,'/api/chat');this.view={...this.view,revision:1,state:{...state,messages:[{role:'assistant',text:'Ответ сервера'}]}};return this.view;}};
  const app=boot(local,api);
  app.elements['#connectionBtn'].onclick();
  app.document.querySelector('#serverUrl').value='https://example.com';app.document.querySelector('#workspaceToken').value='x'.repeat(32);
  await app.elements['#connectForm'].onsubmit({preventDefault(){}});
  app.send('Привет');await new Promise(resolve=>setImmediate(resolve));
  assert.match(app.elements['#page'].innerHTML,/Ответ сервера/);
  assert.equal(JSON.parse(app.store.get('nv_mvp_v2')).tasks[0].id,'local');
  app.elements['#connectionBtn'].onclick();app.elements['#disconnectRemote'].onclick();
  app.send('Покажи задачи');
  assert.match(app.elements['#page'].innerHTML,/Локальная задача/);
  assert.doesNotMatch(app.elements['#page'].innerHTML,/Серверная задача/);
});

test('project and task forms persist links, deadlines and chat overview',()=>{
  const app=boot({projects:[],tasks:[]});
  app.elements['#overviewBtn'].onclick();app.elements['#openProjects'].onclick();app.elements['#addProject'].onclick();
  app.document.querySelector('#projectName').value='Новый продукт';app.document.querySelector('#projectDescription').value='Проверка идеи';
  app.elements['#projectForm'].onsubmit({preventDefault(){}});
  const project=JSON.parse(app.store.get('nv_mvp_v2')).projects[0];
  app.elements['#projectTask'].onclick();
  for(const [key,value] of Object.entries({taskTitle:'Интервью',taskDue:'2026-10-01',taskStatus:'Новая',taskProject:project.id}))app.document.querySelector('#'+key).value=value;
  app.elements['#taskForm'].onsubmit({preventDefault(){}});
  const task=JSON.parse(app.store.get('nv_mvp_v2')).tasks[0];
  assert.equal(task.projectId,project.id);assert.equal(task.dueDate,'2026-10-01');
  const restored=boot(JSON.parse(app.store.get('nv_mvp_v2')));restored.send('Обзор проекта Новый продукт');
  assert.match(restored.elements['#page'].innerHTML,/Интервью/);
});
test('task form storage failure leaves no phantom task',()=>{
  const app=boot({tasks:[]});app.elements['#overviewBtn'].onclick();app.elements['#newOverviewTask'].onclick();
  for(const [key,value] of Object.entries({taskTitle:'Не сохранится',taskDue:'',taskStatus:'Новая',taskProject:''}))app.document.querySelector('#'+key).value=value;
  app.fail();app.elements['#taskForm'].onsubmit({preventDefault(){}});
  assert.match(app.elements['#formError'].textContent,/не сохранены/);
  app.recover();app.elements['#taskForm'].onsubmit({preventDefault(){}});
  assert.equal(JSON.parse(app.store.get('nv_mvp_v2')).tasks.length,1);
});

test('client to order to task persists, is searchable and undoable after reload',()=>{
 const app=boot({clients:[],orders:[],tasks:[]});const fill=values=>{for(const [k,v] of Object.entries(values))app.document.querySelector('#'+k).value=v;};const submit=id=>app.elements['#'+id].onsubmit({preventDefault(){}});
 app.go('Клиенты');app.elements['#addClient'].onclick();fill({clientName:'Студия',clientContact:'test@example.com',clientNotes:'Первый заказ'});submit('clientForm');
 app.elements['#clientOrder'].onclick();const c=JSON.parse(app.store.get('nv_mvp_v2')).clients[0];fill({orderName:'Лендинг',orderClientId:c.id,orderAmount:'25000,50',orderDue:'2026-10-01',orderStatus:'В работе',orderOwner:'Александр',orderNotes:'Тест',orderProject:''});submit('orderForm');
 let d=JSON.parse(app.store.get('nv_mvp_v2'));assert.equal(d.orders[0].amount,'25000.50');app.elements['#orderTask'].onclick();fill({taskTitle:'Макет',taskDue:'',taskStatus:'Новая',taskProject:'',taskOrder:d.orders[0].id});submit('taskForm');
 d=JSON.parse(app.store.get('nv_mvp_v2'));assert.equal(d.tasks[0].orderId,d.orders[0].id);
 const again=boot(d);again.elements['#globalSearch'].onclick();again.elements['#workspaceSearch'].value='Лендинг';again.elements['#workspaceSearch'].oninput();assert.match(again.elements['#searchResults'].innerHTML,/Лендинг/);
 again.go('Данные');again.elements['#undoChange'].onclick();d=JSON.parse(again.store.get('nv_mvp_v2'));assert.equal(d.tasks.length,0);assert.equal(d.orders.length,1);assert.equal(d.clients.length,1);
});
test('failed order save rolls back and retry creates exactly one record',()=>{const app=boot({clients:[{id:'c',name:'Клиент'}],orders:[]});app.go('Заказы');app.elements['#addOrder'].onclick();for(const [k,v] of Object.entries({orderName:'Заказ',orderClientId:'c',orderAmount:'100',orderDue:'',orderStatus:'Новый',orderOwner:'',orderNotes:'',orderProject:''}))app.document.querySelector('#'+k).value=v;app.fail();app.elements['#orderForm'].onsubmit({preventDefault(){}});assert.match(app.elements['#formError'].textContent,/не сохранены/);app.recover();app.elements['#orderForm'].onsubmit({preventDefault(){}});assert.equal(JSON.parse(app.store.get('nv_mvp_v2')).orders.length,1);});

test('finance requires review; storage failure rolls back; exact retry and reload retain one payment',()=>{
 const app=boot({clients:[{id:'c',name:'Клиент'}],orders:[{id:'o',name:'Сайт',clientId:'c',amount:'100.00',status:'Новый'}]});app.go('Финансы');app.elements['#addEntry'].onclick();
 for(const [k,v] of Object.entries({entryKind:'income',entryAmount:'25,50',entryDate:'2026-09-01',entryOrder:'o',entryCategory:'Оплата заказа',entryNote:'Аванс'}))app.document.querySelector('#'+k).value=v;
 app.elements['#entryForm'].onsubmit({preventDefault(){}});assert.equal(JSON.parse(app.store.get('nv_mvp_v2')).ledger,undefined);
 const confirm=app.elements['#confirmEntry'].onclick;app.fail();confirm();assert.match(app.elements['#formError'].textContent,/не сохранены/);app.recover();confirm();confirm();const d=JSON.parse(app.store.get('nv_mvp_v2'));assert.equal(d.ledger.length,1);assert.equal(d.ledger[0].amount,'25.50');
 const restored=boot(d);restored.go('Финансы');assert.match(restored.elements['#page'].innerHTML,/74,50/);restored.go('AI');restored.send('Финансовый обзор');assert.match(restored.elements['#page'].innerHTML,/74,50/);
});
test('document form escapes HTML and persists links and multiline text',()=>{const app=boot({projects:[{id:'p',name:'Проект'}],orders:[{id:'o',name:'Заказ'}]});app.go('Документы');app.elements['#addDoc'].onclick();for(const [k,v] of Object.entries({docName:'<img src=x onerror=alert(1)>',docFolder:'ТЗ',docText:'Строка 1\n<script>alert(1)</script>',docProject:'p',docOrder:'o'}))app.document.querySelector('#'+k).value=v;app.elements['#docForm'].onsubmit({preventDefault(){}});assert.ok(!app.elements['#page'].innerHTML.includes('<script>'));assert.match(app.elements['#page'].innerHTML,/&lt;script&gt;/);const d=JSON.parse(app.store.get('nv_mvp_v2'));assert.equal(d.docs[0].orderId,'o');assert.equal(d.docs[0].projectId,'p');assert.match(d.docs[0].text,/\n/);});
test('financial chat commands do not accidentally become memory records',()=>{const app=boot({memories:[]});app.send('Запиши расход 500 рублей');const d=JSON.parse(app.store.get('nv_mvp_v2'));assert.equal(d.memories.length,0);assert.equal(d.ledger.length,0);assert.match(d.messages.at(-1).text,/не создана/);});
test('newer backup selection wins if an earlier file finishes reading later',async()=>{const app=boot();app.go('Данные');const payload=name=>JSON.stringify({format:'nasha-volna-backup',version:3,state:{messages:[],tasks:[],memories:[],projects:[],clients:[{id:'c',name}],employees:[],docs:[],orders:[],ledger:[]}});let resolve;const slow=new Promise(r=>resolve=r);const first=app.elements['#backupFile'].onchange({target:{files:[{size:10,text:()=>slow}]}});await app.elements['#backupFile'].onchange({target:{files:[{size:10,text:async()=>payload('Новая копия')}]}});resolve(payload('Старая копия'));await first;app.elements['#applyBackup'].onclick();assert.equal(JSON.parse(app.store.get('nv_mvp_v2')).clients[0].name,'Новая копия');});
