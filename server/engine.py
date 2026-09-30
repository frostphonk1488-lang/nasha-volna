"""Nasha Volna orchestration: bounded retrieval, exact reports, action grounding.

This is application logic, not model training. All inputs belong to one workspace.
"""
import copy
import json
import math
import re
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo
from .domain import COLLECTIONS, Problem
from .records import number

VERSION = '0.5'
STOP = set('как что это для или мне нас все где когда какой какие уже ещё пожалуйста покажи найди про'.split())


def tokens(value):
    # Conservative suffix matching, deliberately not advertised as semantic search.
    words = re.findall(r'[\w-]+', value.casefold().replace('ё', 'е'))
    return [w[:6] if len(w) > 6 and re.fullmatch('[а-я]+', w) else w
            for w in words if len(w) > 1 and w not in STOP]


def today():
    return datetime.now(ZoneInfo('Europe/Moscow')).date().isoformat()


def retrieve(state, query, history=(), budget=40000):
    followup = bool(re.search(r'\b(он|она|оно|они|его|ее|их|этому|этому|этом|этому|там|тогда)\b', query.casefold().replace('ё', 'е')))
    previous = [m['text'][-1500:] for m in history if m.get('role') == 'user'][-2:] if followup else []
    terms = Counter(tokens(' '.join(previous + [query])))
    candidates = []
    counts = {key: len(state[key]) for key in COLLECTIONS}
    for collection in COLLECTIONS:
        for row in state[collection]:
            base = copy.deepcopy(row)
            body = base.pop('text', '') if collection == 'docs' else ''
            chunks = [(0, '')] if not body else [(i, body[i:i+1600]) for i in range(0, len(body), 1400)]
            for offset, chunk in chunks:
                record = {**base, **({'text': chunk} if collection == 'docs' else {})}
                search_text = json.dumps(record, ensure_ascii=False)
                candidates.append({'source': collection+':'+row['id'], 'record': record,
                                   'offset': offset, 'total': len(body), 'tf': Counter(tokens(search_text))})
    df = Counter(term for c in candidates for term in c['tf'])
    avg = sum(sum(c['tf'].values()) for c in candidates) / max(1, len(candidates))
    for c in candidates:
        length = sum(c['tf'].values())
        score = sum(math.log(1+(len(candidates)-df[t]+.5)/(df[t]+.5)) *
                    (c['tf'][t]*2.2)/(c['tf'][t]+1.2*(.25+.75*length/max(1,avg)))
                    for t in terms if c['tf'][t])
        if c['record']['id'].casefold() in query.casefold(): score += 100
        c['score'] = score
    # Keep best document excerpt per record; prefer relevant records and pinned preferences.
    ranked = sorted(candidates, key=lambda c: (-c['score'], c['source'], c['offset']))
    anchors = {c['record']['id'] for c in ranked[:12] if c['score'] > 0}
    links = {'projectId','clientId','orderId','assigneeId','ownerId','productId','purchaseId'}
    wanted = set(anchors)
    for c in ranked:
        if c['record']['id'] in anchors:
            wanted.update(c['record'][k] for k in links if c['record'].get(k))
    selected, seen = [], set()
    # A limited set of preferences is always available, other memory must match the query.
    pinned = [c for c in ranked if c['source'].startswith('memories:') and c['record'].get('type') == 'Предпочтение'][:8]
    related = [c for c in ranked if c['record']['id'] in wanted or any(c['record'].get(k) in anchors for k in links)]
    pool = pinned + ranked[:20] + related + ranked
    for c in pool:
        if c['source'] in seen: continue
        if not c['score'] and c not in pinned and c not in related: continue
        item = {'source':c['source'], 'record':c['record'], 'matched':c['score']>0}
        if c['source'].startswith('docs:') and c['total'] > len(c['record'].get('text','')):
            item['record']['excerpt'] = True
            item['record']['excerptStart'] = c['offset']
        proposed = selected + [item]
        if len(json.dumps(proposed, ensure_ascii=False)) > budget or len(selected) >= 80: continue
        selected = proposed
        seen.add(c['source'])
    return {'today':today(), 'counts':counts, 'records':selected,
            'truncated':len(selected)<sum(counts.values()) or any(r['record'].get('excerpt') for r in selected),
            'retrieval':{'method':'lexical-bm25-chunks', 'followup':followup, 'selected':len(selected)},
            'metrics':metrics(state)}


def metrics(state, day=None):
    day = day or today()
    active = [t for t in state['tasks'] if t['status'] != 'Выполнена']
    late = [t for t in active if t.get('dueDate') and t['dueDate'] < day]
    due_today = [t for t in active if t.get('dueDate') == day]
    ledger = {e['id']:e for e in state['ledger']}
    sums = {'income':0, 'expense':0, 'refund':0}
    paid = Counter()
    for e in ledger.values():
        source = ledger[e['reversalOf']] if e['kind'] == 'reversal' else e
        amount = number(e['amount']) * (-1 if e['kind'] == 'reversal' else 1)
        sums[source['kind']] += amount
        if source['kind'] in ('income','refund'):
            paid[e.get('orderId','')] += amount * (1 if source['kind']=='income' else -1)
    debt = overdue = unknown = 0
    for o in state['orders']:
        if o['status'] == 'Отменён': continue
        if not o.get('amount'): unknown += 1; continue
        remaining = max(0, number(o['amount'])-paid[o['id']])
        debt += remaining
        if o.get('paymentDueDate') and o['paymentDueDate'] < day: overdue += remaining
    levels = Counter()
    for movement in state['stock']:
        levels[movement['productId']] += number(movement['quantity'],3)*(1 if movement['kind']=='in' else -1)
    low = [p['id'] for p in state['products'] if levels[p['id']] < number(p.get('minStock','0'),3)]
    return {'date':day, 'basis':'complete-workspace-records', 'tasks':{'active':len(active),'overdue':len(late),'today':len(due_today)},
            'finance':{**sums,'balance':sums['income']-sums['refund']-sums['expense'],
                       'receivable':debt,'overdue':overdue,'unpricedOrders':unknown,'unit':'kopecks'},
            'warehouse':{'belowMinimum':len(low),'unit':'thousandths'},
            'references':{'overdueTasks':['tasks:'+t['id'] for t in late[:12]], 'lowStock':['products:'+p for p in low[:12]]}}


def money(value):
    sign = '-' if value < 0 else ''
    value = abs(value)
    return sign+format(value//100, ',').replace(',', ' ')+f',{value%100:02d} ₽'


def builtin(state, message, context):
    q = message.strip().casefold().rstrip('?!.,')
    m = context['metrics']
    if q in ('финансовый обзор','финансовая сводка'):
        f = m['finance']
        lines = ['Финансовая сводка по всем введённым операциям:',
                 'Поступления: '+money(f['income']), 'Возвраты: '+money(f['refund']),
                 'Расходы: '+money(f['expense']), 'Денежный результат: '+money(f['balance']),
                 'Осталось получить: '+money(f['receivable']), 'Просрочено по дате оплаты: '+money(f['overdue']),
                 'Заказов без стоимости: '+str(f['unpricedOrders']),
                 'Учтены исправления операций. Это управленческие данные, не банковская выписка и не бухгалтерская прибыль.',
                 'Итоги рассчитаны по всем записям; ниже приведены до 12 примеров источников.']
        sources = ['ledger:'+e['id'] for e in state['ledger'][:6]]+['orders:'+o['id'] for o in state['orders'][:6]]
    elif q in ('рабочий обзор','план на сегодня','какие у меня задачи'):
        t = m['tasks']
        rows = sorted((r for r in state['tasks'] if r['status']!='Выполнена'),key=lambda r:(r.get('dueDate') or '9999',r['title']))
        lines = [f"Задачи на {m['date']} (Москва): активных {t['active']}, просроченных {t['overdue']}, на сегодня {t['today']}."]
        if q == 'план на сегодня': rows = [r for r in rows if r.get('dueDate') and r['dueDate']<=m['date']]
        lines += [r['title']+' — '+r.get('dueDate','без срока') for r in rows[:12]]
        if not rows: lines.append('Подходящих задач нет.')
        elif len(rows)>12: lines.append('Показаны первые 12 из '+str(len(rows))+'.')
        lines.append('Это список существующих задач; сроки и записи не изменены.')
        sources = ['tasks:'+r['id'] for r in rows[:12]]
    elif q in ('складской обзор','что заканчивается на складе'):
        sources = m['references']['lowStock'][:12]
        by_id = {p['id']:p for p in state['products']}
        lines = ['Товаров ниже минимального остатка: '+str(m['warehouse']['belowMinimum'])]
        lines += [by_id[s.split(':',1)[1]]['name'] for s in sources]
        if m['warehouse']['belowMinimum']>12: lines.append('Показаны первые 12 товаров.')
        lines.append('Расчёт по всем складским движениям. Данные не изменены.')
    elif q == 'что ты помнишь':
        rows = state['memories'][-12:]
        sources = ['memories:'+r['id'] for r in rows]
        lines = ['Сохранённых записей памяти: '+str(len(state['memories']))] + [r['text'] for r in rows]
        if len(state['memories'])>12: lines.append('Показаны последние 12.')
    elif q.startswith('найди ') and len(q)>6:
        rows = [r for r in context['records'] if r['matched']][:8]
        sources = [r['source'] for r in rows]
        lines = ['Найденные записи (лексический поиск):']
        lines += [(r['record'].get('title') or r['record'].get('name') or r['record'].get('text',''))[:300] for r in rows]
        if not rows: lines.append('Совпадений не найдено. Попробуйте название, ID или другие слова.')
    else: return None
    return {'reply':'\n'.join(lines), 'actions':[], 'sources':sources}


def ground_actions(actions, context, message):
    shown = {r['source'] for r in context['records']}
    projects = {r['record'].get('name','').casefold() for r in context['records'] if r['source'].startswith('projects:')}
    for action in actions:
        kind = action.get('kind','') if isinstance(action,dict) else ''
        if kind.startswith('memory.') and not re.search(r'\b(запомни|запомнить|забудь|забыть)\b|(?:сохрани|измени|удали|обнови).{0,40}памят',message.casefold()):
            raise Problem('Изменение памяти требует прямой просьбы в текущем сообщении.',502)
        collection = 'tasks' if kind=='task.update' else 'memories' if kind in ('memory.update','memory.delete') else None
        if collection and collection+':'+str(action.get('id')) not in shown:
            raise Problem('AI предложил изменить запись, которой не было в его контексте. Уточните запрос.',502)
        if action.get('projectId') and 'projects:'+action['projectId'] not in shown:
            raise Problem('Проект отсутствует в контексте AI.',502)
        if action.get('projectName') and action['projectName'].casefold() not in projects:
            raise Problem('Название проекта отсутствует в контексте AI.',502)
        if kind=='project.create': projects.add(str(action.get('title','')).casefold())
