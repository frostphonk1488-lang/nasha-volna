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
  const document={querySelector:s=>elements[s]||(elements[s]=element()),querySelectorAll:()=>[],createElement:element,body:element()};
  const context={document,localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>{if(fail)throw Error('quota');store.set(key,value);}},structuredClone,setTimeout:fn=>fn(),console};
  context.window=context;context.NVRemote=remoteApi;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('task-core.js','utf8'),context);
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  return {store,alerts,elements,document,fail:()=>{fail=true;},recover:()=>{fail=false;},send:text=>{elements['#chatInput'].value=text;elements['#sendBtn'].onclick();}};
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
