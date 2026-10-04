#!/bin/bash
# Double-click this file to add the Asana Admin MCP to Claude Code
cd "$(dirname "$0")" || exit 1

if [ ! -f "$HOME/.asana_token" ]; then
  echo "⚠️  ~/.asana_token not found"
  echo ""
  echo "   1. Open https://app.asana.com/0/my-apps"
  echo "   2. Create new token → copy the token"
  echo "   3. Paste it on the line below (it won't be shown on screen)"
  echo ""
  read -r -s -p "   Asana Personal Access Token: " TOKEN
  echo ""
  if [ -z "$TOKEN" ]; then echo "❌ No token entered — cancelled"; read -r; exit 1; fi
  printf '%s' "$TOKEN" > "$HOME/.asana_token"
  chmod 600 "$HOME/.asana_token"
  unset TOKEN
  echo "✅ Token saved to ~/.asana_token (permission 600 — readable only by you)"
  echo ""
fi

echo "📦 Installing dependencies..."
npm install --silent || { echo "❌ npm install failed"; read -r; exit 1; }

DIR="$(pwd)"
python3 - "$DIR" <<'PY'
import json, os, sys, time, shutil
f = os.path.expanduser("~/.claude.json")
d = json.load(open(f))
shutil.copy(f, f + ".bak-" + str(int(time.time())))   # back up before editing
d.setdefault("mcpServers", {})["asana-admin"] = {
    "type": "stdio",
    "command": "node",
    "args": [os.path.join(sys.argv[1], "src", "index.js")],
}
json.dump(d, open(f, "w"), indent=2)
print("\n✅ asana-admin added")
print("   MCP servers now:", ", ".join(d["mcpServers"].keys()))
print("\n👉 Restart Claude Code, then type  /mcp  to check\n")
PY

echo "Press Enter to close this window..."
read -r
