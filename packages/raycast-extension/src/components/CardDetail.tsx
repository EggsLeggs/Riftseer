import { Action, ActionPanel, Clipboard, Color, Detail, Image, open, showToast, Toast } from "@raycast/api";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Card } from "../types";

function tinted(source: string): Image.ImageLike {
  return { source, tintColor: Color.PrimaryText };
}

const TYPE_ICONS: Record<string, string> = {
  unit: "icons/types/unit.png",
  champion: "icons/types/champion.png",
  spell: "icons/types/spell.png",
  gear: "icons/types/gear.png",
  battlefield: "icons/types/battlefield.png",
  rune: "icons/types/rune.png",
};

const RARITY_ICONS: Record<string, string> = {
  common: "icons/rarity/rarity_common.png",
  uncommon: "icons/rarity/rarity_uncommon.png",
  rare: "icons/rarity/rarity_rare.png",
  showcase: "icons/rarity/rarity_showcase.png",
};

const DOMAIN_ICONS: Record<string, string> = {
  fury: "icons/domains/rune_fury.png",
  calm: "icons/domains/rune_calm.png",
  mind: "icons/domains/rune_mind.png",
  body: "icons/domains/rune_body.png",
  chaos: "icons/domains/rune_chaos.png",
  order: "icons/domains/rune_order.png",
};

/** Pick the icon key that best represents the type line, mirroring frontend prefix logic. */
function typeIconKey(type?: string, supertype?: string | null): string | undefined {
  const tl = type?.toLowerCase();
  const st = supertype?.toLowerCase();
  if (st === "token" || st === "basic") return tl === "token" ? "unit" : tl;
  if (tl) return tl;
  return st;
}

function getTypeIcon(type?: string, supertype?: string | null): Image.ImageLike | undefined {
  const key = typeIconKey(type, supertype);
  const src = key ? TYPE_ICONS[key] : undefined;
  return src ? tinted(src) : undefined;
}

function getRarityIcon(rarity?: string): Image.ImageLike | undefined {
  const src = rarity ? RARITY_ICONS[rarity.toLowerCase()] : undefined;
  return src ? { source: src } : undefined;
}

function getDomainIcon(domain: string): Image.ImageLike | undefined {
  const src = DOMAIN_ICONS[domain.toLowerCase()];
  return src ? { source: src } : undefined;
}

/** Mirrors the frontend CardPage type-line logic (without icons). */
export function formatTypeLine(type?: string, supertype?: string | null): string | null {
  if (!type && !supertype) return null;
  if (!type) return supertype!;
  if (!supertype) return type;
  const tl = type.toLowerCase();
  const st = supertype.toLowerCase();
  // Supertype is a prefix modifier (e.g. "Token Unit", "Basic Land")
  if (st === "token" || st === "basic") return `${supertype} ${type}`;
  // Type carries the subtype after an em dash (e.g. "Unit — Champion")
  if (tl === "unit" || tl === "basic") return `${type} — ${supertype}`;
  // Fallback: supertype then type
  return `${supertype} ${type}`;
}

interface CardDetailProps {
  card: Card;
  siteBaseUrl: string;
}

function buildMarkdown(card: Card): string {
  const lines: string[] = [];

  // Card image — height=300 for portrait cards; landscape cards use height=200
  // (200 ≈ the pixel-width of a portrait card rendered at height=300 with a 2:3 ratio)
  // Portrait cards: 300 tall (matches lotus-mtg-companion); width=200 preserves 2:3 ratio.
  // Landscape cards: height=200 (= width of a portrait card at height=300 with 2:3 ratio); width=300.
  const isLandscape = card.media?.orientation === "landscape";
  const imgDims = isLandscape ? "raycast-width=300&raycast-height=200" : "raycast-width=200&raycast-height=300";
  const imageUrl = card.media?.media_urls?.normal ?? card.media?.media_urls?.large;
  if (imageUrl) {
    lines.push(`![${card.media?.accessibility_text ?? card.name}](${imageUrl}?${imgDims})`);
    lines.push("");
  }

  // Rules text
  if (card.text?.plain?.trim()) {
    lines.push(card.text.plain.trim());
    lines.push("");
  }

  // Flavour text
  if (card.text?.flavour?.trim()) {
    lines.push(`*${card.text.flavour.trim()}*`);
  }

  return lines.join("\n");
}

function buildCopyableText(card: Card): string {
  const lines: string[] = [card.name];
  const typeParts = [card.classification?.supertype, card.classification?.type].filter(Boolean);
  if (typeParts.length > 0) lines.push(typeParts.join(" — "));
  if (card.text?.plain?.trim()) {
    if (lines.length > 1) lines.push("");
    lines.push(card.text.plain.trim());
  }
  return lines.join("\n");
}

export function CardDetail({ card, siteBaseUrl }: CardDetailProps) {
  const site = siteBaseUrl.replace(/\/$/, "");
  const siteUrl = `${site}/card/${card.id}`;
  const markdown = buildMarkdown(card);

  const metadata = (
    <Detail.Metadata>
      {/* ── Section 1: identity & stats ── */}
      <Detail.Metadata.Label title="Name" text={card.name} />
      {formatTypeLine(card.classification?.type, card.classification?.supertype) && (
        <Detail.Metadata.Label
          title="Type"
          text={formatTypeLine(card.classification?.type, card.classification?.supertype)!}
          icon={getTypeIcon(card.classification?.type, card.classification?.supertype)}
        />
      )}
      {card.attributes?.energy != null && (
        <Detail.Metadata.Label title="Energy" text={String(card.attributes.energy)} />
      )}
      {card.attributes?.power != null && (
        <Detail.Metadata.Label title="Power" text={String(card.attributes.power)} />
      )}
      {card.attributes?.might != null && (
        <Detail.Metadata.Label
          title="Might"
          text={String(card.attributes.might)}
          icon={tinted("icons/stats/might.svg")}
        />
      )}
      {card.classification?.domains?.length ? (
        <Detail.Metadata.TagList title="Domains">
          {card.classification.domains.map((d) => (
            <Detail.Metadata.TagList.Item key={d} text={d} icon={getDomainIcon(d)} />
          ))}
        </Detail.Metadata.TagList>
      ) : null}
      {card.classification?.tags?.length ? (
        <Detail.Metadata.TagList title="Tags">
          {card.classification.tags.map((t) => (
            <Detail.Metadata.TagList.Item key={t} text={t} />
          ))}
        </Detail.Metadata.TagList>
      ) : null}

      {/* ── Section 2: printing ── */}
      <Detail.Metadata.Separator />
      {card.classification?.rarity && (
        <Detail.Metadata.Label
          title="Rarity"
          text={card.classification.rarity}
          icon={getRarityIcon(card.classification.rarity)}
        />
      )}
      {card.set && (
        <Detail.Metadata.Label title="Set" text={card.set.set_name} />
      )}
      {card.collector_number && (
        <Detail.Metadata.Label title="Collector #" text={card.collector_number} />
      )}

      {/* ── Section 3: credits ── */}
      {card.artist && (
        <>
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Artist" text={card.artist} icon={tinted("icons/misc/artist.svg")} />
        </>
      )}
    </Detail.Metadata>
  );

  return (
    <Detail
      markdown={markdown}
      metadata={metadata}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.OpenInBrowser title="Open on RiftSeer" url={siteUrl} />
            <Action.CopyToClipboard
              title="Copy Card Name"
              content={card.name}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
            {card.text?.plain?.trim() && (
              <Action.CopyToClipboard
                title="Copy Rules Text"
                content={buildCopyableText(card)}
                shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              />
            )}
            {(card.media?.media_urls?.normal ?? card.media?.media_urls?.large) && (
              <Action
                title="Copy Card Image"
                shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
                onAction={async () => {
                  const imageUrl = card.media!.media_urls!.normal ?? card.media!.media_urls!.large!;
                  const toast = await showToast({ style: Toast.Style.Animated, title: "Copying image…" });
                  try {
                    const res = await fetch(imageUrl);
                    const buf = Buffer.from(await res.arrayBuffer());
                    const ext = imageUrl.endsWith(".png") ? "png" : "jpg";
                    const tempPath = join(tmpdir(), `riftseer-${card.id}.${ext}`);
                    await writeFile(tempPath, buf);
                    await Clipboard.copy({ file: tempPath });
                    toast.style = Toast.Style.Success;
                    toast.title = "Image copied";
                  } catch {
                    toast.style = Toast.Style.Failure;
                    toast.title = "Failed to copy image";
                  }
                }}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
