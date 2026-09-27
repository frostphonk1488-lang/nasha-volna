/* Deterministic project summaries: every claim is derived from stored records. */
(function(root){
'use strict';
const normalize=v=>String(v||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[«»"“”]/g,'').trim();
function today(now=new Date()){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');
}
function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function inspect(data,now=new Date(),projectId=null){
  const date=today(now);
  const tasks=(data.tasks||[]).filter(t=>projectId===null||t.projectId===projectId);
  const active=tasks.filter(t=>t.status!=='Выполнена');
  const overdue=active.filter(t=>validDate(t.dueDate)&&t.dueDate<date);
  const dueToday=active.filter(t=>t.dueDate===date);
  const unscheduled=active.filter(t=>!validDate(t.dueDate));
  const work=active.filter(t=>t.status==='В работе');
  const done=tasks.filter(t=>t.status==='Выполнена');
  function rank(t){return overdue.includes(t)?0:dueToday.includes(t)?1:t.status==='В работе'?2:validDate(t.dueDate)?3:4;}
  const ordered=[...active].sort((a,b)=>rank(a)-rank(b)||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))||String(a.title).localeCompare(String(b.title),'ru'));
  return {date,tasks,active,done,overdue,dueToday,unscheduled,work,ordered,
    unlinked:active.filter(t=>!(data.projects||[]).some(p=>p.id===t.projectId))};
}
function reason(task,date){
  if(validDate(task.dueDate)&&task.dueDate<date)return 'просрочена с '+task.dueDate;
  if(task.dueDate===date)return 'срок сегодня';
  if(task.status==='В работе')return 'уже в работе';
  return validDate(task.dueDate)?'срок '+task.dueDate:'срок не задан';
}
function validateTask(value,data,editingId=null){
  const title=String(value.title||'').trim();
  if(!title||title.length>300)throw Error('Название должно содержать от 1 до 300 символов.');
  if(!['Новая','В работе','Выполнена'].includes(value.status))throw Error('Выберите статус задачи.');
  if(value.dueDate&&!validDate(value.dueDate))throw Error('Укажите существующую дату.');
  if(value.projectId&&!data.projects.some(p=>p.id===value.projectId))throw Error('Проект не найден.');
  if(value.status!=='Выполнена'&&data.tasks.some(t=>t.id!==editingId&&t.status!=='Выполнена'&&normalize(t.title)===normalize(title)))throw Error('Активная задача с таким названием уже существует.');
  return {title,status:value.status,...(value.dueDate?{dueDate:value.dueDate}:{}),...(value.projectId?{projectId:value.projectId}:{})};
}
function search(data,query){
  const words=(normalize(query).match(/[\p{L}\p{N}]{2,}/gu)||[]).map(w=>/^[а-я]{5,}$/.test(w)?w.replace(/[аяыиеуо]$/,''):w);
  if(!words.length)return [];
  return (data.docs||[]).map(doc=>{
    const body=String(doc.text||doc.desc||'');
    const score=words.reduce((s,w)=>s+(normalize(doc.name).includes(w)?3:0)+(normalize(body).includes(w)?1:0),0);
    const position=Math.min(...words.map(w=>normalize(body).indexOf(w)).filter(i=>i>=0));
    const start=Number.isFinite(position)?Math.max(0,position-80):0;
    return {id:doc.id,name:doc.name,score,snippet:(start?'…':'')+body.slice(start,start+400)+(body.length>start+400?'…':'')};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
}
function answer(text,data,now=new Date()){
  const q=normalize(text).replace(/[?!.]+$/,'');
  const summary=inspect(data,now);
  const line=t=>'«'+t.title+'» — '+reason(t,summary.date)+' [tasks:'+t.id+']';
  if(/^(план на сегодня|что делать сегодня|что у меня на сегодня|составь план на сегодня)$/.test(q)){
    if(!summary.active.length)return 'Активных задач нет. План пока не из чего составить.';
    return 'Предложение на '+summary.date+' (Москва):\n'+summary.ordered.slice(0,5).map((t,i)=>(i+1)+'. '+line(t)).join('\n')+'\n\nПорядок: просрочки → срок сегодня → уже в работе → ближайшие сроки → без срока. Длительность задач неизвестна: это очередь, не обещание успеть всё за день. Данные не изменены.';
  }
  if(/^(покажи просроченные задачи|какие задачи просрочены|просроченные задачи)$/.test(q))return summary.overdue.length?'Просроченные задачи:\n'+summary.overdue.map(line).join('\n'):'Просроченных задач с указанным сроком нет. Без срока: '+summary.unscheduled.length+'.';
  const project=q.match(/^(?:обзор проекта|что мешает проекту|проверь проект)\s+(.+)$/);
  if(project){
    const matches=(data.projects||[]).filter(p=>normalize(p.name)===project[1]||p.id===project[1]);
    if(matches.length!==1)return matches.length?'Несколько проектов с таким названием. Укажите id проекта.':'Не нашёл этот проект. Проверьте название в разделе «Проекты».';
    const p=matches[0],s=inspect(data,now,p.id);
    return 'Проект «'+p.name+'» [projects:'+p.id+']\nЗадач: '+s.tasks.length+'; выполнено: '+s.done.length+'; в работе: '+s.work.length+'.\nПросрочено: '+s.overdue.length+'; без корректного срока: '+s.unscheduled.length+'.'+(s.tasks.length?'\n'+s.ordered.slice(0,5).map(line).join('\n'):'\nЗадачи ещё не привязаны к проекту.')+'\n\nЭто проверка записанных сроков и статусов. Причины задержек и зависимости задач пока не учитываются.';
  }
  const docs=q.match(/^(?:найди|поищи) в документах\s*:?\s*(.+)$/);
  if(docs){const found=search(data,docs[1]);return found.length?'Совпадения в текстах документов:\n'+found.map(x=>'«'+x.name+'» [docs:'+x.id+']\n'+x.snippet).join('\n\n'):'В сохранённых текстах документов совпадений нет. Поиск работает по словам запроса.';}
  return null;
}
const api={today,validDate,inspect,reason,validateTask,search,answer};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NVWorkspace=api;
})(typeof globalThis!=='undefined'?globalThis:this);
