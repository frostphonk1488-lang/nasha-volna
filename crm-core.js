(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.NVCRM=api;})(globalThis,()=>{
'use strict';
const stages=['Новый','В работе','На проверке','Выполнен','Отменён'];
const trim=(v,max,label,required=false)=>{const s=String(v||'').trim();if((required&&!s)||s.length>max)throw Error(label+': '+(required?'от 1 до ':'до ')+max+' символов.');return s;};
function cents(value){const s=String(value??'').trim().replace(',','.');if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(s))throw Error('Укажите сумму от 0 до 999 999 999,99 ₽, не более двух знаков после запятой.');const [a,b='']=s.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));}
function date(value){if(!value)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Укажите корректный срок.');const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw Error('Укажите существующую дату.');return value;}
function client(v,data,id){const name=trim(v.name,300,'Название клиента',true);if(data.clients.some(x=>x.id!==id&&x.name.trim().toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))throw Error('Клиент с таким названием уже существует.');return {name,contact:trim(v.contact,500,'Контакты'),notes:trim(v.notes,5000,'Заметки')};}
function order(v,data){
 const name=trim(v.name,300,'Название заказа',true);
 if(!data.clients.some(x=>x.id===v.clientId))throw Error('Выберите существующего клиента.');
 if(!stages.includes(v.status))throw Error('Выберите этап заказа.');
 if(v.projectId&&!data.projects.some(x=>x.id===v.projectId))throw Error('Проект не найден.');
 const amount=v.amount?.trim()? (cents(v.amount)/100).toFixed(2):'';
 return {name,clientId:v.clientId,status:v.status,amount,dueDate:date(v.dueDate),projectId:v.projectId||'',owner:trim(v.owner,300,'Ответственный'),notes:trim(v.notes,5000,'Описание')};
}
function summary(data,clientId){const orders=(data.orders||[]).filter(o=>!clientId||o.clientId===clientId),active=orders.filter(o=>!['Выполнен','Отменён'].includes(o.status));let amountCents=0,unknown=0;for(const o of active){if(!o.amount){unknown++;continue;}amountCents+=cents(o.amount);}return {orders,active,amountCents,unknown};}
function removeClient(data,id){if((data.orders||[]).some(o=>o.clientId===id))throw Error('У клиента есть заказы. Сначала перенесите или удалите их.');data.clients=data.clients.filter(c=>c.id!==id);}
function removeOrder(data,id){if(data.tasks.some(t=>t.orderId===id))throw Error('У заказа есть задачи. Сначала отвяжите их или выберите этап «Отменён».');data.orders=data.orders.filter(o=>o.id!==id);}
return {stages,cents,client,order,summary,removeClient,removeOrder};
});
