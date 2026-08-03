"""
tests/test_updater.py
Тесты функций парсинга версий и сравнения из updater.py.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "Backend"))

from updater import parse_version, is_newer


# ─── parse_version ───────────────────────────────────────────
class TestParseVersion:
    def test_simple(self):
        assert parse_version("1.2.3") == (1, 2, 3)

    def test_with_v_prefix(self):
        assert parse_version("v1.0.5") == (1, 0, 5)

    def test_capital_v(self):
        assert parse_version("V2.10.0") == (2, 10, 0)

    def test_beta_suffix_stripped(self):
        assert parse_version("1.2.3-beta") == (1, 2, 3)

    def test_build_suffix_stripped(self):
        assert parse_version("1.2.3+build.99") == (1, 2, 3)

    def test_two_parts_padded(self):
        assert parse_version("1.2") == (1, 2, 0)

    def test_one_part_padded(self):
        assert parse_version("3") == (3, 0, 0)

    def test_empty_string(self):
        assert parse_version("") == (0, 0, 0)

    def test_none(self):
        assert parse_version(None) == (0, 0, 0)

    def test_zero_version(self):
        assert parse_version("0.0.0") == (0, 0, 0)

    def test_large_numbers(self):
        assert parse_version("10.20.30") == (10, 20, 30)


# ─── is_newer ────────────────────────────────────────────────
class TestIsNewer:
    def test_newer_patch(self):
        assert is_newer("1.0.1", "1.0.0") is True

    def test_newer_minor(self):
        assert is_newer("1.1.0", "1.0.9") is True

    def test_newer_major(self):
        assert is_newer("2.0.0", "1.9.9") is True

    def test_same_version(self):
        assert is_newer("1.0.0", "1.0.0") is False

    def test_older(self):
        assert is_newer("0.9.9", "1.0.0") is False

    def test_with_v_prefix(self):
        assert is_newer("v1.0.1", "v1.0.0") is True

    def test_beta_vs_release(self):
        # бета: 1.2.0-beta → (1,2,0), релиз (1,2,0) — равны
        assert is_newer("1.2.0-beta", "1.2.0") is False

    def test_empty_candidate(self):
        assert is_newer("", "1.0.0") is False

    def test_empty_current(self):
        # любая версия «новее» чем пустая
        assert is_newer("1.0.0", "") is True
