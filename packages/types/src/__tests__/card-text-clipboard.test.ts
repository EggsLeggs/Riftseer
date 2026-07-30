import { describe, expect, it } from "bun:test";
import {
  decodeCardTextEntities,
  formatCardTextForClipboard,
  maskIconTokens,
  repairFlavourText,
  restoreIconTokens,
} from "../card-text.ts";

describe("repairFlavourText", () => {
  it("restores a missing opening dialogue quote before attribution", () => {
    expect(repairFlavourText('If you hit a wall, hit it hard!"\r\n \r\n- Vi')).toBe(
      '"If you hit a wall, hit it hard!"\n \n- Vi',
    );
    expect(repairFlavourText('Art shall blossom from your fear."\n - Jhin')).toBe(
      '"Art shall blossom from your fear."\n - Jhin',
    );
  });

  it("is idempotent when the opening quote is already present", () => {
    const ok = '"Peace within, peace without."\n\n- Master Yi';
    expect(repairFlavourText(ok)).toBe(ok);
  });

  it("leaves unquoted flavour unchanged", () => {
    expect(repairFlavourText("A quiet resolve.")).toBe("A quiet resolve.");
  });

  it("strips stray HTML debris from upstream flavour", () => {
    expect(
      repairFlavourText('Hey, where is everyone?" \r\n- Common last words</em'),
    ).toBe('"Hey, where is everyone?" \n- Common last words');
  });

  it("leaves prose that quotes a word mid-sentence alone", () => {
    // The attribution rule keys on a newline; a same-line dash after a quoted
    // word is ordinary prose, not the upstream missing-opening-quote bug.
    const prose = 'He said "run" - and she ran.';
    expect(repairFlavourText(prose)).toBe(prose);
    expect(repairFlavourText('They called it the "Rift" - a wound.')).toBe(
      'They called it the "Rift" - a wound.',
    );
  });

  it("keeps angle brackets that are not HTML tags", () => {
    expect(repairFlavourText("<sigh> Another day.")).toBe("<sigh> Another day.");
    expect(repairFlavourText("I <3 the Rift.")).toBe("I <3 the Rift.");
  });

  it("still repairs when the attribution uses an en or em dash", () => {
    expect(repairFlavourText('Only the worthy."\n— Leona')).toBe(
      '"Only the worthy."\n— Leona',
    );
  });
});

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

  it("decodes numeric entities via fromCodePoint and drops invalid scalars", () => {
    expect(decodeCardTextEntities("&#34;quoted&#34;")).toBe('"quoted"');
    expect(decodeCardTextEntities("&#x1F600;")).toBe("\u{1F600}");
    expect(decodeCardTextEntities("&#x110000;")).toBe("");
    expect(decodeCardTextEntities("&#55296;")).toBe(""); // U+D800 surrogate
  });
});

describe("maskIconTokens / restoreIconTokens", () => {
  it("does not treat literal sentinel sequences as token placeholders", () => {
    const literal = "\uE0000\uE001";
    const { masked, tokens } = maskIconTokens(
      `${literal} costs :rb_energy_1: more.`,
    );
    expect(masked).toContain("\uE0020\uE003");
    expect(restoreIconTokens(masked, tokens)).toBe(
      `${literal} costs :rb_energy_1: more.`,
    );
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
