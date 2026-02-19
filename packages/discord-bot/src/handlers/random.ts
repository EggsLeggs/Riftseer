import type { APIChatInputApplicationCommandInteraction } from "discord-api-types/v10";
import { createClient } from "../api.ts";
import { buildCardEmbed } from "../embeds.ts";
import { getEmojiMap } from "../emoji-cache.ts";
import type { Env } from "../index.ts";
import { patchResponse } from "../response.ts";

export async function handleRandom(
  interaction: APIChatInputApplicationCommandInteraction,
  env: Env,
): Promise<void> {
  const client = createClient(env.API_BASE_URL);
  const { data, error } = await client.api.cards.random.get();

  if (error || !data) {
    await patchResponse(interaction, env, { content: "Couldn't fetch a random card. Try again!" });
    return;
  }

  const emojiMap = await getEmojiMap(env);
  const embed = buildCardEmbed(data, env.SITE_BASE_URL, emojiMap);
  await patchResponse(interaction, env, { embeds: [embed] });
}
