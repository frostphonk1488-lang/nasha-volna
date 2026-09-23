"""Nasha Volna Core v0.2 — локальный исполняемый AI Core.

Поток:
text -> Router -> Tool Runtime -> Memory/Action -> result
"""

from dataclasses import dataclass
from .memory import MemoryStore
from .router import Router, Intent
from .tools_runtime import Tool, ToolRuntime


@dataclass
class Task:
    id: str
    title: str
    status: str = "Новая"


class NashaVolnaCore:
    def __init__(self, memory_path: str = "data/memory.json"):
        self.memory = MemoryStore(memory_path)
        self.router = Router()
        self.runtime = ToolRuntime()
        self.tasks: list[Task] = []
        self._register_tools()

    def _register_tools(self):
        self.runtime.register(Tool(
            "memory.save",
            "Save durable memory",
            lambda content: self.memory.add(content).content,
        ))
        self.runtime.register(Tool(
            "memory.search",
            "Search durable memory",
            self._memory_search,
        ))
        self.runtime.register(Tool(
            "memory.list",
            "List durable memory",
            lambda: [m.content for m in self.memory.all()],
        ))
        self.runtime.register(Tool(
            "task.create",
            "Create a task",
            self._create_task,
        ))
        self.runtime.register(Tool(
            "task.list",
            "List tasks",
            lambda: [f"{t.title} — {t.status}" for t in self.tasks],
        ))

    def _memory_search(self, query: str):
        return [m.content for m in self.memory.search(query)]

    def _create_task(self, title: str):
        task = Task(
            id=f"task-{len(self.tasks) + 1}",
            title=title,
        )
        self.tasks.append(task)
        return {
            "id": task.id,
            "title": task.title,
            "status": task.status,
        }

    def handle(self, text: str):
        intent: Intent = self.router.route(text)
        result = self.runtime.execute(intent.name, intent.arguments)
        return {
            "input": text,
            "intent": intent.name,
            "arguments": intent.arguments,
            "result": result,
        }


def demo():
    core = NashaVolnaCore()

    examples = [
        "Запомни, что основной продукт — Nasha Volna AI",
        "Запомни, что дедлайн проекта Альфа — 15 октября",
        "Что ты помнишь?",
        "Найди Альфа",
        "Создай задачу: проверить архитектуру Core",
        "Какие у меня задачи?",
    ]

    for text in examples:
        print("\nUSER:", text)
        print("CORE:", core.handle(text))


if __name__ == "__main__":
    demo()
