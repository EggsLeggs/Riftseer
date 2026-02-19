/**
 * Upload all Riftbound icons as Discord application emojis.
 *
 * Run once (or after adding new icons):
 *   bun run setup-emojis
 *
 * Requires env vars (set in .dev.vars or exported):
 *   DISCORD_BOT_TOKEN
 *   DISCORD_APPLICATION_ID
 *
 * SVG files are automatically converted to 128×128 PNG before upload.
 * PNG files are uploaded directly.
 *
 * Discord limits: 2000 application emojis max, 256 KiB per emoji.
 * Emoji names must match [a-zA-Z0-9_]{2,32}.
 *
 * If an emoji with the same name already exists it is skipped.
 */

import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "fs";
import { join, extname } from "path";
import { EMOJI_FILES } from "@riftseer/core/icons";

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;

if (!token || !appId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID");
  process.exit(1);
}

// Path to the frontend's public icons directory (relative to this script file)
const publicDir = join(import.meta.dir, "../../frontend/public");

// ─── Fetch existing emojis so we can skip duplicates ─────────────────────────

const listRes = await fetch(
  `https://discord.com/api/v10/applications/${appId}/emojis`,
  { headers: { Authorization: `Bot ${token}` } },
);

if (!listRes.ok) {
  console.error(`Failed to list emojis (${listRes.status}): ${await listRes.text()}`);
  process.exit(1);
}

const existing = (await listRes.json()) as { items: Array<{ id: string; name: string }> };
const existingNames = new Set(existing.items.map((e) => e.name));

console.log(`Found ${existingNames.size} existing emoji(s). Uploading new ones...\n`);

// ─── Upload each icon ─────────────────────────────────────────────────────────

let uploaded = 0;
let skipped = 0;

for (const entry of EMOJI_FILES) {
  if (existingNames.has(entry.emojiName)) {
    console.log(`  ↩  ${entry.emojiName} (already exists)`);
    skipped++;
    continue;
  }

  const filePath = join(publicDir, entry.file);
  const ext = extname(entry.file).toLowerCase();

  let pngBuffer: Buffer;

  if (ext === ".svg") {
    // Convert SVG → 128×128 PNG
    const svg = readFileSync(filePath, "utf-8");
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: 128 },
    });
    pngBuffer = Buffer.from(resvg.render().asPng());
  } else {
    // PNG / WebP / etc — upload directly
    pngBuffer = readFileSync(filePath);
  }

  const imageData = `data:image/png;base64,${pngBuffer.toString("base64")}`;

  const res = await fetch(
    `https://discord.com/api/v10/applications/${appId}/emojis`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: entry.emojiName, image: imageData }),
    },
  );

  if (res.ok) {
    const emoji = (await res.json()) as { id: string; name: string };
    console.log(`  ✓  ${emoji.name}  (id: ${emoji.id})`);
    uploaded++;
  } else {
    const text = await res.text();
    console.error(`  ✗  ${entry.emojiName} failed (${res.status}): ${text}`);
  }

  // Discord emoji endpoints are rate-limited; wait briefly between requests
  await new Promise((r) => setTimeout(r, 500));
}

console.log(
  `\nDone — ${uploaded} uploaded, ${skipped} skipped (already existed).`,
);
