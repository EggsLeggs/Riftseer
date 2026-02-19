# Riftbound Icons – Source URLs & Mapping

## Confirmed (from you or official CDN)

| Icon        | Source | URL |
|-------------|--------|-----|
| **artist**  | assetcdn | `https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/artist.svg` |
| **battlefield** | cmsassets | `https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/1f37eb1bed2605bdaab8270a9dc4396cad746522-64x64.png?accountingTag=RB` |
| **might**   | assetcdn | `https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/might.svg` |
| **unit**    | cmsassets | `https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/cb0caf49361546ece0c25d65b7fbf57c0eee57f0-64x64.png?accountingTag=RB` |
| **exhaust** | assetcdn | `https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/exhaust.svg` |
| **rune_rainbow** (any domain) | assetcdn | `https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/rune_rainbow.svg` |
| **power** (attack stat) | assetcdn | `https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/card_type_rune.svg` |
| **spell** | cmsassets | `73c26354435212281d3f1cefe7cdbd7c803fe18f` 64×64 |
| **common** (rarity) | cmsassets | `59e98d14f83125c88880af1d61213e3aef941370` 64×64 (+ format params) |
| **champion** | cmsassets | `c56f1df327f53562a56b493d3d38c3cee5780c5a` 64×64 (+ format params) |
| **showcase** (rarity) | cmsassets | `a0e92b9edf3291fa62c9b35ffd6363de0d7947c0` 376×426 (+ format params, w=48) |

**Energy cost (1–5):** CSS-only — white circle, dark teal number (#013951), flex-centered (no asset URL).

## Domains — glyph style (coloured circle + white icon)

Domain icons now use assetcdn **rune_*.svg** glyphs (one per domain):

| Domain | assetcdn glyph |
|--------|-----------------|
| Fury   | `rune_fury.svg`  |
| Calm   | `rune_calm.svg`  |
| Mind   | `rune_mind.svg`  |
| Body   | `rune_body.svg`  |
| Chaos  | `rune_chaos.svg` |
| Order  | `rune_order.svg` |

Base: `https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/rune_{domain}.svg`

## Still unmapped (64×64 hashes in card-gallary)

| Hash | Context nearby (for manual check) |
|------|-----------------------------------|
| ee2664a6dfe767b7e8b4b08ed04611e019d2c166 | exhaust, gear, unit, rare |

## Still missing (no URL yet)

- **energy** (generic cost symbol) – not at assetcdn `.../rb/latest/energy.svg`
- **Rarities:** uncommon, rare, epic, legendary
- **Card types:** gear, legend, token

Once you have URLs or which hash is which, we can wire them into `packages/api/public/icons/icons.css`.
