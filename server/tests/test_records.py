import copy
from pathlib import Path
import tempfile
import unittest
from server.domain import Problem
from server.service import Service

class OfflineProvider:
    configured=False

class RecordTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.service=Service(Path(self.tmp.name)/'records.sqlite3',OfflineProvider());self.serial=0
    def post(self,operations,role='owner',actor='alex'):
        self.serial+=1
        return self.service.dispatch('company','/api/records',{'requestId':str(self.serial),'revision':self.service.state('company')['revision'],'operations':operations},actor,role)
    def op(self,c,row): return {'collection':c,'id':row['id'],'record':row}
    def setup_order(self):
        self.post([self.op('clients',{'id':'c','name':'Клиент'}),self.op('orders',{'id':'o','name':'Заказ','clientId':'c','status':'Новый','amount':'100.00','paymentDueDate':'2026-09-01'})])
    def entry(self,ident='e',**extra):
        return {'id':ident,'kind':'income','amount':'10.01','date':'2026-09-01','orderId':'o','category':'Оплата заказа','note':'Оплата',**extra}
    def test_order_finance_restart_and_audit(self):
        self.setup_order();result=self.post([self.op('ledger',self.entry())])
        self.assertEqual(result['state']['ledger'][0]['amount'],'10.01')
        fresh=Service(self.service.path,OfflineProvider());self.assertEqual(fresh.state('company')['state']['ledger'],result['state']['ledger'])
        event=fresh.audit('company')[0];self.assertEqual(event['detail']['actor'],'alex');self.assertIsNone(event['detail']['changes'][0]['before'])
        self.assertEqual(fresh.state('other')['state']['orders'],[])
    def test_ledger_is_immutable_and_reversal_single(self):
        self.setup_order();self.post([self.op('ledger',self.entry())])
        for op in [self.op('ledger',self.entry(amount='11.00')),{'collection':'ledger','id':'e','delete':True}]:
            with self.assertRaises(Problem):self.post([op])
        self.post([self.op('ledger',self.entry('r',kind='reversal',reversalOf='e'))])
        with self.assertRaises(Problem):self.post([self.op('ledger',self.entry('r2',kind='reversal',reversalOf='e'))])
    def test_atomic_foreign_link_failure(self):
        before=self.service.state('company')
        with self.assertRaises(Problem):self.post([self.op('clients',{'id':'c','name':'Клиент'}),self.op('orders',{'id':'o','name':'Ошибка','clientId':'missing','status':'Новый'})])
        self.assertEqual(self.service.state('company'),before);self.assertEqual(self.service.audit('company'),[])
    def test_roles_cannot_bypass_api(self):
        for role in ('viewer','member','accountant'):
            with self.assertRaises(Problem) as e:self.post([self.op('clients',{'id':'c','name':'Клиент'})],role)
            self.assertEqual(e.exception.status,403)
        self.setup_order()
        self.post([self.op('ledger',self.entry())],role='accountant',actor='finance')
        with self.assertRaises(Problem):self.post([self.op('ledger',self.entry('e2'))],role='manager')
    def test_stale_revision_and_same_request(self):
        payload={'revision':0,'requestId':'repeat','operations':[self.op('clients',{'id':'c','name':'Клиент'})]}
        first=self.service.dispatch('company','/api/records',payload)
        self.assertEqual(first,self.service.dispatch('company','/api/records',payload))
        with self.assertRaises(Problem):self.service.dispatch('company','/api/records',{**payload,'requestId':'new'})
        self.assertEqual(len(self.service.audit('company')),1)
    def test_atomic_purchase_receipt_and_stock_floor(self):
        product={'id':'p','name':'Товар','sku':'A','unit':'шт','minStock':'2.000'}
        purchase={'id':'buy','productId':'p','quantity':'3.500','supplier':'Поставщик','status':'Заказан'}
        self.post([self.op('products',product),self.op('purchases',purchase)])
        move={'id':'m','productId':'p','kind':'in','quantity':'3.500','purchaseId':'buy','note':'Приёмка'}
        result=self.post([self.op('purchases',{**purchase,'status':'Принят'}),self.op('stock',move)])
        with self.assertRaises(Problem):self.post([self.op('stock',{**move,'id':'m2'})])
        with self.assertRaises(Problem):self.post([self.op('stock',{'id':'out','productId':'p','kind':'out','quantity':'4','note':'Списание'})])
        with self.assertRaises(Problem):self.post([self.op('products',{**product,'unit':'кг'})])
        self.assertEqual(self.service.state('company')['state'],result['state'])
    def test_full_import_preserves_business_links(self):
        self.setup_order();self.post([self.op('ledger',self.entry())]);raw=self.service.state('company')['state']
        result=self.service.dispatch('empty','/api/import',{'revision':0,'requestId':'import','data':raw})
        self.assertEqual(result['state']['orders'][0]['id'],'o');self.assertEqual(result['state']['ledger'][0]['orderId'],'o')
    def test_linked_order_cannot_be_deleted(self):
        self.setup_order();self.post([self.op('ledger',self.entry())]);before=self.service.state('company')
        with self.assertRaises(Problem):self.post([{'collection':'orders','id':'o','delete':True}])
        self.assertEqual(self.service.state('company'),before)
