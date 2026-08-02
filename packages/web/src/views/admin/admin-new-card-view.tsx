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
import { importCardImageFromUrlAction } from "@/features/admin/actions";
import { generateCardId, isValidCardId } from "@/features/admin/card-id";
import { useOracleMutations, usePrintingMutations, useReviewMutations } from "@/features/admin/hooks/use-admin-mutations";
import { clearReviewCreateDraft, galleryToPrefill, readReviewCreateDraft, type GalleryPrefill } from "@/features/admin/review-draft";
import type { AdminOracleDefinition, AdminPrintingDefinition } from "@/features/admin/types";
import { setsApi, setsQueryKeys } from "@/features/sets/api";
import { AdminPageHeader } from "./admin-page-header";
import { AdminSection, CheckboxField, FieldGrid, SelectField, TextField } from "./admin-form-field";

const EMPTY: GalleryPrefill = { name: "", setCode: "", collectorNumber: "", isToken: false, signature: false, alternateArt: false, specialCollection: false, riftboundId: "", rarity: "", type: "", energy: "", might: "", power: "", mightBonus: "", text: "", equipment: "", imageUrl: null };
const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);

export function AdminNewCardView() {
  const router = useRouter();
  const reviewEntryId = useSearchParams().get("review");
  const [printingId, setPrintingId] = React.useState("");
  const [values, setValues] = React.useState(EMPTY);
  const [uploadArt, setUploadArt] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const oracleMutations = useOracleMutations();
  const printingMutations = usePrintingMutations();
  const reviewMutations = useReviewMutations();
  const sets = useQuery({ queryKey: setsQueryKeys.list(), queryFn: setsApi.getSets, staleTime: 300_000 });

  React.useEffect(() => { setPrintingId(generateCardId()); }, []);
  React.useEffect(() => {
    const draft = readReviewCreateDraft(reviewEntryId);
    if (!draft) return;
    const next = galleryToPrefill(draft.gallery);
    setValues(next);
    setUploadArt(Boolean(next.imageUrl));
  }, [reviewEntryId]);
  const update = <K extends keyof GalleryPrefill>(key: K, value: GalleryPrefill[K]) => setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidCardId(printingId)) return void toast.error("Printing ID must be 24 hexadecimal characters");
    if (!values.name.trim()) return void toast.error("Name is required");
    if (!values.setCode) return void toast.error("Set is required for a printing");

    const oracleDefinition: AdminOracleDefinition = {
      name: values.name.trim(),
      card_type: values.type.trim() || null,
      is_token: values.isToken,
      energy: numberOrNull(values.energy),
      might: numberOrNull(values.might),
      power: numberOrNull(values.power),
      might_bonus: numberOrNull(values.mightBonus),
      text_rich: values.text.trim() || null,
      text_plain: values.text.trim() || null,
      equipment_text: values.equipment.trim() || null,
    };
    const printingDefinition: AdminPrintingDefinition = {
      collector_number: values.collectorNumber.trim() || null,
      rarity: values.rarity.trim() || null,
      is_signature: values.signature,
      is_alternate_art: values.alternateArt,
      is_special_collection: values.specialCollection,
    };

    setSubmitting(true);
    try {
      const oracle = await oracleMutations.create.mutateAsync([oracleDefinition]);
      await printingMutations.create.mutateAsync([printingId, oracle.oracle_id, values.setCode, printingDefinition]);
      if (uploadArt && values.imageUrl) {
        const image = await importCardImageFromUrlAction(printingId, values.imageUrl, values.name);
        if (!image.ok) toast.message("Card created, but gallery art did not upload");
      }
      if (reviewEntryId) {
        try { await reviewMutations.confirm.mutateAsync([reviewEntryId, printingId, oracle.oracle_id]); }
        catch { toast.message("Card created — confirm the review entry when ready"); }
        clearReviewCreateDraft();
      }
      router.push(`/admin/cards/${encodeURIComponent(printingId)}/edit`);
    } catch {
      // Mutation hooks already surfaced the API error.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AdminPageHeader title={reviewEntryId ? "Create missing card" : "New card"} description="Creates an oracle first, then one physical printing with a pinned public slug." crumbs={[{ label: "Admin", href: "/admin" }, { label: "Cards", href: "/admin/cards" }, { label: "New" }]} />
      <form onSubmit={(event) => void submit(event)} className="space-y-8">
        <AdminSection heading="Printing identity"><div className="flex flex-wrap items-end gap-3"><div className="min-w-72 flex-1"><Label htmlFor="new-printing-id">Printing ID</Label><Input id="new-printing-id" value={printingId} onChange={(event) => setPrintingId(event.target.value)} className="font-mono text-xs" /></div><Button type="button" variant="outline" onClick={() => setPrintingId(generateCardId())}><RefreshCw />Regenerate</Button></div></AdminSection>
        <Separator />
        <AdminSection heading="Oracle"><FieldGrid><TextField id="new-name" label="Name" value={values.name} onChange={(event) => update("name", event.target.value)} /><TextField id="new-type" label="Type" value={values.type} onChange={(event) => update("type", event.target.value)} /><TextField id="new-energy" label="Energy" value={values.energy} onChange={(event) => update("energy", event.target.value)} /><TextField id="new-power" label="Power" value={values.power} onChange={(event) => update("power", event.target.value)} /><TextField id="new-might" label="Might" value={values.might} onChange={(event) => update("might", event.target.value)} /><TextField id="new-might-bonus" label="Might bonus" hint="0 is meaningful; blank means not equipment" value={values.mightBonus} onChange={(event) => update("mightBonus", event.target.value)} /></FieldGrid><div className="mt-4"><CheckboxField id="new-token" label="Token" checked={values.isToken} onChange={(event) => update("isToken", event.target.checked)} /></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><Label htmlFor="new-text">Rules text</Label><Textarea id="new-text" rows={5} value={values.text} onChange={(event) => update("text", event.target.value)} /></div><div><Label htmlFor="new-equipment">Equipment text</Label><Textarea id="new-equipment" rows={5} value={values.equipment} onChange={(event) => update("equipment", event.target.value)} /></div></div></AdminSection>
        <Separator />
        <AdminSection heading="Printing"><FieldGrid><SelectField id="new-set" label="Set" value={values.setCode} onChange={(event) => update("setCode", event.target.value)} options={[{ value: "", label: "Choose a set" }, ...(sets.data?.sets ?? []).map((set) => ({ value: set.setCode, label: `${set.setCode} · ${set.setName}` }))]} /><TextField id="new-collector" label="Collector number" value={values.collectorNumber} onChange={(event) => update("collectorNumber", event.target.value)} /><TextField id="new-rarity" label="Rarity" value={values.rarity} onChange={(event) => update("rarity", event.target.value)} /></FieldGrid><div className="mt-4 grid gap-3 sm:grid-cols-3"><CheckboxField id="new-signature" label="Signature" checked={values.signature} onChange={(event) => update("signature", event.target.checked)} /><CheckboxField id="new-alt" label="Alternate art" checked={values.alternateArt} onChange={(event) => update("alternateArt", event.target.checked)} /><CheckboxField id="new-special" label="Special collection" checked={values.specialCollection} onChange={(event) => update("specialCollection", event.target.checked)} /></div>{values.imageUrl ? <div className="mt-4 flex items-start gap-4"><img src={values.imageUrl} alt="" className="h-40 rounded border" /><CheckboxField id="new-upload" label="Upload gallery art" checked={uploadArt} onChange={(event) => setUploadArt(event.target.checked)} /></div> : null}</AdminSection>
        <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create oracle and printing"}</Button>
      </form>
    </>
  );
}
