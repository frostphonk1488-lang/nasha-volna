import tempfile
import unittest
from pathlib import Path

from core.memory import MemoryStore
from core.router import Router
from core.core import NashaVolnaCore


class CoreTests(unittest.TestCase):
    def test_router_memory(self):
        intent = Router().route("Запомни: важный факт")
        self.assertEqual(intent.name, "memory.save")
        self.assertEqual(intent.arguments["content"], "важный факт")

    def test_memory_persistence(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "memory.json")
            store = MemoryStore(path)
            store.add("Проект Альфа имеет дедлайн 15 октября")
            second = MemoryStore(path)
            self.assertEqual(second.search("Альфа")[0].content, "Проект Альфа имеет дедлайн 15 октября")

    def test_core_task(self):
        with tempfile.TemporaryDirectory() as tmp:
            core = NashaVolnaCore(str(Path(tmp) / "memory.json"))
            result = core.handle("Создай задачу: проверить Core")
            self.assertEqual(result["intent"], "task.create")
            self.assertEqual(result["result"]["title"], "проверить Core")


if __name__ == "__main__":
    unittest.main()
