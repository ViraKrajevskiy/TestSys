#!/usr/bin/env bash
# Тот же прогон, что и run_tests.bat — для CI и не-Windows.
cd "$(dirname "$0")"
export PYTHONPATH="$(cd .. && pwd)/Backend"
fail=0

echo "[1/2] Python тесты"
python3 -m pytest . -q --ignore=js || fail=1

echo
echo "[2/2] JS тесты"
for f in js/test_*.js; do
  echo "--- $f ---"
  node "$f" || fail=1
done

echo
[ $fail -eq 0 ] && echo "ВСЕ ТЕСТЫ ПРОШЛИ" || echo "ЕСТЬ ПРОВАЛЫ"
exit $fail
