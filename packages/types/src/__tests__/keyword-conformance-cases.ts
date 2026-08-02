export interface KeywordConformanceCase {
  input: string;
  expected: string[];
}

const FORTY_CHAR_KEYWORD = `A${"b".repeat(39)}`;
const FORTY_ONE_CHAR_KEYWORD = `A${"b".repeat(40)}`;

export const KEYWORD_CONFORMANCE_CASES: KeywordConformanceCase[] = [
  {
    input: "[Deflect 3] [Deflect 1] [Accelerate]",
    expected: ["accelerate", "deflect"],
  },
  {
    input: "[No Text] [NO TEXT] [3 Might] [_Hidden] [-Dash]",
    expected: [],
  },
  {
    input: "[Deathknell][>] [>>] [Hunt]",
    expected: ["deathknell", "hunt"],
  },
  {
    input: "[  Quick   Draw 2 ] [quick draw 4] [ASSAULT]",
    expected: ["assault", "quick draw"],
  },
  {
    input: `[${FORTY_CHAR_KEYWORD}] [${FORTY_ONE_CHAR_KEYWORD}]`,
    expected: [FORTY_CHAR_KEYWORD.toLowerCase()],
  },
  {
    input: "[Tank] [Accelerate] [Shield] [Tank]",
    expected: ["accelerate", "shield", "tank"],
  },
  {
    input: "[Empower]:rb_energy_2::rb_rune_fury: draw a card",
    expected: ["empower"],
  },
  { input: "", expected: [] },
];
