#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { req, clean, onePosition } from "./client.js";

const server = new McpServer({ name: "asana-admin", version: "1.0.0" });

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
      "Rename, recolor, or disable a dropdown value. Asana has no delete — set enabled:false to retire a value; tasks already holding it keep it.",
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

await server.connect(new StdioServerTransport());
