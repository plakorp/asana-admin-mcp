# วิธีเอา Asana Personal Access Token

ใช้เวลา ~1 นาที ทำครั้งเดียว

---

## 1. เปิดหน้า Developer console

```
https://app.asana.com/0/my-apps
```

(ถ้าอยากไปจากในแอป: คลิกรูปโปรไฟล์มุมขวาบน → **Settings** → แท็บ **Apps** → **Manage developer apps**)

## 2. หา section **Personal access tokens** → กด **+ Create new token**

## 3. ตั้งชื่อ token

ใส่ชื่อที่บอกได้ว่าใครใช้ เช่น

```
claude-code-mcp
```

ชื่อนี้จะโผล่ในหน้า console เวลาจะมาเพิกถอนทีหลัง — ตั้งให้รู้เรื่อง

## 4. ติ๊กยอมรับ API terms → **Create token**

## 5. ก๊อป token ทันที

> ⚠️ **Asana โชว์ token ให้เห็นครั้งเดียว** ปิดหน้าต่างแล้วดูซ้ำไม่ได้
> ถ้าพลาด — ลบตัวเก่าแล้วสร้างใหม่ได้ ไม่มีอะไรเสียหาย

## 6. เอา token มาใส่

ดับเบิลคลิกไฟล์นี้:

```
~/Desktop/Claude/mcp/asana-admin-mcp/ติดตั้ง-asana-admin-mcp.command
```

มันจะถามหา token แบบ **ไม่แสดงตัวอักษรบนจอ** → วาง (`⌘V`) แล้ว Enter
สคริปต์จะเก็บไว้ที่ `~/.asana_token` สิทธิ์ `600` (อ่านได้เฉพาะ user คุณ) แล้วลงทะเบียน MCP ให้เอง

---

## เช็คว่า token ใช้ได้

```bash
curl -s -H "Authorization: Bearer $(cat ~/.asana_token)" https://app.asana.com/api/1.0/users/me | python3 -m json.tool
```

ควรได้ชื่อ + email + รายการ workspace ของคุณ (ไม่มี token โผล่ใน output)

ถ้าได้ `401 Not Authorized` → token ผิดหรือถูกเพิกถอน สร้างใหม่

---

## เรื่องที่ควรรู้

| เรื่อง | รายละเอียด |
|---|---|
| **สิทธิ์** | token = สิทธิ์เท่าตัวคุณเป๊ะ ๆ ไม่มี scope ให้จำกัด — เห็นและแก้ได้ทุกอย่างที่คุณเห็นและแก้ได้ในเว็บ |
| **วันหมดอายุ** | Asana ไม่ประกาศวันหมดอายุตายตัว ใช้ได้จนกว่าจะเพิกถอนเอง |
| **จำนวน** | สร้างได้หลายอัน แต่ไม่ไม่จำกัด — ลบอันเก่าที่ไม่ใช้ทิ้ง |
| **เพิกถอน** | กลับไปหน้าเดิม กด Deactivate ข้างชื่อ token — มีผลทันที |
| **ถ้า BBL ล็อกไว้** | บาง org ปิดไม่ให้พนักงานสร้าง developer app ถ้ากดแล้วขึ้น error ต้องให้ Asana admin เปิดให้ก่อน |
| **อย่าทำ** | อย่าวาง token ลงในแชท, commit เข้า git, หรือใส่ใน `~/.claude.json` — ให้อยู่ในไฟล์ `~/.asana_token` ที่เดียว |

---

## เปลี่ยน token ทีหลัง

```bash
printf '%s' 'TOKEN_ใหม่' > ~/.asana_token && chmod 600 ~/.asana_token
```

ไม่ต้องแก้ config อะไร — MCP อ่านจากไฟล์นี้ทุกครั้งที่เริ่มทำงาน
