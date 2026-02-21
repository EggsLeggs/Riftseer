/**
 * Riot Games official Riftbound API provider — STUB / NOT IMPLEMENTED
 *
 * TODO: Implement once Riot publishes a public Riftbound API.
 *
 * Expected implementation notes:
 *   - API key from https://developer.riotgames.com/
 *   - Env vars: RIOT_API_KEY, RIOT_API_BASE_URL, RIOT_REGION
 *   - Stricter rate limits than RiftCodex; will need per-region buckets
 *   - Card IDs may differ from RiftCodex — maintain a mapping if needed
 *   - Images likely served from a Riot CDN (same as RiftCodex currently)
 *   - Pagination may use cursor tokens instead of page numbers
 *
 * To activate:  CARD_PROVIDER=riot  in your .env
 */

import type { CardDataProvider } from "../provider.ts";
import type { CardV2, CardRequest, CardSearchOptions, ResolvedCard } from "../types.ts";

export class RiotProvider implements CardDataProvider {
  readonly sourceName = "riot";

  async warmup(): Promise<void> {
    throw new Error(
      "RiotProvider is not yet implemented. Set CARD_PROVIDER=riftcodex in your .env"
    );
  }

  async refresh(): Promise<void> {
    throw new Error("RiotProvider is not yet implemented.");
  }

  async getCardById(_id: string): Promise<CardV2 | null> {
    throw new Error("RiotProvider is not yet implemented.");
  }

  async searchByName(_q: string, _opts?: CardSearchOptions): Promise<CardV2[]> {
    throw new Error("RiotProvider is not yet implemented.");
  }

  async resolveRequest(_req: CardRequest): Promise<ResolvedCard> {
    throw new Error("RiotProvider is not yet implemented.");
  }

  async getSets(): Promise<Array<{ setCode: string; setName: string; cardCount: number }>> {
    return [];
  }

  async getCardsBySet(_setCode: string, _opts?: { limit?: number }): Promise<CardV2[]> {
    return [];
  }

  async getRandomCard(): Promise<CardV2 | null> {
    return null;
  }

  getStats(): { lastRefresh: number; cardCount: number } {
    return { lastRefresh: 0, cardCount: 0 };
  }
}
