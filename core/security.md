# NVC Security v0.1

Безопасность является частью Core, а не дополнением.

Каждый запрос к инструменту должен пройти:

1. authentication;
2. tenant isolation;
3. permission check;
4. input validation;
5. confirmation policy;
6. audit log.

AI не получает прямой доступ к базе данных.

AI вызывает только зарегистрированные инструменты.
