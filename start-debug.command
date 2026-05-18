#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm が見つかりません。Node.js をインストールしてください。"
  read -r
  exit 1
fi

LOGFILE="$SCRIPT_DIR/debug.log"
echo "=== QuickText デバッグ開始: $(date) ===" > "$LOGFILE"
npm run start:debug 2>&1 | tee "$LOGFILE"
