import { describe, expect, it } from "bun:test";
import {
  decodeCardTextEntities,
  formatCardTextForClipboard,
} from "../card-text.ts";

describe("decodeCardTextEntities", () => {
  it("decodes common HTML entities from upstream rules text", () => {
    expect(decodeCardTextEntities("&quot;Kill this.&quot;")).toBe(
      '"Kill this."',
    );
    expect(decodeCardTextEntities("[Action][&gt;] move")).toBe(
      "[Action][>] move",
    );
    expect(decodeCardTextEntities("&amp;quot;")).toBe('"');
  });
});

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

  it("keeps Add resources outside the keyword badge", () => {
    const honeyfruit =
      "[Reaction][&gt;] :rb_exhaust:: [Add] :rb_rune_rainbow:. (Abilities that add resources can't be reacted to.)[Level 6][&gt;] [&gt;&gt;][Reaction][&gt;] :rb_exhaust:: [Add] :rb_energy_1::rb_rune_rainbow:.";
    expect(formatCardTextForClipboard(honeyfruit)).toBe(
      [
        "[Reaction]> {Exhaust}: [Add] {Power}. (Abilities that add resources can't be reacted to.)",
        "[Level 6]> [Reaction]> {Exhaust}: [Add] {1}{Power}.",
      ].join("\n"),
    );
  });

  it("decodes quoted reminder text with a trailing period", () => {
    const conquer =
      'When I conquer, if you assigned 3 or more excess damage, play two Gold gear tokens exhausted. (They have &quot;[Reaction][&gt;] :rb_exhaust:: [Add] :rb_rune_rainbow:.&quot;)';
    expect(formatCardTextForClipboard(conquer)).toBe(
      'When I conquer, if you assigned 3 or more excess damage, play two Gold gear tokens exhausted. (They have "[Reaction]> {Exhaust}: [Add] {Power}.")',
    );
  });

  it("puts each standalone keyword on its own line", () => {
    const rengar = "[Accelerate][Assault 2][Deflect][Ganking]";
    expect(formatCardTextForClipboard(rengar)).toBe(
      ["[Accelerate]", "[Assault 2]", "[Deflect]", "[Ganking]"].join("\n"),
    );
  });

  it("keeps activated ability costs off the keyword badge", () => {
    const vi =
      "[Deflect]:rb_energy_2::rb_rune_fury:: Double my Might this turn.";
    expect(formatCardTextForClipboard(vi)).toBe(
      ["[Deflect]", "{2}{Fury}: Double my Might this turn."].join("\n"),
    );
  });
});
