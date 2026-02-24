import React from "react";
import { TOKEN_ICON_MAP, TOKEN_REGEX } from "@riftseer/core/icons";

interface Props {
  text: string;
}

export function CardTextRenderer({ text }: Props) {
  const lines = text.split("\n");

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((line, i) => (
        <p key={i}>{renderLine(line)}</p>
      ))}
    </div>
  );
}

const ENERGY_VALUE_RE = /^energy_(\d+)$/;

function renderLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(TOKEN_REGEX);

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const tokenKey = match[1];
    const energyMatch = ENERGY_VALUE_RE.exec(tokenKey);
    if (energyMatch) {
      parts.push(
        <span
          key={match.index}
          className="inline-icon icon-energy-value"
          data-value={energyMatch[1]}
          aria-label={`${energyMatch[1]} energy`}
        />
      );
    } else {
      const iconClass = TOKEN_ICON_MAP[tokenKey] ?? `icon-${tokenKey}`;
      parts.push(
        <span key={match.index} className={`inline-icon ${iconClass}`} title={tokenKey} />
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return parts;
}
