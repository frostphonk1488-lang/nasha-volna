/* Working operational screens. Business writes use the same local/server gateway. */
(function(root){
'use strict';
root.NVOperationsUI=function(c){
 const $=s=>document.querySelector(s),esc=c.esc,op=root.NVOperations;
 let query='',lastPage='';
 const qty=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(n/1000);
 const choices=(rows,id,empty)=>'<option value="">'+empty+'</option>'+rows.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===id?'selected':'')+'>'+esc(x.name)+'</option>').join('');
 const field=(label,id,value='',type='text')=>'<label>'+label+'<input id="'+id+'" type="'+type+'" value="'+esc(value)+'" maxlength="300"></label>';
 function form(title,body,save,page){
  $('#page').innerHTML=c.layout(title,'', '<section class="panel full connection-panel"><form id="operationForm">'+body+'<p id="formError" role="alert"></p><div class="workspace-actions"><button class="primary" type="submit">Сохранить</button><button class="secondary" type="button" id="operationCancel">Отмена</button></div></form></section>');
  $('#operationCancel').onclick=()=>c.nav(page);
  $('#operationForm').onsubmit=e=>{e.preventDefault();c.change(save,()=>c.nav(page),title);};
 }
 function editEmployee(id){const d=c.state(),e=d.employees.find(x=>x.id===id)||{};
  form(id?'Изменить сотрудника':'Новый сотрудник',field('Имя','personName',e.name)+field('Должность','personRole',e.role)+field('Контакты','personContact',e.contact)+'<label>Статус<select id="personStatus">'+['Активен','Неактивен'].map(s=>'<option '+(s===(e.status||'Активен')?'selected':'')+'>'+s+'</option>').join('')+'</select></label><p class="muted">Карточка сотрудника используется для назначения работы. Доступ к серверу выдаётся отдельным ключом администратора.</p>',()=>{const v=op.employee({name:$('#personName').value,role:$('#personRole').value,contact:$('#personContact').value,status:$('#personStatus').value},d,id);const row={...e,...v,id:id||c.uid('employee')};if(id)d.employees[d.employees.indexOf(e)]=row;else d.employees.push(row);},'Команда');
 }
 function editProduct(id){const d=c.state(),p=d.products.find(x=>x.id===id)||{};
  form(id?'Изменить товар':'Новый товар',field('Название','productName',p.name)+field('Артикул','productSKU',p.sku)+'<label>Единица<select id="productUnit">'+['шт','кг','л','м'].map(u=>'<option '+(u===p.unit?'selected':'')+'>'+u+'</option>').join('')+'</select></label>'+field('Минимальный остаток','productMin',p.minStock||'0'),()=>{const v=op.product({name:$('#productName').value,sku:$('#productSKU').value,unit:$('#productUnit').value,minStock:$('#productMin').value},d,id);if(id&&p.unit!==v.unit&&d.stock.some(m=>m.productId===id))throw Error('Единицу товара с движениями менять нельзя.');const row={...p,...v,id:id||c.uid('product')};if(id)d.products[d.products.indexOf(p)]=row;else d.products.push(row);},'Каталог');
 }
 function editMovement(){const d=c.state();form('Складская операция','<label>Товар<select id="movementProduct">'+choices(d.products,'','Выберите товар')+'</select></label><label>Вид<select id="movementKind"><option value="in">Приход</option><option value="out">Списание</option></select></label>'+field('Количество','movementQty')+field('Основание','movementNote')+'<p class="muted">После сохранения движение остаётся в журнале. Для корректировки добавьте новое движение с основанием.</p>',()=>d.stock.push({...op.movement({productId:$('#movementProduct').value,kind:$('#movementKind').value,quantity:$('#movementQty').value,note:$('#movementNote').value},d),id:c.uid('stock'),createdAt:new Date().toISOString()}),'Склад');}
 function editPurchase(){const d=c.state();form('Новая закупка','<label>Товар<select id="purchaseProduct">'+choices(d.products,'','Выберите товар')+'</select></label>'+field('Поставщик','purchaseSupplier')+field('Количество','purchaseQty')+field('Ожидаемая дата поставки','purchaseDue','','date')+field('Комментарий','purchaseNote'),()=>d.purchases.push({...op.purchase({productId:$('#purchaseProduct').value,supplier:$('#purchaseSupplier').value,quantity:$('#purchaseQty').value,dueDate:$('#purchaseDue').value,note:$('#purchaseNote').value},d),id:c.uid('purchase'),createdAt:new Date().toISOString()}),'Закупки');}
 function render(page,p){
  if(page!==lastPage){query='';lastPage=page;}
  const d=c.state(),key={'Команда':'employees','Каталог':'products','Склад':'stock','Закупки':'purchases'}[page];
  const write=c.canWrite(key),match=x=>!query||JSON.stringify(x).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'));
  let rows=[],intro='',extra='';
  if(page==='Команда'){
   intro='Сотрудники, назначения и текущая нагрузка.';
   rows=d.employees.filter(match).map(e=>{const tasks=d.tasks.filter(t=>t.assigneeId===e.id&&t.status!=='Выполнена'),orders=d.orders.filter(o=>o.ownerId===e.id&&!['Выполнен','Отменён'].includes(o.status));return '<article class="ops-card"><div class="ops-card-head"><span class="tag">'+esc(e.status||'Активен')+'</span>'+(write?'<button class="secondary" data-edit-person="'+esc(e.id)+'">Изменить</button>':'')+'</div><h3>'+esc(e.name)+'</h3><p>'+esc(e.role||'Должность не указана')+'</p><p class="preserve">'+esc(e.contact||'Нет контактов')+'</p><div class="ops-facts"><span>'+tasks.length+' активных задач</span><span>'+orders.length+' заказов</span></div></article>';});
  }else if(page==='Каталог'){
   intro='Номенклатура и минимальный запас.';
   rows=d.products.filter(match).map(x=>{const n=op.balance(d,x.id);return '<article class="ops-card"><div class="ops-card-head"><span class="tag">'+esc(x.sku)+'</span>'+(write?'<button class="secondary" data-edit-product="'+esc(x.id)+'">Изменить</button>':'')+'</div><h3>'+esc(x.name)+'</h3><p>Остаток: <b>'+qty(n)+' '+esc(x.unit)+'</b></p><p class="muted">Минимум: '+qty(op.qty(x.minStock||'0',true))+' '+esc(x.unit)+'</p>'+(n<op.qty(x.minStock||'0',true)?'<p class="attention">Нужно пополнить запас</p>':'')+'</article>';});
  }else if(page==='Склад'){
   intro='Один склад. Приходы, списания и остатки по товарам.';
   const low=d.products.filter(x=>op.balance(d,x.id)<op.qty(x.minStock||'0',true));
   extra='<section class="panel full"><div class="panel-title"><b>Остатки</b><span class="muted">'+low.length+' товаров ниже минимума</span></div><div class="ops-grid">'+d.products.filter(match).map(x=>'<div class="ops-balance"><span>'+esc(x.name)+'</span><strong>'+qty(op.balance(d,x.id))+' <small>'+esc(x.unit)+'</small></strong></div>').join('')+'</div></section>';
   rows=d.stock.slice().reverse().filter(x=>match({...x,name:d.products.find(p=>p.id===x.productId)?.name})).map(x=>'<article class="record"><div><span class="tag">'+(x.kind==='in'?'Приход':'Списание')+'</span><h3>'+esc(d.products.find(p=>p.id===x.productId)?.name||'Товар не найден')+'</h3><p>'+esc(x.note)+'</p><small class="muted">'+esc(new Date(x.createdAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}))+' МСК</small></div><strong>'+ (x.kind==='in'?'+':'−')+qty(op.qty(x.quantity))+'</strong></article>');
  }else{
   intro='Заказы поставщикам и приёмка на склад.';
   rows=d.purchases.slice().reverse().filter(x=>match({...x,name:d.products.find(p=>p.id===x.productId)?.name})).map(x=>{const product=d.products.find(p=>p.id===x.productId),late=x.status==='Заказан'&&x.dueDate&&x.dueDate<c.today();return '<article class="ops-card"><div class="ops-card-head"><span class="tag">'+esc(x.status)+'</span><small class="muted">'+esc(x.id)+'</small></div><h3>'+esc(product?.name||'Товар не найден')+'</h3><p>'+esc(x.supplier)+'</p><strong>'+qty(op.qty(x.quantity))+' '+esc(product?.unit)+'</strong><p class="'+(late?'attention':'muted')+'">'+(x.dueDate?'Поставка: '+esc(x.dueDate)+(late?' · задерживается':''):'Дата поставки не указана')+'</p><p>'+esc(x.note)+'</p>'+(x.status==='Заказан'&&write?'<div class="workspace-actions">'+(c.canWrite('stock')?'<button class="primary" data-receive="'+esc(x.id)+'">Принять на склад</button>':'')+'<button class="secondary" data-cancel-purchase="'+esc(x.id)+'">Отменить закупку</button></div>':'')+'</article>';});
  }
  const labels={'Команда':'Добавить сотрудника','Каталог':'Добавить товар','Склад':'Записать движение','Закупки':'Новая закупка'};
  p.innerHTML=c.layout(page,intro,'<section class="panel full"><div class="panel-title"><b>'+page+'</b>'+(write?'<button class="primary" id="operationAdd">'+c.icon('plus')+' '+labels[page]+'</button>':'<span class="muted">Просмотр</span>')+'</div><label class="search-field">'+c.icon('search')+'<input id="operationSearch" type="search" aria-label="Поиск в разделе" placeholder="Поиск…" value="'+esc(query)+'" maxlength="300"></label><p class="muted" role="status">Найдено: '+rows.length+'</p></section>'+extra+'<section class="panel full history-panel"><div class="'+(page==='Склад'?'records':'ops-grid')+'">'+(rows.join('')||'<p class="empty">Записей нет. '+(write?'Добавьте первую запись.':'')+'</p>')+'</div></section>');
  $('#operationSearch').oninput=e=>{const pos=e.target.selectionStart;query=e.target.value;render(page,p);$('#operationSearch').focus();$('#operationSearch').setSelectionRange?.(pos,pos);};
  if(write)$('#operationAdd').onclick={'Команда':()=>editEmployee(),'Каталог':()=>editProduct(),'Склад':editMovement,'Закупки':editPurchase}[page];
  document.querySelectorAll('[data-edit-person]').forEach(b=>b.onclick=()=>editEmployee(b.dataset.editPerson));
  document.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>editProduct(b.dataset.editProduct));
  document.querySelectorAll('[data-receive]').forEach(b=>b.onclick=()=>{if(confirm('Подтвердить фактическую приёмку товара? Остаток увеличится.'))c.change(()=>op.receive(d,b.dataset.receive,c.uid('stock'),new Date().toISOString()),()=>c.nav('Закупки'),'Принята закупка');});
  document.querySelectorAll('[data-cancel-purchase]').forEach(b=>b.onclick=()=>{if(confirm('Отменить закупку?'))c.change(()=>{const x=d.purchases.find(x=>x.id===b.dataset.cancelPurchase);if(x.status!=='Заказан')throw Error('Закупка уже обработана.');x.status='Отменён';},()=>c.nav('Закупки'),'Отменена закупка');});
 }
 return render;
};
})(globalThis);
