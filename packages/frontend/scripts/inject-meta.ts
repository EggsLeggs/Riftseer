/**
 * Post-build script: for each static route, copies dist/index.html and replaces
 * the <!-- META --> placeholder with the correct title + OG/Twitter tags.
 *
 * Run automatically after `vite build` via the build script in package.json.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const SITE = "https://riftseer.thinkhuman.dev";
const dist = join(import.meta.dir, "..", "dist");

const template = readFileSync(join(dist, "index.html"), "utf-8");

interface Route {
  outPath: string;
  title: string;
  description: string;
  ogUrl: string;
}

const routes: Route[] = [
  {
    outPath: "index.html",
    title: "RiftSeer — Riftbound Database",
    description:
      "The comprehensive Riftbound TCG card database with deck building support and community bots for Discord and Reddit.",
    ogUrl: `${SITE}/`,
  },
  {
    outPath: "search/index.html",
    title: "Search — RiftSeer",
    description: "Filter Riftbound cards on RiftSeer using options you specify.",
    ogUrl: `${SITE}/search`,
  },
  {
    outPath: "sets/index.html",
    title: "All Sets — RiftSeer",
    description: "All Riftbound sets on RiftSeer.",
    ogUrl: `${SITE}/sets`,
  },
  {
    outPath: "syntax/index.html",
    title: "Search Reference — RiftSeer",
    description:
      "RiftSeer includes a large set of keywords and expressions used to find Riftbound cards.",
    ogUrl: `${SITE}/syntax`,
  },
  {
    outPath: "docs/terms/index.html",
    title: "Terms of Service — RiftSeer",
    description: "Terms of Service for RiftSeer.",
    ogUrl: `${SITE}/docs/terms`,
  },
  {
    outPath: "docs/privacy/index.html",
    title: "Privacy Policy — RiftSeer",
    description: "Privacy Policy for RiftSeer.",
    ogUrl: `${SITE}/docs/privacy`,
  },
];

function buildMeta(route: Route): string {
  return [
    `    <title>${route.title}</title>`,
    `    <meta name="description" content="${route.description}" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:title" content="${route.title}" />`,
    `    <meta property="og:description" content="${route.description}" />`,
    `    <meta property="og:url" content="${route.ogUrl}" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:title" content="${route.title}" />`,
    `    <meta name="twitter:description" content="${route.description}" />`,
  ].join("\n");
}

for (const route of routes) {
  const outFile = join(dist, route.outPath);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, template.replace("<!-- META -->", buildMeta(route)), "utf-8");
  console.log(`  ✓ ${route.outPath}`);
}

console.log("Meta injection complete.");
