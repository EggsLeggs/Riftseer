"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { normalizeCardTextLayout } from "@riftseer/types/card-text";
import {
  TOKEN_ICON_MAP,
  TOKEN_REGEX,
  formatTokenDisplayList,
  tokenDisplayName,
  tokenPlainLabel,
} from "@riftseer/types/icons";
import {
  isKeywordTag,
  KEYWORD_TAG_REGEX,
  styleForKeyword,
} from "@riftseer/types/keywords";

import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";
import { cn } from "@/lib/utils";

/** `energy_3` renders as a numbered bubble rather than a fixed icon. */
const ENERGY_VALUE_PATTERN = /^energy_(\d+)$/;

/**
 * Costs that sit inside a keyword badge: energy bubbles and domain runes
 * (`[Empower] :rb_energy_3::rb_rune_rainbow:`). Exhaust / might stay outside.
 */
const KEYWORD_COST_RUN = /^(?:\s*)((?::rb_(?:energy_\d+|rune_\w+):)+)/;

/**
 * Italic reminder spans are wrapped in `_…_`. Underscores inside `:rb_…:`
 * tokens must not count as delimiters — mask tokens before splitting.
 */
const ITALIC_SEGMENT_PATTERN = /(_(?:[^_\n]|:[^:\n]+:)+_)/;

/** Private-use bookends so restored text can't collide with card copy. */
const TOKEN_PLACEHOLDER = /\uE000(\d+)\uE001/g;

function maskIconTokens(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  const masked = text.replace(new RegExp(TOKEN_REGEX.source, "g"), (match) => {
    const index = tokens.length;
    tokens.push(match);
    return `\uE000${index}\uE001`;
  });
  return { masked, tokens };
}

function restoreIconTokens(text: string, tokens: string[]): string {
  return text.replace(TOKEN_PLACEHOLDER, (_, index: string) => tokens[Number(index)] ?? "");
}

/** Keyword label colours are only white or black — energy circle uses that, number the other. */
function contrastingBw(hex: string): string {
  const normalized = hex.trim().toUpperCase();
  if (normalized === "#FFF" || normalized === "#FFFFFF") return "#000000";
  return "#FFFFFF";
}

function takeKeywordCosts(
  text: string,
  from: number,
): { keys: string[]; end: number } {
  const match = KEYWORD_COST_RUN.exec(text.slice(from));
  if (!match) return { keys: [], end: from };
  const keys = [...match[1]!.matchAll(/:rb_(\w+):/g)].map((m) => m[1]!);
  return { keys, end: from + match[0].length };
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
        : ` ${costs.map(tokenPlainLabel).join("")}`;
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
        TOKEN_ICON_MAP[iconKey] ?? `icon-${iconKey}`,
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
  costKeys,
  preferText,
}: {
  label: string;
  /** True when the source text had `[Keyword][&gt;]` / `[Keyword][>]`. */
  arrow?: boolean;
  /** Trailing `:rb_energy_*:` / `:rb_rune_*:` absorbed into the badge. */
  costKeys?: string[];
  preferText: boolean;
}) {
  const display = label.trim();
  const costs = costKeys ?? [];
  const copy = keywordClipboardText(display, Boolean(arrow), costs, preferText);

  if (preferText) {
    return <span className="font-medium">{copy}</span>;
  }

  const style = styleForKeyword(display);
  const energyFg = contrastingBw(style.color);

  return (
    <span className="card-text-atom">
      <span
        className={cn("card-keyword", arrow && "card-keyword--arrow")}
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
      <CopyText>{copy}</CopyText>
    </span>
  );
}

/**
 * Renders icon tokens (`:rb_*:`) and keyword tags (`[Accelerate]`) inside a
 * stretch of already-unmasked text.
 */
function renderInline(
  text: string,
  keyPrefix: string,
  preferText: boolean,
): ReactNode[] {
  const parts: ReactNode[] = [];
  // Groups: 1 = icon key, 2 = keyword label, 3 = optional arrow marker.
  const regex = new RegExp(
    `${TOKEN_REGEX.source}|${KEYWORD_TAG_REGEX.source}`,
    "g",
  );
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    const key = `${keyPrefix}-${match.index}`;
    const iconKey = match[1];
    const keywordLabel = match[2];
    const keywordArrow = match[3] != null;

    if (iconKey) {
      if (preferText) {
        // Collapse adjacent `:rb_…:` runs into one phrase (`3 Energy and Power`).
        const keys = [iconKey];
        let end = regex.lastIndex;
        const peek = new RegExp(TOKEN_REGEX.source, "g");
        while (true) {
          peek.lastIndex = end;
          const next = peek.exec(text);
          if (!next || next.index !== end) break;
          keys.push(next[1]!);
          end = peek.lastIndex;
        }
        regex.lastIndex = end;
        const phrase = formatTokenDisplayList(keys);
        parts.push(
          <span
            key={key}
            className="text-foreground font-medium tabular-nums"
            title={phrase}
          >
            {phrase}
          </span>,
        );
        lastIndex = end;
        continue;
      }
      parts.push(renderIconToken(iconKey, key, false));
    } else if (keywordLabel != null && isKeywordTag(keywordLabel)) {
      const { keys: costKeys, end } = takeKeywordCosts(text, regex.lastIndex);
      regex.lastIndex = end;
      parts.push(
        <KeywordBadge
          key={key}
          label={keywordLabel}
          arrow={keywordArrow}
          costKeys={costKeys}
          preferText={preferText}
        />,
      );
      lastIndex = end;
      continue;
    } else if (keywordLabel != null) {
      // Non-keyword bracket span — keep the original literal.
      parts.push(`[${keywordLabel}]`);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function renderLine(
  line: string,
  lineIndex: number,
  preferText: boolean,
): ReactNode[] {
  // `:rb_exhaust:` / `:rb_rune_rainbow:` contain `_`, which the italic splitter
  // would otherwise treat as `_…_` markers (Ornn's ability text is the classic case).
  const { masked, tokens } = maskIconTokens(line);
  const parts: ReactNode[] = [];

  masked.split(ITALIC_SEGMENT_PATTERN).forEach((segment, segmentIndex) => {
    const keyPrefix = `${lineIndex}-${segmentIndex}`;
    if (segment.startsWith("_") && segment.endsWith("_") && segment.length > 2) {
      parts.push(
        <em key={`em-${keyPrefix}`}>
          {renderInline(
            restoreIconTokens(segment.slice(1, -1), tokens),
            keyPrefix,
            preferText,
          )}
        </em>,
      );
      return;
    }
    parts.push(
      ...renderInline(restoreIconTokens(segment, tokens), keyPrefix, preferText),
    );
  });
  return parts;
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
  className,
}: {
  text: string;
  className?: string;
}) {
  const { accessibility } = useSitePreferences();
  const preferText = accessibility.preferTextOverSymbols;
  const lines = normalizeCardTextLayout(text).split("\n");
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

  return (
    <div
      ref={rootRef}
      className={cn("space-y-2 text-sm leading-relaxed", className)}
    >
      {lines.map((line, index) => (
        <p key={index}>{renderLine(line, index, preferText)}</p>
      ))}
    </div>
  );
}
