/**
 * Slash command definitions.
 * Import and POST to the Discord API via src/register.ts.
 */
import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord-api-types/v10";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";

// Allow commands in guilds, bot DMs, and private channels (friend DMs / Group DMs).
// Requires both Guild Install (0) and User Install (1) to be enabled in the
// Discord Developer Portal under your app's Installation settings.
const INTEGRATION_TYPES: ApplicationIntegrationType[] = [
  ApplicationIntegrationType.GuildInstall,
  ApplicationIntegrationType.UserInstall,
];
const CONTEXTS: InteractionContextType[] = [
  InteractionContextType.Guild,
  InteractionContextType.BotDM,
  InteractionContextType.PrivateChannel,
];

export const COMMANDS: RESTPostAPIApplicationCommandsJSONBody[] = [
  {
    name: "card",
    description: "Look up a Riftbound card by name",
    integration_types: INTEGRATION_TYPES,
    contexts: CONTEXTS,
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: "name",
        description: "Card name — partial names and typos are fine",
        required: true,
      },
      {
        type: ApplicationCommandOptionType.String,
        name: "set",
        description: "Narrow to a specific set code (e.g. OGN)",
        required: false,
      },
      {
        type: ApplicationCommandOptionType.Boolean,
        name: "image",
        description: "Show the card image only (no stats or text)",
        required: false,
      },
    ],
  },
  {
    name: "random",
    description: "Get a random Riftbound card",
    integration_types: INTEGRATION_TYPES,
    contexts: CONTEXTS,
  },
  {
    name: "sets",
    description: "List all Riftbound card sets",
    integration_types: INTEGRATION_TYPES,
    contexts: CONTEXTS,
  },
];
