const {test} = require('node:test');
const assert = require('node:assert/strict');
const {handle,deadline} = require('../task-core.js');
function fixture() {
  let counter=0;
  const data={tasks:[]};
  const ask=text=>handle(text,data,()=>`task-${++counter}`,new Date('2026-09-26T22:30:00Z'));
  return {data,ask};
}
test('create, follow-up rename, move, list, reload, complete',()=>{
  const {data,ask}=fixture();
  assert.match(ask('Создай задачу: Проверить MVP на завтра').message,/создана/);
  assert.equal(data.tasks[0].dueDate,'2026-09-28');
  ask('Переименуй её в Проверить отчёт');
  assert.equal(data.tasks[0].title,'Проверить отчёт');
  ask('Перенеси её на 30.09.2026');
  assert.equal(data.tasks[0].dueDate,'2026-09-30');
  assert.match(ask('Покажи задачи').message,/Проверить отчёт/);
  const restored=JSON.parse(JSON.stringify(data));
  handle('Заверши её',restored,()=> 'unused');
  assert.equal(restored.tasks[0].status,'Выполнена');
});
test('ambiguous mutations require explicit selection',()=>{
  const {data,ask}=fixture();
  ask('Создай задачу: Отчёт июль');ask('Создай задачу: Отчёт август');
  assert.match(ask('Заверши задачу отчёт').message,/несколько/);
  assert.ok(data.tasks.every(t=>t.status==='Новая'));
  assert.match(ask('9').message,/номер/);
  ask('2');
  assert.equal(data.tasks.find(t=>t.title==='Отчёт июль').status,'Выполнена');
  assert.equal(data.tasks.find(t=>t.title==='Отчёт август').status,'Новая');
});
test('clarification, cancellation and duplicates',()=>{
  const {data,ask}=fixture();
  assert.match(ask('Создай задачу').message,/назвать/);
  ask('Проверить договор');ask('Создай задачу: проверить договор');
  assert.equal(data.tasks.length,1);
  ask('Создай задачу');ask('Отмена');ask('Другое название');
  assert.equal(data.tasks.length,1);
});
test('unsupported commands and missing context do not mutate',()=>{
  const {data,ask}=fixture();
  assert.match(ask('Перенеси её на завтра').message,/Какую/);
  ask('Создай задачу: Отчёт');
  ask('Удали задачу Отчёт');
  ask('Перенеси её на 31.02.2026');
  ask('Заверши задачу которой нет');
  assert.equal(data.tasks.length,1);
  assert.equal(data.tasks[0].status,'Новая');
  assert.equal(data.tasks[0].dueDate,undefined);
});
test('valid dates, invalid dates, leap day and Moscow midnight',()=>{
  assert.equal(deadline('29.02.2028',new Date()),'2028-02-29');
  assert.equal(deadline('29.02.2026',new Date()),null);
  assert.equal(deadline('2026-13-01',new Date()),null);
  assert.equal(deadline('сегодня',new Date('2026-09-26T22:30:00Z')),'2026-09-27');
});
test('new command supersedes ambiguous action; completed filter',()=>{
  const {data,ask}=fixture();
  ask('Создай задачу: Отчёт А');ask('Создай задачу: Отчёт Б');
  ask('Заверши задачу отчёт');ask('Покажи задачи');
  assert.equal(ask('1'),null);
  assert.ok(data.tasks.every(t=>t.status==='Новая'));
  ask('Заверши задачу Отчёт А');
  assert.match(ask('Покажи выполненные задачи').message,/Отчёт А/);
  assert.doesNotMatch(ask('Покажи активные задачи').message,/Отчёт А/);
});
