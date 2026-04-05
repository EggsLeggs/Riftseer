import React from "react";
import { TOKEN_ICON_MAP, TOKEN_REGEX } from "@riftseer/core/icons";

interface Props {
  text: string;
}

export function CardTextRenderer({ text }: Props) {
  const normalized = text
    .replace(/_ \(/g, "_(")
    .replace(/\)_([^\s_\n])/g, ")_\n$1")
    .replace(/([.)—])([A-Z\[])/g, "$1\n$2");

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
  // Split on italic spans _..._
  const segments = line.split(/(_[^_\n]+_)/);
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
