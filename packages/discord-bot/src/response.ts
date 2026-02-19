/**
 * Patch a deferred Discord interaction response.
 * Called from within ctx.waitUntil() after responding with type 5 (DEFERRED).
 */
import type { APIChatInputApplicationCommandInteraction } from "discord-api-types/v10";
import type { Env } from "./index.ts";

const WEBHOOK_BASE = "https://discord.com/api/v10/webhooks";

async function sendFallbackMessage(
  interaction: APIChatInputApplicationCommandInteraction,
  env: Env,
): Promise<void> {
  try {
    const res = await fetch(
      `${WEBHOOK_BASE}/${env.DISCORD_APPLICATION_ID}/${interaction.token}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        },
        body: JSON.stringify({
          content: "Something went wrong. Please try again.",
          flags: 64, // ephemeral
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(
        "[patchResponse fallback] follow-up failed:",
        res.status,
        res.statusText,
        body,
        { token: interaction.token, applicationId: env.DISCORD_APPLICATION_ID },
      );
    }
  } catch (e) {
    console.error("[patchResponse fallback] network error:", (e as Error).stack);
  }
}

export async function patchResponse(
  interaction: APIChatInputApplicationCommandInteraction,
  env: Env,
  data: object,
): Promise<void> {
  try {
    const response = await fetch(
      `${WEBHOOK_BASE}/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) {
      const bodyText = await response.text();
      console.error(
        "[patchResponse] PATCH failed:",
        response.status,
        response.statusText,
        bodyText,
        { token: interaction.token, applicationId: env.DISCORD_APPLICATION_ID },
      );
      await sendFallbackMessage(interaction, env);
    }
  } catch (e) {
    console.error("[patchResponse] network error:", (e as Error).stack);
    await sendFallbackMessage(interaction, env);
  }
}
