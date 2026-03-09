import { normalizeCardName, logger } from "@riftseer/core";

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const TCGCSV_CATEGORY = 89; // Riftbound League of Legends Trading Card Game
const RIFTBOUND_GROUPS = [24344, 24439, 24502, 24519, 24528, 24552, 24560]; // all known groups
const TCG_PRICE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type TCGEntry = {
  productId: number;
  url: string;
  usdMarket: number | null;
  usdLow: number | null;
};

let tcgNameMap = new Map<string, TCGEntry>(); // key: normalizeCardName(cleanName)
let tcgDataLoadedAt = 0;
let tcgDataLoadPromise: Promise<void> | null = null;

export function getTCGEntry(normalizedName: string): TCGEntry | undefined {
  return tcgNameMap.get(normalizedName);
}

export async function loadTCGData(): Promise<void> {
  if (tcgDataLoadedAt && Date.now() - tcgDataLoadedAt < TCG_PRICE_TTL_MS) return;
  if (tcgDataLoadPromise) {
    await tcgDataLoadPromise;
    return;
  }
  tcgDataLoadPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const groupResults = await Promise.all(
        RIFTBOUND_GROUPS.map(async (groupId) => {
          const base = `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/${groupId}`;
          const [productsRes, pricesRes] = await Promise.all([
            fetch(`${base}/products`, { signal: controller.signal }),
            fetch(`${base}/prices`, { signal: controller.signal }),
          ]);
          if (!productsRes.ok) {
            throw new Error(`TCG products ${productsRes.status} ${productsRes.statusText}`);
          }
          if (!pricesRes.ok) {
            throw new Error(`TCG prices ${pricesRes.status} ${pricesRes.statusText}`);
          }
          const products: Array<{ productId: number; cleanName: string; url: string }> =
            await productsRes.json();
          const prices: Array<{
            productId: number;
            lowPrice: number | null;
            marketPrice: number | null;
            subTypeName: string;
          }> = await pricesRes.json();
          return { products, prices };
        })
      );

      const map = new Map<string, TCGEntry>();
      for (const { products, prices } of groupResults) {
        const priceById = new Map(
          prices
            .filter((p) => p.subTypeName === "Normal")
            .map((p) => [p.productId, { usdMarket: p.marketPrice, usdLow: p.lowPrice }])
        );
        for (const product of products) {
          const price = priceById.get(product.productId);
          if (!price) continue; // sealed products won't have a Normal price entry
          map.set(normalizeCardName(product.cleanName), {
            productId: product.productId,
            url: product.url,
            ...price,
          });
        }
      }
      if (map.size > 0) {
        tcgNameMap = map;
        tcgDataLoadedAt = Date.now();
        logger.info("TCGPlayer data loaded", { count: map.size });
      }
    } catch (error) {
      logger.error("Failed to load TCG data", { error });
    } finally {
      clearTimeout(timeoutId);
      tcgDataLoadPromise = null;
    }
  })();
  await tcgDataLoadPromise;
}
