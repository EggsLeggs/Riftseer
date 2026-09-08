import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  environment,
  showToast,
  Toast,
} from "@raycast/api";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { useEffect } from "react";
import type { Oracle } from "@riftseer/types";
import {
  cardSiteUrl,
  cardTypeLine,
  formatCardTextForClipboard,
  normalizeCardTextLayout,
  printingImageDownloadUrl,
  printingImageUrl,
  replaceIconTokens,
  tokenPlainLabel,
} from "@riftseer/types";
import {
  domainIcon,
  rarityIcon,
  tinted,
  TOKEN_PNG_ASSETS,
  TOKEN_SVG_ASSETS,
  typeIcon,
} from "../assets";

// ─── Card text token rendering ────────────────────────────────────────────────

const CIRCLED_DIGITS = ["⓪", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];

/** Tokens with no picture in `assets/` that read better as a glyph than `{Energy}`. */
const TOKEN_TEXT_FALLBACKS: Record<string, string> = {
  energy: "⚡",
};

const svgDataUriCache = new Map<string, string>();

const INLINE_ICON_SIZE = 16;

function themedSvgDataUri(assetRelPath: string): string {
  const cacheKey = `${assetRelPath}:${environment.appearance}`;
  const cached = svgDataUriCache.get(cacheKey);
  if (cached) return cached;
  try {
    let svg = readFileSync(join(environment.assetsPath, assetRelPath), "utf8");

    // Pin display size so the icon sits inline with text
    svg = svg
      .replace(/(<svg[^>]*)\swidth="[^"]*"/, `$1 width="${INLINE_ICON_SIZE}"`)
      .replace(
        /(<svg[^>]*)\sheight="[^"]*"/,
        `$1 height="${INLINE_ICON_SIZE}"`,
      );

    if (environment.appearance === "light") {
      // Protect fill="white" inside structural elements (mask/defs/clipPath) — those
      // define geometry for masking, not visual colour, and must stay white.
      const SENTINEL = "\x00FILL_WHITE\x00";
      svg = svg
        .replace(/<mask[\s\S]*?<\/mask>/g, (m) =>
          m.replace(/fill="white"/g, SENTINEL),
        )
        .replace(/<defs[\s\S]*?<\/defs>/g, (m) =>
          m.replace(/fill="white"/g, SENTINEL),
        )
        .replace(/fill="white"/g, 'fill="black"')
        .replace(new RegExp(SENTINEL, "g"), 'fill="white"');
    }

    const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    svgDataUriCache.set(cacheKey, uri);
    return uri;
  } catch {
    return "";
  }
}

/**
 * Rules text as Raycast Markdown: the kernel splits paragraphs (a blank line
 * each, since Markdown folds single newlines) and every `:rb_…:` token becomes
 * an inline image from `assets/`, a circled digit, or a text stand-in.
 */
function renderTextForRaycast(text: string): string {
  return replaceIconTokens(normalizeCardTextLayout(text, "\n\n"), (key) => {
    const energyMatch = /^energy_(\d+)$/.exec(key);
    if (energyMatch) {
      const n = parseInt(energyMatch[1], 10);
      return CIRCLED_DIGITS[n] ?? `(${n})`;
    }
    const svgAsset = TOKEN_SVG_ASSETS[key];
    if (svgAsset) {
      const uri = themedSvgDataUri(svgAsset);
      if (uri) return `![${key}](${uri})`;
    }
    const pngAsset = TOKEN_PNG_ASSETS[key];
    if (pngAsset) {
      const filePath = join(environment.assetsPath, pngAsset);
      const fileUrl = pathToFileURL(filePath);
      fileUrl.searchParams.set("raycast-width", String(INLINE_ICON_SIZE));
      fileUrl.searchParams.set("raycast-height", String(INLINE_ICON_SIZE));
      return `![${key}](${fileUrl.href})`;
    }
    return TOKEN_TEXT_FALLBACKS[key] ?? tokenPlainLabel(key);
  });
}

interface CardDetailProps {
  card: Oracle;
  siteBaseUrl: string;
  /** Called when this detail view is shown (full-screen detail, random card, or push from search). */
  onView?: (card: Oracle) => void;
}

function buildMarkdown(card: Oracle): string {
  const lines: string[] = [];
  const printing = card.preferred_printing;

  // Card image — height=300 for portrait cards; landscape cards use height=200
  // (200 ≈ the pixel-width of a portrait card rendered at height=300 with a 2:3 ratio)
  // Portrait cards: 300 tall (matches lotus-mtg-companion); width=200 preserves 2:3 ratio.
  // Landscape cards: height=200 (= width of a portrait card at height=300 with 2:3 ratio); width=300.
  const isLandscape = printing?.image_orientation === "landscape";
  const imageUrl = printingImageUrl(printing, "normal");
  if (imageUrl) {
    const altText = (printing?.image_alt_text ?? card.name).replace(/\n/g, " ");
    try {
      const url = new URL(imageUrl);
      if (isLandscape) {
        url.searchParams.set("raycast-width", "300");
        url.searchParams.set("raycast-height", "200");
      } else {
        url.searchParams.set("raycast-width", "200");
        url.searchParams.set("raycast-height", "300");
      }
      lines.push(`![${altText}](${url.toString()})`);
      lines.push("");
    } catch {
      // Skip image if URL is malformed or relative
    }
  }

  // Rules text
  if (card.text?.plain?.trim()) {
    lines.push(renderTextForRaycast(card.text.plain.trim()));
    lines.push("");
  }

  // Flavour text
  if (printing?.flavour_text?.trim()) {
    lines.push(`*${renderTextForRaycast(printing.flavour_text.trim())}*`);
  }

  return lines.join("\n");
}

/** Name, type line, then rules text with `{3}` / `{Exhaust}` stand-ins for icons. */
function buildCopyableText(card: Oracle): string {
  const lines: string[] = [card.name];
  const typeLine = cardTypeLine(card);
  if (typeLine) lines.push(typeLine);
  if (card.text?.plain?.trim()) {
    if (lines.length > 1) lines.push("");
    lines.push(formatCardTextForClipboard(card.text.plain));
  }
  return lines.join("\n");
}

export function CardDetail({ card, siteBaseUrl, onView }: CardDetailProps) {
  const printing = card.preferred_printing;
  const siteUrl = cardSiteUrl(card, printing, siteBaseUrl);
  const markdown = buildMarkdown(card);
  const typeLine = cardTypeLine(card);
  const imageDownloadUrl = printingImageDownloadUrl(printing);

  useEffect(() => {
    onView?.(card);
  }, [card, onView]);

  const metadata = (
    <Detail.Metadata>
      {/* ── Section 1: identity & stats ── */}
      <Detail.Metadata.Label title="Name" text={card.name} />
      {typeLine && (
        <Detail.Metadata.Label
          title="Type"
          text={typeLine}
          icon={typeIcon(card)}
        />
      )}
      {card.energy != null && (
        <Detail.Metadata.Label title="Energy" text={String(card.energy)} />
      )}
      {card.power != null && (
        <Detail.Metadata.Label title="Power" text={String(card.power)} />
      )}
      {card.might != null && (
        <Detail.Metadata.Label
          title="Might"
          text={String(card.might)}
          icon={tinted("icons/stats/might.svg")}
        />
      )}
      {card.domains.length ? (
        <Detail.Metadata.TagList title="Domains">
          {card.domains.map((d) => (
            <Detail.Metadata.TagList.Item
              key={d}
              text={d}
              icon={domainIcon(d)}
            />
          ))}
        </Detail.Metadata.TagList>
      ) : null}
      {card.tags.length ? (
        <Detail.Metadata.TagList title="Tags">
          {card.tags.map((t) => (
            <Detail.Metadata.TagList.Item key={t} text={t} />
          ))}
        </Detail.Metadata.TagList>
      ) : null}

      {/* ── Section 2: printing ── */}
      <Detail.Metadata.Separator />
      {printing?.rarity && (
        <Detail.Metadata.Label
          title="Rarity"
          text={printing.rarity}
          icon={rarityIcon(printing.rarity)}
        />
      )}
      {printing?.set && (
        <Detail.Metadata.Label title="Set" text={printing.set.set_name} />
      )}
      {(printing?.collector_label ?? printing?.collector_number) && (
        <Detail.Metadata.Label
          title="Collector #"
          text={printing?.collector_label ?? printing?.collector_number}
        />
      )}

      {/* ── Section 3: credits ── */}
      {printing?.artist && (
        <>
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="Artist"
            text={printing.artist}
            icon={tinted("icons/misc/artist.svg")}
          />
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
            <Action.OpenInBrowser title="Open on Riftseer" url={siteUrl} />
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
            {imageDownloadUrl && (
              <Action
                title="Copy Card Image"
                shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
                onAction={async () => {
                  const toast = await showToast({
                    style: Toast.Style.Animated,
                    title: "Copying image…",
                  });
                  let tempPath: string | undefined;
                  try {
                    const res = await fetch(imageDownloadUrl);
                    if (!res.ok) {
                      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    }
                    const buf = Buffer.from(await res.arrayBuffer());
                    // Determine extension from URL pathname
                    const url = new URL(imageDownloadUrl);
                    const lastDot = url.pathname.lastIndexOf(".");
                    const ext =
                      lastDot >= 0 && lastDot < url.pathname.length - 1
                        ? url.pathname.substring(lastDot + 1)
                        : "png";
                    tempPath = join(
                      tmpdir(),
                      `riftseer-${printing?.id ?? card.id}.${ext}`,
                    );
                    await writeFile(tempPath, buf);
                    await Clipboard.copy({ file: tempPath });
                    toast.style = Toast.Style.Success;
                    toast.title = "Image copied";
                  } catch {
                    toast.style = Toast.Style.Failure;
                    toast.title = "Failed to copy image";
                  } finally {
                    if (tempPath) {
                      try {
                        await unlink(tempPath);
                      } catch {
                        // Best-effort cleanup (ENOENT if already gone, etc.)
                      }
                    }
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
