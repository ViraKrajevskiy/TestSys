"""
tests/test_api.py
Тесты чистых функций из api.py: валидация полей и генераторы данных.
"""
import sys, os, re
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "Backend"))

# Импортируем только то, что не требует webview/GUI
from api import validate_field
from api import DataGenUtils

detect_field_type = DataGenUtils.detect_field_type
smart_fill        = DataGenUtils.smart_fill


# ─── validate_field ──────────────────────────────────────────
class TestValidateEmail:
    def test_valid(self):
        ok, _ = validate_field("email", "user@example.com")
        assert ok

    def test_valid_subdomain(self):
        ok, _ = validate_field("user_email", "a@b.co.uk")
        assert ok

    def test_missing_at(self):
        ok, msg = validate_field("email", "userexample.com")
        assert not ok
        assert msg

    def test_missing_domain(self):
        ok, msg = validate_field("email", "user@")
        assert not ok

    def test_empty(self):
        ok, _ = validate_field("email", "")
        assert not ok


class TestValidatePhone:
    def test_valid_digits(self):
        ok, _ = validate_field("phone", "+1234567890")
        assert ok

    def test_valid_formatted(self):
        ok, _ = validate_field("tel", "(123) 456-7890")
        assert ok

    def test_too_short(self):
        ok, msg = validate_field("phone", "123")
        assert not ok

    def test_too_long(self):
        ok, msg = validate_field("phone", "1" * 20)
        assert not ok


class TestValidateNumber:
    def test_valid_int(self):
        ok, _ = validate_field("id", "42")
        assert ok

    def test_valid_age(self):
        ok, _ = validate_field("age", "25")
        assert ok

    def test_float_fails(self):
        ok, _ = validate_field("count", "3.14")
        assert not ok

    def test_string_fails(self):
        ok, _ = validate_field("number", "abc")
        assert not ok


class TestValidateStatus:
    def test_active(self):
        ok, _ = validate_field("status", "active")
        assert ok

    def test_case_insensitive(self):
        ok, _ = validate_field("status", "PENDING")
        assert ok

    def test_invalid_status(self):
        ok, msg = validate_field("status", "deleted")
        assert not ok

    def test_empty_status(self):
        ok, _ = validate_field("status", "")
        assert not ok


class TestValidateDate:
    def test_valid_iso(self):
        ok, _ = validate_field("date", "2024-01-15")
        assert ok

    def test_valid_with_time(self):
        ok, _ = validate_field("created_date", "2024-01-15T10:30:00")
        assert ok

    def test_wrong_format(self):
        ok, msg = validate_field("date", "15/01/2024")
        assert not ok

    def test_non_date_string(self):
        ok, _ = validate_field("date", "tomorrow")
        assert not ok


class TestValidateGeneric:
    def test_nonempty_passes(self):
        ok, _ = validate_field("username", "john_doe")
        assert ok

    def test_empty_fails(self):
        ok, _ = validate_field("username", "")
        assert not ok


# ─── detect_field_type ───────────────────────────────────────
class TestDetectFieldType:
    def test_email(self):
        assert detect_field_type("email") == "email"
        assert detect_field_type("user_email") == "email"

    def test_phone(self):
        assert detect_field_type("phone") == "phone"
        assert detect_field_type("tel") == "phone"

    def test_password(self):
        assert detect_field_type("password") == "password"

    def test_date(self):
        # ветка 'date': проверяем слова 'date' и 'time'
        assert detect_field_type("date") == "date"
        assert detect_field_type("created_date") == "date"
        assert detect_field_type("timestamp") == "date"   # содержит 'time'
        # 'created_at' и 'birthday' не содержат 'date'/'time' → text
        assert detect_field_type("created_at") == "text"
        assert detect_field_type("birthday") == "text"

    def test_status(self):
        assert detect_field_type("status") == "status"
        assert detect_field_type("state") == "status"

    def test_number(self):
        assert detect_field_type("age") == "number"
        assert detect_field_type("count") == "number"
        assert detect_field_type("id") == "number"
        assert detect_field_type("number") == "number"

    def test_unknown_fallback_is_text(self):
        assert detect_field_type("zxcvbnm_unknown_field") == "text"
        assert detect_field_type("name") == "text"    # name → text (нет спец-ветки)
        assert detect_field_type("website") == "text" # website → text


# ─── smart_fill ──────────────────────────────────────────────
class TestSmartFill:
    def test_email_format(self):
        val = smart_fill("email")
        assert "@" in val and "." in val.split("@")[-1]

    def test_phone_digits(self):
        val = smart_fill("phone")
        digits = re.sub(r"\D", "", val)
        assert len(digits) >= 9

    def test_name_nonempty(self):
        val = smart_fill("name")
        assert isinstance(val, str) and len(val) > 0

    def test_password_length(self):
        val = smart_fill("password")
        assert len(val) >= 8

    def test_status_valid(self):
        val = smart_fill("status")
        assert val in ["active", "inactive", "pending", "approved", "rejected"]

    def test_date_format(self):
        val = smart_fill("date")
        assert re.match(r"\d{4}-\d{2}-\d{2}", val)

    def test_number_is_int(self):
        val = smart_fill("age")
        assert str(int(val)) == str(val)  # парсится как целое

    def test_unknown_field_nonempty(self):
        val = smart_fill("some_weird_field_xyz")
        assert isinstance(val, str) and len(val) > 0
