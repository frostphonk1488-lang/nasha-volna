"""Server-side business validation and atomic record batches (no model required)."""
import copy
from datetime import datetime
from zoneinfo import ZoneInfo
import re
from .domain import Problem, COLLECTIONS, empty_state

FIELDS = {
 'tasks': 'title status dueDate projectId orderId assigneeId',
 'memories': 'type text', 'projects': 'name desc', 'clients': 'name contact notes',
 'employees': 'name role contact status', 'docs': 'name desc text projectId orderId folder',
 'orders': 'name clientId status amount dueDate paymentDueDate projectId owner ownerId notes',
 'ledger': 'kind amount date orderId category note reversalOf',
 'products': 'name sku unit minStock', 'stock': 'productId kind quantity note purchaseId',
 'purchases': 'productId quantity supplier dueDate status note receivedAt',
}
COMMON = {'id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'}
REQUIRED = {'tasks':'title', 'memories':'text', 'projects':'name', 'clients':'name',
            'employees':'name', 'docs':'name', 'orders':'name', 'products':'name'}
WRITES = {
 'owner': set(COLLECTIONS),
 'manager': {'clients','orders','tasks','projects','docs','memories','products','purchases','stock'},
 'accountant': {'ledger','docs'}, 'member': {'tasks','docs'}, 'viewer': set(),
}

def fail(message): raise Problem(message)
def number(value,scale=2,positive=False):
    if not isinstance(value,str) or not re.fullmatch(r'\d{1,9}(?:\.\d{1,'+str(scale)+'})?',value): fail('Некорректное число.')
    a,_,b=value.partition('.')
    n=int(a)*10**scale+int(b.ljust(scale,'0') or '0')
    if positive and n==0: fail('Сумма или количество должно быть больше нуля.')
    return n
def day(value):
    from datetime import date
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',value): fail('Некорректная дата.')
    try: date.fromisoformat(value)
    except ValueError: fail('Несуществующая дата.')
def validate(raw):
    if not isinstance(raw,dict): fail('Ожидается объект данных.')
    state=empty_state()
    for collection in COLLECTIONS:
        rows=raw.get(collection,[])
        if not isinstance(rows,list) or len(rows)>500: fail('Не более 500 записей в разделе.')
        ids=set()
        for source in rows:
            allowed=set(FIELDS[collection].split())|COMMON
            if not isinstance(source,dict) or set(source)-allowed: fail('Неподдерживаемые поля записи: '+collection)
            row=copy.deepcopy(source)
            for key,value in row.items():
                maximum=20000 if key=='text' and collection=='docs' else 5000 if key=='notes' else 1000 if key=='note' else 2000
                if not isinstance(value,str) or len(value)>maximum: fail('Некорректное поле '+key)
            ident=row.get('id','')
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,150}',ident) or ident in ids: fail('Некорректный или повторяющийся ID.')
            ids.add(ident)
            if collection in REQUIRED:
                name=REQUIRED[collection]
                if not row.get(name,'').strip() or len(row[name])>(2000 if name=='text' else 300): fail('Проверьте '+name)
            for key in ('dueDate','paymentDueDate'):
                if row.get(key): day(row[key])
            state[collection].append(row)
    def link(row,field,target,required=False):
        if (required or row.get(field)) and not any(x['id']==row.get(field) for x in state[target]): fail('Не найдена связанная запись: '+field)
    for row in state['tasks']:
        if row.get('status') not in ('Новая','В работе','Выполнена'): fail('Неизвестный статус задачи.')
        for f,c in [('projectId','projects'),('orderId','orders'),('assigneeId','employees')]: link(row,f,c)
    for row in state['orders']:
        link(row,'clientId','clients',True);link(row,'projectId','projects');link(row,'ownerId','employees')
        if row.get('status') not in ('Новый','В работе','На проверке','Выполнен','Отменён'): fail('Неизвестный этап заказа.')
        if row.get('amount'): number(row['amount'])
    for row in state['docs']:
        link(row,'projectId','projects');link(row,'orderId','orders')
    for collection,key in [('clients','name'),('projects','name'),('products','sku'),('employees','name')]:
        names=set()
        for row in state[collection]:
            name=row.get(key,'').strip().casefold()
            if not name or name in names: fail('Пустое или повторяющееся поле '+key)
            names.add(name)
    for e in state['employees']:
        if e.get('status','Активен') not in ('Активен','Неактивен'): fail('Неизвестный статус сотрудника.')
    for p in state['products']:
        if p.get('unit') not in ('шт','кг','л','м'): fail('Неизвестная единица.')
        number(p.get('minStock','0'),3)
    received=set();levels={}
    for movement in state['stock']:
        link(movement,'productId','products',True)
        if movement.get('kind') not in ('in','out') or not movement.get('note','').strip(): fail('Некорректное складское движение.')
        n=number(movement.get('quantity'),3,True)
        pid=movement['productId'];levels[pid]=levels.get(pid,0)+(n if movement['kind']=='in' else -n)
        if levels[pid]<0: fail('Недостаточно товара на складе.')
        if movement.get('purchaseId'):
            link(movement,'purchaseId','purchases',True)
            p=next(p for p in state['purchases'] if p['id']==movement['purchaseId'])
            if p['id'] in received or p.get('status')!='Принят' or movement['kind']!='in' or p.get('productId')!=pid or number(p.get('quantity'),3)!=n: fail('Некорректная приёмка закупки.')
            received.add(p['id'])
    for p in state['purchases']:
        link(p,'productId','products',True);number(p.get('quantity'),3,True)
        if not p.get('supplier','').strip() or p.get('status') not in ('Заказан','Принят','Отменён'): fail('Проверьте поставщика и статус.')
        if p['status']=='Принят' and p['id'] not in received: fail('Закупка не имеет приёмки.')
    today=datetime.now(ZoneInfo('Europe/Moscow')).date().isoformat();reversed_ids=set()
    for e in state['ledger']:
        for f in ('kind','amount','date','orderId','category','note'):
            if f not in e: fail('Не заполнено поле операции '+f)
        if e['kind'] not in ('income','expense','refund','reversal'): fail('Неизвестная операция.')
        number(e['amount'],2,True);day(e['date'])
        if e['date']>today: fail('Дата операции в будущем.')
        if not e['note'].strip() or len(e['note'])>1000 or e['category'] not in ('Оплата заказа','Подрядчики','Материалы','Реклама','Сервисы','Прочее'): fail('Проверьте назначение операции.')
        link(e,'orderId','orders',e['kind'] in ('income','refund'))
        if e['kind']=='reversal':
            original=next((x for x in state['ledger'] if x['id']==e.get('reversalOf')),None)
            if not original or original['kind']=='reversal' or original['id'] in reversed_ids or any(e.get(k)!=original.get(k) for k in ('amount','orderId','category')) or e['date']<original['date']: fail('Некорректная обратная запись.')
            reversed_ids.add(original['id'])
        elif e.get('reversalOf'): fail('Лишняя ссылка исправления.')
    return state

def apply_batch(state,operations,actor='owner',role='owner'):
    if role not in WRITES: raise Problem('Неизвестная роль.',403)
    if not isinstance(operations,list) or not 1<=len(operations)<=100: fail('Пакет должен содержать 1–100 изменений.')
    candidate=copy.deepcopy(state);log=[];seen=set()
    now=datetime.now(ZoneInfo('Europe/Moscow')).isoformat()
    for op in operations:
        if not isinstance(op,dict) or set(op)-{'collection','id','record','delete'}: fail('Некорректная операция.')
        collection=op.get('collection');ident=op.get('id')
        if collection not in WRITES[role]: raise Problem('Нет прав для изменения раздела.',403)
        if (collection,ident) in seen: fail('Повторное изменение одной записи в пакете.')
        seen.add((collection,ident))
        rows=candidate[collection];old=next((r for r in rows if r['id']==ident),None)
        if op.get('delete'):
            if 'record' in op or not old: fail('Запись для удаления не найдена.')
            if collection in ('ledger','stock') or (collection=='purchases' and old.get('status')=='Принят'): fail('Проведённые записи не удаляются.')
            rows.remove(old);new=None
        else:
            new=copy.deepcopy(op.get('record'))
            if not isinstance(new,dict) or new.get('id')!=ident: fail('ID записи не совпадает.')
            if old and collection in ('ledger','stock'): fail('Проведённые записи не изменяются. Создайте исправление.')
            if old and collection=='purchases' and old.get('status') in ('Принят','Отменён'): fail('Закрытая закупка не изменяется.')
            if old and collection=='products' and old.get('unit')!=new.get('unit') and any(m['productId']==ident for m in candidate['stock']): fail('Единицу товара с движениями менять нельзя.')
            for key in ('createdAt','createdBy'):
                new[key]=(old or {}).get(key) or (now if key=='createdAt' else actor)
            new['updatedAt']=now;new['updatedBy']=actor
            if old: rows[rows.index(old)]=new
            else: rows.append(new)
        log.append({'collection':collection,'id':ident,'before':copy.deepcopy(old),'after':copy.deepcopy(new),'actor':actor})
    validated=validate(candidate);validated['messages']=copy.deepcopy(state['messages'])
    return validated,log
