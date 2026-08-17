#!/bin/bash
# Double-click ไฟล์นี้เพื่อเพิ่ม Asana Admin MCP เข้า Claude Code
cd "$(dirname "$0")" || exit 1

if [ ! -f "$HOME/.asana_token" ]; then
  echo "⚠️  ยังไม่มีไฟล์ ~/.asana_token"
  echo ""
  echo "   1. เปิด https://app.asana.com/0/my-apps"
  echo "   2. Create new token → ก๊อป token มา"
  echo "   3. วางในบรรทัดข้างล่างนี้ (จะไม่แสดงบนหน้าจอ)"
  echo ""
  read -r -s -p "   Asana Personal Access Token: " TOKEN
  echo ""
  if [ -z "$TOKEN" ]; then echo "❌ ไม่ได้ใส่ token — ยกเลิก"; read -r; exit 1; fi
  printf '%s' "$TOKEN" > "$HOME/.asana_token"
  chmod 600 "$HOME/.asana_token"
  unset TOKEN
  echo "✅ เก็บ token ไว้ที่ ~/.asana_token (สิทธิ์ 600 — อ่านได้เฉพาะคุณ)"
  echo ""
fi

echo "📦 ติดตั้ง dependencies..."
npm install --silent || { echo "❌ npm install ไม่ผ่าน"; read -r; exit 1; }

DIR="$(pwd)"
python3 - "$DIR" <<'PY'
import json, os, sys, time, shutil
f = os.path.expanduser("~/.claude.json")
d = json.load(open(f))
shutil.copy(f, f + ".bak-" + str(int(time.time())))   # backup ก่อนแก้
d.setdefault("mcpServers", {})["asana-admin"] = {
    "type": "stdio",
    "command": "node",
    "args": [os.path.join(sys.argv[1], "src", "index.js")],
}
json.dump(d, open(f, "w"), indent=2)
print("\n✅ เพิ่ม asana-admin แล้ว")
print("   MCP servers ตอนนี้:", ", ".join(d["mcpServers"].keys()))
print("\n👉 ปิด-เปิด Claude Code ใหม่ แล้วพิมพ์  /mcp  เพื่อเช็ค\n")
PY

echo "กด Enter เพื่อปิดหน้าต่างนี้..."
read -r
