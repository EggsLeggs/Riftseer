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
      '"If you hit a wall, hit it hard!"\n- Vi',
    );
    expect(repairFlavourText('Art shall blossom from your fear."\n - Jhin')).toBe(
      '"Art shall blossom from your fear."\n- Jhin',
    );
  });

  it("is idempotent when the opening quote is already present", () => {
    const ok = '"Peace within, peace without."\n- Master Yi';
    expect(repairFlavourText(ok)).toBe(ok);
  });

  // Moonfall prints `"Night approaches!"` with `—Diana` on the very next line;
  // upstream pads that break with a blank line holding a single space.
  it("tidies padding around a break but keeps the break itself", () => {
    expect(repairFlavourText('Night approaches!"\r\n \r\n- Diana')).toBe(
      '"Night approaches!"\n- Diana',
    );
    expect(repairFlavourText('"Already fine."\n\n\n- Someone')).toBe(
      '"Already fine."\n- Someone',
    );
    // Padding on either side of a single break goes too.
    expect(repairFlavourText('"Trailing space." \n- Vi')).toBe(
      '"Trailing space."\n- Vi',
    );
    expect(repairFlavourText('"Indented attribution."\n   - Vi')).toBe(
      '"Indented attribution."\n- Vi',
    );
  });

  it("leaves unquoted flavour unchanged", () => {
    expect(repairFlavourText("A quiet resolve.")).toBe("A quiet resolve.");
  });

  it("does not treat a mid-sentence quoted word as an attribution", () => {
    // The dash here is punctuation, not a trailing attribution, so nothing
    // should gain an opening quote.
    const aside = 'The word "power" - not a rule.';
    expect(repairFlavourText(aside)).toBe(aside);
  });

  it("strips stray HTML debris from upstream flavour", () => {
    expect(
      repairFlavourText('Hey, where is everyone?" \r\n- Common last words</em'),
    ).toBe('"Hey, where is everyone?"\n- Common last words');
  });

  // The printed cards disagree about whether the attribution starts a line —
  // Glasc Mixologist runs it on, Lacerate breaks before it — and upstream
  // flattens both to the same shape, so the break is never invented.
  it("restores the quote but leaves a run-on attribution inline", () => {
    expect(
      repairFlavourText('Those who follow me follow destiny!" - Azir'),
    ).toBe('"Those who follow me follow destiny!" - Azir');
    expect(repairFlavourText(`We're gonna be rich!" -Common Last Words`)).toBe(
      `"We're gonna be rich!" -Common Last Words`,
    );
    expect(
      repairFlavourText(
        'The difference between medicine and poison is the dosage."- Renata Glasc',
      ),
    ).toBe(
      '"The difference between medicine and poison is the dosage."- Renata Glasc',
    );
  });

  it("leaves an attribution that already has its own line where it is", () => {
    const own = '"If you hit a wall, hit it hard!"\n- Vi';
    expect(repairFlavourText(own)).toBe(own);
  });

  it("does not break on a dash inside the quoted line", () => {
    const inline = '"A half-measure is no measure."';
    expect(repairFlavourText(inline)).toBe(inline);
  });

  it("strips a closing tag that upstream leaves after the quote", () => {
    expect(
      repairFlavourText('One of us finds peace. One of us walks away."</e>'),
    ).toBe('"One of us finds peace. One of us walks away."');
  });

  it("strips leading tag debris without eating the rest of the text", () => {
    // A greedy `[^>]*` on this unterminated tag consumed the whole flavour.
    expect(repairFlavourText('<em?"I will light our path.')).toBe(
      '"I will light our path."',
    );
  });

  // Upstream drops quotes at either edge, and only about half the affected
  // cards carry a "— Vi" attribution to key off. These six do not.
  it("restores an opening quote with no attribution to key off", () => {
    expect(
      repairFlavourText(
        `Ready" and "fire" are easy. Aiming, now that's the hard part.`,
      ),
    ).toBe(`"Ready" and "fire" are easy. Aiming, now that's the hard part.`);
    expect(repairFlavourText('Last one standing" is a bit subjective.')).toBe(
      '"Last one standing" is a bit subjective.',
    );
  });

  it("restores a dropped closing quote", () => {
    expect(repairFlavourText('They call it "the Noxian hello.')).toBe(
      'They call it "the Noxian hello."',
    );
    expect(repairFlavourText(`He doesn't bother to shout "Freeze!`)).toBe(
      `He doesn't bother to shout "Freeze!"`,
    );
  });

  // Balanced but broken: the count is even, yet the first quote closes.
  it("restores both quotes when each edge lost one", () => {
    expect(repairFlavourText('Gentle" is not the same as "harmless.')).toBe(
      '"Gentle" is not the same as "harmless."',
    );
  });

  it("leaves prose whose dash follows a genuinely quoted phrase", () => {
    const prose =
      'Few people laughed when she claimed she was a "dock pirate" - or at least, few remained.';
    expect(repairFlavourText(prose)).toBe(prose);
  });

  it("reads a quote hugging a dash as a closer, not an opener", () => {
    expect(repairFlavourText('Inaction invites regret."- Mel')).toBe(
      '"Inaction invites regret."- Mel',
    );
  });

  it("is idempotent over every repair", () => {
    for (const raw of [
      `Ready" and "fire" are easy.`,
      'They call it "the Noxian hello.',
      'Gentle" is not the same as "harmless.',
      'Those who follow me follow destiny!" - Azir',
      '<em?"I will light our path.',
    ]) {
      const once = repairFlavourText(raw);
      expect(repairFlavourText(once)).toBe(once);
    }
  });

  it("keeps angle brackets that cannot be a tag", () => {
    expect(repairFlavourText("I <3 the Rift.")).toBe("I <3 the Rift.");
  });

  it("still repairs when the attribution uses an em dash", () => {
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
