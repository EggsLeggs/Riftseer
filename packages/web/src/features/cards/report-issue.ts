import type { Oracle, Printing } from "@riftseer/types";

const ISSUE_URL = "https://github.com/EggsLeggs/Riftseer/issues/new";

/**
 * Prefilled GitHub issue for a card data problem. The identifying fields are
 * filled in for the reporter so we can find the exact printing.
 */
export function reportCardIssueUrl(oracle: Oracle, printing: Printing): string {
  const body = [
    "<!-- Describe what looks wrong with this card. -->",
    "",
    "",
    "---",
    `- Card: ${oracle.name}`,
    `- Set: ${printing.set?.set_name ?? "unknown"} (${printing.set?.set_code ?? "?"})`,
    `- Collector number: ${printing.collector_number ?? "unknown"}`,
    `- Oracle id: ${oracle.id}`,
    `- Printing id: ${printing.id}`,
    `- Slug: ${printing.public_slug || "none"}`,
  ].join("\n");

  const params = new URLSearchParams({
    title: `Card data issue: ${oracle.name}`,
    labels: "Card Data Issue",
    body,
  });
  return `${ISSUE_URL}?${params.toString()}`;
}
