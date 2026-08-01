import { describe, expect, test } from "bun:test";
import { parseCardRequests } from "../parser.ts";

describe("parseCardRequests", () => {
  test("extracts, trims, and preserves multiple card names", () => {
    expect(parseCardRequests("[[  Sun Disc  ]] and [[Ye'dael]]")).toEqual([
      { raw: "Sun Disc", name: "Sun Disc" },
      { raw: "Ye'dael", name: "Ye'dael" },
    ]);
  });

  test("parses either separator plus optional set and collector", () => {
    expect(parseCardRequests("[[Sun Disc|ogn-021]] [[Poro\\SFD 3]]")).toEqual([
      { raw: "Sun Disc|ogn-021", name: "Sun Disc", set: "OGN", collector: "021" },
      { raw: "Poro\\SFD 3", name: "Poro", set: "SFD", collector: "3" },
    ]);
  });

  test("ignores empty requests and requests inside inline or fenced code", () => {
    expect(parseCardRequests("[[]] `[[Inline]]`\n```\n[[Fenced]]\n```\n[[Visible]]")).toEqual([
      { raw: "Visible", name: "Visible" },
    ]);
  });

  test("caps a message at twenty requests", () => {
    const requests = parseCardRequests(Array.from({ length: 25 }, (_, index) => `[[Card ${index}]]`).join(" "));
    expect(requests).toHaveLength(20);
    expect(requests.at(-1)?.name).toBe("Card 19");
  });
});
