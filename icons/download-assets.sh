#!/usr/bin/env bash
# Download PNG (and exhaust SVG) assets from Riot CDNs into icons folder.
# Run from repo root: ./icons/download-assets.sh

set -e
BASE="$(dirname "$0")"
mkdir -p "$BASE/misc" "$BASE/card-types" "$BASE/domains" "$BASE/rarities"

# Exhaust, rune_rainbow, power (card_type_rune) SVGs (assetcdn)
curl -sL "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/exhaust.svg" -o "$BASE/status/exhaust.svg"
curl -sL "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/rune_rainbow.svg" -o "$BASE/domains/rune_rainbow.svg"
curl -sL "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/card_type_rune.svg" -o "$BASE/stats/power.svg"

# Battlefield & unit (cmsassets 64x64)
curl -sL "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/1f37eb1bed2605bdaab8270a9dc4396cad746522-64x64.png?accountingTag=RB" -o "$BASE/card-types/battlefield.png"
curl -sL "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/cb0caf49361546ece0c25d65b7fbf57c0eee57f0-64x64.png?accountingTag=RB" -o "$BASE/card-types/unit.png"
curl -sL "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/73c26354435212281d3f1cefe7cdbd7c803fe18f-64x64.png?accountingTag=RB&auto=format&fit=fill&q=80&w=48" -o "$BASE/card-types/spell.png"
curl -sL "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/c56f1df327f53562a56b493d3d38c3cee5780c5a-64x64.png?accountingTag=RB&auto=format&fit=fill&q=80&w=48" -o "$BASE/card-types/champion.png"

# Rarity showcase (cmsassets)
curl -sL "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/a0e92b9edf3291fa62c9b35ffd6363de0d7947c0-376x426.png?accountingTag=RB&auto=format&fit=fill&q=80&w=48" -o "$BASE/rarities/showcase.png"

# Domain glyphs — coloured circle + white icon (assetcdn rune_*.svg)
curl -sL "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/rune_fury.svg" -o "$BASE/domains/rune_fury.svg"
curl -sL "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/rune_calm.svg" -o "$BASE/domains/rune_calm.svg"
curl -sL "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/rune_mind.svg" -o "$BASE/domains/rune_mind.svg"
curl -sL "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/rune_body.svg" -o "$BASE/domains/rune_body.svg"
curl -sL "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/rune_chaos.svg" -o "$BASE/domains/rune_chaos.svg"
curl -sL "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/rune_order.svg" -o "$BASE/domains/rune_order.svg"

# Domains (cmsassets 64x64 — optional; CSS uses rune_*.svg glyphs above)
curl -sL "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/8bb1b193a8e1adc26ca28e1a21da8d1e2f5d2f72-64x64.png?accountingTag=RB" -o "$BASE/domains/order.png"
curl -sL "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/5aeb4bfd203b5d265902f65aa5afae7da1682eaa-64x64.png?accountingTag=RB" -o "$BASE/domains/fury.png"
curl -sL "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/b9ef2f5b74841ad11f3629aa381a76ac0187d007-64x64.png?accountingTag=RB" -o "$BASE/domains/calm.png"
curl -sL "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/17ab95a6bd052085b6803d846a287f625f347288-64x64.png?accountingTag=RB" -o "$BASE/domains/mind.png"
curl -sL "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/7a5533034de5870808347bc4b296f0029bdd8eea-64x64.png?accountingTag=RB" -o "$BASE/domains/body.png"
curl -sL "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/597ddb82be59e87b467c52bb10204f02c2005d06-64x64.png?accountingTag=RB" -o "$BASE/domains/chaos.png"

echo "Done. Icons in $BASE"
