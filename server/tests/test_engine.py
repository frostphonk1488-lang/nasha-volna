import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from server.domain import empty_state, Problem
from server.engine import retrieve, metrics, builtin, ground_actions, money
from server.provider import OllamaProvider, OpenAIProvider, configured_provider
from server.service import Service


class EngineTests(unittest.TestCase):
    def test_document_tail_and_offsets(self):
        state=empty_state()
        state['docs']=[{'id':'contract','name':'Договор','text':'пустой текст '*1300+'Гарантия — 31 декабря.'}]
        result=retrieve(state,'Когда заканчивается гарантия?')
        doc=result['records'][0]['record']
        self.assertIn('31 декабря',doc['text'])
        self.assertTrue(doc['excerpt']);self.assertGreater(doc['excerptStart'],6000)

    def test_followup_and_current_workspace_only(self):
        state=empty_state();state['clients']=[{'id':'c1','name':'Вектор','contact':'Контакт'}]
        history=[{'role':'user','text':'Расскажи про Вектор'}]
        self.assertEqual(retrieve(state,'А его контакт?',history)['records'][0]['source'],'clients:c1')
        self.assertEqual(retrieve(empty_state(),'А его контакт?',history)['records'],[])

    def test_budget_and_no_irrelevant_search(self):
        state=empty_state()
        state['memories']=[{'id':'m','type':'Предпочтение','text':'Отвечай кратко'}]
        state['docs']=[{'id':str(i),'name':'Договор '+str(i),'text':'Гарантия '*1500} for i in range(100)]
        context=retrieve(state,'Гарантия',budget=3000)
        self.assertLessEqual(len(json.dumps(context['records'],ensure_ascii=False)),3000)
        self.assertTrue(context['truncated'])
        context=retrieve(state,'найди zzzzz')
        self.assertEqual(builtin(state,'найди zzzzz',context)['sources'],[])

    def test_related_order_client_and_project(self):
        state=empty_state()
        state['clients']=[{'id':'c','name':'Покупатель'}]
        state['projects']=[{'id':'p','name':'Проект'}]
        state['orders']=[{'id':'o','name':'Северный заказ','clientId':'c','projectId':'p','status':'Новый'}]
        sources={r['source'] for r in retrieve(state,'Северный заказ')['records']}
        self.assertTrue({'orders:o','clients:c','projects:p'}<=sources)

    def test_money_reversal_and_distinct_payment_deadline(self):
        state=empty_state()
        state['orders']=[{'id':'o','name':'Заказ','amount':'100.10','status':'Новый','dueDate':'2020-01-01','paymentDueDate':'2030-01-01'},
                         {'id':'unknown','name':'Без цены','status':'Новый'},
                         {'id':'cancel','name':'Отменён','amount':'999','status':'Отменён'}]
        state['ledger']=[{'id':'a','kind':'income','amount':'30.10','orderId':'o'},
                         {'id':'b','kind':'refund','amount':'0.10','orderId':'o'},
                         {'id':'c','kind':'reversal','amount':'0.10','orderId':'o','reversalOf':'b'},
                         {'id':'d','kind':'expense','amount':'1.01'}]
        f=metrics(state,'2026-09-30')['finance']
        self.assertEqual(f['receivable'],7000);self.assertEqual(f['overdue'],0)
        self.assertEqual(f['balance'],2909);self.assertEqual(f['unpricedOrders'],1)
        self.assertEqual(money(-123456789),'-1 234 567,89 ₽')

    def test_stock_and_tasks(self):
        state=empty_state()
        state['products']=[{'id':'p','name':'Товар','minStock':'0.101'}]
        state['stock']=[{'productId':'p','kind':'in','quantity':'0.300'},{'productId':'p','kind':'out','quantity':'0.200'}]
        state['tasks']=[{'id':'t','title':'Задача','status':'Новая','dueDate':'2026-09-29'},
                        {'id':'done','title':'Готово','status':'Выполнена','dueDate':'2020-01-01'}]
        m=metrics(state,'2026-09-30')
        self.assertEqual(m['warehouse']['belowMinimum'],1);self.assertEqual(m['tasks']['overdue'],1)

    def test_grounding_and_explicit_memory(self):
        context=retrieve(empty_state(),'Привет')
        for action in ({'kind':'task.update','id':'unseen','status':'Выполнена'},
                       {'kind':'memory.save','text':'Не запрошено'},
                       {'kind':'task.create','title':'Test','projectId':'unseen'}):
            with self.assertRaises(Problem):ground_actions([action],context,'Привет')
        ground_actions([{'kind':'memory.save','text':'Факт'}],context,'Запомни это')
        ground_actions([{'kind':'project.create','title':'Запуск'},{'kind':'task.create','title':'Шаг','projectName':'Запуск'}],context,'Создай проект')

    def test_reports_without_model_replay_and_audit(self):
        with tempfile.TemporaryDirectory() as tmp:
            service=Service(Path(tmp)/'db',OpenAIProvider(key='',model=''))
            payload={'revision':0,'requestId':'report','message':'Финансовый обзор'}
            first=service.dispatch('one','/api/chat',payload)
            again=service.dispatch('one','/api/chat',payload)
            self.assertEqual(first,again);self.assertEqual(first['revision'],1)
            self.assertFalse(first['modelReady']);self.assertTrue(first['ai']['reportsWithoutModel'])
            self.assertIn('0,00 ₽',first['state']['messages'][-1]['text'])
            self.assertEqual(len(service.audit('one')),1)
            self.assertEqual(service.state('two')['state']['messages'],[])

    def test_model_cannot_modify_unseen_existing_record(self):
        class Fake:
            configured=True
            def respond(self,*args):return {'reply':'План','actions':[{'kind':'task.update','id':'t','status':'Выполнена'}],'sources':[]}
        with tempfile.TemporaryDirectory() as tmp:
            service=Service(Path(tmp)/'db',Fake())
            service.dispatch('w','/api/import',{'revision':0,'requestId':'import','data':{'tasks':[{'id':'t','title':'Секретная задача','status':'Новая'}]}})
            before=service.state('w')
            with self.assertRaises(Problem):service.dispatch('w','/api/chat',{'revision':1,'requestId':'chat','message':'Привет'})
            self.assertEqual(service.state('w'),before)


class LocalProviderTests(unittest.TestCase):
    def test_schema_and_no_cloud_credentials(self):
        captured=[]
        class Response:
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def read(self,n):return json.dumps({'done':True,'message':{'content':json.dumps({'reply':'Привет','actions':[],'sources':[]})}}).encode()
        class Opener:
            def open(self,req,timeout):captured.append(req);return Response()
        with patch('server.provider.build_opener',return_value=Opener()):
            result=OllamaProvider(model='local-test').respond([{'role':'user','content':'Привет'}],{})
        self.assertEqual(result['reply'],'Привет')
        req=captured[0];payload=json.loads(req.data)
        self.assertEqual(req.full_url,'http://127.0.0.1:11434/api/chat')
        self.assertFalse(payload['stream']);self.assertFalse(payload['format']['additionalProperties'])
        self.assertIsNone(req.get_header('Authorization'))

    def test_non_loopback_and_unknown_provider_refused(self):
        for url in ('https://example.com','http://192.168.1.1:11434','http://localhost:11434/api','http://user@localhost:11434'):
            with self.assertRaises(Problem):OllamaProvider(model='test',url=url)
        with patch.dict('os.environ',{'NV_AI_PROVIDER':'typo'}), self.assertRaises(Problem):configured_provider()

    def test_bad_local_response_never_falls_back(self):
        class Response:
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def read(self,n):return b'{"done":false}'
        class Opener:
            def open(self,*args,**kwargs):return Response()
        with patch('server.provider.build_opener',return_value=Opener()), self.assertRaises(Problem):
            OllamaProvider(model='test').respond([],{})
