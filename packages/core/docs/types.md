---
title: Types
sidebar_label: Types
sidebar_position: 2
---

The canonical card types live in [`@riftseer/types`](../../types/card-types). `@riftseer/core` re-exports the full type surface from that package, so existing imports from `@riftseer/core` are unaffected.

For the full type reference — `Card`, `CardRequest`, `ResolvedCard`, `CardSearchOptions`, `SimplifiedDeck`, and all sub-interfaces — see the [`@riftseer/types` Card Types page](../../types/card-types).

---

## Importing

```typescript
// From core (unchanged — re-exports from @riftseer/types)
import type { Card, CardRequest, ResolvedCard } from "@riftseer/core";

// Directly from types (avoids core's heavier dependencies)
import type { Card, CardRequest, ResolvedCard } from "@riftseer/types";
```

---

## Adding a field

If a new field needs to be added to `Card`:

1. Update `packages/types/src/card.ts`
2. Update `packages/ingest-worker/src/riftcodex.ts` (`rawToCard`)
3. Update the row mapping in `packages/core/src/providers/supabase.ts` (`dbRowToCard`)
4. Update the field table in `packages/api/docs/cards.md`
5. Check `PrivacyPage.tsx` if the field affects what data is stored or shown
