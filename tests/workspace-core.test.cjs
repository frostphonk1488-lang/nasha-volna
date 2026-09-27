const {test}=require('node:test');const assert=require('node:assert/strict');
const core=require('../workspace-core.js');
const now=new Date('2026-09-27T22:00:00Z');
function fixture(){return {projects:[{id:'p1',name:'Запуск',desc:'Первая версия'}],tasks:[
{id:'late',title:'Договор',status:'Новая',dueDate:'2026-09-27',projectId:'p1'},
{id:'today',title:'Текст',status:'Новая',dueDate:'2026-09-28',projectId:'p1'},
{id:'done',title:'Готовая',status:'Выполнена',dueDate:'2026-09-01',projectId:'p1'},
{id:'work',title:'Макет',status:'В работе'},
{id:'invalid',title:'Проверить',status:'Новая',dueDate:'2026-02-31'}],docs:[{id:'d1',name:'Договор',text:'Срок доставки — 5 октября.'}]};}
test('Moscow date, overdue and completed tasks stay consistent',()=>{
 const s=core.inspect(fixture(),now);assert.equal(s.date,'2026-09-28');
 assert.deepEqual(s.overdue.map(x=>x.id),['late']);assert.equal(s.done.length,1);
 assert.equal(s.unscheduled.length,2);assert.equal(s.dueToday.length,1);
 assert.deepEqual(s.ordered.map(x=>x.id),['late','today','work','invalid']);
});
test('project scope never counts unrelated tasks',()=>{
 const s=core.inspect(fixture(),now,'p1');assert.equal(s.tasks.length,3);assert.equal(s.unscheduled.length,0);
 const answer=core.answer('Обзор проекта Запуск',fixture(),now);
 assert.match(answer,/projects:p1/);assert.doesNotMatch(answer,/Макет/);
});
test('daily proposal is sourced and does not mutate records',()=>{
 const d=fixture(),before=JSON.stringify(d),answer=core.answer('План на сегодня',d,now);
 assert.match(answer,/tasks:late/);assert.match(answer,/Данные не изменены/);
 assert.equal(JSON.stringify(d),before);
});
test('document search cites actual excerpts and reports no match',()=>{
 const answer=core.answer('Найди в документах доставка',fixture(),now);
 assert.match(answer,/docs:d1/);assert.match(answer,/5 октября/);
 assert.match(core.answer('Найди в документах вулкан',fixture(),now),/совпадений нет/);
});
test('task form rejects bad dates, duplicate active titles and nonexistent project',()=>{
 const d=fixture();const base={title:'Новая',status:'Новая'};
 for(const patch of [{dueDate:'2026-02-31'},{projectId:'missing'},{title:'договор'},{status:'unknown'}])assert.throws(()=>core.validateTask({...base,...patch},d));
 assert.deepEqual(core.validateTask({...base,projectId:'p1',dueDate:'2028-02-29'},d),{...base,projectId:'p1',dueDate:'2028-02-29'});
});
test('empty workspace and ambiguous project names are explicit',()=>{
 assert.match(core.answer('План на сегодня',{tasks:[],projects:[]},now),/Активных задач нет/);
 const d=fixture();d.projects.push({id:'p2',name:'Запуск'});
 assert.match(core.answer('Обзор проекта Запуск',d,now),/Несколько/);
 assert.equal(core.answer('Расскажи анекдот',d,now),null);
});
