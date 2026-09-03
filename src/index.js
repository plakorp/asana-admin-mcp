#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { req, clean, onePosition, upload } from "./client.js";

const server = new McpServer({ name: "asana-admin", version: "1.4.0" });

const ok = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

/** Wrap every handler so an Asana 4xx comes back as a readable tool error, not a crash. */
const tool = (name, config, handler) =>
  server.registerTool(name, config, async (args) => {
    try {
      return ok(await handler(args));
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
  });

const GID = z.string().describe("Asana gid (numeric string). Use asana_find to look one up by name.");
const COLOR = z
  .string()
  .describe(
    "One of: none, red, orange, yellow-orange, yellow, yellow-green, green, blue-green, aqua, blue, indigo, purple, magenta, hot-pink, pink, cool-gray"
  );

/**
 * Asana has no trash for structure objects — a deleted custom field, dropdown value
 * or team membership is gone, and the data that hung off it goes with it. Every tool
 * that destroys something takes this, so the destruction is always a second decision.
 */
const CONFIRM = z
  .literal(true)
  .describe("Must be true. This permanently destroys something; there is no undo and no trash.");

// ─── Discovery ────────────────────────────────────────────────────────────────

tool(
  "asana_whoami",
  {
    title: "Who am I",
    description:
      "The authenticated user and their workspaces. Call this first — almost every create call needs a workspace_gid.",
    inputSchema: {},
  },
  async () => req("GET", "/users/me", { query: { opt_fields: "name,email,workspaces.name" } })
);

tool(
  "asana_find",
  {
    title: "Find gid by name",
    description:
      "Typeahead search that turns a name you can see in the Asana UI into the gid every other tool needs.",
    inputSchema: {
      workspace_gid: GID,
      query: z.string().describe("Name or part of a name, as shown in Asana."),
      type: z
        .enum(["project", "portfolio", "custom_field", "task", "team", "user", "tag", "goal", "project_template"])
        .describe("What kind of object to search for."),
      count: z.number().int().min(1).max(100).optional().describe("Max results (default 20)."),
    },
  },
  async ({ workspace_gid, query, type, count }) =>
    req("GET", `/workspaces/${workspace_gid}/typeahead`, {
      query: { resource_type: type, query, count: count ?? 20, opt_fields: "name,resource_type,resource_subtype" },
    })
);

tool(
  "asana_list_custom_fields",
  {
    title: "List custom fields",
    description:
      "Custom fields in a workspace, or the ones attached to a project/portfolio. Returns enum_options with their gids — the input for every dropdown tool.",
    inputSchema: {
      workspace_gid: GID.optional().describe("List every custom field in the workspace."),
      project_gid: GID.optional().describe("List the fields attached to this project instead."),
      portfolio_gid: GID.optional().describe("List the fields attached to this portfolio instead."),
    },
  },
  async ({ workspace_gid, project_gid, portfolio_gid }) => {
    const fields = "name,resource_type,type,enum_options,enum_options.name,enum_options.enabled,enum_options.color";
    if (project_gid)
      return req("GET", `/projects/${project_gid}/custom_field_settings`, {
        query: { opt_fields: `is_important,custom_field.${fields.split(",").join(",custom_field.")}` },
      });
    if (portfolio_gid)
      return req("GET", `/portfolios/${portfolio_gid}/custom_field_settings`, {
        query: { opt_fields: `is_important,custom_field.${fields.split(",").join(",custom_field.")}` },
      });
    if (workspace_gid)
      return req("GET", `/workspaces/${workspace_gid}/custom_fields`, { query: { opt_fields: fields, limit: 100 } });
    throw new Error("Give one of workspace_gid, project_gid, or portfolio_gid.");
  }
);

// ─── Portfolios ───────────────────────────────────────────────────────────────

tool(
  "portfolio_create",
  {
    title: "Create portfolio",
    description: "Create a portfolio in a workspace.",
    inputSchema: {
      workspace_gid: GID,
      name: z.string(),
      color: COLOR.optional(),
      public: z.boolean().optional().describe("Visible to the whole workspace (default false)."),
    },
  },
  async ({ workspace_gid, name, color, public: isPublic }) =>
    req("POST", "/portfolios", {
      body: clean({ workspace: workspace_gid, name, color, public: isPublic }),
      query: { opt_fields: "name,color,public,permalink_url" },
    })
);

tool(
  "portfolio_update",
  {
    title: "Rename / update portfolio",
    description: "Change a portfolio's name, color, or visibility. Only the fields you pass are touched.",
    inputSchema: {
      portfolio_gid: GID,
      name: z.string().optional().describe("New name."),
      color: COLOR.optional(),
      public: z.boolean().optional(),
    },
  },
  async ({ portfolio_gid, name, color, public: isPublic }) =>
    req("PUT", `/portfolios/${portfolio_gid}`, {
      body: clean({ name, color, public: isPublic }),
      query: { opt_fields: "name,color,public,permalink_url" },
    })
);

tool(
  "portfolio_list_items",
  {
    title: "List portfolio items",
    description: "The projects/portfolios inside a portfolio, in their current display order.",
    inputSchema: { portfolio_gid: GID },
  },
  async ({ portfolio_gid }) =>
    req("GET", `/portfolios/${portfolio_gid}/items`, {
      query: { opt_fields: "name,resource_type,archived,permalink_url", limit: 100 },
    })
);

tool(
  "portfolio_add_item",
  {
    title: "Add project to portfolio",
    description:
      "Add a project (or sub-portfolio) to a portfolio, optionally at a chosen position. Adding an item that is already present moves it to that position.",
    inputSchema: {
      portfolio_gid: GID,
      item_gid: GID.describe("The project or portfolio to add."),
      insert_before: GID.optional().describe("Place it before this existing item."),
      insert_after: GID.optional().describe("Place it after this existing item."),
    },
  },
  async ({ portfolio_gid, item_gid, insert_before, insert_after }) => {
    onePosition(insert_before, insert_after, "insert_before", "insert_after");
    await req("POST", `/portfolios/${portfolio_gid}/addItem`, {
      body: clean({ item: item_gid, insert_before, insert_after }),
    });
    return req("GET", `/portfolios/${portfolio_gid}/items`, { query: { opt_fields: "name", limit: 100 } });
  }
);

tool(
  "portfolio_remove_item",
  {
    title: "Remove item from portfolio",
    description:
      "Remove a project from a portfolio. This also drops any portfolio-level custom field values set on that project.",
    inputSchema: {
      portfolio_gid: GID,
      item_gid: GID,
      confirm: z.literal(true).describe("Must be true. Guard against accidental removal."),
    },
  },
  async ({ portfolio_gid, item_gid }) => {
    await req("POST", `/portfolios/${portfolio_gid}/removeItem`, { body: { item: item_gid } });
    return { removed: item_gid, from: portfolio_gid };
  }
);

// ─── Custom fields & dropdown (enum) options ──────────────────────────────────

tool(
  "custom_field_create",
  {
    title: "Create custom field",
    description:
      "Create a workspace custom field. For a dropdown use type 'enum' (single-select) or 'multi_enum' (multi-select) and pass enum_options.",
    inputSchema: {
      workspace_gid: GID,
      name: z.string(),
      type: z.enum(["enum", "multi_enum", "text", "number", "date", "people"]),
      description: z.string().optional(),
      enum_options: z
        .array(z.object({ name: z.string(), color: COLOR.optional() }))
        .optional()
        .describe("Dropdown values, in order. Only for enum / multi_enum."),
      precision: z.number().int().min(0).max(6).optional().describe("Decimal places, for type 'number'."),
    },
  },
  async ({ workspace_gid, name, type, description, enum_options, precision }) =>
    req("POST", "/custom_fields", {
      body: clean({
        workspace: workspace_gid,
        name,
        resource_subtype: type,
        description,
        enum_options,
        precision,
      }),
      query: { opt_fields: "name,resource_subtype,enum_options.name,enum_options.color" },
    })
);

tool(
  "custom_field_update",
  {
    title: "Rename / update custom field",
    description: "Change a custom field's name or description. Enum values are edited with the enum_option_* tools.",
    inputSchema: {
      custom_field_gid: GID,
      name: z.string().optional(),
      description: z.string().optional(),
    },
  },
  async ({ custom_field_gid, name, description }) =>
    req("PUT", `/custom_fields/${custom_field_gid}`, {
      body: clean({ name, description }),
      query: { opt_fields: "name,description,resource_subtype" },
    })
);

tool(
  "enum_option_create",
  {
    title: "Create dropdown value",
    description:
      "Add a value to an enum / multi_enum custom field. Appended at the end unless you give a position.",
    inputSchema: {
      custom_field_gid: GID,
      name: z.string().describe("The new dropdown value."),
      color: COLOR.optional(),
      insert_before: GID.optional().describe("enum_option gid to place this before."),
      insert_after: GID.optional().describe("enum_option gid to place this after."),
    },
  },
  async ({ custom_field_gid, name, color, insert_before, insert_after }) => {
    onePosition(insert_before, insert_after, "insert_before", "insert_after");
    return req("POST", `/custom_fields/${custom_field_gid}/enum_options`, {
      body: clean({ name, color, insert_before, insert_after }),
      query: { opt_fields: "name,color,enabled" },
    });
  }
);

tool(
  "enum_option_update",
  {
    title: "Rename / disable dropdown value",
    description:
      "Rename, recolor, or disable a dropdown value. There is no way to DELETE one: DELETE /enum_options/{gid} is a real route but Asana answers 403 'Enum option deletion is forbidden' (measured 2026-08-27). enabled:false is the only retirement there is — it hides the value from the picker while tasks already holding it keep it.",
    inputSchema: {
      enum_option_gid: GID,
      name: z.string().optional(),
      color: COLOR.optional(),
      enabled: z.boolean().optional().describe("false hides it from the picker."),
    },
  },
  async ({ enum_option_gid, name, color, enabled }) =>
    req("PUT", `/enum_options/${enum_option_gid}`, {
      body: clean({ name, color, enabled }),
      query: { opt_fields: "name,color,enabled" },
    })
);

tool(
  "enum_option_reorder",
  {
    title: "Reorder dropdown value",
    description: "Move an existing dropdown value to a new position within its custom field.",
    inputSchema: {
      custom_field_gid: GID,
      enum_option_gid: GID.describe("The value to move."),
      before_enum_option: GID.optional().describe("Move it before this value."),
      after_enum_option: GID.optional().describe("Move it after this value."),
    },
  },
  async ({ custom_field_gid, enum_option_gid, before_enum_option, after_enum_option }) => {
    onePosition(before_enum_option, after_enum_option, "before_enum_option", "after_enum_option");
    await req("POST", `/custom_fields/${custom_field_gid}/enum_options/insert`, {
      body: clean({ enum_option: enum_option_gid, before_enum_option, after_enum_option }),
    });
    return req("GET", `/custom_fields/${custom_field_gid}`, {
      query: { opt_fields: "name,enum_options.name,enum_options.enabled" },
    });
  }
);

tool(
  "custom_field_attach",
  {
    title: "Attach custom field to project or portfolio",
    description: "Make an existing custom field available on a project or a portfolio.",
    inputSchema: {
      custom_field_gid: GID,
      project_gid: GID.optional(),
      portfolio_gid: GID.optional(),
      is_important: z
        .boolean()
        .optional()
        .describe("Show it in the sidebar / as a portfolio column (default false)."),
      insert_before: GID.optional().describe("custom_field_setting gid to place this before."),
      insert_after: GID.optional().describe("custom_field_setting gid to place this after."),
    },
  },
  async ({ custom_field_gid, project_gid, portfolio_gid, is_important, insert_before, insert_after }) => {
    onePosition(insert_before, insert_after, "insert_before", "insert_after");
    if (!project_gid && !portfolio_gid) throw new Error("Give either project_gid or portfolio_gid.");
    if (project_gid && portfolio_gid) throw new Error("Give only one of project_gid or portfolio_gid.");
    const owner = project_gid ? `/projects/${project_gid}` : `/portfolios/${portfolio_gid}`;
    return req("POST", `${owner}/addCustomFieldSetting`, {
      body: clean({ custom_field: custom_field_gid, is_important, insert_before, insert_after }),
    });
  }
);

tool(
  "custom_field_detach",
  {
    title: "Detach custom field from project or portfolio",
    description:
      "Remove a custom field from one project or portfolio. The field itself and its values on other projects are untouched — this only takes the column away here.",
    inputSchema: {
      custom_field_gid: GID,
      project_gid: GID.optional(),
      portfolio_gid: GID.optional(),
    },
  },
  async ({ custom_field_gid, project_gid, portfolio_gid }) => {
    if (!project_gid && !portfolio_gid) throw new Error("Give either project_gid or portfolio_gid.");
    if (project_gid && portfolio_gid) throw new Error("Give only one of project_gid or portfolio_gid.");
    const owner = project_gid ? `/projects/${project_gid}` : `/portfolios/${portfolio_gid}`;
    await req("POST", `${owner}/removeCustomFieldSetting`, { body: { custom_field: custom_field_gid } });
    return { detached: custom_field_gid, from: project_gid ?? portfolio_gid };
  }
);

// custom_field_delete is real but UNDOCUMENTED — Asana's reference offers no DELETE
// for a custom field. Verified end-to-end by the smoke test, not merely probed.
//
// There is deliberately NO enum_option_delete here. DELETE /enum_options/{gid} is a
// recognised route, which is exactly what made it look available; calling it returns
// 403 "Enum option deletion is forbidden". A route answering "Not a recognized ID"
// instead of "No matching route" proves it EXISTS, never that it is PERMITTED — the
// two are different questions and only a real call answers the second one.

tool(
  "custom_field_delete",
  {
    title: "Delete custom field",
    description:
      "Permanently delete a workspace custom field. It disappears from EVERY project and portfolio that uses it, along with the values stored on their tasks — a field is workspace-wide, so this is never a local cleanup. Check custom_field_attach's inverse (custom_field_detach) first: detaching from one project is usually what was actually wanted. UNDOCUMENTED endpoint.",
    inputSchema: {
      custom_field_gid: GID,
      confirm: CONFIRM,
    },
  },
  async ({ custom_field_gid }) => {
    const before = await req("GET", `/custom_fields/${custom_field_gid}`, {
      query: { opt_fields: "name,resource_subtype" },
    });
    await req("DELETE", `/custom_fields/${custom_field_gid}`);
    return { deleted: before };
  }
);

// ─── Project templates ────────────────────────────────────────────────────────
// Templates ARE in the API, contrary to a long-standing note in our own wiki. The
// trap that hides them: bangkokbank.com is an ORGANIZATION, so passing ?workspace=
// is rejected with "Not a valid regular workspace. You provided an organization",
// which reads like the endpoint is broken. Pass ?team= instead. (Measured 2026-08-27.)

tool(
  "template_list",
  {
    title: "List project templates",
    description:
      "Project templates visible to you. In an organization (bangkokbank.com is one) you MUST list per team — a workspace query is rejected. Use asana_find with type 'team' to get team gids.",
    inputSchema: {
      team_gid: GID.optional().describe("Templates owned by this team. Required in an organization."),
      workspace_gid: GID.optional().describe("Only valid for a plain workspace, NOT an organization."),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ team_gid, workspace_gid, limit }) => {
    if (!team_gid && !workspace_gid) throw new Error("Give team_gid (or workspace_gid for a non-organization).");
    return req("GET", "/project_templates", {
      query: clean({
        team: team_gid,
        workspace: workspace_gid,
        limit: limit ?? 50,
        opt_fields: "name,public,team.name,owner.name,description",
      }),
    });
  }
);

tool(
  "template_get",
  {
    title: "Get project template",
    description:
      "The full template record, including requested_roles and requested_dates — the two things template_instantiate needs answers for.",
    inputSchema: { template_gid: GID },
  },
  async ({ template_gid }) =>
    req("GET", `/project_templates/${template_gid}`, {
      query: {
        opt_fields:
          "name,description,html_description,public,color,team.name,owner.name,requested_dates,requested_roles,requested_roles.name",
      },
    })
);

tool(
  "template_instantiate",
  {
    title: "Create a project from a template",
    description:
      "Build a real project from a template. Runs as a dry run by default: it reports what the template will ask for and creates nothing until you pass execute:true. NOTE a template does NOT carry Dashboard widgets (an open Asana feature request) — if the new project must have charts, use project_duplicate on a fully-configured project instead. Returns an Asana job; the project appears a moment after the call.",
    inputSchema: {
      template_gid: GID,
      name: z.string().describe("Name for the new project."),
      team_gid: GID.optional().describe("Team to create it in (defaults to the template's team)."),
      public: z.boolean().optional().describe("Visible to the whole team (default false)."),
      requested_dates: z
        .array(z.object({ gid: GID, value: z.string().describe("ISO date, e.g. 2026-09-15") }))
        .optional()
        .describe("Answers for the template's date variables — gids come from template_get."),
      requested_roles: z
        .array(z.object({ gid: GID, value: GID.describe("User gid to fill this role.") }))
        .optional()
        .describe("Answers for the template's roles — gids come from template_get."),
      execute: z
        .boolean()
        .optional()
        .describe("false or omitted = dry run, nothing is created. true = actually create the project."),
    },
  },
  async ({ template_gid, name, team_gid, public: isPublic, requested_dates, requested_roles, execute }) => {
    const tpl = await req("GET", `/project_templates/${template_gid}`, {
      query: { opt_fields: "name,team.name,requested_dates,requested_roles,requested_roles.name" },
    });
    if (!execute) {
      return {
        dry_run: true,
        template: tpl.name,
        would_create: { name, team: team_gid ?? tpl.team?.gid, public: isPublic ?? false },
        template_asks_for: { requested_dates: tpl.requested_dates, requested_roles: tpl.requested_roles },
        answered: { requested_dates: requested_dates ?? [], requested_roles: requested_roles ?? [] },
        note: "Nothing was created. Call again with execute:true to build it. Dashboard widgets do NOT come across — use project_duplicate if the project needs charts.",
      };
    }
    return req("POST", `/project_templates/${template_gid}/instantiateProject`, {
      body: clean({
        name,
        team: team_gid,
        public: isPublic,
        requested_dates,
        requested_roles,
      }),
      query: { opt_fields: "resource_subtype,status,new_project.name" },
    });
  }
);

// ─── Knowledge pages ──────────────────────────────────────────────────────────
// The Knowledge → Pages feature is the `note` resource. Asana does NOT document
// it: /notes appears in neither the OpenAPI spec nor developers.asana.com/llms.txt.
// Verified working by direct probe 2026-08-17. Being undocumented, it can change
// or disappear without notice — treat a sudden 404 here as Asana's move, not a bug.

const PAGE_HTML = z
  .string()
  .describe(
    "Page body as HTML in a single <body> root. Allowed: strong, em, u, s, ul, ol, li, " +
      "a, blockquote, code, pre, hr, img, h1, h2, and table. <p> is REJECTED " +
      "(xml_parsing_error) — separate paragraphs with newlines. h1/h2 are accepted but " +
      "stored as <strong>, so heading levels do not survive. " +
      "TABLES DO WORK, despite not appearing in any Asana doc: <table><tr><td>…</td></tr></table> " +
      "(no thead/th — bold the first row's cells with <strong> for a header). Asana stores it as a " +
      "real native table and adds its own '⚠ This table cannot be viewed on Mobile' line above it. " +
      "But page_get NEVER returns the table's contents (see its warning), so verify a table in the " +
      "browser, not by reading the page back. Keep tables to ~5 columns — wide ones overflow the " +
      "page's content area and the right-hand columns get clipped. " +
      "Links: pass a plain Asana permalink as href; Asana enriches it into a mention on its own, but " +
      "only after a reload — right after a write it still renders as a raw URL. That is not a failure, " +
      "and the visible label becomes the target's real name regardless of the text you supply."
  );

tool(
  "page_create",
  {
    title: "Create Knowledge page",
    description: "Create a page under Knowledge → Pages.",
    inputSchema: {
      workspace_gid: GID,
      name: z.string().describe("Page title."),
      html_text: PAGE_HTML.optional(),
      privacy_setting: z
        .enum(["members_only", "public_to_domain"])
        .optional()
        .describe("Defaults to members_only."),
    },
  },
  async ({ workspace_gid, name, html_text, privacy_setting }) =>
    req("POST", "/notes", {
      body: clean({ workspace: workspace_gid, name, html_text, privacy_setting }),
      query: { opt_fields: "name,permalink_url,privacy_setting,modified_at" },
    })
);

tool(
  "page_update",
  {
    title: "Rename / edit Knowledge page",
    description:
      "Change a page's title, body, or privacy. Only the fields you pass are touched — but " +
      "html_text REPLACES the whole body, it never appends. To add to a page: page_get first, " +
      "then send the existing html_text with your addition concatenated onto it. " +
      "DESTRUCTIVE ROUND-TRIP: page_get does not return the contents of tables already on the " +
      "page, so a plain get-then-update rewrite silently deletes every existing table. Check the " +
      "page in the browser for tables before rewriting a body you did not author.",
    inputSchema: {
      page_gid: GID,
      name: z.string().optional(),
      html_text: PAGE_HTML.optional(),
      privacy_setting: z.enum(["members_only", "public_to_domain"]).optional(),
    },
  },
  async ({ page_gid, name, html_text, privacy_setting }) =>
    req("PUT", `/notes/${page_gid}`, {
      body: clean({ name, html_text, privacy_setting }),
      query: { opt_fields: "name,permalink_url,privacy_setting,modified_at" },
    })
);

tool(
  "page_get",
  {
    title: "Read a Knowledge page",
    description:
      "Full page including html_text — read this before editing so you do not overwrite the body. " +
      "TWO BLIND SPOTS. (1) Tables: a table on the page comes back only as the placeholder line " +
      "'<i>⚠ This table cannot be viewed on Mobile. Please view it on Web. ⚠</i>' with no rows or " +
      "cells, so you cannot read a table back, cannot diff one, and must not assume a table write " +
      "failed just because it is missing here — open the page in a browser to confirm. " +
      "(2) Links you lack access to come back as [Private Link] with data-asana-accessible=\"false\"; " +
      "that is a permission gap on the linked page, not an error — ask for access to read it.",
    inputSchema: { page_gid: GID },
  },
  async ({ page_gid }) =>
    req("GET", `/notes/${page_gid}`, {
      query: { opt_fields: "name,text,html_text,permalink_url,privacy_setting,modified_at,created_by.name" },
    })
);

tool(
  "page_list",
  {
    title: "List Knowledge pages",
    description: "Pages in a workspace, newest first. Untitled pages come back with an empty name.",
    inputSchema: {
      workspace_gid: GID,
      limit: z.number().int().min(1).max(100).optional().describe("Default 50."),
    },
  },
  async ({ workspace_gid, limit }) =>
    req("GET", "/notes", {
      query: { workspace: workspace_gid, limit: limit ?? 50, opt_fields: "name,permalink_url,modified_at" },
    })
);

// ─── Membership / access ──────────────────────────────────────────────────────

tool(
  "member_add",
  {
    title: "Add member to project or portfolio",
    description:
      "Give a person or team access to a project or portfolio. NOTE Asana's own limits: a project can only be admin / editor / commenter — there is no view-only level for projects, so 'commenter' is the least access possible. A portfolio can be admin / editor / viewer.",
    inputSchema: {
      parent_gid: GID.describe("The project or portfolio to grant access to."),
      member_gid: GID.describe("User gid (or team gid). Use asana_find with type 'user'."),
      access_level: z
        .enum(["admin", "editor", "commenter", "viewer"])
        .describe("Projects: admin/editor/commenter. Portfolios: admin/editor/viewer."),
    },
  },
  async ({ parent_gid, member_gid, access_level }) =>
    req("POST", "/memberships", {
      body: { parent: parent_gid, member: member_gid, access_level },
      query: { opt_fields: "access_level,member.name,parent.name" },
    })
);

tool(
  "member_list",
  {
    title: "List members of a project or portfolio",
    description: "Who currently has access, and at what level.",
    inputSchema: { parent_gid: GID },
  },
  async ({ parent_gid }) =>
    req("GET", "/memberships", {
      query: { parent: parent_gid, limit: 100, opt_fields: "access_level,member.name" },
    })
);

// ─── Teams (the People tab) ───────────────────────────────────────────────────
// What the People tab exposes is teams and team membership, and those ARE writable.
// What is NOT here, measured 2026-08-27: DELETE /teams/{gid} does not exist at all
// ("No matching route") — a team can be created and emptied but never deleted; and
// inviting (POST /users) or deactivating (DELETE /users/{gid}) answer 403, not 404,
// so those routes exist but a Personal Access Token is not allowed to call them.
// That is a PERMISSION ceiling (org admin / service account), not a missing feature.

tool(
  "team_list",
  {
    title: "List teams",
    description:
      "Teams in the organization. Defaults to the ones you belong to; pass all:true for every team in the org. Use this rather than asana_find when you have no name to search for — typeahead returns nothing for an empty query.",
    inputSchema: {
      organization_gid: GID.describe("The organization gid — what asana_whoami returns as the workspace."),
      all: z.boolean().optional().describe("true = every team in the organization, not just yours."),
    },
  },
  async ({ organization_gid, all }) =>
    all
      ? req("GET", `/organizations/${organization_gid}/teams`, {
          query: { limit: 100, opt_fields: "name,visibility" },
        })
      : req("GET", "/users/me/teams", {
          query: { organization: organization_gid, opt_fields: "name,visibility" },
        })
);

tool(
  "team_get",
  {
    title: "Get team",
    description:
      "A team's record, including the six access-level settings that decide who in it may invite, remove members, rename it or trash it. Read these before changing a team's membership — they say whether you are allowed to.",
    inputSchema: { team_gid: GID },
  },
  async ({ team_gid }) =>
    req("GET", `/teams/${team_gid}`, {
      query: {
        opt_fields:
          "name,description,html_description,visibility,permalink_url,organization.name," +
          "edit_team_name_or_description_access_level,edit_team_visibility_or_trash_team_access_level," +
          "member_invite_management_access_level,guest_invite_management_access_level," +
          "join_request_management_access_level,team_member_removal_access_level",
      },
    })
);

tool(
  "team_create",
  {
    title: "Create team",
    description:
      "Create a team in the organization. There is no delete for teams in the API — the only way to remove one is the Asana UI, so name it correctly the first time.",
    inputSchema: {
      organization_gid: GID.describe("The organization gid — same value asana_whoami returns as the workspace."),
      name: z.string(),
      description: z.string().optional(),
      visibility: z
        .enum(["secret", "request_to_join", "public"])
        .optional()
        .describe("secret = invite only; request_to_join = discoverable; public = anyone in the org can join."),
    },
  },
  async ({ organization_gid, name, description, visibility }) =>
    req("POST", "/teams", {
      body: clean({ organization: organization_gid, name, description, visibility }),
      query: { opt_fields: "name,visibility,permalink_url" },
    })
);

tool(
  "team_update",
  {
    title: "Rename / update team",
    description: "Change a team's name, description or visibility.",
    inputSchema: {
      team_gid: GID,
      name: z.string().optional(),
      description: z.string().optional(),
      visibility: z.enum(["secret", "request_to_join", "public"]).optional(),
    },
  },
  async ({ team_gid, name, description, visibility }) =>
    req("PUT", `/teams/${team_gid}`, {
      body: clean({ name, description, visibility }),
      query: { opt_fields: "name,description,visibility" },
    })
);

tool(
  "team_members",
  {
    title: "List team members",
    description:
      "Everyone in a team, with is_admin / is_guest / is_limited_access per person. This is the People tab's real content.",
    inputSchema: {
      team_gid: GID,
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ team_gid, limit }) =>
    req("GET", "/team_memberships", {
      query: {
        team: team_gid,
        limit: limit ?? 100,
        opt_fields: "user.name,user.email,is_admin,is_guest,is_limited_access",
      },
    })
);

tool(
  "team_add_user",
  {
    title: "Add person to team",
    description:
      "Add someone already in the organization to a team. This does NOT invite a new person into Asana — inviting is an org-admin call a Personal Access Token cannot make (it answers 403).",
    inputSchema: {
      team_gid: GID,
      user: z
        .string()
        .describe("User gid, the person's email address, or the literal 'me'. Asana accepts all three."),
    },
  },
  async ({ team_gid, user }) =>
    req("POST", `/teams/${team_gid}/addUser`, {
      body: { user },
      query: { opt_fields: "user.name,is_admin,is_guest" },
    })
);

tool(
  "team_remove_user",
  {
    title: "Remove person from team",
    description:
      "Take someone out of a team. They keep their Asana account and anything assigned to them, but lose access to the team's projects — which can hide work they are still the assignee of.",
    inputSchema: {
      team_gid: GID,
      user: z.string().describe("User gid, email address, or 'me'."),
      confirm: CONFIRM,
    },
  },
  async ({ team_gid, user }) => {
    await req("POST", `/teams/${team_gid}/removeUser`, { body: { user } });
    return { removed: user, from_team: team_gid };
  }
);

// ─── Projects & sections ──────────────────────────────────────────────────────

tool(
  "project_create",
  {
    title: "Create project",
    description: "Create a project in a workspace (team_gid is required in an organization).",
    inputSchema: {
      workspace_gid: GID,
      name: z.string(),
      team_gid: GID.optional(),
      notes: z.string().optional().describe("Project description."),
      color: COLOR.optional(),
      default_view: z
        .enum(["list", "board", "calendar", "timeline"])
        .optional()
        .describe("Which tab opens by default. Note: the Dashboard tab cannot be configured via API."),
      public: z.boolean().optional(),
    },
  },
  async ({ workspace_gid, name, team_gid, notes, color, default_view, public: isPublic }) =>
    req("POST", "/projects", {
      body: clean({ workspace: workspace_gid, team: team_gid, name, notes, color, default_view, public: isPublic }),
      query: { opt_fields: "name,default_view,permalink_url" },
    })
);

tool(
  "project_update",
  {
    title: "Rename / update project",
    description: "Change a project's name, notes, color, default view, or archived state.",
    inputSchema: {
      project_gid: GID,
      name: z.string().optional(),
      notes: z.string().optional(),
      color: COLOR.optional(),
      default_view: z.enum(["list", "board", "calendar", "timeline"]).optional(),
      archived: z.boolean().optional(),
      public: z.boolean().optional(),
    },
  },
  async ({ project_gid, ...rest }) =>
    req("PUT", `/projects/${project_gid}`, {
      body: clean(rest),
      query: { opt_fields: "name,color,default_view,archived,permalink_url" },
    })
);

tool(
  "project_set_fields",
  {
    title: "Set project custom field values",
    description:
      "Write custom field VALUES on a project — this is the only way to fill the columns you see in a portfolio List view, because those values live on the project, not the portfolio. Pass a map of custom_field_gid → value: text takes a string, number a number, enum the enum_option gid, multi_enum an array of gids, date {\"date\":\"YYYY-MM-DD\"}. null clears one. Only the fields you pass are touched. Get the gids from asana_list_custom_fields (project_gid or portfolio_gid).",
    inputSchema: {
      project_gid: GID,
      custom_fields: z
        .record(
          z.string(),
          z.union([z.string(), z.number(), z.null(), z.array(z.string()), z.record(z.string(), z.string())])
        )
        .describe("Map of custom field gid → value."),
    },
  },
  async ({ project_gid, custom_fields }) =>
    req("PUT", `/projects/${project_gid}`, {
      body: { custom_fields },
      query: { opt_fields: "name,custom_fields.name,custom_fields.display_value" },
    })
);

tool(
  "project_duplicate",
  {
    title: "Duplicate project",
    description:
      "Copy a project. Tasks, project views (List/Board/Dashboard tabs) and rules are always carried over — this is the only way to give a new project a preconfigured Dashboard, since Asana exposes no dashboard/chart API. Returns a job; duplication finishes asynchronously.",
    inputSchema: {
      project_gid: GID.describe("The template project to copy."),
      name: z.string().describe("Name for the new project."),
      team_gid: GID.optional().describe("Team for the new project."),
      include: z
        .array(
          z.enum([
            "allocations",
            "forms",
            "members",
            "notes",
            "permissions",
            "task_assignee",
            "task_attachments",
            "task_dates",
            "task_dependencies",
            "task_followers",
            "task_notes",
            "task_projects",
            "task_subtasks",
            "task_tags",
            "task_templates",
            "task_type_default",
          ])
        )
        .optional()
        .describe("Optional elements to copy in addition to the automatic ones."),
    },
  },
  async ({ project_gid, name, team_gid, include }) =>
    req("POST", `/projects/${project_gid}/duplicate`, {
      body: clean({ name, team: team_gid, include: include?.join(",") }),
    })
);

tool(
  "project_list_sections",
  {
    title: "List project sections",
    description: "Sections of a project in display order — the gids needed by section_reorder.",
    inputSchema: { project_gid: GID },
  },
  async ({ project_gid }) =>
    req("GET", `/projects/${project_gid}/sections`, { query: { opt_fields: "name", limit: 100 } })
);

tool(
  "section_create",
  {
    title: "Create section",
    description: "Add a section to a project, optionally at a chosen position.",
    inputSchema: {
      project_gid: GID,
      name: z.string(),
      insert_before: GID.optional().describe("Section gid to place this before."),
      insert_after: GID.optional().describe("Section gid to place this after."),
    },
  },
  async ({ project_gid, name, insert_before, insert_after }) => {
    onePosition(insert_before, insert_after, "insert_before", "insert_after");
    return req("POST", `/projects/${project_gid}/sections`, {
      body: clean({ name, insert_before, insert_after }),
      query: { opt_fields: "name" },
    });
  }
);

tool(
  "section_update",
  {
    title: "Rename section",
    description: "Rename an existing section.",
    inputSchema: { section_gid: GID, name: z.string() },
  },
  async ({ section_gid, name }) =>
    req("PUT", `/sections/${section_gid}`, { body: { name }, query: { opt_fields: "name" } })
);

tool(
  "section_reorder",
  {
    title: "Reorder section",
    description: "Move an existing section to a new position within its project.",
    inputSchema: {
      project_gid: GID,
      section_gid: GID.describe("The section to move."),
      before_section: GID.optional(),
      after_section: GID.optional(),
    },
  },
  async ({ project_gid, section_gid, before_section, after_section }) => {
    onePosition(before_section, after_section, "before_section", "after_section");
    await req("POST", `/projects/${project_gid}/sections/insert`, {
      body: clean({ section: section_gid, before_section, after_section }),
    });
    return req("GET", `/projects/${project_gid}/sections`, { query: { opt_fields: "name", limit: 100 } });
  }
);

// ─── Attachments ──────────────────────────────────────────────────────────────

tool(
  "task_attach",
  {
    title: "Attach a file to a task",
    description:
      "Upload a file from this machine and attach it to a task (a project or project brief gid works as the parent too). Asana has no API for re-pointing an existing attachment at a second task — to put the same file on another task, upload it again. Max 100 MB.",
    inputSchema: {
      parent_gid: GID.describe("The task that receives the attachment."),
      file_path: z.string().describe("Absolute path to a file on this machine."),
      name: z
        .string()
        .optional()
        .describe("Filename to show in Asana. Defaults to the file's own name."),
    },
  },
  async ({ parent_gid, file_path, name }) => upload(parent_gid, file_path, { name })
);

tool(
  "task_attachments",
  {
    title: "List attachments",
    description: "Attachments already on a task, with the gid each one needs to be deleted.",
    inputSchema: { parent_gid: GID },
  },
  async ({ parent_gid }) =>
    req("GET", "/attachments", {
      query: { parent: parent_gid, opt_fields: "name,resource_subtype,size,created_at,permanent_url", limit: 100 },
    })
);

tool(
  "attachment_delete",
  {
    title: "Delete attachment",
    description: "Remove an attachment. The file is gone from Asana; there is no undo.",
    inputSchema: { attachment_gid: GID, confirm: CONFIRM },
  },
  async ({ attachment_gid }) => {
    await req("DELETE", `/attachments/${attachment_gid}`);
    return { deleted: attachment_gid };
  }
);

await server.connect(new StdioServerTransport());
