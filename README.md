# asana-admin-mcp

MCP server สำหรับ **จัดโครงสร้าง Asana** — portfolio, custom field / dropdown, project, section
เติมช่องที่ Asana connector ตัวมาตรฐานทำไม่ได้ (ตัวนั้นเน้น task/read)

---

## ⚠️ Dashboard ทำไม่ได้ — และไม่ใช่ข้อจำกัดของ MCP ตัวนี้

Asana **ไม่เปิด public API สำหรับ Dashboard / chart / widget / project view tab** เลย
(ไล่ครบ 175 endpoints ใน [OpenAPI spec ทางการ](https://github.com/Asana/openapi) — ไม่มีสักตัว)

ทางเดียวที่ automate ได้คือ **`project_duplicate`** — สเปคระบุว่าเวลา duplicate project นั้น
Project Views (แท็บ List / Board / Dashboard) ถูกก๊อปตามไปเสมอและปิดไม่ได้
→ ตั้ง Dashboard ไว้ใน "โปรเจกต์ต้นแบบ" หนึ่งอัน แล้ว duplicate ทุกครั้งที่ต้องการโปรเจกต์ใหม่

> 🟡 **ยังไม่ได้พิสูจน์:** สเปคเขียนว่า "Project Views" ตามไป แต่ไม่ได้บอกชัดว่า **chart ที่ตั้งไว้ใน Dashboard**
> ตามไปด้วยหรือได้แค่แท็บเปล่า — ตรวจไม่ได้ผ่าน API (ไม่มี endpoint ให้อ่าน chart) ต้องเปิดดูด้วยตา
> smoke test 2026-08-17 duplicate โปรเจกต์ที่ไม่มี chart จึงยังไม่ตอบข้อนี้

หมายเหตุ: **Project Template ไม่พา Dashboard ไปด้วย** (ยังเป็น feature request ค้างอยู่ในฟอรัม Asana)
ต้องใช้ duplicate ไม่ใช่ template

---

## ติดตั้ง

### 1. เอา Asana token ก่อน (ทุกคนต้องมีของตัวเอง)

ทำตาม **[GET-TOKEN.md](GET-TOKEN.md)** → เซฟไว้ที่ `~/.asana_token`

```bash
printf '%s' 'วาง_token_ตรงนี้' > ~/.asana_token && chmod 600 ~/.asana_token
```

> token ผูกกับสิทธิ์รายบุคคล **ห้ามใช้ของคนอื่น** — log ใน Asana จะขึ้นชื่อเจ้าของ token

### 2. ติดตั้ง plugin (แนะนำ)

ใน Claude Code พิมพ์ 2 บรรทัด:

```
/plugin marketplace add plakorp/asana-admin-mcp
/plugin install asana-admin@asana-admin-mcp
```

Claude Code จะ clone repo + รัน `npm ci` ให้เอง แล้วลงทะเบียน MCP ให้ — ไม่ต้องแตะ `~/.claude.json`
อัปเดตทีหลังก็ `/plugin update`

ต้องมี **Node 20+** ในเครื่อง (`node -v` เช็ก)

### วิธีที่ 2 — ติดตั้งมือ (ถ้าไม่อยากใช้ plugin)

clone repo แล้วดับเบิลคลิก `ติดตั้ง-asana-admin-mcp.command`
สคริปต์จะขอ token, รัน `npm install`, แล้วเขียน `~/.claude.json` ให้ (backup ทุกครั้ง)

> อย่าใช้ทั้ง 2 วิธีพร้อมกัน — จะได้ MCP ชื่อ `asana-admin` ซ้อนกัน 2 ตัว

Token อ่านจาก env `ASANA_TOKEN` ก่อน ถ้าไม่มีค่อย fallback ไป `~/.asana_token`
→ ตัว token ไม่เคยอยู่ในรีโปและไม่ต้องอยู่ใน `~/.claude.json`

---

## Tools (28)

ทุก tool รับ **gid** ไม่ใช่ชื่อ — ใช้ `asana_find` แปลงชื่อ → gid ก่อน

### Discovery
| Tool | ทำอะไร |
|---|---|
| `asana_whoami` | ตัวเอง + workspace ทั้งหมด (เริ่มที่นี่ เพราะเกือบทุก create ต้องใช้ `workspace_gid`) |
| `asana_find` | typeahead หา gid จากชื่อ — project / portfolio / custom_field / task / team / user / tag / goal |
| `asana_list_custom_fields` | custom field ใน workspace หรือที่ผูกกับ project/portfolio — **คืน `enum_options` พร้อม gid** ซึ่งเป็น input ของทุก tool กลุ่ม dropdown |

### Portfolio
| Tool | ทำอะไร |
|---|---|
| `portfolio_create` | สร้าง portfolio |
| `portfolio_update` | **rename** / เปลี่ยนสี / public |
| `portfolio_list_items` | ดูโปรเจกต์ใน portfolio ตามลำดับที่แสดงจริง |
| `portfolio_add_item` | **เพิ่มโปรเจกต์เข้า portfolio** + ระบุตำแหน่งได้ (`insert_before` / `insert_after`) — เรียกซ้ำกับ item ที่มีอยู่แล้ว = **ย้ายตำแหน่ง** |
| `portfolio_remove_item` | ถอดโปรเจกต์ออก (ต้องส่ง `confirm: true`) |

### Custom field / dropdown
| Tool | ทำอะไร |
|---|---|
| `custom_field_create` | สร้าง field — `enum` (dropdown เลือกอันเดียว) / `multi_enum` / text / number / date / people |
| `custom_field_update` | **rename** / แก้ description |
| `enum_option_create` | **เพิ่มค่าใน dropdown** + ระบุตำแหน่งได้ |
| `enum_option_update` | **rename** / เปลี่ยนสี / `enabled:false` เพื่อเลิกใช้ |
| `enum_option_reorder` | **จัดลำดับค่าใน dropdown** |
| `custom_field_attach` | ผูก field เข้า project หรือ portfolio (`is_important:true` = โชว์เป็นคอลัมน์) |

> Asana **ลบค่า dropdown ไม่ได้** — ทำได้แค่ `enabled:false` งานที่เคยเลือกค่านั้นไว้จะยังเก็บค่าเดิม

### Knowledge pages ⚠️ undocumented API

| Tool | ทำอะไร |
|---|---|
| `page_create` | สร้างหน้าใน **Knowledge → Pages** |
| `page_update` | **rename** / แก้เนื้อหา / privacy |
| `page_get` | อ่านหน้าเต็มรวม `html_text` |
| `page_list` | หน้าทั้งหมดใน workspace |

> 🔴 **Asana ไม่ประกาศ endpoint นี้ที่ไหนเลย** — ไม่มีใน OpenAPI spec และไม่มีใน
> `developers.asana.com/llms.txt` ค้นพบด้วยการ probe ตรง ๆ เมื่อ 2026-08-17
> Knowledge Page = resource ชื่อ **`note`** (`/notes`, permalink `/note/{gid}`)
> **ของที่ไม่ประกาศเปลี่ยนได้ทุกเมื่อ** — ถ้าวันหนึ่ง 404 นั่นคือ Asana ไม่ใช่บั๊กของเรา
> `npm run smoke` ครอบคลุมส่วนนี้ไว้เพื่อให้รู้ตัวเร็ว

**ข้อจำกัดของ HTML ที่วัดเอง:**
- `<p>` **ใช้ไม่ได้** → `xml_parsing_error` (ขึ้นบรรทัดใหม่ด้วย newline แทน)
- `<h1>` `<h2>` ส่งได้ แต่ถูกเก็บเป็น `<strong>` — **ระดับหัวข้อไม่รอด**
- ใช้ได้: `strong` `em` `u` `s` `ul` `ol` `li` `a` `blockquote` `code` `pre` `hr` `img` **`table`**
- `privacy_setting`: `members_only` (ค่าตั้งต้น) | `public_to_domain`

#### 🔴 4 กับดักที่ทำให้คนคิดว่า "ทำไม่ได้" (วัดจริง 2026-08-21)

**1. ตารางทำได้ — แต่ไม่มีเขียนไว้ที่ไหนเลย**
ส่ง `<table><tr><td>…</td></tr></table>` ได้ตรง ๆ Asana เก็บเป็น **native table จริง** ไม่ใช่ข้อความ
ไม่มี `thead` / `th` — ทำหัวตารางด้วยการใส่ `<strong>` ในเซลล์แถวแรก
Asana จะแปะบรรทัด `⚠ This table cannot be viewed on Mobile` ให้เองเหนือตาราง (เราไม่ต้องเขียน)

**2. `page_get` อ่านตารางกลับมาไม่ได้ — ห้ามใช้ตัดสินว่าเขียนสำเร็จไหม**
ตารางที่อยู่บนหน้าจะคืนมาเป็นบรรทัด placeholder เปล่า ๆ:
```html
<i>⚠ This table cannot be viewed on Mobile. Please view it on Web. ⚠</i>
```
ไม่มีแถว ไม่มีเซลล์เลย → **ยืนยันด้วยการเปิดเว็บดูเท่านั้น** ถ้าดูจาก `page_get` จะสรุปผิดว่าโดน strip

**3. ⚠️ round-trip ลบตารางทิ้งแบบเงียบ ๆ**
`html_text` = **replace ทั้ง body ไม่ใช่ append** → การเพิ่มเนื้อหาต้อง `page_get` แล้วต่อ string เอง
แต่เพราะข้อ 2 การ `page_get` → `page_update` ธรรมดา **จะลบตารางเดิมที่มีอยู่บนหน้าไปทั้งหมด**
ก่อนเขียนทับหน้าที่ไม่ได้เขียนเอง → เปิดเว็บเช็คก่อนว่ามีตารางอยู่ไหม

**4. link ต้องรอ enrich — ไม่ใช่พัง**
ใส่ permalink ธรรมดาใน `href` แล้ว Asana จะ enrich เป็น mention ให้เอง
แต่ **หลังเขียนเสร็จทันทีจะยังโชว์เป็น URL ดิบ ต้อง reload ก่อน**
และ label ที่แสดงจะถูกเขียนทับด้วยชื่อจริงของ page เสมอ ไม่ว่าจะใส่ข้อความอะไรไว้

> เพิ่มเติม: ตารางเกิน ~5 คอลัมน์จะ**ล้นกรอบเนื้อหา** คอลัมน์ขวาสุดโดนตัด — ยุบคอลัมน์ก่อน

### Project / Section
| Tool | ทำอะไร |
|---|---|
| `project_create` | สร้างโปรเจกต์ (ใน organization ต้องมี `team_gid`) |
| `project_update` | **rename** / notes / สี / `default_view` / archive |
| `project_set_fields` | **เขียนค่า custom field ของ project** — ทางเดียวที่จะเติมคอลัมน์ที่เห็นใน portfolio List view เพราะค่าอยู่บน project ไม่ใช่บน portfolio |
| `project_duplicate` | ก๊อปโปรเจกต์ **พา Dashboard ไปด้วย** — ทางออกเดียวของเรื่อง dashboard (คืน job, ทำงาน async) |
| `project_list_sections` | section ตามลำดับ + gid |
| `section_create` | เพิ่ม section + ระบุตำแหน่งได้ |
| `section_update` | **rename** section |
| `section_reorder` | **จัดลำดับ** section |

**ไม่มี tool สำหรับลบ project / portfolio / custom field โดยตั้งใจ** — ลบพวกนี้กู้ไม่ได้ ให้ทำในหน้าเว็บ

---

## สี (ใช้ได้กับ portfolio / project / enum option)

`none` `red` `orange` `yellow-orange` `yellow` `yellow-green` `green` `blue-green`
`aqua` `blue` `indigo` `purple` `magenta` `hot-pink` `pink` `cool-gray`

---

## ทดสอบ

```bash
ASANA_TOKEN=$(cat ~/.asana_token) npm run smoke
```

สร้างของจริงใน workspace แรกของ token ชื่อขึ้นต้น `ZZ-mcp-smoke-*` → ตรวจทุก tool → **ลบทิ้งเองทั้งหมด**
ถ้าไม่ใส่ token จะรันแค่ครึ่งแรก (server boot + list tools)

---

## หมายเหตุการทำงาน

- 429 → retry อัตโนมัติ 3 ครั้ง ตาม `Retry-After`
- error จาก Asana ส่งกลับเป็นข้อความจริงจาก API (บอกว่า field ไหนหาย / gid ไหนผิด) ไม่ใช่แค่ status code
- ฟิลด์ที่ไม่ได้ส่ง จะไม่ถูกแตะ — `portfolio_update` ที่ส่งแค่ `name` ไม่ล้างสี
