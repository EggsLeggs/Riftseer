#!/usr/bin/env node
/**
 * Fail on dangling references in guidance files.
 *
 * Most documentation rot is not prose going subtly out of date — it is a name
 * that no longer exists: a deleted migration, a renamed RPC, a moved file. A
 * grep catches every one of those, and it is the cheapest guardrail available.
 *
 * Two classes of reference are checked, both taken from inline code spans:
 *
 *   paths        `packages/types/src/oracle.ts` — must exist on disk
 *   identifiers  `oracleKeyForName()`           — must appear in tracked source
 *
 * Anything else in backticks (commands, env vars, column names, prose) is
 * ignored: the point is to catch names that claim to point somewhere.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

const guidanceFiles = git("ls-files", "*CLAUDE.md", "*AGENTS.md");
const agentFiles = git("ls-files", "*AGENTS.md");
const trackedClaudeFiles = new Set(git("ls-files", "*CLAUDE.md"));

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
const PATH_LIKE = /^[\w./@-]+\/[\w./@-]+\.(ts|tsx|sql|json|jsonc|md|mjs|yml)$/;
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

for (const file of guidanceFiles) {
  const full = path.join(repoRoot, file);
  const text = readFileSync(full, "utf8");
  const dir = path.dirname(full);

  for (const [, span] of text.matchAll(CODE_SPAN)) {
    const token = span.trim();

    if (PATH_LIKE.test(token)) {
      // A path may be repo-relative, relative to the file that mentions it,
      // or — the usual convention in a package's own guidance — relative to
      // that package's `src/`.
      const candidates = [
        path.join(repoRoot, token),
        path.join(dir, token),
        path.join(dir, "src", token),
      ];
      if (!candidates.some(existsSync)) {
        problems.push({ file, token, why: "no such file" });
      }
      continue;
    }

    const identifier = IDENTIFIER_LIKE.exec(token);
    if (identifier && !haystack.includes(identifier[1])) {
      problems.push({ file, token, why: "not found in tracked source" });
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
