/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** API Base URL - Base URL of the RiftSeer API server (where /api/v1 routes live). */
  "apiBaseUrl": string,
  /** Site Base URL - Base URL of the RiftSeer frontend (used for card links). */
  "siteBaseUrl": string
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

