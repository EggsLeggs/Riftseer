import type { Card } from "@riftseer/types";

const ISSUE_URL = "https://github.com/EggsLeggs/Riftseer/issues/new";

/**
 * Prefilled GitHub issue for a card data problem. The identifying fields are
 * filled in for the reporter so we can find the exact printing.
 */
export function reportCardIssueUrl(card: Card): string {
  const body = [
    "<!-- Describe what looks wrong with this card. -->",
    "",
    "",
    "---",
    `- Card: ${card.name}`,
    `- Set: ${card.set?.set_name ?? "unknown"} (${card.set?.set_code ?? "?"})`,
    `- Collector number: ${card.collector_number ?? "unknown"}`,
    `- Card id: ${card.id}`,
    `- Slug: ${card.public_slug ?? "none"}`,
  ].join("\n");

  const params = new URLSearchParams({
    title: `Card data issue: ${card.name}`,
    labels: "card-data",
    body,
  });
  return `${ISSUE_URL}?${params.toString()}`;
}
