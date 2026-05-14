import React from "react";
import { TOKEN_ICON_MAP, TOKEN_REGEX } from "@riftseer/types/icons";

function normalizeCardTextLayout(text: string, paragraphBreak = "\n"): string {
  let normalized = text.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let depth = 0;
  let result = "";
  let pendingSpace = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === "(") { if (pendingSpace && result.length > 0 && !result.endsWith(" ")) result += " "; pendingSpace = false; depth++; result += ch; continue; }
    if (ch === ")") { pendingSpace = false; if (depth > 0) depth--; result += ch; continue; }
    if (depth > 0 && /\s/.test(ch)) { pendingSpace = true; continue; }
    if (pendingSpace && result.length > 0 && !result.endsWith(" ")) result += " ";
    pendingSpace = false;
    result += ch;
  }
  if (pendingSpace && result.length > 0 && !result.endsWith(" ")) result += " ";
  normalized = result
    .replace(/_ \(/g, "_(")
    .replace(/\)_([^\s_\n])/g, `)_${paragraphBreak}$1`)
    .replace(/\]([A-Z])/g, `]${paragraphBreak}$1`);
  const depthMap = new Uint16Array(normalized.length + 1);
  let d = 0;
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === "(") d++;
    else if (normalized[i] === ")" && d > 0) d--;
    depthMap[i + 1] = d;
  }
  normalized = normalized.replace(
    /([.)—])(\s*)(?=(?:[A-Z[]|:rb_))/g,
    (match: string, punct: string, spacing: string, index: number) => {
      const depthAfter = punct === ")" ? depthMap[index + 1] ?? 0 : depthMap[index] ?? 0;
      if (depthAfter > 0 || spacing.length > 0) return match;
      return `${punct}${paragraphBreak}`;
    },
  );
  return normalized;
}

interface Props {
  text: string;
}

export function CardTextRenderer({ text }: Props) {
  const normalized = normalizeCardTextLayout(text);

  const lines = normalized.split("\n");

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((line, i) => (
        <p key={i}>{renderLine(line)}</p>
      ))}
    </div>
  );
}

const ENERGY_VALUE_RE = /^energy_(\d+)$/;

function renderTokens(text: string, keyOffset = 0): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(TOKEN_REGEX);

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const tokenKey = match[1];
    const energyMatch = ENERGY_VALUE_RE.exec(tokenKey);
    if (energyMatch) {
      parts.push(
        <span
          key={keyOffset + match.index}
          className="inline-icon icon-energy-value"
          data-value={energyMatch[1]}
          aria-label={`${energyMatch[1]} energy`}
          title={`energy ${energyMatch[1]}`}
        />
      );
    } else {
      const iconClass = TOKEN_ICON_MAP[tokenKey] ?? `icon-${tokenKey}`;
      parts.push(
        <span key={keyOffset + match.index} className={`inline-icon ${iconClass}`} title={tokenKey} />
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function renderLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Split on italic spans _..._ while treating token patterns (like energy_3) as atomic
  const segments = line.split(/(_(?:[^_\n]|:[^:\n]+:)+_)/);
  segments.forEach((seg, si) => {
    if (seg.startsWith("_") && seg.endsWith("_") && seg.length > 2) {
      const inner = seg.slice(1, -1);
      parts.push(<em key={`em-${si}`}>{renderTokens(inner, si * 10000)}</em>);
    } else {
      renderTokens(seg, si * 10000).forEach((n) => parts.push(n));
    }
  });
  return parts;
}