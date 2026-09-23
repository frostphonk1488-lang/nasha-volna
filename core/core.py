"""Nasha Volna Core v0.1 — архитектурный skeleton.

Это не готовый production backend. Файл задаёт контракт между
Router, Memory, Tools и Executor.
"""

from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class Intent:
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass
class Tool:
    name: str
    description: str
    execute: Callable[..., Any]
    requires_confirmation: bool = False


class Memory:
    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    def save(self, item: dict[str, Any]) -> dict[str, Any]:
        self.items.append(item)
        return item

    def search(self, query: str) -> list[dict[str, Any]]:
        q = query.lower()
        return [
            item for item in self.items
            if q in str(item.get("content", "")).lower()
        ]


class ToolRegistry:
    def __init__(self) -> None:
        self.tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self.tools[tool.name] = tool

    def get(self, name: str) -> Tool:
        if name not in self.tools:
            raise KeyError(f"Unknown tool: {name}")
        return self.tools[name]


class NashaVolnaCore:
    def __init__(self) -> None:
        self.memory = Memory()
        self.tools = ToolRegistry()

    def handle(self, intent: Intent) -> Any:
        tool = self.tools.get(intent.name)

        if tool.requires_confirmation:
            return {
                "status": "confirmation_required",
                "tool": tool.name,
                "arguments": intent.arguments,
            }

        return tool.execute(**intent.arguments)


if __name__ == "__main__":
    core = NashaVolnaCore()
    core.memory.save({
        "type": "fact",
        "content": "Nasha Volna строит собственное AI Core",
    })
    print(core.memory.search("AI Core"))
