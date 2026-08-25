
"""
custom_generator.py
-------------------
Advanced randomizer with 2 types:
1. Random by type (text, numbers, symbols, mixed)
2. Custom word list randomizer
+ Error injection for validation testing
"""

import random
import string
import json
from typing import List, Dict, Any, Optional


class RandomizerType1:
    """Random generator by data type (text/numbers/symbols/mixed)"""

    SYMBOL_SETS = {
        "text": string.ascii_letters,
        "numbers": string.digits,
        "symbols": "!@#$%^&*()_+-=[]{}|;:,.<>?",
        "mixed": string.ascii_letters + string.digits + "!@#$%^&*",
        "alphanumeric": string.ascii_letters + string.digits,
    }

    @classmethod
    def generate(
        cls,
        char_type: str = "mixed",
        length: int = 20,
        error_probability: float = 0.0,
    ) -> str:
        """
        Generate random string by type.
        
        Args:
            char_type: 'text', 'numbers', 'symbols', 'mixed', 'alphanumeric'
            length: string length
            error_probability: 0.0-1.0, chance to inject error
        """
        if char_type not in cls.SYMBOL_SETS:
            char_type = "mixed"

        chars = cls.SYMBOL_SETS[char_type]
        value = "".join(random.choices(chars, k=max(1, length)))

        if random.random() < error_probability:
            value = cls._inject_error(value, char_type)

        return value

    @staticmethod
    def _inject_error(value: str, char_type: str) -> str:
        """Inject common validation errors"""
        errors = [
            lambda v: v + "\n",  # Newline at end
            lambda v: " " + v,  # Leading space
            lambda v: v.replace(v[0], "🔥"),  # Invalid char
            lambda v: v[:len(v)//2] if len(v) > 1 else v,  # Truncate
        ]
        return random.choice(errors)(value)


class RandomizerType2:
    """Custom word list randomizer"""

    def __init__(self):
        self.word_lists: Dict[str, List[str]] = {}

    def add_word_list(self, list_name: str, words: List[str]) -> bool:
        """Add or update word list"""
        if not words or not isinstance(words, list):
            return False
        self.word_lists[list_name] = words
        return True

    def load_from_json(self, json_data: str) -> bool:
        """Load word lists from JSON"""
        try:
            data = json.loads(json_data)
            if isinstance(data, dict):
                for name, words in data.items():
                    if isinstance(words, list):
                        self.word_lists[name] = words
            return True
        except json.JSONDecodeError:
            return False

    def export_to_json(self) -> str:
        """Export word lists to JSON"""
        return json.dumps(self.word_lists, ensure_ascii=False, indent=2)

    def generate(
        self,
        list_name: str,
        count: int = 1,
        separator: str = "",
        error_probability: float = 0.0,
    ) -> str:
        """
        Generate value from word list.
        
        Args:
            list_name: which word list to use
            count: how many words to pick
            separator: join words with this (space, comma, etc.)
            error_probability: chance to return invalid value
        """
        if list_name not in self.word_lists:
            return ""

        words = self.word_lists[list_name]
        if not words:
            return ""

        selected = [random.choice(words) for _ in range(count)]
        value = separator.join(selected)

        if random.random() < error_probability:
            value = self._inject_error(value)

        return value

    @staticmethod
    def _inject_error(value: str) -> str:
        """Inject common validation errors"""
        errors = [
            lambda v: v + "###",  # Junk at end
            lambda v: v.upper() if v.islower() else v.lower(),  # Wrong case
            lambda v: v + " " * 50,  # Trailing spaces
            lambda v: v[:len(v)//2] if len(v) > 2 else v,  # Truncate
        ]
        return random.choice(errors)(value)

    def get_list_names(self) -> List[str]:
        """Get all available word lists"""
        return list(self.word_lists.keys())

    def delete_list(self, list_name: str) -> bool:
        """Delete word list"""
        if list_name in self.word_lists:
            del self.word_lists[list_name]
            return True
        return False


# Global instance
randomizer = RandomizerType2()

# Pre-load some default word lists
DEFAULT_LISTS = {
    "first_names": [
        "John", "Emma", "Michael", "Sarah", "James", "Jessica",
        "David", "Lisa", "Robert", "Mary", "William", "Patricia"
    ],
    "last_names": [
        "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia",
        "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez"
    ],
    "companies": [
        "TechCorp", "DataSys", "CloudNet", "WebSolutions", "AI Labs",
        "Digital Pro", "Software House", "Network Plus"
    ],
    "actions": [
        "create", "update", "delete", "fetch", "process", "analyze",
        "validate", "execute", "deploy", "monitor"
    ],
    "statuses": [
        "active", "inactive", "pending", "completed", "failed",
        "processing", "blocked", "archived"
    ],
}

for list_name, words in DEFAULT_LISTS.items():
    randomizer.add_word_list(list_name, words)
