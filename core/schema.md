# NVC Memory Schema v0.1

Базовые сущности памяти:

- fact — устойчивый факт;
- event — событие;
- decision — принятое решение;
- preference — предпочтение пользователя;
- entity — человек, компания, проект или объект;
- relationship — связь между сущностями;
- task — задача;
- document — документ.

Каждая запись должна иметь:

- id;
- tenant_id;
- type;
- content;
- source;
- created_at;
- updated_at;
- confidence;
- sensitivity.

В будущем записи будут храниться в PostgreSQL, а семантический поиск — через vector index.
