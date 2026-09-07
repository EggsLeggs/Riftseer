"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { styleForKeyword } from "@riftseer/types/keywords";
import type { CardTextToken } from "@riftseer/types/render";
import {
  formatTokenDisplayList,
  normalizeCardTextLayout,
  parseCardTextRich,
  tokenDisplayName,
  tokenPlainLabel,
  tokenizeCardTextLine,
} from "@riftseer/types/render";

import { keywordSearchQuery, searchHref } from "@/features/cards/search-links";
import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";
import { cn } from "@/lib/utils";

/** `energy_3` renders as a numbered bubble rather than a fixed icon. */
const ENERGY_VALUE_PATTERN = /^energy_(\d+)$/;

/** The CSS class drawing a `:rb_<key>:` glyph — see `app/icons.css`. */
function iconClassForToken(key: string): string {
  return `icon-${key.replace(/_/g, "-")}`;
}

/** Keyword label colours are only white or black — energy circle uses that, number the other. */
function contrastingBw(hex: string): string {
  const normalized = hex.trim().toUpperCase();
  if (normalized === "#FFF" || normalized === "#FFFFFF") return "#000000";
  return "#FFFFFF";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Plain text for the current selection inside `root`. Keyword/icon chrome is
 * swapped for `.card-text-copy` labels so partial copies stay on one line.
 * Returns null when there is no usable selection in `root`.
 */
function plainTextFromSelection(root: HTMLElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    return null;
  }

  const holder = document.createElement("div");
  holder.appendChild(range.cloneContents());

  holder.querySelectorAll(".card-text-atom").forEach((atom) => {
    const copy = atom.querySelector(".card-text-copy");
    atom.replaceWith(document.createTextNode(copy?.textContent ?? ""));
  });
  holder.querySelectorAll(".card-keyword, .inline-icon").forEach((el) => {
    el.remove();
  });
  holder.querySelectorAll("br").forEach((br) => {
    br.replaceWith(document.createTextNode("\n"));
  });
  holder.querySelectorAll("li").forEach((item, index) => {
    if (index > 0) {
      item.parentNode?.insertBefore(
        document.createTextNode("\n"),
        item,
      );
    }
  });
  // Selection across ability paragraphs → keep a single newline between them.
  holder.querySelectorAll("p").forEach((paragraph, index) => {
    if (index > 0) {
      paragraph.parentNode?.insertBefore(
        document.createTextNode("\n"),
        paragraph,
      );
    }
  });

  return (holder.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/^\n+|\n+$/g, "");
}

/** Zero-size inline plaintext so native selection doesn't pick badge/icon glyphs. */
function CopyText({ children }: { children: string }) {
  return <span className="card-text-copy">{children}</span>;
}

function keywordClipboardText(
  display: string,
  arrow: boolean,
  costs: string[],
  preferText: boolean,
): string {
  const costText =
    costs.length === 0
      ? ""
      : preferText
        ? ` ${formatTokenDisplayList(costs)}`
        : ` ${costs.length <= 1 ? costs.map(tokenPlainLabel).join("") : costs.map(tokenPlainLabel).join(" ")}`;
  return `[${display}]${arrow ? ">" : ""}${costText}`;
}

function renderIconToken(
  iconKey: string,
  reactKey: string,
  preferText: boolean,
  opts?: { inKeyword?: boolean },
): ReactNode {
  const name = tokenDisplayName(iconKey);
  const energy = ENERGY_VALUE_PATTERN.exec(iconKey);
  if (preferText) {
    return (
      <span
        key={reactKey}
        className="text-foreground font-medium tabular-nums"
        title={name}
      >
        {name}
      </span>
    );
  }

  const visual = energy ? (
    <span
      className={cn(
        "inline-icon icon-energy-value",
        opts?.inKeyword && "card-keyword-energy",
      )}
      data-value={energy[1]}
      aria-hidden={opts?.inKeyword ? true : undefined}
      aria-label={opts?.inKeyword ? undefined : name}
      title={name}
    />
  ) : (
    <span
      className={cn(
        "inline-icon",
        iconClassForToken(iconKey),
        opts?.inKeyword && "card-keyword-rune",
      )}
      aria-hidden={opts?.inKeyword ? true : undefined}
      aria-label={opts?.inKeyword ? undefined : name}
      title={name}
    />
  );

  // Costs inside a keyword share one copy string on the badge wrapper.
  if (opts?.inKeyword) return <span key={reactKey}>{visual}</span>;

  return (
    <span key={reactKey} className="card-text-atom">
      {visual}
      <CopyText>{tokenPlainLabel(iconKey)}</CopyText>
    </span>
  );
}

function KeywordBadge({
  label,
  arrow,
  arrowLeft,
  costKeys,
  preferText,
  linked = false,
}: {
  label: string;
  /** True when the source text had `[Keyword][&gt;]` / `[Keyword][>]`. */
  arrow?: boolean;
  /** True when this badge follows a `[>>]` / `[&gt;&gt;]` stack connector. */
  arrowLeft?: boolean;
  /** Trailing `:rb_energy_*:` / `:rb_rune_*:` absorbed into the badge. */
  costKeys?: string[];
  preferText: boolean;
  /** Link the badge to a `kw:` search. Card detail only — see CardText. */
  linked?: boolean;
}) {
  const display = label.trim();
  const costs = costKeys ?? [];
  const copy = keywordClipboardText(display, Boolean(arrow), costs, preferText);

  if (preferText) {
    if (!linked) return <span className="font-medium">{copy}</span>;
    return (
      <Link
        href={searchHref(keywordSearchQuery(display))}
        className="font-medium underline-offset-4 hover:underline"
      >
        {copy}
      </Link>
    );
  }

  const style = styleForKeyword(display);
  const energyFg = contrastingBw(style.color);

  const badge = (
    <span
      className={cn(
        "card-keyword",
        arrow && "card-keyword--arrow",
        arrowLeft && "card-keyword--arrow-left",
      )}
      style={
        {
          "--keyword-bg": style.background,
          "--keyword-fg": style.color,
          "--keyword-energy-bg": style.color,
          "--keyword-energy-fg": energyFg,
          "--keyword-icon-filter":
            energyFg === "#FFFFFF"
              ? "brightness(0)"
              : "brightness(0) invert(1)",
        } as CSSProperties
      }
      title={
        costs.length > 0
          ? `${display} ${formatTokenDisplayList(costs)}`
          : display
      }
      aria-hidden="true"
    >
      <span className="card-keyword-label">{display}</span>
      {costs.map((iconKey, index) =>
        renderIconToken(iconKey, `cost-${index}-${iconKey}`, false, {
          inKeyword: true,
        }),
      )}
    </span>
  );

  return (
    <span className="card-text-atom">
      {linked ? (
        <Link
          href={searchHref(keywordSearchQuery(display))}
          // The badge itself is aria-hidden, so the link carries the name.
          aria-label={`Search for ${display} cards`}
          className="inline-flex rounded-sm transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none"
        >
          {badge}
        </Link>
      ) : (
        badge
      )}
      <CopyText>{copy}</CopyText>
    </span>
  );
}

interface RenderOpts {
  preferText: boolean;
  /** Link `[Keyword]` badges to a `kw:` search. */
  linkKeywords: boolean;
}

/** Maps the kernel's token stream to elements: icons, badges, italics, prose. */
function renderTokens(
  tokens: CardTextToken[],
  keyPrefix: string,
  opts: RenderOpts,
): ReactNode[] {
  const parts: ReactNode[] = [];

  tokens.forEach((token, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (token.kind) {
      case "text":
        parts.push(token.text);
        break;
      case "icon":
        if (opts.preferText) {
          // Adjacent `:rb_…:` runs read as one phrase (`3 Energy and Power`).
          const phrase = formatTokenDisplayList(token.keys);
          parts.push(
            <span
              key={key}
              className="text-foreground font-medium tabular-nums"
              title={phrase}
            >
              {phrase}
            </span>,
          );
          break;
        }
        token.keys.forEach((iconKey, iconIndex) => {
          parts.push(renderIconToken(iconKey, `${key}-${iconIndex}`, false));
        });
        break;
      case "keyword":
        parts.push(
          <KeywordBadge
            key={key}
            label={token.label}
            arrow={token.arrow}
            arrowLeft={token.stackLeft}
            costKeys={token.costs}
            preferText={opts.preferText}
            linked={opts.linkKeywords}
          />,
        );
        break;
      case "bracket":
        // Non-keyword bracket span — keep the original literal.
        parts.push(`[${token.label}]`);
        break;
      case "italic":
        parts.push(<em key={key}>{renderTokens(token.tokens, key, opts)}</em>);
        break;
    }
  });

  return parts;
}

function renderLine(
  line: string,
  lineIndex: number,
  opts: RenderOpts,
): ReactNode[] {
  return renderTokens(tokenizeCardTextLine(line), `${lineIndex}`, opts);
}

/**
 * Renders card rules text: `:rb_*:` → icons, `[Keyword]` → rhombus badges
 * (chevron when followed by `[&gt;]`; energy/rune costs nest inside the badge),
 * `_…_` → italic reminder text. The accessibility preference swaps icons and
 * badges for plain labels.
 *
 * Copy serializes only the current selection: badge/icon chrome is replaced with
 * zero-size `.card-text-copy` labels so partial sentences paste cleanly while
 * real paragraph breaks are preserved.
 */
export function CardText({
  text,
  rich,
  className,
  linkKeywords = false,
}: {
  text: string;
  /** Upstream `text.rich` — used for bullet lists when it contains `<ul>`. */
  rich?: string | null;
  className?: string;
  /**
   * Link each `[Keyword]` badge to a `kw:` search. Opt-in: the browse grid
   * renders rules text inside its own click target, where a nested link would
   * hijack the tile's navigation.
   */
  linkKeywords?: boolean;
}) {
  const { accessibility } = useSitePreferences();
  const preferText = accessibility.preferTextOverSymbols;
  const renderOpts: RenderOpts = { preferText, linkKeywords };
  const richBlocks = rich ? parseCardTextRich(rich) : null;
  const lines = richBlocks
    ? null
    : normalizeCardTextLayout(text).split("\n");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onCopy = (event: ClipboardEvent) => {
      const plain = plainTextFromSelection(root);
      if (plain == null) return;

      event.preventDefault();
      event.stopPropagation();
      event.clipboardData?.setData("text/plain", plain);
      event.clipboardData?.setData(
        "text/html",
        plain
          .split("\n")
          .map((line) =>
            line.length === 0 ? "<br>" : `<p>${escapeHtml(line)}</p>`,
          )
          .join(""),
      );
    };

    root.addEventListener("copy", onCopy, true);
    return () => root.removeEventListener("copy", onCopy, true);
  }, []);

  let lineCounter = 0;

  return (
    <div
      ref={rootRef}
      className={cn("space-y-2 text-sm leading-relaxed", className)}
    >
      {richBlocks
        ? richBlocks.map((block, blockIndex) => {
            if (block.type === "paragraph") {
              return block.lines.map((line) => {
                const index = lineCounter++;
                return <p key={`${blockIndex}-${index}`}>{renderLine(line, index, renderOpts)}</p>;
              });
            }
            return (
              <ul
                key={blockIndex}
                className="list-disc space-y-1 pl-5 marker:text-foreground/70"
              >
                {block.items.map((item) => {
                  const index = lineCounter++;
                  const itemLines = item.split("\n");
                  return (
                    <li key={index}>
                      {itemLines.map((itemLine, lineIdx) => (
                        <span key={`${index}-${lineIdx}`}>
                          {lineIdx > 0 ? <br /> : null}
                          {renderLine(itemLine, index * 1000 + lineIdx, renderOpts)}
                        </span>
                      ))}
                    </li>
                  );
                })}
              </ul>
            );
          })
        : lines!.map((line, index) => (
            <p key={index}>{renderLine(line, index, renderOpts)}</p>
          ))}
    </div>
  );
}

/** One line of rules-text tokens, for primers and other prose that is not a card. */
export function CardTextInline({
  text,
  className,
  linkKeywords = false,
}: {
  text: string;
  className?: string;
  /** Off in guides: a keyword there is decoration, not a search. */
  linkKeywords?: boolean;
}) {
  const { accessibility } = useSitePreferences();
  return (
    <span className={className}>
      {renderLine(text, 0, {
        preferText: accessibility.preferTextOverSymbols,
        linkKeywords,
      })}
    </span>
  );
}
