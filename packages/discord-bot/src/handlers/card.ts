import type { APIChatInputApplicationCommandInteraction } from "discord-api-types/v10";
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { createClient } from "../api.ts";
import { buildCardEmbed, buildCardImageEmbed } from "../embeds.ts";
import { getEmojiMap } from "../emoji-cache.ts";
import type { Env } from "../index.ts";
import { patchResponse } from "../response.ts";

export async function handleCard(
  interaction: APIChatInputApplicationCommandInteraction,
  env: Env,
): Promise<void> {
  const options = interaction.data.options ?? [];

  const name = options.find(
    (o) => o.name === "name" && o.type === ApplicationCommandOptionType.String,
  );
  const setOpt = options.find(
    (o) => o.name === "set" && o.type === ApplicationCommandOptionType.String,
  );
  const imageOpt = options.find(
    (o) => o.name === "image" && o.type === ApplicationCommandOptionType.Boolean,
  );

  const cardName = "value" in (name ?? {}) ? (name as { value: string }).value : "";
  const setCode = setOpt && "value" in setOpt ? (setOpt as { value: string }).value : undefined;
  const imageOnly =
    imageOpt && "value" in imageOpt ? (imageOpt as { value: boolean }).value : false;

  const client = createClient(env.API_BASE_URL);
  const request = setCode ? `${cardName}|${setCode}` : cardName;

  const { data, error } = await client.api.resolve.post({ requests: [request] });

  if (error || !data || data.results.length === 0 || !data.results[0].card) {
    await patchResponse(interaction, env, {
      content: `No card found for **${cardName}**${setCode ? ` in set **${setCode}**` : ""}.`,
    });
    return;
  }

  const card = data.results[0].card;
  const emojiMap = await getEmojiMap(env);
  const embed = imageOnly
    ? buildCardImageEmbed(card, env.SITE_BASE_URL)
    : buildCardEmbed(card, env.SITE_BASE_URL, emojiMap);

  await patchResponse(interaction, env, { embeds: [embed] });
}
