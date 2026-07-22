#!/bin/zsh

set -e

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Job Hub needs Node.js 22.13 or newer. Download it from https://nodejs.org/"
  read -r "?Press Return to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Preparing Job Hub for the first launch…"
  npm install
fi

echo "Job Hub is opening at http://localhost:3000"
(sleep 2 && open "http://localhost:3000") &
npm run dev
