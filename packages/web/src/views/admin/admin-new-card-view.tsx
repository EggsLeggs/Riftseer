"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { setsApi, setsQueryKeys } from "@/features/sets/api";
import { generateCardId, isValidCardId } from "@/features/admin/card-id";
import { useCardMutations } from "@/features/admin/hooks/use-admin-mutations";
import type { AdminCardDefinition } from "@/features/admin/types";
import { AdminPageHeader } from "./admin-page-header";
import {
  AdminSection,
  CheckboxField,
  FieldGrid,
  SelectField,
  TextField,
} from "./admin-form-field";

export function AdminNewCardView() {
  const router = useRouter();
  const { create } = useCardMutations();

  // Generated on mount rather than in a useState initialiser so the server and
  // client render the same markup.
  const [cardId, setCardId] = React.useState("");
  React.useEffect(() => {
    setCardId(generateCardId());
  }, []);

  const [name, setName] = React.useState("");
  const [setCode, setSetCode] = React.useState("");
  const [collectorNumber, setCollectorNumber] = React.useState("");
  const [isToken, setIsToken] = React.useState(false);
  const [signature, setSignature] = React.useState(false);
  const [alternateArt, setAlternateArt] = React.useState(false);

  const sets = useQuery({
    queryKey: setsQueryKeys.list(),
    queryFn: () => setsApi.getSets(),
    staleTime: 5 * 60_000,
  });

  const selectedSet = sets.data?.sets.find((s) => s.setCode === setCode);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const id = cardId.trim().toLowerCase();
    const trimmedName = name.trim();

    if (!isValidCardId(id)) {
      toast.error("Card ID must be 24 hexadecimal characters");
      return;
    }
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }
    if (setCode && !selectedSet) {
      toast.error("Pick a set from the list");
      return;
    }

    // The API generates public_slug at creation time from the name, set,
    // collector number and these two flags, so they are worth getting right
    // here rather than patching afterwards.
    const definition: AdminCardDefinition = {
      name: trimmedName,
      is_token: isToken,
      collector_number: collectorNumber.trim() || null,
      metadata: { signature, alternate_art: alternateArt },
      ...(selectedSet
        ? {
            set: {
              set_code: selectedSet.setCode,
              set_name: selectedSet.setName,
            },
          }
        : {}),
    };

    try {
      await create.mutateAsync([id, definition]);
    } catch {
      // Already surfaced as a toast; keep the form so it can be corrected.
      return;
    }

    // Everything else lives in the full editor, which needs the row to exist.
    router.push(`/admin/cards/${encodeURIComponent(id)}/edit`);
  }

  return (
    <>
      <AdminPageHeader
        title="New card"
        description="Creates a manual card that ingest will never prune or overwrite. Use this only for printings RiftCodex does not cover."
        crumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Cards", href: "/admin/cards" },
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
          description="Name, set, collector number and the two variant flags determine the public URL, which is pinned once the card is created."
        >
          <FieldGrid>
            <TextField
              id="new-card-name"
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={300}
              placeholder="Sun Disc"
            />
            <SelectField
              id="new-card-set"
              label="Set"
              hint="Cards without a set get a placeholder slug. You can move the card later."
              value={setCode}
              onChange={(e) => setSetCode(e.target.value)}
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
              value={collectorNumber}
              onChange={(e) => setCollectorNumber(e.target.value)}
              maxLength={64}
              placeholder="21"
            />
          </FieldGrid>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CheckboxField
              id="new-card-token"
              label="Token"
              checked={isToken}
              onChange={(e) => setIsToken(e.target.checked)}
            />
            <CheckboxField
              id="new-card-signature"
              label="Signature printing"
              hint="Adds /signature to the public slug."
              checked={signature}
              onChange={(e) => setSignature(e.target.checked)}
            />
            <CheckboxField
              id="new-card-alternate"
              label="Alternate art"
              hint="Appends “a” to a numeric collector number in slugs."
              checked={alternateArt}
              onChange={(e) => setAlternateArt(e.target.checked)}
            />
          </div>
        </AdminSection>

        <Separator />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create card"}
          </Button>
          <p className="text-muted-foreground text-sm">
            You will land in the full editor to fill in text, art and the rest.
          </p>
        </div>
      </form>
    </>
  );
}
