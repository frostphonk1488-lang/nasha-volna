/* Local management ledger. Integer kopecks; entries describe recorded events, not bank transfers. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.NVFinance=api;})(globalThis,()=>{
'use strict';
const labels={income:'Поступление',expense:'Расход',refund:'Возврат клиенту',reversal:'Исправление'};
const categories=['Оплата заказа','Подрядчики','Материалы','Реклама','Сервисы','Прочее'];
function cents(v){const s=String(v??'').trim().replace(',','.');if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(s))throw Error('Сумма: от 0,01 до 999 999 999,99 ₽, максимум две цифры после запятой.');const [a,b='']=s.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));}
function decimal(n){return Math.floor(n/100)+'.'+String(n%100).padStart(2,'0');}
function validDate(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
function validate(v,data,today){
 if(!['income','expense','refund'].includes(v.kind))throw Error('Выберите вид операции.');
 const amount=cents(v.amount);if(!amount)throw Error('Сумма должна быть больше нуля.');
 if(!validDate(v.date)||v.date>today)throw Error('Укажите существующую дату не позже сегодняшней.');
 const orderId=v.orderId||'';if(orderId&&!(data.orders||[]).some(o=>o.id===orderId))throw Error('Заказ не найден.');
 if(v.kind!=='expense'&&!orderId)throw Error('Поступление или возврат нужно связать с заказом.');
 const note=String(v.note||'').trim();if(!note||note.length>1000)throw Error('Укажите назначение от 1 до 1000 символов.');
 if(!categories.includes(v.category))throw Error('Выберите статью операции.');
 return {kind:v.kind,amount:decimal(amount),date:v.date,orderId,category:v.category,note};
}
function reverse(data,id,note,today){
 const rows=data.ledger||[],target=rows.find(e=>e.id===id);
 if(!target||target.kind==='reversal')throw Error('Нельзя исправить эту запись.');
 if(rows.some(e=>e.reversalOf===id))throw Error('Запись уже исправлена.');
 const reason=String(note||'').trim();if(!reason||reason.length>1000)throw Error('Укажите причину исправления от 1 до 1000 символов.');
 if(!validDate(today)||today<target.date)throw Error('Дата исправления не может быть раньше операции.');
 return {kind:'reversal',amount:target.amount,date:today,orderId:target.orderId,category:target.category,note:reason,reversalOf:id};
}
function effect(entry,all){const source=entry.kind==='reversal'?all.find(e=>e.id===entry.reversalOf):entry;if(!source)throw Error('Не найдена исправляемая операция.');const amount=cents(entry.amount)*(entry.kind==='reversal'?-1:1);return {income:source.kind==='income'?amount:0,expense:source.kind==='expense'?amount:0,refund:source.kind==='refund'?amount:0};}
function totals(data,filter={}){const all=data.ledger||[],rows=all.filter(e=>(!filter.orderId||e.orderId===filter.orderId)&&(!filter.from||e.date>=filter.from)&&(!filter.to||e.date<=filter.to));let income=0,expense=0,refund=0;for(const e of rows){const f=effect(e,all);income+=f.income;expense+=f.expense;refund+=f.refund;}return {rows,income,expense,refund,netPaid:income-refund,balance:income-refund-expense};}
function orderSummary(data,order){const t=totals(data,{orderId:order.id}),priced=order.amount!==''&&order.amount!==undefined,price=priced?cents(order.amount):null;const due=priced&&order.status!=='Отменён'?Math.max(0,price-t.netPaid):null;return {...t,price,due,overpaid:priced?Math.max(0,t.netPaid-price):0};}
function portfolio(data){let due=0;const unpaid=[];for(const order of data.orders||[]){const s=orderSummary(data,order);if(s.due>0){due+=s.due;unpaid.push({order,...s});}}return {due,unpaid,unknown:(data.orders||[]).filter(o=>o.status!=='Отменён'&&!o.amount).length};}
function csv(data,filter={}){const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+\-@\t\r]/,m=>"'"+m).replace(/"/g,'""')+'"';const rows=[['ID','Дата','Вид','Заказ','Статья','Сумма, RUB','Назначение','Исправляет'],...totals(data,filter).rows.map(e=>[e.id,e.date,labels[e.kind],(data.orders||[]).find(o=>o.id===e.orderId)?.name||'',e.category,e.amount,e.note,e.reversalOf||''])];return '\uFEFF'+rows.map(r=>r.map(cell).join(';')).join('\r\n');}
const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(n/100);
function answer(text,data){const q=text.trim().toLocaleLowerCase('ru').replace(/[?!.]+$/,'');if(['финансовый обзор','покажи финансы','сколько нам должны','какие заказы не оплачены'].includes(q)){const t=totals(data),p=portfolio(data);return 'По записанным операциям за всё время:\nПоступления: '+money(t.income)+'; возвраты: '+money(t.refund)+'; расходы: '+money(t.expense)+'.\nДенежный результат: '+money(t.balance)+' (поступления − возвраты − расходы).\nОсталось получить по неотменённым заказам: '+money(p.due)+'. Заказов без суммы: '+p.unknown+'.\n'+p.unpaid.slice(0,10).map(x=>'• '+x.order.name+': '+money(x.due)+' [orders:'+x.order.id+']').join('\n')+'\n\nОстаток к оплате не равен просроченному долгу: сроки оплаты пока не заданы. Это управленческий расчёт по введённым записям, не банковская выписка и не бухгалтерская прибыль. Источник: раздел «Финансы». Данные не изменены.';}
 const match=q.match(/^экономика заказа\s+(.+)$/);if(!match)return null;const orders=(data.orders||[]).filter(o=>o.name.toLocaleLowerCase('ru')===match[1]||o.id===match[1]);if(orders.length!==1)return orders.length?'Несколько заказов с таким названием. Укажите ID.':'Заказ не найден. Укажите точное название или ID.';const o=orders[0],s=orderSummary(data,o);return 'Заказ «'+o.name+'» [orders:'+o.id+']\nСтоимость: '+(s.price===null?'не указана':money(s.price))+'\nОплачено с учётом возвратов: '+money(s.netPaid)+'\nРасходы: '+money(s.expense)+'\nДенежный результат: '+money(s.balance)+'\nОсталось получить: '+(s.due===null?'не рассчитывается':money(s.due))+'\nПереплата: '+money(s.overpaid)+'\nИсточник: операции заказа в разделе «Финансы». Общие расходы без привязки к заказу здесь не учтены; это не бухгалтерская прибыль. Данные не изменены.';}
return {labels,categories,cents,decimal,validDate,validate,reverse,effect,totals,orderSummary,portfolio,csv,answer};
});
