#!/usr/bin/env node
/**
 * Fail on dangling references in guidance and reference files.
 *
 * Most documentation rot is not prose going subtly out of date — it is a name
 * that no longer exists: a deleted migration, a renamed RPC, a moved file. A
 * grep catches every one of those, and it is the cheapest guardrail available.
 *
 * Files checked: every AGENTS.md and CLAUDE.md, the root CONTEXT.md, and every
 * markdown file under docs/ or a package's docs/.
 *
 * Two classes of reference are checked, taken from inline code spans and
 * markdown link targets:
 *
 *   paths        `packages/types/src/oracle.ts` — must exist on disk
 *   identifiers  `oracleKeyForName()`           — must appear in tracked source
 *
 * Anything else in backticks (commands, env vars, column names, prose) is
 * ignored: the point is to catch names that claim to point somewhere.
 *
 * Two structural checks ride along:
 *
 *   CONTEXT.md   every glossary entry has a term, a definition, an _Avoid_
 *                line and a _Related_ line, and every related term is defined
 *   orphans      every reference doc is reachable by path from an AGENTS.md,
 *                CONTEXT.md or another doc, so nothing survives unlinked
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).split("\n").filter(Boolean);
}

const agentFiles = git("ls-files", "*AGENTS.md");
const trackedClaudeFiles = new Set(git("ls-files", "*CLAUDE.md"));
const contextFile = "CONTEXT.md";
const docFiles = git("ls-files", "docs/*.md", "*/docs/*.md");
const guidanceFiles = [
  ...git("ls-files", "*CLAUDE.md", "*AGENTS.md"),
  ...(existsSync(path.join(repoRoot, contextFile)) ? [contextFile] : []),
  ...docFiles,
];

// One pass over tracked source; membership tests are then free.
const sourceFiles = git(
  "ls-files",
  "*.ts",
  "*.tsx",
  "*.sql",
  "*.json",
  "*.jsonc",
  "*.mjs",
  "*.yml",
);
const haystack = sourceFiles
  .map((file) => {
    try {
      return readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      return "";
    }
  })
  .join("\n");

const CODE_SPAN = /`([^`\n]+)`/g;
const MARKDOWN_LINK = /\]\(([^)\s]+)\)/g;
const PATH_LIKE = /^[\w./@-]+\/[\w./@-]+\.(ts|tsx|sql|json|jsonc|json5|md|mjs|yml)$/;
const IDENTIFIER_LIKE = /^([A-Za-z_][\w]*)\(\)$/;

const problems = [];

// AGENTS.md is the canonical guidance file, while CLAUDE.md is a one-line
// import (`@AGENTS.md`) that exposes the same instructions to tools that
// discover that filename. Copies drift, so every tracked AGENTS.md must have
// a tracked sibling CLAUDE.md that does nothing but import it.
for (const file of agentFiles) {
  const claudeFile = path.join(path.dirname(file), "CLAUDE.md");
  const claudePath = path.join(repoRoot, claudeFile);

  if (!trackedClaudeFiles.has(claudeFile)) {
    problems.push({ file, token: claudeFile, why: "CLAUDE.md is not tracked" });
    continue;
  }
  if (!existsSync(claudePath)) {
    problems.push({ file, token: claudeFile, why: "CLAUDE.md is missing" });
    continue;
  }
  if (readFileSync(claudePath, "utf8").trim() !== "@AGENTS.md") {
    problems.push({
      file,
      token: claudeFile,
      why: "CLAUDE.md must contain only `@AGENTS.md`",
    });
  }
}

// A path may be repo-relative, relative to the file that mentions it, or —
// the usual convention in a package's own guidance — relative to that
// package's `src/`. A file inside a package's docs/ folder gets the same
// package-relative conventions, so `src/deck.ts` in packages/types/docs works.
function resolvePath(file, token) {
  const dir = path.dirname(path.join(repoRoot, file));
  const candidates = [
    path.join(repoRoot, token),
    path.join(dir, token),
    path.join(dir, "src", token),
  ];
  if (path.basename(dir) === "docs") {
    const pkg = path.dirname(dir);
    candidates.push(path.join(pkg, token), path.join(pkg, "src", token));
  }
  return candidates.find(existsSync) ?? null;
}

// Every resolved path each file points at, for the orphan check below.
const referencedBy = new Map();

for (const file of guidanceFiles) {
  const text = readFileSync(path.join(repoRoot, file), "utf8");
  const referenced = new Set();
  referencedBy.set(file, referenced);

  const tokens = [];
  for (const [, span] of text.matchAll(CODE_SPAN)) tokens.push(span.trim());
  for (const [, target] of text.matchAll(MARKDOWN_LINK)) {
    const bare = target.split("#")[0];
    if (bare && !/^[a-z]+:/.test(bare)) tokens.push(bare);
  }

  for (const token of tokens) {
    if (PATH_LIKE.test(token)) {
      const resolved = resolvePath(file, token);
      if (resolved === null) {
        problems.push({ file, token, why: "no such file" });
      } else {
        referenced.add(path.relative(repoRoot, resolved));
      }
      continue;
    }

    const identifier = IDENTIFIER_LIKE.exec(token);
    if (identifier && !haystack.includes(identifier[1])) {
      problems.push({ file, token, why: "not found in tracked source" });
    }
  }
}

// A reference doc nobody points at is a doc nobody reads. Every file under
// docs/ or a package's docs/ must be named, by path, from an AGENTS.md,
// CONTEXT.md or another doc.
for (const doc of docFiles) {
  const linked = [...referencedBy].some(([from, refs]) => from !== doc && refs.has(doc));
  if (!linked) {
    problems.push({
      file: doc,
      token: path.basename(doc),
      why: "orphan: no AGENTS.md, CONTEXT.md or doc links to it",
    });
  }
}

// CONTEXT.md is a glossary with one shape per entry:
//
//   **Term**:
//   One or two sentences saying what it is.
//   _Avoid_: the synonyms not to use
//   _Related_: Other Term, Another Term
//
// Every part is required, and every related term must itself be defined, so a
// renamed or deleted term cannot leave a dangling relationship behind.
if (existsSync(path.join(repoRoot, contextFile))) {
  const text = readFileSync(path.join(repoRoot, contextFile), "utf8");
  const TERM = /^\*\*([^*]+)\*\*:\s*$/;
  const entries = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const heading = TERM.exec(lines[i]);
    if (!heading) continue;
    const body = [];
    for (let j = i + 1; j < lines.length && lines[j].trim() !== ""; j++) body.push(lines[j]);
    entries.push({ term: heading[1].trim(), line: i + 1, body });
  }

  const terms = new Set(entries.map((entry) => entry.term));
  if (entries.length === 0) {
    problems.push({ file: contextFile, token: "**Term**:", why: "no glossary entries found" });
  }

  const seen = new Set();
  for (const { term, line, body } of entries) {
    const token = `${term} (line ${line})`;
    if (seen.has(term)) problems.push({ file: contextFile, token, why: "term defined twice" });
    seen.add(term);

    const definition = body.filter((l) => !l.startsWith("_"));
    const avoid = body.find((l) => l.startsWith("_Avoid_:"));
    const related = body.find((l) => l.startsWith("_Related_:"));

    if (definition.length === 0) problems.push({ file: contextFile, token, why: "no definition" });
    if (!avoid || avoid.slice("_Avoid_:".length).trim() === "") {
      problems.push({ file: contextFile, token, why: "no `_Avoid_:` line" });
    }
    if (!related || related.slice("_Related_:".length).trim() === "") {
      problems.push({ file: contextFile, token, why: "no `_Related_:` line" });
      continue;
    }
    for (const name of related.slice("_Related_:".length).split(",")) {
      const relatedTerm = name.trim();
      if (relatedTerm && !terms.has(relatedTerm)) {
        problems.push({
          file: contextFile,
          token,
          why: `related term "${relatedTerm}" is not defined`,
        });
      }
    }
  }
}

if (problems.length > 0) {
  console.error("Dangling references in guidance files:\n");
  for (const { file, token, why } of problems) {
    console.error(`  ${file}: ${token} — ${why}`);
  }
  console.error(
    `\n${problems.length} dangling reference(s). Update the doc, or the name it points at.`,
  );
  process.exit(1);
}

console.log(
  `Guidance imports are valid and no references dangle across ${guidanceFiles.length} file(s).`,
);
