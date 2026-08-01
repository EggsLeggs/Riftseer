"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { Oracle, Printing } from "@riftseer/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  buildOraclePatch,
  buildPrintingPatch,
  oracleToEditorValues,
  printingToEditorValues,
  type OracleEditorValues,
  type PrintingEditorValues,
} from "@/features/admin/card-form";
import {
  useOracleMutations,
  usePrintingMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import { cardHref } from "@/features/cards/paths";
import { AdminCardImagePanel } from "./admin-card-image-panel";
import { AdminCardLegalitiesPanel } from "./admin-card-legalities-panel";
import { AdminCardRelationshipsPanel } from "./admin-card-relationships-panel";
import { AdminCardRulingsPanel } from "./admin-card-rulings-panel";
import { AdminPrintingDeltaPanel } from "./admin-printing-delta-panel";
import {
  AdminSection,
  CheckboxField,
  FieldGrid,
  TextAreaField,
  TextField,
} from "./admin-form-field";
import { AdminPageHeader } from "./admin-page-header";

export function AdminCardEditorView({
  oracle,
  printing,
  setCodes,
}: {
  oracle: Oracle;
  printing: Printing;
  setCodes: string[];
}) {
  const router = useRouter();
  const oracleBaseline = React.useRef(oracleToEditorValues(oracle));
  const printingBaseline = React.useRef(printingToEditorValues(printing));
  const [oracleValues, setOracleValues] = React.useState(oracleBaseline.current);
  const [printingValues, setPrintingValues] = React.useState(printingBaseline.current);
  const oracleMutations = useOracleMutations();
  const printingMutations = usePrintingMutations();

  const setOracle = <K extends keyof OracleEditorValues>(key: K, value: OracleEditorValues[K]) =>
    setOracleValues((current) => ({ ...current, [key]: value }));
  const setPrinting = <K extends keyof PrintingEditorValues>(key: K, value: PrintingEditorValues[K]) =>
    setPrintingValues((current) => ({ ...current, [key]: value }));

  async function saveOracle(event: React.FormEvent) {
    event.preventDefault();
    const patch = buildOraclePatch(oracleValues, oracleBaseline.current);
    if (Object.keys(patch).length === 0) return void toast.info("No oracle changes to save");
    try {
      await oracleMutations.patch.mutateAsync([oracle.id, patch]);
      oracleBaseline.current = oracleValues;
      router.refresh();
    } catch {}
  }

  async function savePrinting(event: React.FormEvent) {
    event.preventDefault();
    const patch = buildPrintingPatch(printingValues, printingBaseline.current);
    if (Object.keys(patch).length === 0) return void toast.info("No printing changes to save");
    try {
      await printingMutations.patch.mutateAsync([printing.id, patch, printing.public_slug]);
      printingBaseline.current = printingValues;
      router.refresh();
    } catch {}
  }

  return (
    <>
      <AdminPageHeader
        title={oracle.name}
        description={`${printing.set?.set_code ?? "no set"} · ${printing.collector_number ?? "no collector number"} · printing ${printing.id}`}
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Cards", href: "/admin/cards" }, { label: oracle.name }]}
        actions={<Button variant="outline" size="sm" asChild><Link href={cardHref(printing)}><ExternalLink />View card page</Link></Button>}
      />

      <form onSubmit={(event) => void saveOracle(event)} className="space-y-6">
        <AdminSection heading="Oracle" description="Rules-object fields inherited by every printing unless a printing delta says otherwise.">
          <FieldGrid>
            <TextField id="oracle-name" label="Name" value={oracleValues.name} onChange={(event) => setOracle("name", event.target.value)} />
            <TextField id="oracle-type" label="Type" value={oracleValues.card_type} onChange={(event) => setOracle("card_type", event.target.value)} />
            <TextField id="oracle-supertype" label="Supertype" value={oracleValues.supertype} onChange={(event) => setOracle("supertype", event.target.value)} />
            <TextField id="oracle-energy" label="Energy" inputMode="numeric" value={oracleValues.energy} onChange={(event) => setOracle("energy", event.target.value)} />
            <TextField id="oracle-power" label="Power" inputMode="numeric" value={oracleValues.power} onChange={(event) => setOracle("power", event.target.value)} />
            <TextField id="oracle-might" label="Might" inputMode="numeric" value={oracleValues.might} onChange={(event) => setOracle("might", event.target.value)} />
            <TextField id="oracle-might-bonus" label="Might bonus" inputMode="numeric" hint="0 is a real printed value; blank means this is not equipment." value={oracleValues.might_bonus} onChange={(event) => setOracle("might_bonus", event.target.value)} />
            <TextField id="oracle-tags" label="Tags" hint="Comma-separated" value={oracleValues.tags} onChange={(event) => setOracle("tags", event.target.value)} />
            <TextField id="oracle-domains" label="Domains" hint="Comma-separated" value={oracleValues.domains} onChange={(event) => setOracle("domains", event.target.value)} />
            <TextField id="oracle-meta-flags" label="Meta flags" hint="Comma-separated is: flags" value={oracleValues.meta_flags} onChange={(event) => setOracle("meta_flags", event.target.value)} />
          </FieldGrid>
          <div className="mt-4"><CheckboxField id="oracle-token" label="Token" checked={oracleValues.is_token} onChange={(event) => setOracle("is_token", event.target.checked)} /></div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <TextAreaField id="oracle-rich" label="Rules text (rich)" rows={6} value={oracleValues.text_rich} onChange={(event) => setOracle("text_rich", event.target.value)} />
            <TextAreaField id="oracle-plain" label="Rules text (plain)" rows={6} value={oracleValues.text_plain} onChange={(event) => setOracle("text_plain", event.target.value)} />
            <TextAreaField id="oracle-equipment" label="Equipment effect" rows={3} className="lg:col-span-2" value={oracleValues.equipment_text} onChange={(event) => setOracle("equipment_text", event.target.value)} />
          </div>
          <Button className="mt-4" type="submit" disabled={oracleMutations.patch.isPending}>{oracleMutations.patch.isPending ? "Saving…" : "Save oracle"}</Button>
        </AdminSection>
      </form>

      <Separator className="my-8" />

      <form onSubmit={(event) => void savePrinting(event)} className="space-y-6">
        <AdminSection heading="Printing" description="Physical-card fields: set, collector number, rarity, art credit, flavour and marketplace links.">
          <FieldGrid>
            <div className="flex flex-col gap-1.5"><label htmlFor="printing-set" className="text-sm font-medium">Set</label><select id="printing-set" className="border-input bg-background h-9 rounded-md border px-3 text-sm" value={printingValues.set_code} onChange={(event) => setPrinting("set_code", event.target.value)}>{setCodes.map((code) => <option key={code}>{code}</option>)}</select></div>
            <TextField id="printing-collector" label="Collector number" value={printingValues.collector_number} onChange={(event) => setPrinting("collector_number", event.target.value)} />
            <TextField id="printing-released" label="Released at" type="date" value={printingValues.released_at} onChange={(event) => setPrinting("released_at", event.target.value)} />
            <TextField id="printing-rarity" label="Rarity" value={printingValues.rarity} onChange={(event) => setPrinting("rarity", event.target.value)} />
            <TextField id="printing-artist" label="Artist" value={printingValues.artist} onChange={(event) => setPrinting("artist", event.target.value)} />
            <TextField id="printing-finishes" label="Finishes" hint="Comma-separated" value={printingValues.finishes} onChange={(event) => setPrinting("finishes", event.target.value)} />
            <TextField id="printing-tcg-id" label="TCGPlayer ID" value={printingValues.tcgplayer_id} onChange={(event) => setPrinting("tcgplayer_id", event.target.value)} />
            <TextField id="printing-tcg-url" label="TCGPlayer URL" type="url" value={printingValues.tcgplayer_url} onChange={(event) => setPrinting("tcgplayer_url", event.target.value)} />
            <TextField id="printing-cm-url" label="Cardmarket URL" type="url" value={printingValues.cardmarket_url} onChange={(event) => setPrinting("cardmarket_url", event.target.value)} />
          </FieldGrid>
          <TextAreaField id="printing-flavour" label="Flavour text" rows={3} className="mt-4" value={printingValues.flavour_text} onChange={(event) => setPrinting("flavour_text", event.target.value)} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CheckboxField id="printing-signature" label="Signature" checked={printingValues.is_signature} onChange={(event) => setPrinting("is_signature", event.target.checked)} />
            <CheckboxField id="printing-alt" label="Alternate art" checked={printingValues.is_alternate_art} onChange={(event) => setPrinting("is_alternate_art", event.target.checked)} />
            <CheckboxField id="printing-over" label="Overnumbered" checked={printingValues.is_overnumbered} onChange={(event) => setPrinting("is_overnumbered", event.target.checked)} />
            <CheckboxField id="printing-special" label="Special collection" checked={printingValues.is_special_collection} onChange={(event) => setPrinting("is_special_collection", event.target.checked)} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="submit" disabled={printingMutations.patch.isPending}>{printingMutations.patch.isPending ? "Saving…" : "Save printing"}</Button><span className="text-xs text-muted-foreground">Pinned slug: {printing.public_slug}</span></div>
        </AdminSection>
      </form>

      <Separator className="my-8" /><AdminPrintingDeltaPanel oracle={oracle} printing={printing} />
      <Separator className="my-8" /><AdminCardImagePanel oracle={oracle} printing={printing} />
      <Separator className="my-8" /><AdminCardRelationshipsPanel oracle={oracle} />
      <Separator className="my-8" /><AdminCardLegalitiesPanel printing={printing} />
      <Separator className="my-8" /><AdminCardRulingsPanel printing={printing} />
    </>
  );
}
