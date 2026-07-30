"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, RefreshCw, Trash2 } from "lucide-react";
import type { Card } from "@riftseer/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { useCardMutations } from "@/features/admin/hooks/use-admin-mutations";
import { AdminSection } from "./admin-form-field";
import { ConfirmDialog } from "./confirm-dialog";

interface Props {
  card: Card;
  setCodes: string[];
}

/** Set membership, slug regeneration and deletion — the non-patch card actions. */
export function AdminCardPlacementPanel({ card, setCodes }: Props) {
  const router = useRouter();
  const [targetSet, setTargetSet] = React.useState(card.set?.set_code ?? "");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const { move, regenerateSlug, remove } = useCardMutations();

  const canMove = targetSet !== "" && targetSet !== card.set?.set_code;

  async function handleDelete(reason: string) {
    try {
      await remove.mutateAsync([card.id, reason || undefined]);
    } catch {
      // Already surfaced as a toast — leave the dialog open so it can be retried.
      return;
    }
    setConfirmDelete(false);
    // The card no longer exists, so this page would 404 on refresh.
    router.push("/admin/cards");
  }

  return (
    <>
      <AdminSection heading="Placement">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-move-set">Set</Label>
            <select
              id="card-move-set"
              value={targetSet}
              onChange={(e) => setTargetSet(e.target.value)}
              className={CARD_BROWSE_SELECT_CLASS}
            >
              <option value="">Select a set…</option>
              {setCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!canMove || move.isPending}
            onClick={() => move.mutate([card.id, targetSet, card.public_slug])}
          >
            <ArrowRightLeft aria-hidden="true" />
            {move.isPending ? "Moving…" : "Move card"}
          </Button>
        </div>
      </AdminSection>

      <AdminSection
        heading="Public URL"
        description="Slugs are pinned on first ingest so links never drift. Regenerate only to repair a malformed slug, since existing links to the old slug will 404."
      >
        <p className="mb-3 font-mono text-xs break-all">
          {card.public_slug ?? "No slug set"}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={regenerateSlug.isPending}
          onClick={() => regenerateSlug.mutate([card.id, card.public_slug])}
        >
          <RefreshCw aria-hidden="true" />
          {regenerateSlug.isPending ? "Regenerating…" : "Regenerate slug"}
        </Button>
      </AdminSection>

      <AdminSection
        heading="Danger zone"
        description="Deleting records a durable deletion, so the scheduled ingest will not restore this card."
      >
        <Button
          type="button"
          variant="destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 aria-hidden="true" />
          Delete card
        </Button>
      </AdminSection>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${card.name}?`}
        description="The live row is removed and a deletion record is stored. Ingest will not bring it back."
        confirmLabel="Delete card"
        destructive
        reasonLabel="Reason (optional)"
        pending={remove.isPending}
        onConfirm={(reason) => void handleDelete(reason)}
      />
    </>
  );
}
