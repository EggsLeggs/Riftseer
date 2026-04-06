---
title: Types
sidebar_label: Types
sidebar_position: 2
---

The canonical card types live in [`@riftseer/types`](../../types/docs/card-types). `@riftseer/core` re-exports the full type surface from that package, so existing imports from `@riftseer/core` are unaffected.

For the full type reference — `Card`, `CardRequest`, `ResolvedCard`, `CardSearchOptions`, `SimplifiedDeck`, and all sub-interfaces — see the [`@riftseer/types` Card Types page](../../types/docs/card-types).

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

See the [Adding a field checklist](../../types/docs/card-types#adding-a-field) in the `@riftseer/types` Card Types page.
