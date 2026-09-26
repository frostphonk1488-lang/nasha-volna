const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const initial=()=>({state:Object.fromEntries(['messages','tasks','memories','projects','clients','employees','docs'].map(k=>[k,[]])),revision:0,plans:[],modelReady:true});
function client(responder){
  const calls=[];let next=0;
  const context={URL,AbortController,TypeError,setTimeout,clearTimeout,crypto:{randomUUID:()=>String(++next)},fetch:async(url,options)=>{calls.push({url,options});return responder(url,options,calls.length);}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('remote-client.js','utf8'),context);
  return {api:context.NVRemote,calls};
}
const ok=data=>({ok:true,json:async()=>data});
test('requires HTTPS and rejects model key in browser',async()=>{
  const {api,calls}=client(()=>ok(initial()));
  await assert.rejects(api.connect('http://example.com','x'.repeat(32)),/HTTPS/);
  await assert.rejects(api.connect('https://example.com/path','x'.repeat(32)),/только адрес/);
  await assert.rejects(api.connect('https://example.com','sk-'+ 'x'.repeat(32)),/API-ключ/);
  assert.equal(calls.length,0);
});
test('connect, post revision, refresh and disconnect',async()=>{
  const {api,calls}=client((url,options)=>ok({...initial(),revision:options.method==='POST'?1:0}));
  await api.connect('https://example.com','x'.repeat(32));
  assert.equal(api.connected,true);
  await api.post('/api/chat',{message:'Привет'});
  assert.equal(api.view.revision,1);
  const sent=JSON.parse(calls[1].options.body);
  assert.equal(sent.revision,0);assert.equal(sent.requestId,'1');
  assert.equal(calls[1].options.credentials,'omit');assert.equal(calls[1].options.redirect,'error');
  api.disconnect();assert.equal(api.connected,false);assert.equal(api.view,null);
});
test('uncertain response reuses request ID on exact retry',async()=>{
  const {api,calls}=client((url,options,count)=>{if(count===2)throw new TypeError('network');return ok(initial());});
  await api.connect('https://example.com','x'.repeat(32));
  await assert.rejects(api.post('/api/chat',{message:'Создай задачу'}),/неизвестен/);
  await api.post('/api/chat',{message:'Создай задачу'});
  assert.equal(JSON.parse(calls[1].options.body).requestId,JSON.parse(calls[2].options.body).requestId);
});
test('API errors never activate connection or replace data',async()=>{
  const {api}=client(()=>({ok:false,status:401,json:async()=>({error:'Неверный ключ доступа.'})}));
  await assert.rejects(api.connect('https://example.com','x'.repeat(32)),/Неверный ключ/);
  assert.equal(api.connected,false);assert.equal(api.view,null);
});
