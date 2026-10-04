# asana-admin-mcp

[ภาษาไทย](README.th.md)

**Asana MCP for the write operations the official connector can't do:** portfolios, custom fields & dropdowns,
projects, sections, project templates, teams (the People tab), Knowledge pages and file attachments.
Use it alongside the official Asana connector, which covers tasks and reading.

---

## ⚠️ Dashboards can't be automated, and it isn't this MCP's limit

Asana has **no public API for Dashboards / charts / widgets / project view tabs**
(checked all 175 endpoints in the [official OpenAPI spec](https://github.com/Asana/openapi): none exist).

The only thing you can automate is **`project_duplicate`**. The spec says that when a project is duplicated,
its Project Views (List / Board / Dashboard tabs) are always copied and this can't be turned off.
→ Set up the Dashboard once in a "template project", then duplicate it every time you need a new project.

> 🟡 **Not proven yet:** the spec says "Project Views" are copied, but doesn't say whether the **charts inside a Dashboard**
> come along or only an empty tab. The API can't check this (no endpoint reads charts), so you have to look.
> The 2026-08-17 smoke test duplicated a project with no charts, so it doesn't answer this.

Note: **Project Templates don't carry Dashboards** (still an open feature request on the Asana forum).
Use duplicate, not a template.

---

## Install

### 1. Get an Asana token first (everyone needs their own)

Follow **[GET-TOKEN.md](GET-TOKEN.md)** → save it to `~/.asana_token`

```bash
printf '%s' 'PASTE_TOKEN_HERE' > ~/.asana_token && chmod 600 ~/.asana_token
```

> A token carries one person's permissions. **Never use someone else's**: Asana logs every change under the token owner's name.

### 2. Install the plugin (recommended)

In Claude Code, type these 2 lines:

```
/plugin marketplace add plakorp/asana-admin-mcp
/plugin install asana-admin@asana-admin-mcp
```

Claude Code clones the repo, runs `npm ci` and registers the MCP for you. No need to touch `~/.claude.json`.
To update later: `/plugin update`

Requires **Node 20+** (check with `node -v`).

### Option 2: manual install (if you don't want the plugin)

Clone the repo and double-click `install-asana-admin-mcp.command` (macOS).
The script asks for your token, runs `npm install`, then writes `~/.claude.json` for you (backing it up every time).

> Don't use both methods at once, or you'll get two MCPs both named `asana-admin`.

### Other MCP clients (Claude Desktop, Cursor, …)

Add this to the client's MCP config:

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

The token is read from the `ASANA_TOKEN` env var first, falling back to `~/.asana_token`.
→ The token never lives in the repo and doesn't need to be in `~/.claude.json`.

---

## Tools (43)

Every tool takes a **gid**, not a name. Use `asana_find` to turn a name into a gid first.

### Discovery
| Tool | What it does |
|---|---|
| `asana_whoami` | You + all your workspaces (start here: almost every create needs a `workspace_gid`) |
| `asana_find` | Typeahead lookup from name to gid: project / portfolio / custom_field / task / team / user / tag / goal |
| `asana_list_custom_fields` | Custom fields in a workspace, or attached to a project/portfolio. **Returns `enum_options` with gids**, which every dropdown tool takes as input |

### Portfolio
| Tool | What it does |
|---|---|
| `portfolio_create` | Create a portfolio |
| `portfolio_update` | **Rename** / change color / public |
| `portfolio_list_items` | Projects in a portfolio, in the order they're actually shown |
| `portfolio_add_item` | **Add a project to a portfolio** at a chosen position (`insert_before` / `insert_after`). Calling it again on an existing item **moves** it |
| `portfolio_remove_item` | Remove a project (requires `confirm: true`) |

### Custom field / dropdown
| Tool | What it does |
|---|---|
| `custom_field_create` | Create a field: `enum` (single-select dropdown) / `multi_enum` / text / number / date / people |
| `custom_field_update` | **Rename** / edit description |
| `enum_option_create` | **Add a dropdown option** at a chosen position |
| `enum_option_update` | **Rename** / change color / `enabled:false` to retire it |
| `enum_option_reorder` | **Reorder dropdown options** |
| `custom_field_attach` | Attach a field to a project or portfolio (`is_important:true` = show it as a column) |
| `custom_field_detach` | **Detach a field from one project/portfolio.** The field itself and its values elsewhere are untouched |
| `custom_field_delete` | 🔴 **Delete a field permanently.** It disappears from every project in the org, along with its values on tasks (requires `confirm: true`). This endpoint is **undocumented** |

> Asana **can't delete dropdown options**, only `enabled:false`. Tasks that already use that option keep their value.
>
> 🔴 **A trap that nearly fooled us (2026-08-27):** `DELETE /enum_options/{gid}` **has a real route**. It answers
> `"enum_option: Not a recognized ID"`, not `"No matching route"`, but a real call returns
> **403 `Enum option deletion is forbidden`**.
> ⇒ **A route existing ≠ being allowed to call it.** They're separate questions, and only a real call answers the second.
> Compare `DELETE /custom_fields/{gid}`: also undocumented, but it **works** (confirmed by the smoke test).

### Knowledge pages ⚠️ undocumented API

| Tool | What it does |
|---|---|
| `page_create` | Create a page in **Knowledge → Pages** |
| `page_update` | **Rename** / edit content / privacy |
| `page_get` | Read a full page including `html_text` |
| `page_list` | All pages in a workspace |

> 🔴 **Asana doesn't document this endpoint anywhere.** It's not in the OpenAPI spec or in
> `developers.asana.com/llms.txt`. Found by probing directly on 2026-08-17.
> A Knowledge Page is a resource called **`note`** (`/notes`, permalink `/note/{gid}`).
> **Undocumented things can change at any time.** If it starts returning 404 one day, that's Asana, not a bug here.
> `npm run smoke` covers this so you find out fast.

**HTML limits (measured):**
- `<p>` **doesn't work** → `xml_parsing_error` (use newlines for line breaks)
- `<h1>` `<h2>` are accepted but stored as `<strong>`, so **heading levels are lost**
- Works: `strong` `em` `u` `s` `ul` `ol` `li` `a` `blockquote` `code` `pre` `hr` `img` **`table`**
- `privacy_setting`: `members_only` (default) | `public_to_domain`

#### 🔴 4 traps that make people think "it can't be done" (measured 2026-08-21)

**1. Tables work, but this isn't written down anywhere**
Send `<table><tr><td>…</td></tr></table>` directly and Asana stores it as a **real native table**, not text.
There's no `thead` / `th`: make a header row by putting `<strong>` in the first row's cells.
Asana adds a `⚠ This table cannot be viewed on Mobile` line above the table by itself (you don't write it).

**2. `page_get` can't read tables back, so don't use it to judge whether a write worked**
A table on the page comes back as an empty placeholder line:
```html
<i>⚠ This table cannot be viewed on Mobile. Please view it on Web. ⚠</i>
```
No rows, no cells → **only the web UI can confirm it.** Going by `page_get`, you'd wrongly conclude the table was stripped.

**3. ⚠️ A round-trip silently deletes tables**
`html_text` **replaces the whole body; it doesn't append** → to add content you `page_get` and concatenate the string yourself.
But because of trap 2, a plain `page_get` → `page_update` **deletes every existing table on the page.**
Before overwriting a page you didn't write → check the web UI for tables first.

**4. Links need time to enrich; they aren't broken**
Put a plain permalink in `href` and Asana enriches it into a mention by itself,
but **right after writing it still shows as a raw URL until you reload**.
The displayed label is always replaced with the page's real name, whatever text you put in.

> Also: tables wider than ~5 columns **overflow the content area** and the rightmost columns get cut off. Merge columns first.

### Project template ✅ exists (contrary to what we first thought)

| Tool | What it does |
|---|---|
| `template_list` | A team's templates. **In an organization you must pass `team_gid`** |
| `template_get` | Full record, including the `requested_roles` / `requested_dates` you must answer when instantiating |
| `template_instantiate` | Create a real project from a template. **Defaults to a dry run**; pass `execute: true` to actually create it |

> 🔴 **The trap that makes everyone conclude "there's no template API" (measured 2026-08-27):**
> If your Asana domain is an **organization, not a workspace** (most company domains are), `GET /project_templates?workspace={gid}`
> returns 400 *"Not a valid regular workspace. You provided an organization"*, which at a glance looks like a broken
> endpoint. You just need to switch to **`?team={gid}`**.
>
> ⚠️ **Templates don't carry Dashboard widgets.** If the new project needs charts, use `project_duplicate`.

### Team / People

| Tool | What it does |
|---|---|
| `team_list` | Your teams (or `all:true` = the whole org). Use this instead of `asana_find` when you have no name to search for |
| `team_get` | Team record + **6 access-level settings** that say who can invite / remove members / rename |
| `team_create` | Create a team (`secret` / `request_to_join` / `public`) |
| `team_update` | **Rename** / description / visibility |
| `team_members` | Team members with `is_admin` / `is_guest` / `is_limited_access` |
| `team_add_user` | Add someone **already in the org** to a team (takes gid / email / `me`) |
| `team_remove_user` | Remove someone from a team (requires `confirm: true`) |

> **Ceilings measured 2026-08-27:**
> - 🔴 **Teams can't be deleted.** `DELETE /teams/{gid}` returns `No matching route`. Once created, it stays, so name it right the first time.
> - 🟡 **Inviting people to the org / deactivating accounts** (`POST /users`, `DELETE /users/{gid}`) returns **403, not 404**
>   ⇒ the route exists, but a **Personal Access Token doesn't have the permission**. It needs an org admin / service account.
>   This is a **permission** ceiling, not a **capability** ceiling.

### Rule / Form / Dashboard / View: no routes at all

Calling these directly returns `No matching route for request` for every one (2026-08-27):
`/rules` · `/rule_triggers` · `/projects/{gid}/rules` · `/automations` · `/forms` · `/dashboards` · `/widgets` · `/project_views`

⇒ **Upgrading the MCP won't help.** An MCP is just a pipe to the REST API; no endpoint, no feature.
(The exception is `POST /rule_triggers/{gid}/run`, for rules whose trigger is *Web request is received*.
Someone has to copy that URL for you, because there's no `GET /rules` to discover it automatically.)

### Project / Section
| Tool | What it does |
|---|---|
| `project_create` | Create a project (in an organization it needs a `team_gid`) |
| `project_update` | **Rename** / notes / color / `default_view` / archive |
| `project_set_fields` | **Write a project's custom field values.** The only way to fill the columns you see in a portfolio's List view, because those values live on the project, not the portfolio |
| `project_duplicate` | Copy a project **including its Dashboard**: the only workaround for dashboards (returns a job, runs async) |
| `project_list_sections` | Sections in order, with gids |
| `section_create` | Add a section at a chosen position |
| `section_update` | **Rename** a section |
| `section_reorder` | **Reorder** sections |

### Access
| Tool | What it does |
|---|---|
| `member_add` | Give a person or team access to a project or portfolio |
| `member_list` | Who has access to a project or portfolio, and at what level |

> Asana's own limits: a **project** is admin / editor / commenter only. There's **no view-only level for projects**, so commenter is the least access possible.
> A **portfolio** is admin / editor / viewer.

### Attachment
| Tool | What it does |
|---|---|
| `task_attach` | **Upload a local file and attach it to a task** (the parent can also be a project / project brief). Up to 100 MB |
| `task_attachments` | Files already attached, plus the gids you need to delete them |
| `attachment_delete` | Delete an attachment (requires `confirm: true`) |

`/attachments` is the only endpoint in this server that **isn't JSON**: it takes `multipart/form-data`,
so it skips `req()` and uses `upload()` in `client.js` instead. (Never set the `Content-Type` header yourself;
let `fetch` write the boundary.)
Asana has no API to attach an existing attachment to another task; you have to upload it again.

---

**There are deliberately no tools to delete a project / portfolio / team.** Those deletes can't be undone, so do them in the web UI.
(Teams can't be deleted through the API anyway: `DELETE /teams/{gid}` returns `No matching route`.)
`custom_field_delete` is available, but requires `confirm: true`, and you should always try `custom_field_detach` first.

---

## Colors (for portfolios / projects / enum options)

`none` `red` `orange` `yellow-orange` `yellow` `yellow-green` `green` `blue-green`
`aqua` `blue` `indigo` `purple` `magenta` `hot-pink` `pink` `cool-gray`

---

## Testing

```bash
ASANA_TOKEN=$(cat ~/.asana_token) npm run smoke
```

Creates real objects in the token's first workspace, named `ZZ-mcp-smoke-*` → checks every tool → **deletes everything it created**.
Without a token it runs only the first half (server boot + list tools).

---

## Behavior notes

- 429 → retries automatically up to 3 times, honoring `Retry-After`
- Errors from Asana come back as the API's actual message (which field is missing / which gid is wrong), not just a status code
- Fields you don't send are left untouched: a `portfolio_update` that sends only `name` won't clear the color
