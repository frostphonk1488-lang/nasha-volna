/* Nasha Volna browser task core. No network requests or model credentials. */
(function (root) {
'use strict';
const norm = value => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[«»"“”]/g, '').trim();
const clean = value => String(value || '').trim().replace(/^[:\s«"]+|[»"]+$/g, '').trim();
const describe = task => '«' + task.title + '» — ' + task.status + (task.dueDate ? ', срок: ' + task.dueDate : '');
function day(offset, now) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  const d = new Date(Date.UTC(+get('year'), +get('month') - 1, +get('day') + offset));
  return d.toISOString().slice(0, 10);
}
function deadline(text, now) {
  const value = norm(text).replace(/^(?:на|до)\s+/, '');
  if (value === 'сегодня') return day(0, now);
  if (value === 'завтра') return day(1, now);
  if (value === 'послезавтра') return day(2, now);
  let m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m && local) m = [local[0],local[3],local[2],local[1]];
  if (!m) return null;
  const iso = m[1]+'-'+m[2]+'-'+m[3];
  const date = new Date(iso+'T12:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === iso ? iso : null;
}
function handle(text, data, uid, now = new Date()) {
  const t = text.trim().replace(/[.!?]+$/, '').replace(/^(?:пожалуйста[, ]+|можешь\s+|можно\s+)/i, '').trim();
  const q = norm(t);
  const state = data.taskContext || (data.taskContext = {lastId:null,pending:null});
  const reply = message => ({message});
  function execute(task, action) {
    state.lastId = task.id;
    state.pending = null;
    if (action.type === 'rename') task.title = action.value;
    if (action.type === 'date') task.dueDate = action.value;
    if (action.type === 'status') task.status = action.value;
    if (action.type !== 'show') task.updatedAt = now.toISOString();
    return reply((action.type === 'show' ? 'Задача: ' : 'Сохранено: ') + describe(task) + '.');
  }
  function choose(selector, action) {
    selector = clean(selector).replace(/^(?:задачу|задачи|задача)\s*/i, '').trim();
    const needle = norm(selector);
    let found;
    if (!needle || /^(?:ее|эту|эту задачу|ее задачу|последнюю|последнюю задачу)$/.test(needle)) {
      found = data.tasks.filter(x => x.id === state.lastId);
      if (!found.length) return reply('Какую задачу? Укажите её название: «Покажи задачу: проверить MVP».');
    } else {
      found = data.tasks.filter(x => norm(x.title) === needle || x.id === selector);
      if (!found.length) found = data.tasks.filter(x => norm(x.title).includes(needle));
    }
    if (!found.length) return reply('Не нашёл задачу «'+selector+'». Посмотреть список: «Покажи задачи».');
    if (found.length > 1) {
      state.pending = {kind:'select',ids:found.map(x=>x.id),action};
      return reply('Нашёл несколько задач. Напишите номер или точное название; «Отмена» отменит действие:\n'+found.map((x,i)=>(i+1)+'. '+describe(x)).join('\n'));
    }
    return execute(found[0], action);
  }
  function create(title) {
    title = clean(title);
    if (!title) { state.pending = {kind:'create'}; return reply('Как назвать задачу? Напишите название или «Отмена».'); }
    let dueDate;
    const dateMatch = title.match(/\s+(?:на|до)\s+(сегодня|завтра|послезавтра|\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})$/i);
    if (dateMatch) {
      dueDate = deadline(dateMatch[1], now);
      if (!dueDate) return reply('Дата некорректна. Используйте ДД.ММ.ГГГГ или «завтра».');
      title = clean(title.slice(0, dateMatch.index));
      if (!title) return reply('Укажите название: «Создай задачу: проверить MVP на завтра».');
    }
    const duplicate = data.tasks.find(x=>norm(x.title)===norm(title) && x.status!=='Выполнена');
    if (duplicate) { state.lastId=duplicate.id; state.pending=null; return reply('Такая активная задача уже есть: '+describe(duplicate)+'. Дубликат не создан.'); }
    const task = {id:uid('task'),title,status:'Новая',createdAt:now.toISOString()};
    if (dueDate) task.dueDate = dueDate;
    data.tasks.unshift(task); state.lastId=task.id; state.pending=null;
    return reply('Задача создана: '+describe(task)+'. Она доступна в разделе «Задачи».');
  }
  if (/^(?:отмена|отмени|не надо)$/.test(q)) {state.pending=null;return reply('Ожидающее действие отменено.');}
  if (state.pending?.kind === 'select') {
    const pending = state.pending;
    const candidates = pending.ids.map(id=>data.tasks.find(x=>x.id===id)).filter(Boolean);
    let task;
    if (/^\d+$/.test(q)) task = candidates[Number(q)-1];
    else {
      const exact = candidates.filter(x=>norm(x.title)===q || x.id===t);
      if (exact.length===1) task=exact[0];
    }
    if (task) return execute(task,pending.action);
    if (/^\d+$/.test(q)) return reply('Выберите номер из списка или напишите «Отмена».');
  }
  let m;
  if ((m=t.match(/^(?:создай|создать|добавь|добавить|поставь|заведи)\s+задачу(?:\s*[:,-]?\s*(.*))$/i))) return create(m[1]);
  if ((m=t.match(/^(?:переименуй|назови)\s+(.+?)\s+(?:в|на)\s+(.+)$/i))) {
    const title=clean(m[2]);
    if (!title) return reply('Укажите новое название.');
    return choose(m[1],{type:'rename',value:title});
  }
  if ((m=t.match(/^(?:перенеси|назначь срок|установи срок|поставь срок)\s*(.*?)\s+(?:на|до)\s+(.+)$/i))) {
    const value=deadline(m[2],now);
    if (!value) return reply('Укажите срок: «Перенеси её на завтра» или «Перенеси задачу проверить MVP на 30.09.2026». Даты считаются по Москве.');
    return choose(m[1],{type:'date',value});
  }
  if ((m=t.match(/^(?:заверши|закрой|выполни|отметь выполненной)\s+(.+)$/i))) return choose(m[1],{type:'status',value:'Выполнена'});
  if ((m=t.match(/^(?:начни|возьми в работу)\s+(.+)$/i))) return choose(m[1],{type:'status',value:'В работе'});
  if ((m=t.match(/^(?:возобнови|открой заново)\s+(.+)$/i))) return choose(m[1],{type:'status',value:'Новая'});
  if (/^(?:(?:покажи|список|какие|какие у меня)\s+)?(?:(?:все|мои|активные|выполненные)\s+)?задач[иу]$/.test(q) || q === 'список задач') {
    const tasks = /активные/.test(q) ? data.tasks.filter(x=>x.status!=='Выполнена') : /выполненные/.test(q) ? data.tasks.filter(x=>x.status==='Выполнена') : data.tasks;
    if (tasks.length===1) state.lastId=tasks[0].id;
    state.pending=null;
    return reply(tasks.length ? 'Задачи ('+tasks.length+'):\n'+tasks.map((x,i)=>(i+1)+'. '+describe(x)).join('\n') : 'Задач в этом списке нет.');
  }
  if ((m=t.match(/^(?:покажи|найди|поищи)\s+(?:задачу|задачи)\s*:?\s+(.+)$/i))) return choose(m[1],{type:'show'});
  if (/^(?:покажи|найди)\s+(?:ее|её|эту задачу|последнюю задачу)$/.test(q)) return choose('эту',{type:'show'});
  // A new command supersedes a previous clarification. Plain text supplies a missing title.
  if (state.pending?.kind === 'create' && !/^(?:покажи|найди|запомни|сохрани|что|какие|кто|создай|добавь)(?:\s|$)/i.test(t)) return create(t);
  state.pending=null;
  // Never route an unsupported mutation to a read-only task list in the legacy router.
  if (/^(?:измени|удали|переименуй|перенеси|заверши|закрой|начни|назначь|установи|поставь|создай|добавь|возобнови|возьми)/i.test(t) && /задач|ее|её/i.test(t)) return reply('Не удалось разобрать изменение. Примеры: «Переименуй её в Проверить отчёт», «Перенеси её на завтра», «Заверши задачу Проверить отчёт».');
  return null;
}
const api = {handle,deadline};
if (typeof module !== 'undefined' && module.exports) module.exports=api;
else root.NVTaskCore=api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
