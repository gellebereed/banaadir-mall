#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CODE GRAPH — a map of the codebase an AI agent reads INSTEAD of the code.
 * ─────────────────────────────────────────────────────────────────────────
 * ── Why it exists ────────────────────────────────────────────────────────
 * Every AI session used to start the same way: list 250 files, grep for a
 * name, open six of them to find out which one actually matters. That
 * exploration is paid for in tokens, every session, for answers that only
 * change when the code does.
 *
 * So the answers are written down once:
 *   .claude/graph/code-graph.json  every file → exports, imports, importers,
 *                                  route, "use client"/"use server", summary
 *   .claude/graph/CODEMAP.md       the same, compressed to one line per file
 *                                  — small enough to load whole
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   npm run graph                      rebuild (skipped when up to date)
 *   npm run graph -- --force           rebuild even when up to date
 *   npm run graph -- --check           exit 1 if the graph is stale
 *   npm run graph -- --query <name>    a file's or symbol's neighbourhood:
 *                                      what it imports, who imports it, and
 *                                      where an exported symbol is used
 *
 * No dependencies: imports are read with regular expressions, which is
 * exactly as precise as this needs to be and keeps the script runnable
 * before `npm install`.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, ".claude", "graph");
const JSON_OUT = join(OUT_DIR, "code-graph.json");
const MD_OUT = join(OUT_DIR, "CODEMAP.md");

const SOURCE_DIRS = ["app", "components", "lib", "scripts"];
const SOURCE_FILES = ["middleware.ts", "next.config.ts"];
const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];

const toPosix = (p) => p.split(sep).join("/");

function walk(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((entry) => {
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) return walk(rel);
    return EXTENSIONS.includes(extname(entry)) ? [toPosix(rel)] : [];
  });
}

function listSources() {
  return [
    ...SOURCE_DIRS.flatMap(walk),
    ...SOURCE_FILES.filter((f) => existsSync(join(ROOT, f))),
  ].sort();
}

/** One hash over every source file's path and content. */
function fingerprint(files) {
  const hash = createHash("sha1");
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(join(ROOT, file)));
  }
  return hash.digest("hex").slice(0, 16);
}

/** Resolve `@/lib/x` or `./x` to a file in the graph, or null for packages. */
function resolveImport(from, spec, known) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = toPosix(join(dirname(from), spec));
  else return null;

  const candidates = [
    base,
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];
  return candidates.find((c) => known.has(c)) ?? null;
}

/** App Router file → URL it serves, e.g. app/product/[slug]/page.tsx → /product/[slug]. */
function routeOf(file) {
  const m = file.match(/^app\/(.*?)(?:\/)?(page|route|layout|loading)\.(tsx?|jsx?)$/);
  if (!m) return null;
  const path = "/" + m[1].replace(/\/$/, "");
  return { kind: m[2], path: path === "/" ? "/" : path.replace(/\/$/, "") };
}

/** The first sentence of the first doc comment — what the file is for. */
function summaryOf(source) {
  const doc = source.match(/\/\*\*([\s\S]*?)\*\//);
  if (!doc) return "";
  const text = doc[1]
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .filter((line) => line && !/^[─━═-]{3,}/.test(line) && !/^──/.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = text.match(/^(.{10,160}?[.!?])(\s|$)/);
  return (sentence ? sentence[1] : text.slice(0, 160)).trim();
}

function kindOf(file, source) {
  const route = routeOf(file);
  if (route) return route.kind;
  if (/^\s*["']use server["']/.test(source)) return "server-actions";
  if (file.startsWith("components/")) return "component";
  if (file.startsWith("lib/")) return "lib";
  if (file.startsWith("scripts/")) return "script";
  return "other";
}

function parse(file, known) {
  const source = readFileSync(join(ROOT, file), "utf8");
  const imports = new Set();
  const importRe = /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,]+?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of source.matchAll(importRe)) {
    const target = resolveImport(file, m[1] ?? m[2], known);
    if (target && target !== file) imports.add(target);
  }

  const exports = new Set();
  for (const m of source.matchAll(
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+(\w+)/g,
  )) {
    exports.add(m[1]);
  }
  if (/export\s+default\s/.test(source) && exports.size === 0) exports.add("default");

  return {
    file,
    kind: kindOf(file, source),
    route: routeOf(file)?.path ?? null,
    client: /^\s*["']use client["']/.test(source),
    lines: source.split("\n").length,
    summary: summaryOf(source),
    exports: [...exports],
    imports: [...imports].sort(),
    importedBy: [],
  };
}

function build() {
  const files = listSources();
  const known = new Set(files);
  const nodes = Object.fromEntries(files.map((f) => [f, parse(f, known)]));
  for (const node of Object.values(nodes)) {
    for (const target of node.imports) nodes[target]?.importedBy.push(node.file);
  }

  const graph = {
    generatedAt: new Date().toISOString(),
    fingerprint: fingerprint(files),
    stats: {
      files: files.length,
      edges: Object.values(nodes).reduce((n, node) => n + node.imports.length, 0),
    },
    routes: Object.values(nodes)
      .filter((n) => n.route && n.kind === "page")
      .map((n) => ({ path: n.route, file: n.file })),
    nodes,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(graph, null, 1) + "\n");
  writeFileSync(MD_OUT, renderMarkdown(graph));
  return graph;
}

function renderMarkdown(graph) {
  const nodes = Object.values(graph.nodes);
  const short = (f) => f.replace(/\.(tsx?|mjs|js)$/, "");
  const groups = [
    ["Pages (URL → file)", (n) => n.kind === "page"],
    ["Layouts, loading & API routes", (n) => ["layout", "loading", "route"].includes(n.kind)],
    ["Server actions", (n) => n.kind === "server-actions"],
    ["Components", (n) => n.kind === "component"],
    ["Library", (n) => n.kind === "lib"],
    ["Scripts", (n) => n.kind === "script" || n.kind === "other"],
  ];

  const out = [
    "# Code map",
    "",
    `<!-- generated by scripts/build-code-graph.mjs — do not edit. fingerprint ${graph.fingerprint} -->`,
    "",
    `${graph.stats.files} files, ${graph.stats.edges} import edges. Read this before opening files;`,
    "run `npm run graph -- --query <file-or-symbol>` for a file's full neighbourhood.",
    "",
    "Legend: `[c]` client component · `←N` imported by N files · `→` local imports",
    "",
  ];

  for (const [title, match] of groups) {
    const members = nodes.filter(match);
    if (members.length === 0) continue;
    out.push(`## ${title}`, "");
    for (const n of members) {
      const head = n.kind === "page" ? `\`${n.route}\` ${short(n.file)}` : short(n.file);
      const flags = [n.client ? "[c]" : "", n.importedBy.length ? `←${n.importedBy.length}` : ""]
        .filter(Boolean)
        .join(" ");
      // Only pages list their imports here: a page's imports ARE its
      // anatomy. Everyone else's are one --query away, and listing them all
      // doubled the size of a file whose whole job is to be cheap to load.
      const deps = n.kind === "page" && n.imports.length
        ? ` → ${n.imports.map((i) => short(i).replace(/^(components|lib)\//, "")).join(", ")}`
        : "";
      const exp =
        n.kind === "server-actions" || n.kind === "lib"
          ? ` {${n.exports.slice(0, 40).join(", ")}${n.exports.length > 40 ? ", …" : ""}}`
          : "";
      out.push(`- ${head} ${flags}${n.summary ? ` — ${n.summary}` : ""}${exp}${deps}`.replace(/\s+—/, " —"));
    }
    out.push("");
  }
  return out.join("\n");
}

function load() {
  return existsSync(JSON_OUT) ? JSON.parse(readFileSync(JSON_OUT, "utf8")) : null;
}

function isStale(graph) {
  return !graph || graph.fingerprint !== fingerprint(listSources());
}

function query(term) {
  let graph = load();
  if (isStale(graph)) graph = build();
  const nodes = Object.values(graph.nodes);
  const lower = term.toLowerCase();

  const fileHits = nodes.filter((n) => n.file.toLowerCase().includes(lower));
  const symbolHits = nodes.filter((n) => n.exports.some((e) => e.toLowerCase() === lower));

  if (fileHits.length === 0 && symbolHits.length === 0) {
    console.log(`Nothing in the graph matches "${term}".`);
    process.exitCode = 1;
    return;
  }

  for (const n of fileHits.slice(0, 8)) {
    console.log(`\n${n.file}  (${n.kind}${n.client ? ", client" : ""}, ${n.lines} lines)`);
    if (n.route) console.log(`  route:       ${n.route}`);
    if (n.summary) console.log(`  summary:     ${n.summary}`);
    if (n.exports.length) console.log(`  exports:     ${n.exports.join(", ")}`);
    if (n.imports.length) console.log(`  imports:     ${n.imports.join(", ")}`);
    if (n.importedBy.length) console.log(`  imported by: ${n.importedBy.join(", ")}`);
  }
  if (fileHits.length > 8) console.log(`\n…and ${fileHits.length - 8} more files matching "${term}".`);

  for (const n of symbolHits) {
    // Who uses the symbol: importers of its file whose source names it.
    const users = n.importedBy.filter((f) =>
      new RegExp(`\\b${term}\\b`).test(readFileSync(join(ROOT, f), "utf8")),
    );
    console.log(`\nsymbol ${term} — exported by ${n.file}`);
    console.log(`  used in: ${users.length ? users.join(", ") : "(no importers reference it)"}`);
  }
}

const args = process.argv.slice(2);
if (args[0] === "--query") {
  if (!args[1]) {
    console.error("Usage: npm run graph -- --query <file-or-symbol>");
    process.exit(2);
  }
  query(args[1]);
} else if (args[0] === "--check") {
  if (isStale(load())) {
    console.log("Code graph is stale — run `npm run graph`.");
    process.exit(1);
  }
  console.log("Code graph is up to date.");
} else {
  const existing = load();
  if (!args.includes("--force") && !isStale(existing)) {
    console.log(`Code graph up to date (${existing.stats.files} files).`);
  } else {
    const graph = build();
    console.log(
      `Code graph rebuilt: ${graph.stats.files} files, ${graph.stats.edges} edges → ${toPosix(relative(ROOT, MD_OUT))}`,
    );
  }
}
