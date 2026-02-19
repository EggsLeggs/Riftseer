import React from "react";

const TOKEN_REGEX = /:rb_(\w+):/g;

const TOKEN_ICON_MAP: Record<string, string> = {
  exhaust: "icon-exhaust",
  energy: "icon-energy",
  energy_1: "icon-energy-1",
  energy_2: "icon-energy-2",
  energy_3: "icon-energy-3",
  energy_4: "icon-energy-4",
  energy_5: "icon-energy-5",
  might: "icon-might",
  power: "icon-power",
};

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
    const iconClass = TOKEN_ICON_MAP[tokenKey] ?? `icon-${tokenKey}`;
    parts.push(
      <span key={match.index} className={`inline-icon ${iconClass}`} title={tokenKey} />
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return parts;
}
