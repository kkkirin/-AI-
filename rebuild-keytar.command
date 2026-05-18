#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm が見つかりません。Node.js をインストールしてください。"
  read -r
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node が見つかりません。Node.js をインストールしてください。"
  read -r
  exit 1
fi

ELECTRON_VERSION="$(node -e "const pkg=require('./package.json'); const v=(pkg.devDependencies?.electron||pkg.dependencies?.electron||'').toString(); console.log(v.replace(/^[^0-9]*/,''));")"
if [ -z "$ELECTRON_VERSION" ]; then
  ELECTRON_VERSION="39.2.7"
fi

echo "Rebuilding keytar for Electron ${ELECTRON_VERSION}..."
npm rebuild keytar --runtime=electron --target="${ELECTRON_VERSION}" --disturl=https://electronjs.org/headers

echo "Done."
read -r
