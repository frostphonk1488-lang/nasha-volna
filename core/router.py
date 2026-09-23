"""NVC Intent Router v0.2.

Пока работает без внешней LLM: базовые намерения определяются локально.
Позже Router сможет использовать модель для сложных запросов.
"""

from dataclasses import dataclass
import re


@dataclass
class Intent:
    name: str
    arguments: dict


class Router:
    def route(self, text: str) -> Intent:
        text = text.strip()

        m = re.match(r"^(запомни|сохрани|запиши)\s*[:,-]?\s*(.+)$", text, re.I)
        if m:
            return Intent("memory.save", {"content": m.group(2).strip()})

        m = re.match(r"^(найди|поищи|покажи)\s+(?:в памяти\s*)?(.+)$", text, re.I)
        if m:
            return Intent("memory.search", {"query": m.group(2).strip()})

        m = re.match(r"^(создай|добавь)\s+задачу\s*[:,-]?\s*(.+)$", text, re.I)
        if m:
            return Intent("task.create", {"title": m.group(2).strip()})

        if re.search(r"\b(что ты помнишь|что помнишь|память)\b", text, re.I):
            return Intent("memory.list", {})

        if re.search(r"\b(какие у меня задачи|мои задачи|список задач)\b", text, re.I):
            return Intent("task.list", {})

        return Intent("chat", {"text": text})
