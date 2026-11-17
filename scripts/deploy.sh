#!/bin/zsh
# Send Code.gs to the Sheet's Apps Script project and make it live, instead of pasting it.
#
#   scripts/deploy.sh                 # check, send, and deploy a new version
#   scripts/deploy.sh "what changed"  # the same, with this as the version's description
#   PUSH_ONLY=1 scripts/deploy.sh     # send only (enough for a change to the Sheet's menus)
#
# Needs clasp set up once on this Mac: see "Code.gs from the Mac" in SETUP.md.
# Only Code.gs and appsscript.json are sent (.claspignore); a push replaces the project's files with them.
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f .clasp.json && -f appsscript.json ]] || { echo "clasp isn't set up in this folder yet. See \"Code.gs from the Mac\" in SETUP.md."; exit 1; }

echo "Checking Code.gs…"
deno run --allow-read tests/all.js > /tmp/grace-music-tests.txt || { grep -B2 -A3 FAIL /tmp/grace-music-tests.txt; echo "A check failed, so nothing was sent."; exit 1; }
tail -1 /tmp/grace-music-tests.txt

scripts/clasp.sh push --force
[[ -n "${PUSH_ONLY:-}" ]] && { echo "Sent. Not deployed: the web app still runs the last version."; exit 0; }

# The deployment the pages and the iPads call: the id in the /exec address.
id=$(grep -o 'macros/s/[A-Za-z0-9_-]*/exec' index.html | head -1 | cut -d/ -f3)
[[ -n "$id" ]] || { echo "Couldn't find the web app's address in index.html."; exit 1; }
scripts/clasp.sh update-deployment "$id" -d "${1:-$(git log -1 --format=%s -- Code.gs | cut -c1-90)}"
