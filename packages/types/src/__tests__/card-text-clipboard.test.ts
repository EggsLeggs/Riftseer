import { describe, expect, it } from "bun:test";
import { formatCardTextForClipboard } from "../card-text.ts";

const AKALI =
  "[Empower] :rb_energy_3::rb_rune_rainbow: (:rb_energy_3::rb_rune_rainbow:: Empower this. Use only if not Empowered.)[Action][&gt;] :rb_exhaust:: If it's your turn, move a friendly unit in a showdown to base and if I'm [Empowered], ready it.";

describe("formatCardTextForClipboard", () => {
  it("keeps symbol paste on clean lines with braced tokens", () => {
    expect(formatCardTextForClipboard(AKALI)).toBe(
      [
        "[Empower] {3}{Power} ({3}{Power}: Empower this. Use only if not Empowered.)",
        "[Action]> {Exhaust}: If it's your turn, move a friendly unit in a showdown to base and if I'm [Empowered], ready it.",
      ].join("\n"),
    );
  });

  it("uses readable phrases in prefer-text mode", () => {
    expect(formatCardTextForClipboard(AKALI, { preferText: true })).toBe(
      [
        "[Empower] 3 Energy and Power (3 Energy and Power: Empower this. Use only if not Empowered.)",
        "[Action]> Exhaust: If it's your turn, move a friendly unit in a showdown to base and if I'm [Empowered], ready it.",
      ].join("\n"),
    );
  });

  it("keeps mid-sentence keywords on the same line", () => {
    const poppy =
      "You may spend 3 XP as an additional cost to play me. If you do, I cost :rb_energy_3: less.[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)[Tank] (I must be assigned combat damage first.)";
    expect(formatCardTextForClipboard(poppy)).toBe(
      [
        "You may spend 3 XP as an additional cost to play me. If you do, I cost {3} less.",
        "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)",
        "[Tank] (I must be assigned combat damage first.)",
      ].join("\n"),
    );
  });
});
