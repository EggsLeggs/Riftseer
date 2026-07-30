import { notFound } from "next/navigation";
import { cardsApi } from "@/features/cards/api";
import { setsApi } from "@/features/sets/api";
import { AdminCardEditorView } from "@/views/admin/admin-card-editor-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminCardEditPage({ params }: Props) {
  const { id } = await params;

  const [card, sets] = await Promise.all([
    cardsApi.getById(id),
    // Only the codes matter here (the move control); an outage just leaves the
    // set picker empty rather than blocking every other field.
    setsApi.getSets().catch(() => ({ sets: [] })),
  ]);

  if (!card) notFound();

  return (
    <AdminCardEditorView
      card={card}
      setCodes={sets.sets.map((set) => set.setCode)}
    />
  );
}
