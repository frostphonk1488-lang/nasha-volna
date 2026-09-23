"""NVC Tool Runtime v0.2 — безопасный реестр действий."""

from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class Tool:
    name: str
    description: str
    handler: Callable[..., Any]
    requires_confirmation: bool = False


class ToolRuntime:
    def __init__(self):
        self.tools: dict[str, Tool] = {}

    def register(self, tool: Tool):
        if tool.name in self.tools:
            raise ValueError(f"Tool already registered: {tool.name}")
        self.tools[tool.name] = tool

    def execute(self, name: str, arguments: dict):
        tool = self.tools.get(name)
        if not tool:
            raise KeyError(f"Unknown tool: {name}")

        # Критические действия в production здесь будут останавливаться
        # до подтверждения пользователя.
        if tool.requires_confirmation:
            return {
                "status": "confirmation_required",
                "tool": name,
                "arguments": arguments,
            }

        return tool.handler(**arguments)
