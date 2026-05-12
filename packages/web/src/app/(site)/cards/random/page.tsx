import { redirect } from "next/navigation";
import { cardsApi } from "@/features/cards/api";
import { cardHref } from "@/features/cards/paths";

export default async function RandomCardPage() {
  const card = await cardsApi.getRandom();
  if (!card) redirect("/cards");
  redirect(cardHref(card));
}
