"""SQLite-backed workspace, chat history, action plans and audit trail."""
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import threading
import time
import uuid
from .records import apply_batch, WRITES
from .engine import VERSION, retrieve, builtin, ground_actions
from .domain import COLLECTIONS, Problem, apply_actions, empty_state, text, validate_import


def dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


class Service:
    def __init__(self, path, provider):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.provider = provider
        self.lock = threading.RLock()
        self.rates = {}
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,state TEXT NOT NULL,revision INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,revision INTEGER NOT NULL,
                actions TEXT NOT NULL,status TEXT NOT NULL,created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS requests(workspace TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,
                result TEXT NOT NULL,PRIMARY KEY(workspace,id));
            CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,workspace TEXT NOT NULL,event TEXT NOT NULL,
                detail TEXT NOT NULL,created REAL NOT NULL);
            ''')

    def connect(self):
        db = sqlite3.connect(self.path,timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def _load(self,db,workspace):
        db.execute('INSERT OR IGNORE INTO workspaces VALUES(?,?,0)',(workspace,dumps(empty_state())))
        row = db.execute('SELECT * FROM workspaces WHERE id=?',(workspace,)).fetchone()
        state=json.loads(row['state'])
        for key in COLLECTIONS: state.setdefault(key,[])
        return state, row['revision']

    def _save(self,db,workspace,state,revision):
        state['messages'] = state['messages'][-500:]
        db.execute('UPDATE workspaces SET state=?,revision=? WHERE id=?',(dumps(state),revision,workspace))

    def _view(self,db,workspace):
        state,revision = self._load(db,workspace)
        plans = [dict(row) for row in db.execute("SELECT id,actions FROM plans WHERE workspace=? AND status='pending' AND revision=? AND created>? ORDER BY created",(workspace,revision,time.time()-3600))]
        for plan in plans: plan['actions'] = json.loads(plan['actions'])
        return {'state':state,'revision':revision,'plans':plans,'modelReady':self.provider.configured,
                'ai':{'coreVersion':VERSION,'provider':getattr(self.provider,'name','custom'),
                      'configured':self.provider.configured,'reportsWithoutModel':True}}

    def state(self,workspace):
        with self.lock, self.connect() as db:
            return self._view(db,workspace)

    def audit(self,workspace):
        with self.lock, self.connect() as db:
            return [{'id':row['id'],'event':row['event'],'created':row['created'],'detail':json.loads(row['detail'])} for row in db.execute('SELECT * FROM audit WHERE workspace=? ORDER BY id DESC LIMIT 100',(workspace,))]

    def context(self,state,query):
        return retrieve(state,query,state['messages'],budget=16000 if getattr(self.provider,'name','')=='ollama' else 40000)

    def dispatch(self,workspace,path,payload,actor='owner',role='owner'):
        if role not in WRITES: raise Problem('Нет доступа.',403)
        if path=='/api/import' and role!='owner': raise Problem('Импорт доступен владельцу.',403)
        if path.startswith('/api/plans/') and path.endswith('/confirm') and role!='owner': raise Problem('Применение AI-планов доступно владельцу.',403)
        if path=='/api/chat' and role!='owner': raise Problem('AI пока доступен владельцу пространства.',403)
        if not isinstance(payload,dict): raise Problem('Ожидается JSON-объект.')
        request_id=text(payload.get('requestId'),'requestId',100)
        fingerprint=hashlib.sha256((actor+':'+role+':'+path+dumps(payload)).encode()).hexdigest()
        with self.lock, self.connect() as db:
            prior=db.execute('SELECT * FROM requests WHERE workspace=? AND id=?',(workspace,request_id)).fetchone()
            if prior:
                if prior['fingerprint']!=fingerprint: raise Problem('Идентификатор запроса уже использован.',409)
                return {**json.loads(prior['result']),**self._view(db,workspace)}
            state,revision=self._load(db,workspace)
            if payload.get('revision') != revision: raise Problem('Данные изменились. Нажмите «Обновить» и повторите запрос.',409)
            extra={}
            if path=='/api/import':
                if revision or any(state[k] for k in COLLECTIONS) or state['messages']:
                    raise Problem('Импорт разрешён только в пустое рабочее пространство.',409)
                state=validate_import(payload.get('data'))
                for collection in COLLECTIONS:
                    for row in state[collection]:
                        row.pop('updatedBy',None);row['createdBy']=actor
                db.execute('INSERT INTO audit(workspace,event,detail,created) VALUES(?,?,?,?)',(workspace,'records.imported',dumps({'actor':actor,'requestId':request_id,'counts':{k:len(state[k]) for k in COLLECTIONS}}),time.time()))
                extra['message']='Записи импортированы. Локальная история диалога осталась в браузере.'
            elif path=='/api/records':
                state,changes=apply_batch(state,payload.get('operations'),actor,role)
                db.execute('INSERT INTO audit(workspace,event,detail,created) VALUES(?,?,?,?)',(workspace,'records.changed',dumps({'actor':actor,'role':role,'requestId':request_id,'changes':changes}),time.time()))
                extra['message']='Изменения сохранены на сервере.'
            elif path=='/api/chat':
                message=text(payload.get('message'),'message',6000)
                now=time.monotonic()
                recent=[t for t in self.rates.get(workspace,[]) if now-t<60]
                if len(recent)>=10: raise Problem('Слишком много запросов. Повторите через минуту.',429)
                self.rates[workspace]=recent+[now]
                context=self.context(state,message)
                history=[]
                history_size=0
                for m in reversed(state['messages'][-20:]):
                    content=m['text'][:3000]
                    if history_size+len(content)>8000: break
                    history.insert(0,{'role':m['role'],'content':content})
                    history_size+=len(content)
                history.append({'role':'user','content':message})
                result=builtin(state,message,context)
                local_result=result is not None
                if result is None: result=self.provider.respond(history,context)
                if not isinstance(result,dict) or set(result)!={'reply','actions','sources'}:
                    raise Problem('Модель вернула неподдерживаемый ответ.',502)
                reply=text(result.get('reply'),'reply',12000)
                actions=result['actions']
                if not isinstance(actions,list) or len(actions)>20: raise Problem('Некорректный план модели.',502)
                if actions:
                    ground_actions(actions,context,message)
                    apply_actions(state,actions)  # Dry run: validates the entire plan.
                source_ids={k+':'+r['id'] for k in COLLECTIONS for r in state[k]} if local_result else {r['source'] for r in context['records']}
                if not isinstance(result['sources'],list) or any(not isinstance(s,str) or s not in source_ids for s in result['sources']):
                    raise Problem('Ответ содержит неподтверждённые источники. Попробуйте уточнить вопрос.',502)
                sources=list(dict.fromkeys(result['sources']))
                source_rows={k+':'+r['id']:r for k in COLLECTIONS for r in state[k]}
                if sources:
                    reply+='\n\nИсточники:\n'+'\n'.join(s+' — '+str(source_rows[s].get('title') or source_rows[s].get('name') or source_rows[s].get('text',''))[:180] for s in sources)
                if actions:
                    reply+='\n\nПлан подготовлен. Изменения ещё не применены — проверьте карточку ниже.'
                    ident='plan-'+uuid.uuid4().hex
                    db.execute('INSERT INTO plans VALUES(?,?,?,?,?,?)',(ident,workspace,revision+1,dumps(actions),'pending',time.time()))
                db.execute('INSERT INTO audit(workspace,event,detail,created) VALUES(?,?,?,?)',
                           (workspace,'ai.responded',dumps({'actor':actor,'requestId':request_id,'coreVersion':VERSION,
                            'mode':'report' if local_result else getattr(self.provider,'name','custom'),
                            'retrieved':len(context['records']),'sources':sources,'proposedActions':len(actions)}),time.time()))
                state['messages'] += [{'id':uuid.uuid4().hex,'role':'user','text':message}, {'id':uuid.uuid4().hex,'role':'assistant','text':reply}]
            elif path.startswith('/api/plans/'):
                parts=path.split('/')
                if len(parts)!=5 or parts[4] not in ('confirm','cancel'): raise Problem('Маршрут не найден.',404)
                plan=db.execute('SELECT * FROM plans WHERE id=? AND workspace=?',(parts[3],workspace)).fetchone()
                if not plan: raise Problem('План не найден.',404)
                if plan['status']!='pending': raise Problem('План уже обработан.',409)
                if plan['revision']!=revision or plan['created']<time.time()-3600:
                    raise Problem('План устарел. Запросите новый.',409)
                if parts[4]=='confirm':
                    state,log=apply_actions(state,json.loads(plan['actions']))
                    extra['message']='Выполнено:\n'+'\n'.join(x['kind']+' — '+x['label'] for x in log)
                    db.execute('INSERT INTO audit(workspace,event,detail,created) VALUES(?,?,?,?)',(workspace,'plan.applied',dumps({'actor':actor,'role':role,'plan':plan['id'],'actions':log}),time.time()))
                else: extra['message']='План отменён. Данные не изменены.'
                state['messages'].append({'id':uuid.uuid4().hex,'role':'assistant','text':extra['message']})
                db.execute('UPDATE plans SET status=? WHERE id=?',('applied' if parts[4]=='confirm' else 'cancelled',plan['id']))
            else: raise Problem('Маршрут не найден.',404)
            # Any newer state makes other pending plans stale.
            db.execute("UPDATE plans SET status='stale' WHERE workspace=? AND status='pending' AND revision<>?",(workspace,revision+1))
            self._save(db,workspace,state,revision+1)
            db.execute('INSERT INTO requests VALUES(?,?,?,?)',(workspace,request_id,fingerprint,dumps(extra)))
            return {**extra,**self._view(db,workspace)}
