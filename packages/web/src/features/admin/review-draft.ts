import type {
  AdminCardDefinition,
  AdminReviewEntry,
  AdminReviewGalleryCard,
} from "./types";

/**
 * Stash for the create-from-review flow. The new-card form reads this after a
 * "Create card" click on a `missing_card` entry; sessionStorage keeps the
 * gallery text (which can be long) out of the URL.
 */
const STORAGE_KEY = "riftseer:admin-review-create-draft";

export interface ReviewCreateDraft {
  entryId: string;
  gallery: AdminReviewGalleryCard;
}

export function stashReviewCreateDraft(entry: AdminReviewEntry): void {
  const gallery = entry.payload.gallery;
  if (!gallery || typeof window === "undefined") return;
  const draft: ReviewCreateDraft = { entryId: entry.id, gallery };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Quota exhausted, or storage blocked by the browser. The prefill is a
    // convenience — navigating to an empty create form still works.
  }
}

export function readReviewCreateDraft(
  entryId: string | null,
): ReviewCreateDraft | null {
  if (!entryId || typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as ReviewCreateDraft;
    if (draft?.entryId !== entryId || !draft.gallery) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearReviewCreateDraft(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

/** Form values the new-card page seeds from a gallery missing-card payload. */
export interface GalleryPrefill {
  name: string;
  setCode: string;
  collectorNumber: string;
  isToken: boolean;
  signature: boolean;
  alternateArt: boolean;
  specialCollection: boolean;
  riftboundId: string;
  rarity: string;
  type: string;
  energy: string;
  might: string;
  power: string;
  mightBonus: string;
  text: string;
  equipment: string;
  imageUrl: string | null;
}

export function galleryToPrefill(gallery: AdminReviewGalleryCard): GalleryPrefill {
  const num = (value: number | null | undefined): string =>
    typeof value === "number" && Number.isFinite(value) ? String(value) : "";

  const collector = gallery.collector_number ?? "";
  const riftboundId = gallery.riftbound_id ?? "";
  // Older queue rows predate the enriched payload; derive the flags that the
  // printed id already encodes so Create still lands useful defaults.
  const isToken =
    gallery.is_token === true || /^T\d/i.test(collector);
  const signature =
    gallery.signature === true || /-\d+\*/.test(riftboundId);
  const specialCollection =
    gallery.special_collection === true || /-(?:sp)\d+/i.test(riftboundId);
  const alternateArt =
    gallery.alternate_art === true || /-\d+a(?:-|$)/i.test(riftboundId);

  return {
    name: gallery.name ?? "",
    setCode: (gallery.set_code ?? "").toUpperCase(),
    collectorNumber: collector,
    isToken,
    signature,
    alternateArt,
    specialCollection,
    riftboundId,
    rarity: gallery.rarity ?? "",
    type: gallery.type ?? "",
    energy: num(gallery.energy),
    might: num(gallery.might),
    power: num(gallery.power),
    mightBonus: num(gallery.might_bonus),
    text: gallery.text ?? "",
    equipment: gallery.equipment ?? "",
    imageUrl: gallery.image_url ?? null,
  };
}

function optionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Build the create payload from the prefilled (and possibly edited) form.
 * Identity fields feed `public_slug`; the rest are suggestions the gallery
 * already stated, so the editor starts nearly complete.
 */
export function buildDefinitionFromPrefill(
  prefill: GalleryPrefill,
  set: { setCode: string; setName: string } | null,
): AdminCardDefinition {
  const energy = optionalInt(prefill.energy);
  const might = optionalInt(prefill.might);
  const power = optionalInt(prefill.power);
  const mightBonus = optionalInt(prefill.mightBonus);
  const rarity = prefill.rarity.trim();
  const type = prefill.type.trim();
  const text = prefill.text.trim();
  const equipment = prefill.equipment.trim();
  const riftboundId = prefill.riftboundId.trim();

  return {
    name: prefill.name.trim(),
    is_token: prefill.isToken,
    collector_number: prefill.collectorNumber.trim() || null,
    metadata: {
      signature: prefill.signature,
      alternate_art: prefill.alternateArt,
      special_collection: prefill.specialCollection,
    },
    ...(set
      ? {
          set: {
            set_code: set.setCode,
            set_name: set.setName,
          },
        }
      : {}),
    ...(riftboundId
      ? { external_ids: { riftbound_id: riftboundId } }
      : {}),
    ...((energy !== null ||
      might !== null ||
      power !== null ||
      mightBonus !== null) && {
      attributes: {
        ...(energy !== null ? { energy } : {}),
        ...(might !== null ? { might } : {}),
        ...(power !== null ? { power } : {}),
        ...(mightBonus !== null ? { might_bonus: mightBonus } : {}),
      },
    }),
    ...((rarity || type) && {
      classification: {
        ...(rarity ? { rarity } : {}),
        ...(type ? { type } : {}),
      },
    }),
    ...((text || equipment) && {
      text: {
        ...(text ? { rich: text, plain: text } : {}),
        ...(equipment ? { equipment } : {}),
      },
    }),
  };
}
