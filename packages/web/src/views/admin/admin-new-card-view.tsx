"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { setsApi, setsQueryKeys } from "@/features/sets/api";
import { generateCardId, isValidCardId } from "@/features/admin/card-id";
import { importCardImageFromUrlAction } from "@/features/admin/actions";
import {
  useCardMutations,
  useReviewMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import {
  buildDefinitionFromPrefill,
  clearReviewCreateDraft,
  galleryToPrefill,
  readReviewCreateDraft,
  type GalleryPrefill,
} from "@/features/admin/review-draft";
import { suggestCardAltText } from "@/features/admin/alt-text";
import type { AdminCardDefinition } from "@/features/admin/types";
import { AdminPageHeader } from "./admin-page-header";
import {
  AdminSection,
  CheckboxField,
  FieldGrid,
  SelectField,
  TextField,
} from "./admin-form-field";

const EMPTY_PREFILL: GalleryPrefill = {
  name: "",
  setCode: "",
  collectorNumber: "",
  isToken: false,
  signature: false,
  alternateArt: false,
  specialCollection: false,
  riftboundId: "",
  rarity: "",
  type: "",
  energy: "",
  might: "",
  power: "",
  mightBonus: "",
  text: "",
  equipment: "",
  imageUrl: null,
};

export function AdminNewCardView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reviewEntryId = searchParams.get("review");
  const { create } = useCardMutations();
  const { confirm } = useReviewMutations();

  // Generated on mount rather than in a useState initialiser so the server and
  // client render the same markup.
  const [cardId, setCardId] = React.useState("");
  React.useEffect(() => {
    setCardId(generateCardId());
  }, []);

  const [prefill, setPrefill] = React.useState<GalleryPrefill>(EMPTY_PREFILL);
  const [fromReview, setFromReview] = React.useState(false);
  const [uploadArt, setUploadArt] = React.useState(true);

  React.useEffect(() => {
    const draft = readReviewCreateDraft(reviewEntryId);
    if (!draft) return;
    setPrefill(galleryToPrefill(draft.gallery));
    setFromReview(true);
    setUploadArt(Boolean(draft.gallery.image_url));
  }, [reviewEntryId]);

  const sets = useQuery({
    queryKey: setsQueryKeys.list(),
    queryFn: () => setsApi.getSets(),
    staleTime: 5 * 60_000,
  });

  const selectedSet = sets.data?.sets.find(
    (s) => s.setCode === prefill.setCode,
  );

  function update<K extends keyof GalleryPrefill>(
    key: K,
    value: GalleryPrefill[K],
  ) {
    setPrefill((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const id = cardId.trim().toLowerCase();

    if (!isValidCardId(id)) {
      toast.error("Card ID must be 24 hexadecimal characters");
      return;
    }
    if (!prefill.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (prefill.setCode && !selectedSet) {
      toast.error("Pick a set from the list");
      return;
    }

    // The API generates public_slug at creation time from the name, set,
    // collector number and these two flags, so they are worth getting right
    // here rather than patching afterwards. Gallery suggestions ride along
    // so the editor opens nearly filled.
    const definition: AdminCardDefinition = buildDefinitionFromPrefill(
      prefill,
      selectedSet
        ? { setCode: selectedSet.setCode, setName: selectedSet.setName }
        : null,
    );

    try {
      await create.mutateAsync([id, definition]);
    } catch {
      // Already surfaced as a toast; keep the form so it can be corrected.
      return;
    }

    if (uploadArt && prefill.imageUrl) {
      const alt = suggestCardAltText({
        name: prefill.name,
        type: prefill.type,
        collectorNumber: prefill.collectorNumber,
        setCode: prefill.setCode,
        signature: prefill.signature,
        alternateArt: prefill.alternateArt,
        specialCollection: prefill.specialCollection,
      });
      const imageResult = await importCardImageFromUrlAction(
        id,
        prefill.imageUrl,
        alt,
      );
      if (!imageResult.ok) {
        toast.message(
          "Card created, but gallery art didn't upload — add it in the editor",
        );
      }
    }

    if (reviewEntryId) {
      try {
        await confirm.mutateAsync([reviewEntryId, id]);
      } catch {
        // Card exists; the queue entry can still be confirmed from /admin/review.
        toast.message("Card created — confirm the review entry when ready");
      }
      clearReviewCreateDraft();
    }

    // Everything else lives in the full editor, which needs the row to exist.
    router.push(`/admin/cards/${encodeURIComponent(id)}/edit`);
  }

  const pending = create.isPending || confirm.isPending;
  const hasSuggestions =
    fromReview &&
    Boolean(
      prefill.rarity ||
        prefill.type ||
        prefill.energy ||
        prefill.might ||
        prefill.power ||
        prefill.mightBonus ||
        prefill.text ||
        prefill.equipment ||
        prefill.riftboundId ||
        prefill.imageUrl,
    );

  return (
    <>
      <AdminPageHeader
        title={fromReview ? "Create missing card" : "New card"}
        description={
          fromReview
            ? "Prefills from the official gallery entry. Adjust anything that looks wrong, then create — the review queue is confirmed automatically."
            : "Creates a manual card that ingest will never prune or overwrite. Use this only for printings RiftCodex does not cover."
        }
        crumbs={[
          { label: "Admin", href: "/admin" },
          ...(fromReview
            ? [{ label: "Review", href: "/admin/review" }]
            : [{ label: "Cards", href: "/admin/cards" }]),
          { label: "New" },
        ]}
      />

      <form onSubmit={(event) => void submit(event)} className="space-y-8">
        <AdminSection
          heading="Identity"
          description="The ID is permanent and shared with the RiftCodex ID space. Keep the generated value unless you are recreating a card with a known ID."
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-72 flex-1 flex-col gap-1.5">
              <Label htmlFor="new-card-id">Card ID</Label>
              <Input
                id="new-card-id"
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
                className="font-mono text-xs"
                maxLength={128}
                spellCheck={false}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCardId(generateCardId())}
            >
              <RefreshCw aria-hidden="true" />
              Regenerate
            </Button>
          </div>
        </AdminSection>

        <Separator />

        <AdminSection
          heading="Card"
          description="Name, set, collector number and the variant flags determine the public URL, which is pinned once the card is created."
        >
          <FieldGrid>
            <TextField
              id="new-card-name"
              label="Name"
              value={prefill.name}
              onChange={(e) => update("name", e.target.value)}
              maxLength={300}
              placeholder="Sun Disc"
            />
            <SelectField
              id="new-card-set"
              label="Set"
              hint="Cards without a set get a placeholder slug. You can move the card later."
              value={prefill.setCode}
              onChange={(e) => update("setCode", e.target.value)}
              options={[
                { value: "", label: "No set" },
                ...(sets.data?.sets ?? []).map((s) => ({
                  value: s.setCode,
                  label: `${s.setCode} · ${s.setName}`,
                })),
              ]}
            />
            <TextField
              id="new-card-collector"
              label="Collector number"
              value={prefill.collectorNumber}
              onChange={(e) => update("collectorNumber", e.target.value)}
              maxLength={64}
              placeholder="21"
            />
          </FieldGrid>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CheckboxField
              id="new-card-token"
              label="Token"
              checked={prefill.isToken}
              onChange={(e) => update("isToken", e.target.checked)}
            />
            <CheckboxField
              id="new-card-signature"
              label="Signature printing"
              hint="Adds /signature to the public slug."
              checked={prefill.signature}
              onChange={(e) => update("signature", e.target.checked)}
            />
            <CheckboxField
              id="new-card-alternate"
              label="Alternate art"
              hint="Appends “a” to a numeric collector number in slugs."
              checked={prefill.alternateArt}
              onChange={(e) => update("alternateArt", e.target.checked)}
            />
            {fromReview && (
              <CheckboxField
                id="new-card-special"
                label="Special collection"
                hint="Searchable as is:special."
                checked={prefill.specialCollection}
                onChange={(e) =>
                  update("specialCollection", e.target.checked)
                }
              />
            )}
          </div>
        </AdminSection>

        {hasSuggestions && (
          <>
            <Separator />

            <AdminSection
              heading="Gallery suggestions"
              description="Values the official gallery already states for this printing. Edit freely — they ship with the card on create."
            >
              {prefill.imageUrl ? (
                <div className="mb-4 flex flex-wrap items-start gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote gallery preview, not a product asset */}
                  <img
                    src={prefill.imageUrl}
                    alt=""
                    className="h-40 w-auto rounded border object-contain"
                  />
                  <CheckboxField
                    id="new-card-upload-art"
                    label="Upload gallery art"
                    hint="Downloads the image and hosts it like a normal admin upload."
                    checked={uploadArt}
                    onChange={(e) => setUploadArt(e.target.checked)}
                  />
                </div>
              ) : null}

              <FieldGrid>
                <TextField
                  id="new-card-riftbound"
                  label="Riftbound ID"
                  value={prefill.riftboundId}
                  onChange={(e) => update("riftboundId", e.target.value)}
                  maxLength={128}
                  spellCheck={false}
                />
                <TextField
                  id="new-card-type"
                  label="Type"
                  value={prefill.type}
                  onChange={(e) => update("type", e.target.value)}
                  maxLength={120}
                />
                <TextField
                  id="new-card-rarity"
                  label="Rarity"
                  value={prefill.rarity}
                  onChange={(e) => update("rarity", e.target.value)}
                  maxLength={120}
                />
                <TextField
                  id="new-card-energy"
                  label="Energy"
                  value={prefill.energy}
                  onChange={(e) => update("energy", e.target.value)}
                  inputMode="numeric"
                />
                <TextField
                  id="new-card-might"
                  label="Might"
                  value={prefill.might}
                  onChange={(e) => update("might", e.target.value)}
                  inputMode="numeric"
                />
                <TextField
                  id="new-card-power"
                  label="Power"
                  value={prefill.power}
                  onChange={(e) => update("power", e.target.value)}
                  inputMode="numeric"
                />
                <TextField
                  id="new-card-might-bonus"
                  label="Might bonus"
                  hint="Only for [Equip] gear."
                  value={prefill.mightBonus}
                  onChange={(e) => update("mightBonus", e.target.value)}
                  inputMode="numeric"
                />
              </FieldGrid>

              <div className="mt-4 flex flex-col gap-1.5">
                <Label htmlFor="new-card-text">Rules text</Label>
                <Textarea
                  id="new-card-text"
                  value={prefill.text}
                  onChange={(e) => update("text", e.target.value)}
                  rows={5}
                  className="font-mono text-xs"
                />
              </div>

              {prefill.equipment || prefill.mightBonus ? (
                <div className="mt-4 flex flex-col gap-1.5">
                  <Label htmlFor="new-card-equipment">Equipment effect</Label>
                  <Textarea
                    id="new-card-equipment"
                    value={prefill.equipment}
                    onChange={(e) => update("equipment", e.target.value)}
                    rows={3}
                    className="font-mono text-xs"
                  />
                </div>
              ) : null}
            </AdminSection>
          </>
        )}

        <Separator />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending
              ? "Creating…"
              : fromReview
                ? "Create and confirm"
                : "Create card"}
          </Button>
          <p className="text-muted-foreground text-sm">
            {fromReview
              ? "Creates the card, uploads gallery art when checked, closes the review entry, then opens the editor."
              : "You will land in the full editor to fill in text, art and the rest."}
          </p>
        </div>
      </form>
    </>
  );
}
