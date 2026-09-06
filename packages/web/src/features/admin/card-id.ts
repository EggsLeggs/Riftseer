/**
 * RiftCodex card IDs are 24-character hex MongoDB ObjectIds, and manual cards
 * share that ID space. Generating one in the same shape keeps manual rows
 * indistinguishable from ingested ones everywhere IDs are displayed or parsed,
 * and makes a collision with a future upstream ID vanishingly unlikely.
 */
export function generateCardId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const CARD_ID_PATTERN = /^[a-f0-9]{24}$/;

/** Admins may paste an upstream ID, so only the shape is enforced. */
export function isValidCardId(value: string): boolean {
  return CARD_ID_PATTERN.test(value.trim().toLowerCase());
}
