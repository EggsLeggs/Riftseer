/**
 * [[Card Name]] token parser — inlined from @riftseer/core.
 *
 * Kept as a standalone file so this Devvit package has zero workspace
 * dependencies and bundles cleanly with the Devvit CLI.
 */

export interface CardRequest {
  raw: string;
  name: string;
  set?: string;
  collector?: string;
}

const MAX_TOKENS = 20;
const CARD_PATTERN = /\[\[([^\]]+)\]\]/g;
const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]+`/g;

export function parseCardRequests(text: string): CardRequest[] {
  const sanitised = text
    .replace(FENCED_CODE, (m) => " ".repeat(m.length))
    .replace(INLINE_CODE, (m) => " ".repeat(m.length));

  const requests: CardRequest[] = [];
  let match: RegExpExecArray | null;

  CARD_PATTERN.lastIndex = 0;
  while ((match = CARD_PATTERN.exec(sanitised)) !== null) {
    if (requests.length >= MAX_TOKENS) break;
    const inner = match[1].trim();
    if (inner.length === 0) continue;
    requests.push(parseToken(inner));
  }

  return requests;
}

function parseToken(inner: string): CardRequest {
  const sepIdx = inner.search(/[|\\]/);
  if (sepIdx === -1) return { raw: inner, name: inner.trim() };

  const name = inner.slice(0, sepIdx).trim();
  const rest = inner.slice(sepIdx + 1).trim();

  const collectorMatch = rest.match(/^([A-Z0-9]+)[- ](\d+)$/i);
  if (collectorMatch) {
    return { raw: inner, name, set: collectorMatch[1].toUpperCase(), collector: collectorMatch[2] };
  }

  return { raw: inner, name, set: rest.toUpperCase() };
}
