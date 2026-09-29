(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.NVStorage=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const keys=['messages','memories','tasks','projects','clients','employees','docs','orders'];
const copy=x=>JSON.parse(JSON.stringify(x));
function clean(state){const result={};for(const key of keys)result[key]=copy(state[key]||[]);if(state.taskContext)result.taskContext=copy(state.taskContext);return result;}
function parseBackup(text){
 if(text.length>5000000)throw Error('Размер копии превышает 5 МБ.');
 const envelope=JSON.parse(text);
 if(envelope.format!=='nasha-volna-backup'||![1,2].includes(envelope.version))throw Error('Нужна резервная копия Nasha Volna версии 1 или 2.');
 const state=envelope.state;
 if(!state||typeof state!=='object')throw Error('В копии нет данных.');
 if(envelope.version===1&&!Object.hasOwn(state,'orders'))state.orders=[];
 const required={messages:['text'],memories:['text','type'],tasks:['title','status'],projects:['name'],clients:['name'],employees:['name'],docs:['name'],orders:['name','clientId','status','amount']};
 for(const key of keys){
  if(!Array.isArray(state[key])||state[key].length>10000)throw Error('Некорректный раздел: '+key);
  const ids=new Set();
  for(const row of state[key]){
   if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id||row.id.length>150||ids.has(row.id))throw Error('Некорректный или повторный ID: '+key);
   ids.add(row.id);
   for(const field of Object.keys(row))if(['__proto__','constructor','prototype'].includes(field)||typeof row[field]!=='string'||row[field].length>100000)throw Error('Некорректное поле: '+key);
   for(const field of required[key])if(typeof row[field]!=='string')throw Error('Отсутствует поле '+field);
   if(key==='tasks'&&!['Новая','В работе','Выполнена'].includes(row.status))throw Error('Неизвестный статус задачи.');
   if(key==='messages'&&!['user','assistant'].includes(row.role))throw Error('Неизвестная роль сообщения.');
  }
 }
 for(const order of state.orders){if(!state.clients.some(c=>c.id===order.clientId))throw Error('В заказе указан отсутствующий клиент.');if(!['Новый','В работе','На проверке','Выполнен','Отменён'].includes(order.status))throw Error('Неизвестный этап заказа.');if(order.amount&&!/^\d{1,9}\.\d{2}$/.test(order.amount))throw Error('Некорректная сумма заказа.');}
 for(const task of state.tasks)if(task.orderId&&!state.orders.some(o=>o.id===task.orderId))throw Error('В задаче указан отсутствующий заказ.');
 const result=clean(state);delete result.taskContext;return result;
}
function open(storage,key){
 let raw=null,meta={},problem='';
 try{raw=storage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();meta=parsed._meta||{};}}
 catch(e){problem='Сохранённые данные недоступны или повреждены. Экспортируйте исходные данные перед восстановлением.';}
 function commit(state,label,previous,undo=false){
  if(problem)throw Error(problem);
  if(storage.getItem(key)!==raw)throw Error('Данные изменились в другой вкладке. Обновите страницу перед продолжением.');
  const nextMeta={history:[{label,at:new Date().toISOString()},...(Array.isArray(meta.history)?meta.history:[])].slice(0,30),undo:undo?null:clean(previous)};
  const next=JSON.stringify({...clean(state),_meta:nextMeta});storage.setItem(key,next);raw=next;meta=nextMeta;
 }
 return {commit,history:()=>copy(Array.isArray(meta.history)?meta.history:[]),canUndo:()=>!!meta.undo&&!problem,undo:()=>copy(meta.undo),problem:()=>problem,raw:()=>raw,
 export:state=>JSON.stringify({format:'nasha-volna-backup',version:2,createdAt:new Date().toISOString(),state:clean(state)},null,2)};
}
return {open,parseBackup,clean};
});
