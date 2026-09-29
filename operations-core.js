(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.NVOperations=api;})(globalThis,()=>{
'use strict';
const collections=['employees','products','stock','purchases'];
const trim=(v,label,max=300,required=false)=>{if(typeof v!=='string')throw Error('Некорректное поле: '+label);const s=v.trim();if((required&&!s)||s.length>max)throw Error(label+': '+(required?'от 1 до ':'до ')+max+' символов.');return s;};
function qty(value,zero=false){const s=String(value).trim().replace(',','.');if(!/^\d{1,9}(?:\.\d{1,3})?$/.test(s))throw Error('Количество: до 999 999 999,999, максимум 3 знака после запятой.');const [a,b='']=s.split('.');const n=Number(a)*1000+Number(b.padEnd(3,'0'));if(!zero&&!n)throw Error('Количество должно быть больше нуля.');return n;}
function decimal(n){return (n/1000).toFixed(3);}
function employee(v,state,id){const name=trim(v.name,'Имя',300,true);if(state.employees.some(x=>x.id!==id&&x.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))throw Error('Сотрудник с таким именем уже существует.');if(!['Активен','Неактивен'].includes(v.status))throw Error('Выберите статус.');return {name,role:trim(v.role||'','Должность'),contact:trim(v.contact||'','Контакты',500),status:v.status};}
function product(v,state,id){const sku=trim(v.sku,'Артикул',100,true),name=trim(v.name,'Название',300,true);if(state.products.some(x=>x.id!==id&&x.sku.toLocaleLowerCase('ru')===sku.toLocaleLowerCase('ru')))throw Error('Артикул уже существует.');if(!['шт','кг','л','м'].includes(v.unit))throw Error('Выберите единицу.');return {sku,name,unit:v.unit,minStock:decimal(qty(v.minStock||'0',true))};}
function balance(state,productId){return state.stock.filter(x=>x.productId===productId).reduce((n,x)=>n+(x.kind==='in'?1:-1)*qty(x.quantity),0);}
function movement(v,state){if(!state.products.some(x=>x.id===v.productId))throw Error('Товар не найден.');if(!['in','out'].includes(v.kind))throw Error('Выберите движение.');const n=qty(v.quantity);if(v.kind==='out'&&balance(state,v.productId)<n)throw Error('Недостаточно товара на складе.');return {productId:v.productId,kind:v.kind,quantity:decimal(n),note:trim(v.note,'Основание',1000,true)};}
function purchase(v,state){if(!state.products.some(x=>x.id===v.productId))throw Error('Выберите товар.');const dueDate=v.dueDate||'';if(dueDate){const d=new Date(dueDate+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==dueDate)throw Error('Некорректная дата поставки.');}return {productId:v.productId,quantity:decimal(qty(v.quantity)),supplier:trim(v.supplier,'Поставщик',300,true),dueDate,status:'Заказан',note:trim(v.note||'','Комментарий',1000)};}
function receive(state,id,uid,now){const p=state.purchases.find(x=>x.id===id);if(!p||p.status!=='Заказан')throw Error('Закупка уже принята или отменена.');const record={...movement({productId:p.productId,kind:'in',quantity:p.quantity,note:'Приёмка закупки '+p.id},state),id:uid,purchaseId:p.id,createdAt:now};state.stock.push(record);p.status='Принят';p.receivedAt=now;}
function validateState(state){
 for(const k of collections)if(!Array.isArray(state[k]))throw Error('Некорректный раздел '+k);
 for(const p of state.products)product(p,state,p.id);
 for(const e of state.employees)employee({...e,status:e.status||'Активен'},state,e.id);
 const levels=new Map(),received=new Set();
 for(const m of state.stock){if(!state.products.some(p=>p.id===m.productId)||!['in','out'].includes(m.kind)||!m.note?.trim())throw Error('Некорректное складское движение.');const n=qty(m.quantity),level=(levels.get(m.productId)||0)+(m.kind==='in'?n:-n);if(level<0)throw Error('Отрицательный остаток в истории склада.');levels.set(m.productId,level);if(m.purchaseId){const p=state.purchases.find(p=>p.id===m.purchaseId);if(!p||p.status!=='Принят'||m.kind!=='in'||m.productId!==p.productId||qty(m.quantity)!==qty(p.quantity)||received.has(p.id))throw Error('Некорректная приёмка закупки.');received.add(p.id);}}
 for(const p of state.purchases){purchase(p,state);if(!['Заказан','Принят','Отменён'].includes(p.status))throw Error('Неизвестный статус закупки.');if(p.status==='Принят'&&!received.has(p.id))throw Error('Нет складской приёмки.');}
 for(const o of state.orders||[])if(o.ownerId&&!state.employees.some(e=>e.id===o.ownerId))throw Error('Ответственный заказа не найден.');
 for(const t of state.tasks||[])if(t.assigneeId&&!state.employees.some(e=>e.id===t.assigneeId))throw Error('Исполнитель задачи не найден.');
}
return {collections,qty,decimal,employee,product,balance,movement,purchase,receive,validateState};
});
