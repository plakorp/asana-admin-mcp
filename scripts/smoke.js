#!/usr/bin/env node
/**
 * End-to-end check. Drives the real MCP tool surface over stdio, against a real
 * Asana workspace, then deletes everything it created.
 *
 *   ASANA_TOKEN=$(cat ~/.asana_token) npm run smoke
 *
 * Without a token it still runs the offline half (server boots, tools listed).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PREFIX = "ZZ-mcp-smoke";

const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [resolve(HERE, "../src/index.js")],
    env: { ...process.env },
  })
);

const { tools } = await client.listTools();
console.log(`✓ server up — ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}\n`);

const created = { projects: [], portfolios: [], custom_fields: [], notes: [] };
let failures = 0;

async function call(name, args) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "";
  if (res.isError) throw new Error(`${name} → ${text}`);
  return text ? JSON.parse(text) : null;
}

async function step(label, fn) {
  try {
    const out = await fn();
    console.log(`✓ ${label}`);
    return out;
  } catch (err) {
    failures++;
    console.log(`✗ ${label}\n    ${err.message}`);
    return null;
  }
}

/** Deletes go straight at the API — deliberately not exposed as MCP tools. */
async function destroy(kind, gid) {
  const res = await fetch(`https://app.asana.com/api/1.0/${kind}/${gid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.ASANA_TOKEN}` },
  });
  console.log(`  ${res.ok ? "cleaned" : "FAILED to clean"} ${kind}/${gid}`);
}

const names = (list) => list.map((x) => x.name).join(" | ");

if (!process.env.ASANA_TOKEN) {
  console.log("ASANA_TOKEN not set — skipping the live half.");
  await client.close();
  process.exit(0);
}

try {
  const me = await step("whoami", () => call("asana_whoami", {}));
  const ws = me.workspaces?.[0];
  if (!ws) throw new Error("no workspace on this token");
  console.log(`  workspace: ${ws.name} (${ws.gid})\n`);

  // ── portfolio: create → rename ────────────────────────────────────────────
  const pf = await step("portfolio_create", () =>
    call("portfolio_create", { workspace_gid: ws.gid, name: `${PREFIX}-portfolio` })
  );
  created.portfolios.push(pf.gid);
  await step("portfolio_update (rename)", async () => {
    const r = await call("portfolio_update", { portfolio_gid: pf.gid, name: `${PREFIX}-portfolio-renamed` });
    if (r.name !== `${PREFIX}-portfolio-renamed`) throw new Error(`name is still ${r.name}`);
  });

  // ── projects into the portfolio, then reorder ─────────────────────────────
  const projects = [];
  for (const n of ["A", "B", "C"]) {
    const p = await step(`project_create ${n}`, () =>
      call("project_create", { workspace_gid: ws.gid, name: `${PREFIX}-${n}` })
    );
    created.projects.push(p.gid);
    projects.push(p);
  }
  for (const p of projects) {
    await step(`portfolio_add_item ${p.name}`, () =>
      call("portfolio_add_item", { portfolio_gid: pf.gid, item_gid: p.gid })
    );
  }
  await step("portfolio order is A,B,C", async () => {
    const items = await call("portfolio_list_items", { portfolio_gid: pf.gid });
    const got = names(items);
    if (!got.startsWith(`${PREFIX}-A | ${PREFIX}-B | ${PREFIX}-C`)) throw new Error(`got ${got}`);
  });
  // The question this answers: does addItem on an item already in the portfolio
  // move it, or is a remove+add round trip required?
  await step("portfolio_add_item repositions an existing item (C → front)", async () => {
    const items = await call("portfolio_add_item", {
      portfolio_gid: pf.gid,
      item_gid: projects[2].gid,
      insert_before: projects[0].gid,
    });
    const got = names(items);
    if (!got.startsWith(`${PREFIX}-C | ${PREFIX}-A | ${PREFIX}-B`)) throw new Error(`got ${got}`);
  });
  await step("portfolio_remove_item", () =>
    call("portfolio_remove_item", { portfolio_gid: pf.gid, item_gid: projects[2].gid, confirm: true })
  );

  // ── dropdown (enum custom field) ──────────────────────────────────────────
  const cf = await step("custom_field_create (enum with 2 values)", () =>
    call("custom_field_create", {
      workspace_gid: ws.gid,
      name: `${PREFIX}-dropdown`,
      type: "enum",
      enum_options: [{ name: "Low", color: "green" }, { name: "High", color: "red" }],
    })
  );
  created.custom_fields.push(cf.gid);
  const [low, high] = cf.enum_options;

  const mid = await step("enum_option_create positioned between Low and High", async () => {
    const o = await call("enum_option_create", {
      custom_field_gid: cf.gid,
      name: "Medium",
      color: "yellow",
      insert_before: high.gid,
    });
    const f = await call("asana_list_custom_fields", { workspace_gid: ws.gid });
    const found = f.find((x) => x.gid === cf.gid);
    const got = names(found.enum_options);
    if (got !== "Low | Medium | High") throw new Error(`order is ${got}`);
    return o;
  });

  await step("enum_option_update (rename)", async () => {
    const r = await call("enum_option_update", { enum_option_gid: mid.gid, name: "Med" });
    if (r.name !== "Med") throw new Error(`name is ${r.name}`);
  });

  await step("enum_option_update (disable)", async () => {
    const r = await call("enum_option_update", { enum_option_gid: low.gid, enabled: false });
    if (r.enabled !== false) throw new Error("still enabled");
    await call("enum_option_update", { enum_option_gid: low.gid, enabled: true });
  });

  await step("enum_option_reorder (Med → last)", async () => {
    const f = await call("enum_option_reorder", {
      custom_field_gid: cf.gid,
      enum_option_gid: mid.gid,
      after_enum_option: high.gid,
    });
    const got = names(f.enum_options);
    if (got !== "Low | High | Med") throw new Error(`order is ${got}`);
  });

  await step("custom_field_attach → portfolio", () =>
    call("custom_field_attach", { custom_field_gid: cf.gid, portfolio_gid: pf.gid, is_important: true })
  );
  await step("custom_field_attach → project", () =>
    call("custom_field_attach", { custom_field_gid: cf.gid, project_gid: projects[0].gid, is_important: true })
  );
  await step("custom_field_update (rename)", async () => {
    const r = await call("custom_field_update", { custom_field_gid: cf.gid, name: `${PREFIX}-dropdown-renamed` });
    if (!r.name.endsWith("renamed")) throw new Error(`name is ${r.name}`);
  });

  // ── sections ──────────────────────────────────────────────────────────────
  const target = projects[0].gid;
  const s1 = await step("section_create One", () => call("section_create", { project_gid: target, name: "One" }));
  const s2 = await step("section_create Two", () => call("section_create", { project_gid: target, name: "Two" }));
  await step("section_update (rename)", async () => {
    const r = await call("section_update", { section_gid: s2.gid, name: "Two-renamed" });
    if (r.name !== "Two-renamed") throw new Error(`name is ${r.name}`);
  });
  await step("section_reorder (Two before One)", async () => {
    const secs = await call("section_reorder", {
      project_gid: target,
      section_gid: s2.gid,
      before_section: s1.gid,
    });
    const idx = (n) => secs.findIndex((s) => s.name === n);
    if (idx("Two-renamed") > idx("One")) throw new Error(`order is ${names(secs)}`);
  });

  // ── Knowledge pages (undocumented /notes endpoint — most likely to break) ──
  const page = await step("page_create", () =>
    call("page_create", {
      workspace_gid: ws.gid,
      name: `${PREFIX}-page`,
      html_text: "<body>hello</body>",
    })
  );
  if (page) created.notes.push(page.gid);
  await step("page_update (rename + body)", async () => {
    const r = await call("page_update", {
      page_gid: page.gid,
      name: `${PREFIX}-page-renamed`,
      html_text: "<body><strong>bold</strong><ul><li>a</li></ul></body>",
    });
    if (!r.name.endsWith("renamed")) throw new Error(`name is ${r.name}`);
  });
  await step("page_get returns the new body", async () => {
    const r = await call("page_get", { page_gid: page.gid });
    if (!r.html_text.includes("<strong>bold</strong>")) throw new Error(`body is ${r.html_text}`);
  });
  await step("page_list finds it", async () => {
    const list = await call("page_list", { workspace_gid: ws.gid, limit: 100 });
    if (!list.some((n) => n.gid === page.gid)) throw new Error("not in list");
  });
  // Documented behaviour worth pinning: <p> is rejected outright.
  await step("<p> is still rejected (guards the doc claim)", async () => {
    const res = await client.callTool({
      name: "page_update",
      arguments: { page_gid: page.gid, html_text: "<body><p>x</p></body>" },
    });
    if (!res.isError) throw new Error("<p> was accepted — docs/tool description are now wrong");
  });

  // ── project rename + duplicate (the dashboard question) ───────────────────
  await step("project_update (rename)", async () => {
    const r = await call("project_update", { project_gid: target, name: `${PREFIX}-A-renamed` });
    if (!r.name.endsWith("renamed")) throw new Error(`name is ${r.name}`);
  });
  const job = await step("project_duplicate", () =>
    call("project_duplicate", { project_gid: target, name: `${PREFIX}-A-copy` })
  );
  if (job?.new_project?.gid) created.projects.push(job.new_project.gid);
  if (job) console.log(`  duplicate job ${job.gid} → ${job.new_project?.gid ?? "(pending)"}`);
} catch (err) {
  failures++;
  console.log(`✗ aborted: ${err.message}`);
} finally {
  console.log("\ncleanup:");
  // Duplication runs async; give the copy a moment to exist before deleting it.
  await new Promise((r) => setTimeout(r, 4000));
  for (const gid of created.projects) await destroy("projects", gid);
  for (const gid of created.portfolios) await destroy("portfolios", gid);
  for (const gid of created.custom_fields) await destroy("custom_fields", gid);
  for (const gid of created.notes) await destroy("notes", gid);
  await client.close();
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}
