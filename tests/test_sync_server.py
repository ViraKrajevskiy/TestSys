"""
tests/test_sync_server.py
Тесты функций авторизации, rate-limit, ACL и merge из sync_server.py.
Не требуют сети или файловой системы.
"""
import sys, os, time, hashlib
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "Backend"))

import sync_server as ss


# ─── _hash_password ──────────────────────────────────────────
class TestHashPassword:
    def test_returns_hex(self):
        salt = "aabbccddeeff0011" * 2   # 32 hex chars = 16 bytes
        h = ss._hash_password("secret", salt)
        assert all(c in "0123456789abcdef" for c in h)

    def test_deterministic(self):
        salt = "00" * 16
        h1 = ss._hash_password("pass", salt)
        h2 = ss._hash_password("pass", salt)
        assert h1 == h2

    def test_different_passwords_differ(self):
        salt = "00" * 16
        assert ss._hash_password("abc", salt) != ss._hash_password("xyz", salt)

    def test_different_salts_differ(self):
        assert ss._hash_password("pass", "00" * 16) != ss._hash_password("pass", "ff" * 16)

    def test_unicode_password(self):
        salt = "aa" * 16
        h = ss._hash_password("пароль123", salt)
        assert len(h) > 0


# ─── _login_check_ratelimit / _login_record_fail ─────────────
class TestLoginRateLimit:
    def setup_method(self):
        # Сбрасываем состояние между тестами
        with ss._login_attempts_lock:
            ss._login_attempts.clear()

    def test_fresh_ip_allowed(self):
        assert ss._login_check_ratelimit("1.2.3.4") is None

    def test_below_limit_allowed(self):
        ip = "10.0.0.1"
        for _ in range(ss.LOGIN_MAX_ATTEMPTS - 1):
            ss._login_record_fail(ip)
        assert ss._login_check_ratelimit(ip) is None

    def test_at_limit_returns_ban(self):
        ip = "10.0.0.2"
        for _ in range(ss.LOGIN_MAX_ATTEMPTS):
            ss._login_record_fail(ip)
        result = ss._login_check_ratelimit(ip)
        assert result is not None
        secs, reason = result
        assert secs > 0
        assert reason == "banned"

    def test_reset_clears_attempts(self):
        ip = "10.0.0.3"
        for _ in range(ss.LOGIN_MAX_ATTEMPTS):
            ss._login_record_fail(ip)
        ss._login_reset(ip)
        assert ss._login_check_ratelimit(ip) is None

    def test_different_ips_independent(self):
        ip_a, ip_b = "192.168.1.1", "192.168.1.2"
        for _ in range(ss.LOGIN_MAX_ATTEMPTS):
            ss._login_record_fail(ip_a)
        # ip_a заблокирован, ip_b — чистый
        assert ss._login_check_ratelimit(ip_a) is not None
        assert ss._login_check_ratelimit(ip_b) is None


# ─── _can_read / _can_write ──────────────────────────────────
class TestAcl:
    def setup_method(self):
        # Подменяем _load_acl, не трогая файловую систему
        self._orig = ss._load_acl

    def teardown_method(self):
        ss._load_acl = self._orig

    def _mock_acl(self, data):
        ss._load_acl = lambda: data

    def test_admin_can_read_everything(self):
        self._mock_acl({"SecretCol": {"read": [], "write": []}})
        assert ss._can_read("SecretCol", "u1", "admin") is True

    def test_admin_can_write_everything(self):
        self._mock_acl({"SecretCol": {"read": [], "write": []}})
        assert ss._can_write("SecretCol", "u1", "admin") is True

    def test_wildcard_allows_all(self):
        self._mock_acl({"PubCol": {"read": ["*"], "write": ["*"]}})
        assert ss._can_read("PubCol", "u99", "member") is True
        assert ss._can_write("PubCol", "u99", "member") is True

    def test_specific_user_allowed(self):
        self._mock_acl({"PrivCol": {"read": ["u5"], "write": ["u5"]}})
        assert ss._can_read("PrivCol", "u5", "member") is True
        assert ss._can_write("PrivCol", "u5", "member") is True

    def test_specific_user_denied(self):
        self._mock_acl({"PrivCol": {"read": ["u5"], "write": ["u5"]}})
        assert ss._can_read("PrivCol", "u99", "member") is False
        assert ss._can_write("PrivCol", "u99", "member") is False

    def test_no_acl_entry_allows_all(self):
        self._mock_acl({})
        assert ss._can_read("UnknownCol", "u1", "member") is True
        assert ss._can_write("UnknownCol", "u1", "member") is True

    def test_read_allowed_write_denied(self):
        self._mock_acl({"Col": {"read": ["*"], "write": ["admin_only"]}})
        assert ss._can_read("Col", "u1", "member") is True
        assert ss._can_write("Col", "u1", "member") is False


# ─── _filter_doc_for_user ────────────────────────────────────
class TestFilterDoc:
    def setup_method(self):
        self._orig = ss._load_acl

    def teardown_method(self):
        ss._load_acl = self._orig

    def _mock_acl(self, data):
        ss._load_acl = lambda: data

    def _doc(self, names):
        return {"collections": [{"name": n} for n in names]}

    def test_admin_sees_all(self):
        self._mock_acl({"secret": {"read": ["u1"], "write": []}})
        doc = self._doc(["public", "secret"])
        out = ss._filter_doc_for_user(doc, "u99", "admin")
        names = [c["name"] for c in out["collections"]]
        assert "secret" in names

    def test_member_sees_only_allowed(self):
        self._mock_acl({"secret": {"read": ["u1"], "write": []}})
        doc = self._doc(["public", "secret"])
        out = ss._filter_doc_for_user(doc, "u99", "member")
        names = [c["name"] for c in out["collections"]]
        assert "public" in names
        assert "secret" not in names

    def test_empty_collections(self):
        self._mock_acl({})
        doc = {"collections": []}
        out = ss._filter_doc_for_user(doc, "u1", "member")
        assert out["collections"] == []


# ─── _merge_write ────────────────────────────────────────────
class TestMergeWrite:
    def setup_method(self):
        self._orig = ss._load_acl

    def teardown_method(self):
        ss._load_acl = self._orig

    def _mock_acl(self, data):
        ss._load_acl = lambda: data

    def _doc(self, *names):
        return {"collections": [{"name": n, "data": n} for n in names]}

    def test_admin_merge_uses_incoming(self):
        self._mock_acl({})
        current = self._doc("A", "B")
        incoming = self._doc("A", "C")
        result = ss._merge_write(current, incoming, "admin", "admin")
        names = [c["name"] for c in result]
        assert "C" in names
        assert "B" not in names   # admin: incoming wins

    def test_member_cannot_overwrite_protected(self):
        self._mock_acl({"AdminOnly": {"read": ["*"], "write": ["admin_id"]}})
        current = self._doc("AdminOnly", "UserCol")
        incoming = self._doc("AdminOnly", "UserCol")
        # member пробует изменить AdminOnly
        incoming["collections"][0]["data"] = "hacked"
        result = ss._merge_write(current, incoming, "u1", "member")
        names_map = {c["name"]: c for c in result}
        # AdminOnly должен остаться из current (data == "AdminOnly")
        assert names_map["AdminOnly"]["data"] == "AdminOnly"

    def test_member_can_write_own_col(self):
        self._mock_acl({"UserCol": {"read": ["*"], "write": ["*"]}})
        current = self._doc("UserCol")
        incoming = {"collections": [{"name": "UserCol", "data": "updated"}]}
        result = ss._merge_write(current, incoming, "u1", "member")
        names_map = {c["name"]: c for c in result}
        assert names_map["UserCol"]["data"] == "updated"

    def test_collections_not_in_incoming_preserved_for_member(self):
        # member: коллекции из current, которые не пришли в incoming, сохраняются
        self._mock_acl({})
        current = self._doc("A", "B")
        incoming = self._doc("A")          # клиент не прислал B
        result = ss._merge_write(current, incoming, "u1", "member")
        names = [c["name"] for c in result]
        assert "B" in names                # B сохранился из current

    def test_admin_incoming_wins_completely(self):
        # admin: incoming полностью заменяет current (B не присылали — B нет)
        self._mock_acl({})
        current = self._doc("A", "B")
        incoming = self._doc("A")
        result = ss._merge_write(current, incoming, "u1", "admin")
        names = [c["name"] for c in result]
        assert "A" in names
        assert "B" not in names            # admin: incoming wins, B не пришёл
