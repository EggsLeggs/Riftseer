import type { AdminReviewEntry, AdminReviewGalleryCard } from "./types";

/**
 * Stash for the create-from-review flow. The new-card form reads this after a
 * "Create card" click on a `missing_printing` entry; sessionStorage keeps the
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
