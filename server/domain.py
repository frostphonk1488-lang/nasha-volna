"""Validated workspace operations. All mutations operate on a transaction copy."""
import copy
from datetime import date, datetime, timezone
import re
import uuid

COLLECTIONS = ('tasks', 'memories', 'projects', 'clients', 'employees', 'docs')
KINDS = ('task.create', 'task.update', 'memory.save', 'memory.update', 'memory.delete', 'project.create', 'client.create', 'document.create')
FIELDS = ('kind', 'id', 'title', 'text', 'status', 'dueDate', 'projectId', 'projectName')

class Problem(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def text(value, name, limit=2000, optional=False):
    if optional and value is None:
        return None
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise Problem(f'Некорректное поле {name}.')
    return value.strip()


def empty_state():
    return {**{key: [] for key in COLLECTIONS}, 'messages': []}


def validate_import(raw):
    if not isinstance(raw, dict):
        raise Problem('Ожидается объект данных.')
    state = empty_state()
    fields = {'tasks': ('title', 'status', 'dueDate', 'projectId'), 'memories': ('type', 'text'),
              'projects': ('name', 'desc'), 'clients': ('name', 'contact'),
              'employees': ('name', 'role'), 'docs': ('name', 'desc', 'text', 'projectId')}
    required = {'tasks': 'title', 'memories': 'text', 'projects': 'name', 'clients': 'name', 'employees': 'name', 'docs': 'name'}
    for key in COLLECTIONS:
        rows = raw.get(key, [])
        if not isinstance(rows, list) or len(rows) > 500:
            raise Problem('Не более 500 записей в каждом разделе.')
        seen = set()
        for row in rows:
            if not isinstance(row, dict):
                raise Problem('Некорректная запись.')
            ident = text(row.get('id'), 'id', 100)
            if not re.fullmatch(r'[A-Za-z0-9_-]+', ident) or ident in seen:
                raise Problem('Некорректный или повторяющийся id.')
            seen.add(ident)
            result = {'id': ident}
            for field in fields[key]:
                value = row.get(field)
                if value is not None:
                    if not isinstance(value, str) or len(value) > (20000 if key == 'docs' and field == 'text' else 2000):
                        raise Problem('Слишком длинное или некорректное поле.')
                    result[field] = value
            text(result.get(required[key]), required[key])
            if key == 'tasks':
                result.setdefault('status', 'Новая')
                check_status(result['status'])
                check_date(result.get('dueDate'))
            state[key].append(result)
    project_ids = {p['id'] for p in state['projects']}
    for row in state['tasks'] + state['docs']:
        if row.get('projectId') and row['projectId'] not in project_ids:
            raise Problem('Не найден проект связанной записи.')
    # Import records only: local transcripts never acquire trusted assistant roles.
    return state


def check_status(status):
    if status not in ('Новая', 'В работе', 'Выполнена'):
        raise Problem('Неизвестный статус задачи.')


def check_date(value):
    if value is None:
        return
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise Problem('Срок должен быть в формате ГГГГ-ММ-ДД.')
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise Problem('Несуществующая дата.') from exc


def apply_actions(state, actions):
    if not isinstance(actions, list) or not 1 <= len(actions) <= 20:
        raise Problem('План должен содержать от 1 до 20 действий.')
    state = copy.deepcopy(state)
    log = []
    for action in actions:
        if not isinstance(action, dict) or set(action) - set(FIELDS):
            raise Problem('Некорректное действие.')
        kind = action.get('kind')
        if kind not in KINDS:
            raise Problem('Неизвестный инструмент.')
        for field in FIELDS[1:]:
            if action.get(field) is not None:
                text(action[field], field, 20000 if field == 'text' else 2000)
        allowed = {
            'task.create': {'title','dueDate','projectId','projectName'},
            'task.update': {'id','title','status','dueDate','projectId','projectName'},
            'memory.save': {'text'}, 'memory.update': {'id','text'}, 'memory.delete': {'id'},
            'project.create': {'title','text'}, 'client.create': {'title','text'},
            'document.create': {'title','text','projectId','projectName'},
        }[kind]
        if any(action.get(k) is not None for k in FIELDS[1:] if k not in allowed):
            raise Problem('Инструмент получил неподдерживаемое поле.')
        def find(collection):
            ident = text(action.get('id'), 'id', 100)
            record = next((x for x in state[collection] if x['id'] == ident), None)
            if record is None:
                raise Problem('Запись не найдена. Обновите план.', 409)
            return record
        def project():
            ident, name = action.get('projectId'), action.get('projectName')
            if ident and name:
                raise Problem('Укажите id или название проекта, не оба.')
            if not ident and not name:
                return None
            matches = [p for p in state['projects'] if (p['id'] == ident if ident else p['name'].casefold() == name.casefold())]
            if len(matches) != 1:
                raise Problem('Проект не найден или название неоднозначно.')
            return matches[0]['id']
        if kind == 'task.create':
            title = text(action.get('title'), 'title', 300)
            if any(t['title'].casefold() == title.casefold() and t['status'] != 'Выполнена' for t in state['tasks']):
                raise Problem('Такая активная задача уже существует.', 409)
            check_date(action.get('dueDate'))
            record = {'id': 'task-'+uuid.uuid4().hex, 'title': title, 'status': 'Новая'}
            if action.get('dueDate'): record['dueDate'] = action['dueDate']
            if (pid := project()): record['projectId'] = pid
            state['tasks'].insert(0, record)
        elif kind == 'task.update':
            record = find('tasks')
            if not any(action.get(k) is not None for k in ('title','status','dueDate','projectId','projectName')):
                raise Problem('Нет изменений задачи.')
            if action.get('title'):
                title = text(action['title'], 'title', 300)
                if any(t['id'] != record['id'] and t['title'].casefold() == title.casefold() and t['status'] != 'Выполнена' for t in state['tasks']):
                    raise Problem('Название совпадает с другой активной задачей.', 409)
                record['title'] = title
            if action.get('status'): check_status(action['status']); record['status'] = action['status']
            if action.get('dueDate'): check_date(action['dueDate']); record['dueDate'] = action['dueDate']
            if (pid := project()): record['projectId'] = pid
        elif kind.startswith('memory.'):
            if kind == 'memory.save':
                record = {'id':'mem-'+uuid.uuid4().hex, 'type':'Факт', 'text':text(action.get('text'),'text')}
                state['memories'].append(record)
            else:
                record = find('memories')
                if kind == 'memory.delete': state['memories'].remove(record)
                else: record['text'] = text(action.get('text'),'text')
        else:
            collection = {'project.create':'projects','client.create':'clients','document.create':'docs'}[kind]
            title = text(action.get('title'),'title',300)
            if any(x['name'].casefold() == title.casefold() for x in state[collection]):
                raise Problem('Запись с таким названием уже есть.',409)
            record = {'id':collection+'-'+uuid.uuid4().hex,'name':title}
            record[{'projects':'desc','clients':'contact','docs':'text'}[collection]] = action.get('text') or ''
            if collection == 'docs' and (pid := project()): record['projectId'] = pid
            state[collection].append(record)
        record['updatedAt'] = datetime.now(timezone.utc).isoformat()
        log.append({'kind':kind, 'id':record['id'], 'label':record.get('title') or record.get('name') or record.get('text')})
    if any(len(state[k]) > 500 for k in COLLECTIONS):
        raise Problem('Достигнут лимит MVP: 500 записей на раздел.')
    return state, log
