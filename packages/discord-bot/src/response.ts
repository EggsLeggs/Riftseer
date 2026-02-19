/**
 * Patch a deferred Discord interaction response.
 * Called from within ctx.waitUntil() after responding with type 5 (DEFERRED).
 */
import type { APIChatInputApplicationCommandInteraction } from "discord-api-types/v10";
import type { Env } from "./index.ts";

export async function patchResponse(
  interaction: APIChatInputApplicationCommandInteraction,
  env: Env,
  data: object,
): Promise<void> {
  await fetch(
    `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify(data),
    },
  );
}
