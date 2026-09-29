(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.NVStorage=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const keys=['messages','memories','tasks','projects','clients','employees','docs','orders','ledger'];
const copy=x=>JSON.parse(JSON.stringify(x));
function clean(state){const result={};for(const key of keys)result[key]=copy(state[key]||[]);if(state.taskContext)result.taskContext=copy(state.taskContext);return result;}
function parseBackup(text){
 if(text.length>5000000)throw Error('Размер копии превышает 5 МБ.');
 const envelope=JSON.parse(text);
 if(envelope.format!=='nasha-volna-backup'||![1,2,3].includes(envelope.version))throw Error('Нужна резервная копия Nasha Volna версии 1, 2 или 3.');
 const state=envelope.state;
 if(!state||typeof state!=='object')throw Error('В копии нет данных.');
 if(envelope.version===1&&!Object.hasOwn(state,'orders'))state.orders=[];
 if(envelope.version<3&&!Object.hasOwn(state,'ledger'))state.ledger=[];
 const required={messages:['text'],memories:['text','type'],tasks:['title','status'],projects:['name'],clients:['name'],employees:['name'],docs:['name'],orders:['name','clientId','status','amount'],ledger:['kind','amount','date','orderId','category','note']};
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
 const validDate=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
 for(const row of [...state.orders,...state.tasks])if(row.dueDate&&!validDate(row.dueDate))throw Error('Некорректная дата срока.');
 for(const doc of state.docs){if(doc.orderId&&!state.orders.some(o=>o.id===doc.orderId))throw Error('В документе указан отсутствующий заказ.');if(doc.projectId&&!state.projects.some(p=>p.id===doc.projectId))throw Error('В документе указан отсутствующий проект.');}
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const reversed=new Set();
 for(const entry of state.ledger){
  if(!['income','expense','refund','reversal'].includes(entry.kind)||!/^\d{1,9}\.\d{2}$/.test(entry.amount)||Number(entry.amount)<=0)throw Error('Некорректная финансовая операция.');
  if(!validDate(entry.date)||entry.date>today)throw Error('Некорректная дата финансовой операции.');
  if(!entry.note.trim()||entry.note.length>1000||!['Оплата заказа','Подрядчики','Материалы','Реклама','Сервисы','Прочее'].includes(entry.category))throw Error('Некорректное назначение или статья операции.');
  if(entry.orderId&&!state.orders.some(o=>o.id===entry.orderId))throw Error('Финансовая операция без существующего заказа.');
  if(['income','refund'].includes(entry.kind)&&!entry.orderId)throw Error('Поступление или возврат без заказа.');
  if(entry.kind==='reversal'){
   const original=state.ledger.find(x=>x.id===entry.reversalOf);
   if(!original||original.kind==='reversal'||reversed.has(original.id)||entry.orderId!==original.orderId||entry.amount!==original.amount||entry.category!==original.category||entry.date<original.date)throw Error('Некорректная обратная запись.');
   reversed.add(original.id);
  }else if(entry.reversalOf)throw Error('Лишняя ссылка исправления.');
 }
 const result=clean(state);delete result.taskContext;return result;
}
function open(storage,key){
 let raw=null,meta={},problem='';
 try{raw=storage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();meta=parsed._meta||{};if(!meta||typeof meta!=='object'||Array.isArray(meta))meta={};if(Array.isArray(meta.history))meta.history=meta.history.filter(x=>x&&typeof x.label==='string'&&typeof x.at==='string').slice(0,30);}}
 catch(e){problem='Сохранённые данные недоступны или повреждены. Экспортируйте исходные данные перед восстановлением.';}
 function commit(state,label,previous,undo=false){
  if(problem)throw Error(problem);
  if(storage.getItem(key)!==raw)throw Error('Данные изменились в другой вкладке. Обновите страницу перед продолжением.');
  const nextMeta={history:[{label,at:new Date().toISOString()},...(Array.isArray(meta.history)?meta.history:[])].slice(0,30),undo:undo?null:clean(previous)};
  const next=JSON.stringify({...clean(state),_meta:nextMeta});storage.setItem(key,next);raw=next;meta=nextMeta;
 }
 return {commit,history:()=>copy(Array.isArray(meta.history)?meta.history:[]),canUndo:()=>!!meta.undo&&!problem,undo:()=>copy(meta.undo),problem:()=>problem,raw:()=>raw,
 export:state=>JSON.stringify({format:'nasha-volna-backup',version:3,createdAt:new Date().toISOString(),state:clean(state)},null,2)};
}
return {open,parseBackup,clean};
});
