import { redirect } from "next/navigation";
import { cardsApi } from "@/features/cards/api";
import { cardHref } from "@riftseer/types/render";

export default async function RandomCardPage() {
  const card = await cardsApi.getRandom();
  if (!card?.preferred_printing) redirect("/cards");
  redirect(cardHref(card.preferred_printing));
}
