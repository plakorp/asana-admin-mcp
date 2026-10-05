# asana-admin-mcp

[English](README.md)

**Asana MCP สำหรับงานเขียน/แก้ที่ connector ทางการทำไม่ได้:** portfolio, custom field & dropdown,
project, section, project template, team (แท็บ People), Knowledge page และไฟล์แนบ
ใช้คู่กับ Asana connector ทางการ (ตัวนั้นเน้น task/read)

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

clone repo แล้วดับเบิลคลิก `install-asana-admin-mcp.command`
สคริปต์จะขอ token, รัน `npm install`, แล้วเขียน `~/.claude.json` ให้ (backup ทุกครั้ง)

> อย่าใช้ทั้ง 2 วิธีพร้อมกัน — จะได้ MCP ชื่อ `asana-admin` ซ้อนกัน 2 ตัว

### MCP client อื่น (Claude Desktop, Cursor, …)

ใส่ใน MCP config ของ client:

```json
{
  "mcpServers": {
    "asana-admin": {
      "command": "npx",
      "args": ["-y", "asana-admin-mcp"]
    }
  }
}
```

Token อ่านจาก env `ASANA_TOKEN` ก่อน ถ้าไม่มีค่อย fallback ไป `~/.asana_token`
→ ตัว token ไม่เคยอยู่ในรีโปและไม่ต้องอยู่ใน `~/.claude.json`

---

## Tools (44)

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
| `custom_field_detach` | **ถอด field ออกจาก project/portfolio เดียว** — ตัว field และค่าบนที่อื่นไม่ถูกแตะ |
| `custom_field_delete` | 🔴 **ลบ field ถาวร** หายจากทุกโปรเจกต์ในองค์กรพร้อมค่าบน task (ต้อง `confirm: true`) — endpoint นี้ **undocumented** |

> Asana **ลบค่า dropdown ไม่ได้** — ทำได้แค่ `enabled:false` งานที่เคยเลือกค่านั้นไว้จะยังเก็บค่าเดิม
>
> 🔴 **กับดักที่เกือบหลอกได้ (2026-08-27):** `DELETE /enum_options/{gid}` **มี route จริง** — ตอบ
> `"enum_option: Not a recognized ID"` ไม่ใช่ `"No matching route"` แต่พอยิงจริงกลับได้
> **403 `Enum option deletion is forbidden`**
> ⇒ **route มีอยู่ ≠ เรียกได้** เป็นคนละคำถาม และมีแค่การยิงจริงเท่านั้นที่ตอบข้อหลัง
> ตรงข้ามกับ `DELETE /custom_fields/{gid}` ที่ undocumented เหมือนกันแต่**ทำงานจริง** (smoke ยืนยัน)

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

### Project template ✅ มีจริง (ที่เคยเข้าใจว่าไม่มี)

| Tool | ทำอะไร |
|---|---|
| `template_list` | template ของทีม — **ใน organization ต้องส่ง `team_gid` เท่านั้น** |
| `template_get` | record เต็ม รวม `requested_roles` / `requested_dates` ที่ต้องตอบตอนสร้าง |
| `template_instantiate` | สร้างโปรเจกต์จริงจาก template — **default = dry run** ต้องส่ง `execute: true` ถึงจะสร้าง |

> 🔴 **กับดักที่ทำให้ทุกคนสรุปว่า "ไม่มี template API" (วัด 2026-08-27):**
> ถ้า domain Asana ของเราเป็น **organization ไม่ใช่ workspace** (domain บริษัทส่วนใหญ่เป็นแบบนี้) ⇒ `GET /project_templates?workspace={gid}`
> ตอบ 400 *"Not a valid regular workspace. You provided an organization"* ซึ่งอ่านเผิน ๆ เหมือน
> endpoint พัง ทั้งที่แค่ต้องเปลี่ยนเป็น **`?team={gid}`**
>
> ⚠️ **template ไม่พา Dashboard widget ไปด้วย** — ถ้าโปรเจกต์ใหม่ต้องมี chart ให้ใช้ `project_duplicate`

### Team / People

| Tool | ทำอะไร |
|---|---|
| `team_list` | ทีมของเรา (หรือ `all:true` = ทั้ง org) — ใช้ตัวนี้แทน `asana_find` เมื่อไม่มีชื่อจะค้น |
| `team_get` | record ทีม + **6 access-level setting** ที่บอกว่าใครมีสิทธิ์เชิญ/เอาคนออก/เปลี่ยนชื่อ |
| `team_create` | สร้างทีม (`secret` / `request_to_join` / `public`) |
| `team_update` | **rename** / description / visibility |
| `team_members` | คนในทีม พร้อม `is_admin` / `is_guest` / `is_limited_access` |
| `team_add_user` | เพิ่มคน**ที่อยู่ใน org แล้ว**เข้าทีม (รับ gid / email / `me`) |
| `team_remove_user` | เอาคนออกจากทีม (ต้อง `confirm: true`) |

> **เพดานที่วัดแล้ว 2026-08-27:**
> - 🔴 **ลบทีมไม่ได้** — `DELETE /teams/{gid}` ตอบ `No matching route` สร้างแล้วสร้างเลย ตั้งชื่อให้ถูกตั้งแต่แรก
> - 🟡 **เชิญคนเข้า org / ปิดบัญชี** (`POST /users`, `DELETE /users/{gid}`) ตอบ **403 ไม่ใช่ 404**
>   ⇒ route มีจริง แต่ **Personal Access Token สิทธิ์ไม่ถึง** ต้องเป็น org admin / service account
>   นี่คือเพดาน**สิทธิ์** ไม่ใช่เพดาน**ความสามารถ**

### Rule / Form / Dashboard / View — ไม่มี route เลย

ยิงตรงแล้วได้ `No matching route for request` ทุกตัว (2026-08-27):
`/rules` · `/rule_triggers` · `/projects/{gid}/rules` · `/automations` · `/forms` · `/dashboards` · `/widgets` · `/project_views`

⇒ **upgrade MCP ไม่ช่วย** MCP เป็นแค่ท่อต่อ REST API — ไม่มี endpoint ก็จบ
(ยกเว้น `POST /rule_triggers/{gid}/run` สำหรับ rule ที่ตั้ง trigger เป็น *Web request is received*
ซึ่งต้องให้คนก๊อป URL มาให้ เพราะไม่มี `GET /rules` ให้ auto-discover)

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

### Access
| Tool | ทำอะไร |
|---|---|
| `member_add` | ให้สิทธิ์คนหรือทีมเข้า project หรือ portfolio |
| `member_list` | ใครมีสิทธิ์ใน project หรือ portfolio บ้าง และระดับไหน |
| `member_update` | เปลี่ยนระดับสิทธิ์ของ membership ที่มีอยู่ (ส่ง membership gid จาก `member_list`) |

> ระดับสิทธิ์: admin / editor / commenter / **viewer** ใช้ได้ทั้ง project และ portfolio (วัด 2026-10-05 — viewer บน project มีผลจริง เช่นลบไม่ได้ 403) · `member_update` เปลี่ยนระดับของ membership ที่มีอยู่ · ลดสิทธิ์ตัวเองแล้วมีผลทันที
> **portfolio** มี admin / editor / viewer

### Attachment
| Tool | ทำอะไร |
|---|---|
| `task_attach` | **อัปโหลดไฟล์จากเครื่องขึ้นไปแนบกับ task** (parent เป็น project / project brief ก็ได้) — สูงสุด 100 MB |
| `task_attachments` | ไฟล์ที่แนบอยู่แล้ว + gid ที่ต้องใช้ตอนลบ |
| `attachment_delete` | ลบไฟล์ที่แนบ (ต้อง `confirm: true`) |

`/attachments` เป็น endpoint เดียวในเซิร์ฟเวอร์นี้ที่ **ไม่ใช่ JSON** — ต้องส่ง `multipart/form-data`
เลยไม่ผ่าน `req()` แต่ใช้ `upload()` ใน `client.js` แทน (ห้ามตั้ง header `Content-Type` เอง
ต้องปล่อยให้ `fetch` เขียน boundary ให้)
Asana ไม่มี API เอาไฟล์ที่แนบอยู่แล้วไปแปะ task อื่น — ต้องอัปใหม่

---

**ไม่มี tool สำหรับลบ project / portfolio / team โดยตั้งใจ** — ลบพวกนี้กู้ไม่ได้ ให้ทำในหน้าเว็บ
(team ลบผ่าน API ไม่ได้อยู่แล้ว — `DELETE /teams/{gid}` ตอบ `No matching route`)
ส่วน `custom_field_delete` มีให้ แต่บังคับ `confirm: true` และควรลอง `custom_field_detach` ก่อนเสมอ

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
