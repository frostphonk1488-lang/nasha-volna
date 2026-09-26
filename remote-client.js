/* Authenticated API client. The model API key is never accepted by the browser. */
(function(root){
'use strict';
let connection=null,view=null,pendingRequest=null;
function endpoint(value){
  const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/') throw Error('Укажите только адрес сервера, без пути, пароля и параметров.');
  if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw Error('Для подключения нужен HTTPS.');
  return url.origin;
}
async function call(config,path,body){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),55000);
  try{
    const response=await fetch(config.url+path,{method:body?'POST':'GET',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,
      headers:{Authorization:'Bearer '+config.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    let data;
    try{data=await response.json();}catch(e){throw Error('Сервер вернул неподдерживаемый ответ.');}
    if(!response.ok){const e=Error(data.error||'Ошибка сервера.');e.status=response.status;throw e;}
    if(!data.state||!Number.isInteger(data.revision)||!Array.isArray(data.plans)||!['messages','tasks','memories','projects','clients','employees','docs'].every(k=>Array.isArray(data.state[k]))) throw Error('Неподдерживаемый формат данных сервера.');
    return data;
  }catch(e){
    if(e.name==='AbortError'||e instanceof TypeError) throw Error('Нет ответа сервера. Результат запроса пока неизвестен: нажмите «Обновить» перед следующим действием.');
    throw e;
  }finally{clearTimeout(timer);}
}
const api={
  get connected(){return Boolean(connection);},get view(){return view;},
  async connect(url,token){
    if(typeof token!=='string'||token.trim().length<32)throw Error('Нужен ключ рабочего пространства (от 32 символов), выданный администратором сервера.');
    if(token.trim().startsWith('sk-'))throw Error('Здесь нужен ключ рабочего пространства, не API-ключ модели.');
    const config={url:endpoint(url),token:token.trim()};
    const result=await call(config,'/api/state');connection=config;view=result;pendingRequest=null;return result;
  },
  disconnect(){connection=null;view=null;pendingRequest=null;},
  async refresh(){if(!connection)throw Error('Сервер не подключён.');view=await call(connection,'/api/state');pendingRequest=null;return view;},
  async post(path,body){
    if(!connection)throw Error('Сервер не подключён.');
    const signature=JSON.stringify({path,body,revision:view.revision});
    if(!pendingRequest||pendingRequest.signature!==signature) pendingRequest={signature,body:{...body,revision:view.revision,requestId:crypto.randomUUID()}};
    const result=await call(connection,path,pendingRequest.body);view=result;pendingRequest=null;return result;
  }
};
root.NVRemote=api;
})(typeof globalThis!=='undefined'?globalThis:this);
