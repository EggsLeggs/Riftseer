import type { DeckDataRepository, DeckRole, DeckRow } from "../lib/deck-data";

// ─── Deck access ──────────────────────────────────────────────────────────────
//
// The authorisation boundary. The Worker holds a service-role key and bypasses
// RLS entirely, so the rules below are the ones that actually decide who reads
// and who writes:
//
//   owner   — everything, and the only role that may delete the deck, manage
//             the collaborator roster, or change `visibility`
//   editor  — card mutations and metadata patches, but not `visibility`:
//             being invited to help build is not consent to be published
//   viewer  — read only
//
// Visibility is orthogonal to role. `public` is readable by anyone and listed;
// `unlisted` is readable by anyone holding the id but never appears in another
// user's list — which is why the migration's policies grant no read on it and
// this module does; `private` is owner and collaborators only.

/** The one place a role is decided. `null` means "no relationship to this deck". */
export async function roleFor(
  repository: DeckDataRepository,
  deck: DeckRow,
  userId: string | undefined,
): Promise<DeckRole | null> {
  if (!userId) return null;
  if (deck.owner_id === userId) return "owner";
  return repository.getCollaboratorRole(deck.id, userId);
}

export function canRead(deck: DeckRow, role: DeckRole | null): boolean {
  // `unlisted` is readable by id — holding the link is the credential.
  return deck.visibility !== "private" || role !== null;
}

export function canWrite(role: DeckRole | null): boolean {
  return role === "owner" || role === "editor";
}
