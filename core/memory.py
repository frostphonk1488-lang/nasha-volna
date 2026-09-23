"""NVC Memory v0.2 — локальная память с поиском по тексту."""

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Optional


@dataclass
class MemoryItem:
    id: str
    type: str
    content: str
    source: str = "user"
    confidence: float = 1.0
    created_at: str = ""


class MemoryStore:
    def __init__(self, path: str = "data/memory.json"):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.items: list[MemoryItem] = []
        self._load()

    def _load(self):
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            self.items = [MemoryItem(**x) for x in raw]
        except (ValueError, TypeError):
            self.items = []

    def _save(self):
        self.path.write_text(
            json.dumps([asdict(x) for x in self.items], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def add(self, content: str, memory_type: str = "fact", source: str = "user") -> MemoryItem:
        item = MemoryItem(
            id=f"mem-{len(self.items)+1}",
            type=memory_type,
            content=content.strip(),
            source=source,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self.items.append(item)
        self._save()
        return item

    def search(self, query: str, limit: int = 8) -> list[MemoryItem]:
        words = {w.lower() for w in query.split() if len(w) > 2}
        scored = []
        for item in self.items:
            text = item.content.lower()
            score = sum(1 for word in words if word in text)
            if score:
                scored.append((score, item))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in scored[:limit]]

    def all(self) -> list[MemoryItem]:
        return list(self.items)
