/**
 * Register slash commands with Discord.
 * Run once (or after command changes):
 *   bun run src/register.ts
 *
 * Requires env vars:
 *   DISCORD_BOT_TOKEN
 *   DISCORD_APPLICATION_ID
 */
import { COMMANDS } from "./commands.ts";

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;

if (!token || !appId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID");
  process.exit(1);
}

const res = await fetch(
  `https://discord.com/api/v10/applications/${appId}/commands`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(COMMANDS),
  },
);

if (!res.ok) {
  const text = await res.text();
  console.error(`Failed to register commands (${res.status}): ${text}`);
  process.exit(1);
}

const registered = (await res.json()) as Array<{ name: string }>;
console.log(
  `Registered ${registered.length} command(s): ${registered.map((c) => c.name).join(", ")}`,
);
