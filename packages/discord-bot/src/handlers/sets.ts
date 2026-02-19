import type { APIChatInputApplicationCommandInteraction } from "discord-api-types/v10";
import { createClient } from "../api.ts";
import { buildSetsEmbed } from "../embeds.ts";
import type { Env } from "../index.ts";
import { patchResponse } from "../response.ts";

export async function handleSets(
  interaction: APIChatInputApplicationCommandInteraction,
  env: Env,
): Promise<void> {
  const client = createClient(env.API_BASE_URL);
  const { data, error } = await client.api.sets.get();

  if (error || !data) {
    await patchResponse(interaction, env, { content: "Couldn't fetch sets. Try again!" });
    return;
  }

  const embed = buildSetsEmbed(data.sets);
  await patchResponse(interaction, env, { embeds: [embed] });
}
