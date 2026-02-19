/**
 * Slash command definitions.
 * Import and POST to the Discord API via src/register.ts.
 */
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";

export const COMMANDS: RESTPostAPIApplicationCommandsJSONBody[] = [
  {
    name: "card",
    description: "Look up a Riftbound card by name",
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
  },
  {
    name: "sets",
    description: "List all Riftbound card sets",
  },
];
