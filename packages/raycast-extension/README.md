# RiftSeer — Riftbound Card Search

A Raycast extension for searching Riftbound TCG cards in real-time via the RiftSeer API.

## Features

- **Search Cards** — Search for Riftbound TCG cards by name with fuzzy matching
- **Random Card** — Fetch and view a random card instantly
- **Recent History** — Automatically remembers and shows recently viewed cards
- **Card Details** — View full card metadata, attributes, and set information

## Installation

The extension works out of the box — no configuration required. It points to the public Riftseer API and site by default.

### Configuration (optional)

If you're self-hosting, open Raycast preferences and override:

- **API Base URL** — Base URL of your Riftseer API server (default: `https://riftseer-api.thinkhuman-21f.workers.dev`)
- **Site Base URL** — Base URL of the Riftseer frontend for card links (default: `https://riftseer.thinkhuman.dev`)
- **Max Recent History** — How many recently viewed cards to remember (default: `50`, set to `0` to disable)

## Commands

### Search Cards
Search for Riftbound TCG cards by name. Results show card name, set, and rarity. Select a card to view full details including attributes, cost, power, text, and more.

### Random Card
Instantly fetch and display a random Riftbound TCG card with all metadata.

## Privacy

For up-to-date privacy information, see the [Riftseer Privacy Policy](https://riftseer.thinkhuman.dev/docs/privacy).

## Support

For issues or feature requests, visit the [RiftSeer repository](https://github.com/yourrepo/riftseer).
