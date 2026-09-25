#!/bin/bash
# Copy the presentation from the working site folder into public/ (what the Worker serves and GitHub holds).
# data/asks.js is an unused draft and is not published.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../project-1-proposal-audit/site"
rm -rf "$here/public"; mkdir -p "$here/public/data"
cp "$src/index.html" "$src/app.js" "$src/style.css" "$here/public/"
cp "$src/data/session.js" "$src/data/walkthrough.js" "$here/public/data/"
cp -R "$src/fonts" "$src/vendor" "$here/public/"
echo "synced $(find "$here/public" -type f | wc -l | tr -d ' ') files"
