import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const API = "https://app.asana.com/api/1.0";

/** Env first, then ~/.asana_token — so the secret never has to live in ~/.claude.json. */
function loadToken() {
  const fromEnv = process.env.ASANA_TOKEN || process.env.ASANA_ACCESS_TOKEN;
  if (fromEnv) return fromEnv.trim();
  try {
    return readFileSync(join(homedir(), ".asana_token"), "utf8").trim();
  } catch {
    return "";
  }
}

const TOKEN = loadToken();

const NO_TOKEN =
  "No Asana token. Create a Personal Access Token at https://app.asana.com/0/my-apps, " +
  "then save it to ~/.asana_token (or set ASANA_TOKEN).";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Asana returns a body on errors that is far more useful than the status line
 * (missing field names, which gid was rejected, the help URL). Surface it.
 */
class AsanaError extends Error {
  constructor(status, payload) {
    const errs = payload?.errors ?? [];
    const detail =
      errs.map((e) => [e.message, e.help].filter(Boolean).join(" — ")).join("; ") ||
      JSON.stringify(payload)?.slice(0, 400) ||
      "no body";
    super(`Asana ${status}: ${detail}`);
    this.status = status;
  }
}

export async function req(method, path, { body, query } = {}) {
  if (!TOKEN) throw new Error(NO_TOKEN);

  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  // Asana rate-limits per minute and answers 429 with Retry-After.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify({ data: body }),
    });

    if (res.status === 429 && attempt < 3) {
      await sleep((Number(res.headers.get("Retry-After")) || 2 ** attempt) * 1000);
      continue;
    }

    const text = await res.text();
    const payload = text ? JSON.parse(text) : {};
    if (!res.ok) throw new AsanaError(res.status, payload);
    return payload.data;
  }
}

/**
 * Asana stores the content type we send and serves it back on download, so a wrong
 * one turns an .html into a file the browser refuses to preview. Only the types this
 * server actually ships are listed; anything else is left to the generic fallback.
 */
const MIME = {
  ".css": "text/css",
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".htm": "text/html",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
};

/**
 * Attachments are the one Asana write that is NOT JSON: /attachments takes
 * multipart/form-data, so it cannot go through req(). Never set Content-Type here —
 * fetch has to write it itself to include the multipart boundary.
 */
export async function upload(parentGid, filePath, { name } = {}) {
  if (!TOKEN) throw new Error(NO_TOKEN);

  const abs = resolve(filePath);
  let bytes;
  try {
    bytes = readFileSync(abs);
  } catch (err) {
    throw new Error(`Cannot read ${abs}: ${err.code ?? err.message}`);
  }

  const fileName = name || basename(abs);
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const form = new FormData();
  form.append("parent", String(parentGid));
  form.append("file", new Blob([bytes], { type: MIME[ext] ?? "application/octet-stream" }), fileName);

  // Ask for the link back in the same call — otherwise the response carries only gid+name.
  const url = new URL(`${API}/attachments`);
  url.searchParams.set("opt_fields", "name,size,resource_subtype,created_at,permanent_url,parent.name");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    body: form,
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) throw new AsanaError(res.status, payload);
  return payload.data;
}

/** Drop undefined so we never send `"name": null` and blank a field by accident. */
export const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/** Asana rejects requests that carry both sides of a positioning pair. */
export function onePosition(a, b, labelA, labelB) {
  if (a !== undefined && b !== undefined) {
    throw new Error(`Give only one of ${labelA} or ${labelB}, not both.`);
  }
}
