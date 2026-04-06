/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** API Base URL - Base URL of the Riftseer API server (where /api/v1 routes live). */
  "apiBaseUrl": string,
  /** Site Base URL - Base URL of the Riftseer frontend (used for card links). */
  "siteBaseUrl": string,
  /** Max Recent History - How many recently viewed cards to remember and show when the search is empty. Use 0 to disable. */
  "maxRecentHistory": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-cards` command */
  export type SearchCards = ExtensionPreferences & {}
  /** Preferences accessible in the `random-card` command */
  export type RandomCard = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-cards` command */
  export type SearchCards = {}
  /** Arguments passed to the `random-card` command */
  export type RandomCard = {}
}

