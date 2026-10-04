# How to get an Asana Personal Access Token

Takes ~1 minute, once.

---

## 1. Open the Developer console

```
https://app.asana.com/0/my-apps
```

(From inside the app: click your profile picture top right → **Settings** → **Apps** tab → **Manage developer apps**)

## 2. Find the **Personal access tokens** section → click **+ Create new token**

## 3. Name the token

Use a name that tells you what it's for, e.g.

```
claude-code-mcp
```

This name shows up in the console when you want to revoke it later, so make it recognizable.

## 4. Accept the API terms → **Create token**

## 5. Copy the token right away

> ⚠️ **Asana shows the token only once.** Once you close the window you can't see it again.
> If you miss it, delete the old one and create a new one. Nothing breaks.

## 6. Save the token

If you installed the plugin, run:

```bash
printf '%s' 'PASTE_TOKEN_HERE' > ~/.asana_token && chmod 600 ~/.asana_token
```

If you're doing the manual install, double-click this file in the cloned repo instead (macOS):

```
install-asana-admin-mcp.command
```

It asks for the token **without echoing it on screen** → paste (`⌘V`) and press Enter.
The script saves it to `~/.asana_token` with permission `600` (readable only by your user) and registers the MCP for you.

---

## Check the token works

```bash
curl -s -H "Authorization: Bearer $(cat ~/.asana_token)" https://app.asana.com/api/1.0/users/me | python3 -m json.tool
```

You should see your name + email + list of workspaces (the token itself never appears in the output).

If you get `401 Not Authorized` → the token is wrong or revoked. Create a new one.

---

## Good to know

| Topic | Details |
|---|---|
| **Permissions** | A token has exactly your permissions. There are no scopes to limit it: it can see and edit everything you can in the web app |
| **Expiry** | Asana doesn't publish a fixed expiry. It works until you revoke it |
| **How many** | You can create several, but not unlimited. Delete old ones you don't use |
| **Revoking** | Go back to the same page and click Deactivate next to the token name. Takes effect immediately |
| **If your org blocks it** | Some orgs don't let employees create developer apps. If you get an error, ask your Asana admin to enable it first |
| **Don't** | Don't paste the token into a chat, commit it to git, or put it in `~/.claude.json`. Keep it only in `~/.asana_token` |

---

## Changing the token later

```bash
printf '%s' 'NEW_TOKEN' > ~/.asana_token && chmod 600 ~/.asana_token
```

No config changes needed. The MCP reads this file every time it starts.
