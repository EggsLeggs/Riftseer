/**
 * RiftSeer Discord Bot — Cloudflare Workers entry point.
 *
 * Discord sends a POST request for every interaction (slash command, ping).
 * The worker:
 *   1. Verifies the Ed25519 signature.
 *   2. Responds to PINGs immediately (Discord requirement).
 *   3. For slash commands, responds with a deferred message (type 5) and
 *      processes the command asynchronously inside ctx.waitUntil().
 *
 * Slash commands:
 *   /card name:<name> [set:<set>] [image:<bool>]  — Look up a card
 *   /random                                         — Random card
 *   /sets                                           — List all sets
 *
 * Deploy:
 *   wrangler deploy
 *
 * Register commands (once, after changes):
 *   bun run src/register.ts
 *
 * Secrets (set via wrangler secret put):
 *   DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID
 */

import { InteractionResponseType, InteractionType } from "discord-api-types/v10";
import type {
  APIInteraction,
  APIChatInputApplicationCommandInteraction,
} from "discord-api-types/v10";
import { verifySignature } from "./verify.ts";
import { patchResponse } from "./response.ts";
import { handleCard } from "./handlers/card.ts";
import { handleRandom } from "./handlers/random.ts";
import { handleSets } from "./handlers/sets.ts";

export interface Env {
  DISCORD_PUBLIC_KEY: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_APPLICATION_ID: string;
  /** Base URL of the RiftSeer API (e.g. https://riftseerapi-production.up.railway.app) */
  API_BASE_URL: string;
  /** Base URL of the RiftSeer site for card links */
  SITE_BASE_URL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await request.text();
    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");

    if (
      !signature ||
      !timestamp ||
      !(await verifySignature(env.DISCORD_PUBLIC_KEY, signature, timestamp, body))
    ) {
      return new Response("Invalid request signature", { status: 401 });
    }

    const interaction: APIInteraction = JSON.parse(body);

    // Discord PING — must respond synchronously
    if (interaction.type === InteractionType.Ping) {
      return json({ type: InteractionResponseType.Pong });
    }

    // Slash commands — defer immediately, handle in waitUntil
    if (interaction.type === InteractionType.ApplicationCommand) {
      const cmd = interaction as APIChatInputApplicationCommandInteraction;
      const name = cmd.data.name;

      ctx.waitUntil(dispatch(name, cmd, env));

      return json({ type: InteractionResponseType.DeferredChannelMessageWithSource });
    }

    return new Response("Unknown interaction type", { status: 400 });
  },
};

async function dispatch(
  name: string,
  interaction: APIChatInputApplicationCommandInteraction,
  env: Env,
): Promise<void> {
  switch (name) {
    case "card":
      return handleCard(interaction, env);
    case "random":
      return handleRandom(interaction, env);
    case "sets":
      return handleSets(interaction, env);
    default:
      console.warn(`[RiftSeer] Unknown command: ${name}`);
      await patchResponse(interaction, env, { content: "Unknown command." });
  }
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
