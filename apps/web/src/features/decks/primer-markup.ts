import { parseCardRequests } from "@riftseer/types/parser";

/**
 * The primer's mention markup, turned into plain Markdown links.
 *
 * `[[Card Name]]` becomes a hoverable card mention; `![[Card Name]]` becomes
 * an inline card image; `[@handle]` becomes a profile chip. The link href
 * carries only an index into `mentions` — the token's own text never has to
 * survive Markdown's escaping rules.
 *
 * Token *content* — the `Name|SET-123` grammar — is parsed by
 * `@riftseer/types/parser`, the same code the bots and the resolve endpoint
 * use. Only the span scanning lives here, and it copies the parser's trick of
 * blanking code spans in a same-length copy so a token inside a code block
 * stays literal text.
 *
 * `:rb_…:` icons and `[Keyword]` badges stay in the markdown. The renderer
 * runs them through `CardTextInline` after Markdown has done its work.
 */

export type PrimerMention =
  | {
      kind: "card";
      /** The token's inner content, exactly what `POST /cards/resolve` takes. */
      raw: string;
      /** The card name to display. */
      label: string;
      /** True for `![[…]]` — render the card image rather than a mention. */
      embed: boolean;
    }
  | { kind: "user"; handle: string };

export interface PrimerMarkup {
  markdown: string;
  mentions: PrimerMention[];
}

const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]+`/g;
const MENTION_SPAN = /!?\[\[([^\]]+)\]\]|\[@([A-Za-z0-9_]{1,32})\]/g;

export function primerMarkup(text: string): PrimerMarkup {
  const sanitised = text
    .replace(FENCED_CODE, (m) => " ".repeat(m.length))
    .replace(INLINE_CODE, (m) => " ".repeat(m.length));

  const mentions: PrimerMention[] = [];
  let markdown = "";
  let last = 0;
  let match: RegExpExecArray | null;

  MENTION_SPAN.lastIndex = 0;
  while ((match = MENTION_SPAN.exec(sanitised)) !== null) {
    const cardInner = match[1]?.trim();
    const handle = match[2];
    if (cardInner) {
      const embed = match[0]!.startsWith("!");
      const request = parseCardRequests(`[[${cardInner}]]`)[0];
      const label = request?.name || cardInner;
      markdown += text.slice(last, match.index);
      markdown += `[${label}](#${embed ? "card-embed" : "card"}:${mentions.length})`;
      mentions.push({ kind: "card", raw: cardInner, label, embed });
      last = match.index + match[0]!.length;
      continue;
    }
    if (handle) {
      markdown += text.slice(last, match.index);
      markdown += `[@${handle}](#user:${mentions.length})`;
      mentions.push({ kind: "user", handle });
      last = match.index + match[0]!.length;
    }
  }
  markdown += text.slice(last);
  return { markdown, mentions };
}

/** The href a mention link carries, back to its entry in `mentions`. */
export function parseMentionHref(
  href: string | undefined,
): { index: number; kind: "card" | "card-embed" | "user" } | null {
  if (!href) return null;
  const match = /^#(card|card-embed|user):(\d+)$/.exec(href);
  if (!match) return null;
  return { index: Number(match[2]), kind: match[1] as "card" | "card-embed" | "user" };
}
