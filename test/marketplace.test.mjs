// Validates the self-hosted marketplace catalog (marketplace.json) at the
// repository root against the official BB marketplace v2 schema, plus
// consistency checks that the schema cannot express:
//   * the entry id matches the plugin id derived from package.json
//   * the git source URL matches the repository declared in package.json
//   * referenced screenshot/overview files exist when present

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const SCHEMA_URL = "https://getbb.app/schemas/marketplace-v2.schema.json";

// Same algorithm BB uses to derive a plugin id from the package name:
// strip the npm scope, strip a lowercase `bb-plugin-` prefix, lowercase,
// replace other characters with hyphens, trim edge hyphens.
function derivePluginId(packageName) {
  const base = packageName.includes("/")
    ? packageName.split("/").at(-1)
    : packageName;
  return base
    .replace(/^bb-plugin-/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/, "");
}

const catalog = JSON.parse(
  await readFile(path.join(root, "marketplace.json"), "utf8"),
);
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

let ajv;
try {
  const schemaRes = await fetch(SCHEMA_URL);
  assert.ok(schemaRes.ok, `schema fetch failed: ${schemaRes.status}`);
  const schema = await schemaRes.json();
  ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  ajv.validate = validate;
} catch (error) {
  // No network (rare in CI): skip schema validation but keep local checks.
  ajv = null;
  console.warn(`schema fetch skipped: ${error.message}`);
}

test("marketplace.json validates against the official v2 schema", () => {
  if (!ajv) return;
  const ok = ajv.validate(catalog);
  assert.ok(
    ok,
    `schema errors: ${JSON.stringify(ajv.errors, null, 2)}`,
  );
});

test("catalog identity is well-formed", () => {
  assert.equal(catalog.schemaVersion, 2);
  assert.match(catalog.name, /^[a-z0-9][a-z0-9-]*$/);
  assert.ok(catalog.displayName.length > 0);
  assert.ok(catalog.plugins.length >= 1);
});

test("exactly one plugin entry, matching the package id", () => {
  assert.equal(catalog.plugins.length, 1);
  const entry = catalog.plugins[0];
  const expectedId = derivePluginId(pkg.name);
  assert.equal(entry.id, expectedId, "entry id must match derived plugin id");
  assert.equal(expectedId, "tasks-kanban");
});

test("entry fields are consistent with the package", () => {
  const entry = catalog.plugins[0];
  assert.ok(entry.displayName.length > 0);
  assert.ok(entry.description.length > 0);
  assert.ok(Array.isArray(entry.author?.name) === false);
  assert.ok(entry.author?.github, "author.github is required by the listing");
  assert.ok(entry.source?.git?.url, "git source expected");
  const repoUrl = pkg.repository?.url?.replace(/^git\+/, "");
  assert.equal(
    entry.source.git.url,
    repoUrl,
    "entry source URL must match package.json repository",
  );
  assert.ok(entry.source.git.range, "range source expected for updates");
  assert.ok(Array.isArray(entry.tags));
  assert.ok(
    entry.tags.every((t) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t) && t.length <= 32),
  );
});

test("relative asset references point at existing files", async () => {
  const entry = catalog.plugins[0];
  const refs = [
    ...(Array.isArray(entry.screenshots) ? entry.screenshots : []),
    ...(entry.overview ? [entry.overview] : []),
  ];
  for (const ref of refs) {
    if (!ref.startsWith("./")) continue;
    const p = path.join(root, ref);
    await assert.doesNotReject(readFile(p), `missing referenced file ${ref}`);
  }
});

test("category id is one the community marketplace uses", () => {
  // Keep in sync with get-bb/marketplace marketplace.base.json categories.
  const allowed = [
    "themes-and-appearance",
    "thread-management",
    "thread-content",
    "memory-and-context",
    "security",
    "agents-and-providers",
    "token-usage-and-limits",
    "notifications",
    "code-and-reviews",
    "file-viewers-and-editors",
    "cloud-and-remote",
    "command-line",
    "utilities",
    "plugin-development",
    "tasks-and-workflows",
  ];
  const entry = catalog.plugins[0];
  assert.ok(entry.category, "entry needs a category");
  assert.ok(allowed.includes(entry.category), `unknown category ${entry.category}`);
  // Self-hosted catalogs may define their own categories; when the entry
  // uses one, it must be declared in the catalog.
  if (catalog.categories) {
    assert.ok(
      catalog.categories.some((c) => c.id === entry.category),
      "category must be declared in the catalog",
    );
  }
});
