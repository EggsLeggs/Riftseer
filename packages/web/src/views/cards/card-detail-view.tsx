"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { OracleDetail } from "@riftseer/types";
import { printingImageDownloadUrl, printingImageUrl } from "@riftseer/types";
import {
  DownloadIcon,
  ExternalLinkIcon,
  FlagIcon,
  LayoutList,
  PencilLine,
  Rows2,
} from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cardExportUrls } from "@/features/cards/api";
import { CardArt } from "@/features/cards/card-art";
import {
  CardTypeLine,
  DomainRunes,
  EnergyCost,
  MightStat,
  PowerStat,
  RarityIcon,
} from "@/features/cards/card-icons";
import { CardLegalityGrid } from "@/features/cards/card-legalities";
import {
  CardPrintingsTable,
  OracleReferencesTable,
} from "@/features/cards/card-printings-table";
import { CardRulings } from "@/features/cards/card-rulings";
import { CardTags } from "@/features/cards/card-tags";
import { CardText } from "@/features/cards/card-text";
import { CopyButton } from "@/features/cards/copy-button";
import {
  cardIsLandscapeOriented,
  formatEur,
  formatUsd,
  meaningfulCardDomains,
  meaningfulRulesText,
  tcgplayerUsdPrice,
} from "@/features/cards/format";
import { cardHref } from "@/features/cards/paths";
import { reportCardIssueUrl } from "@/features/cards/report-issue";
import { artistSearchQuery, searchHref } from "@/features/cards/search-links";
import { ShareButton } from "@/features/cards/share-button";
import {
  CARD_DETAIL_VIEW_OPTIONS,
  type CardDetailViewPreference,
} from "@/features/site-preferences/accessibility-prefs";
import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";

function parseViewParam(raw: string | null): CardDetailViewPreference | null {
  if (raw && (CARD_DETAIL_VIEW_OPTIONS as readonly string[]).includes(raw)) {
    return raw as CardDetailViewPreference;
  }
  return null;
}

export function CardDetailView({
  detail,
  isAdmin = false,
}: {
  detail: OracleDetail;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessibility, patchAccessibility } = useSitePreferences();
  const view = parseViewParam(searchParams.get("view")) ?? accessibility.cardDetailView;
  const { oracle, printing } = detail;
  const domains = meaningfulCardDomains(oracle);
  const rulesText = meaningfulRulesText(oracle.text?.plain) ?? null;
  const imageUrl = printingImageUrl(printing, "large");

  const setView = React.useCallback(
    (next: CardDetailViewPreference) => {
      patchAccessibility({ cardDetailView: next });
      const params = new URLSearchParams(searchParams.toString());
      if (next === "detailed") params.delete("view");
      else params.set("view", next);
      router.replace(params.size > 0 ? `?${params.toString()}` : "?", { scroll: false });
    },
    [patchAccessibility, router, searchParams],
  );

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardBreadcrumb detail={detail} />
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            spacing={0}
            variant="outline"
            size="sm"
            className="h-7 rounded-[min(var(--radius-md),12px)]"
            value={view}
            onValueChange={(next) => next && setView(next as CardDetailViewPreference)}
            aria-label="Card page layout"
          >
            <ToggleGroupItem value="detailed" className="h-7 gap-1 rounded-none px-2.5 text-[0.8rem] first:rounded-l-[min(var(--radius-md),12px)] last:rounded-r-[min(var(--radius-md),12px)]">
              <LayoutList data-icon="inline-start" className="size-3.5" /> Detailed
            </ToggleGroupItem>
            <ToggleGroupItem value="simple" className="h-7 gap-1 rounded-none px-2.5 text-[0.8rem] first:rounded-l-[min(var(--radius-md),12px)] last:rounded-r-[min(var(--radius-md),12px)]">
              <Rows2 data-icon="inline-start" className="size-3.5" /> Simple
            </ToggleGroupItem>
          </ToggleGroup>
          {isAdmin ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/cards/${encodeURIComponent(printing.id)}/edit`}>
                <PencilLine aria-hidden="true" /> Edit
              </Link>
            </Button>
          ) : null}
          <ShareButton title={oracle.name} path={cardHref(printing)} />
        </div>
      </div>

      {view === "simple" ? (
        <SimpleCardBody detail={detail} imageUrl={imageUrl} domains={domains} rulesText={rulesText} />
      ) : (
        <DetailedCardBody detail={detail} imageUrl={imageUrl} domains={domains} rulesText={rulesText} />
      )}

      <Separator />
      <ToolsPanel detail={detail} imageUrl={imageUrl} />
      {detail.rulings.length > 0 ? (
        <>
          <Separator />
          <section aria-label={`Notes and rules information for ${oracle.name}`}>
            <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
              Notes &amp; rulings
            </h2>
            <CardRulings rulings={detail.rulings} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function CardBreadcrumb({ detail }: { detail: OracleDetail }) {
  const { oracle, printing } = detail;
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink></BreadcrumbItem>
        {printing.set?.set_code ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/sets/${printing.set.set_code.toLowerCase()}`}>
                  {printing.set.set_name ?? printing.set.set_code}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </>
        ) : null}
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>{oracle.name}</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

interface CardBodyProps {
  detail: OracleDetail;
  imageUrl: string | undefined;
  domains: string[];
  rulesText: string | null;
}

function DetailedCardBody({ detail, imageUrl, domains, rulesText }: CardBodyProps) {
  const { oracle, printing } = detail;
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <CardArt
          imageUrl={imageUrl}
          name={printing.image_alt_text ?? oracle.name}
          isLandscape={cardIsLandscapeOriented(printing)}
        />
      </div>
      <section className="lg:col-span-5" aria-label="Card details">
        <Table>
          <TableBody>
            <DetailRow label="Name">
              <div className="flex items-center justify-between gap-3">
                <h1 className="tk-arpona text-lg font-bold">{oracle.name}</h1>
                <CardStats detail={detail} />
              </div>
            </DetailRow>
            <DetailRow label="Type"><CardTypeLine oracle={oracle} rarity={printing.rarity} badge linked /></DetailRow>
            {domains.length > 0 ? <DetailRow label="Domain"><DomainRunes domains={domains} linked /></DetailRow> : null}
            {oracle.tags.length > 0 ? <DetailRow label="Tags"><CardTags tags={oracle.tags} linked /></DetailRow> : null}
            {rulesText ? <DetailRow label="Ability" alignTop><CardText text={rulesText} rich={oracle.text?.rich} linkKeywords /></DetailRow> : null}
            {oracle.might_bonus != null ? (
              <DetailRow label="Equipped" alignTop>
                <div className="space-y-1.5">
                  <MightStat might={oracle.might_bonus} signed />
                  {oracle.text?.equipment?.trim() ? <CardText text={oracle.text.equipment} linkKeywords /> : null}
                </div>
              </DetailRow>
            ) : null}
            {printing.flavour_text?.trim() ? (
              <DetailRow label="Flavour" alignTop>
                <p className="text-muted-foreground text-sm italic whitespace-pre-line">{printing.flavour_text}</p>
              </DetailRow>
            ) : null}
            {oracle.might != null ? <DetailRow label="Might"><MightStat might={oracle.might} /></DetailRow> : null}
            <DetailRow label="Artist"><ArtistLink artist={printing.artist} /></DetailRow>
            <DetailRow label="Rarity">
              {printing.rarity ? <span className="inline-flex items-center gap-1.5"><RarityIcon rarity={printing.rarity} />{printing.rarity}</span> : "—"}
            </DetailRow>
            <DetailRow label="Set"><SetLink detail={detail} /></DetailRow>
            <DetailRow label="Collector number"><span className="tabular-nums">{printing.collector_label ?? printing.collector_number ?? "—"}</span></DetailRow>
            {detail.legalities.length > 0 ? <DetailRow label="Legality" alignTop><CardLegalityGrid legalities={detail.legalities} className="sm:grid-cols-1" /></DetailRow> : null}
          </TableBody>
        </Table>
      </section>
      <aside className="space-y-6 lg:col-span-4"><RelatedTables detail={detail} /><BuyPanel detail={detail} /></aside>
    </div>
  );
}

function SimpleCardBody({ detail, imageUrl, domains, rulesText }: CardBodyProps) {
  const { oracle, printing } = detail;
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <CardArt imageUrl={imageUrl} name={printing.image_alt_text ?? oracle.name} isLandscape={cardIsLandscapeOriented(printing)} />
      </div>
      <section className="flex min-w-0 flex-col lg:col-span-5" aria-label="Card details">
        <div className="flex items-start justify-between gap-4">
          <h1 className="tk-arpona min-w-0 text-xl font-bold tracking-tight sm:text-2xl">{oracle.name}</h1>
          <CardStats detail={detail} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <CardTypeLine oracle={oracle} rarity={printing.rarity} badge linked />
            {oracle.tags.length > 0 ? <CardTags tags={oracle.tags} linked /> : null}
          </div>
          {domains.length > 0 ? <DomainRunes domains={domains} className="shrink-0" linked /> : null}
        </div>
        {rulesText ? <CardText text={rulesText} rich={oracle.text?.rich} className="text-foreground mt-6 max-w-prose text-[0.95rem] leading-relaxed" linkKeywords /> : null}
        {oracle.might_bonus != null ? (
          <div className="border-border/60 mt-6 max-w-prose border-l-2 pl-4">
            <h2 className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wider uppercase">Equipped unit</h2>
            <MightStat might={oracle.might_bonus} signed />
            {oracle.text?.equipment?.trim() ? <CardText text={oracle.text.equipment} className="text-foreground mt-1.5 text-[0.95rem] leading-relaxed" linkKeywords /> : null}
          </div>
        ) : null}
        {oracle.might != null ? <div className="mt-4 flex justify-end"><MightStat might={oracle.might} /></div> : null}
        {printing.flavour_text?.trim() ? <p className="text-muted-foreground mt-6 max-w-prose text-sm italic whitespace-pre-line">{printing.flavour_text}</p> : null}
        {detail.legalities.length > 0 ? (
          <div className="mt-8">
            <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">Legality</h2>
            <CardLegalityGrid legalities={detail.legalities} />
          </div>
        ) : null}
      </section>
      <aside className="space-y-6 lg:col-span-4"><RelatedTables detail={detail} /><BuyPanel detail={detail} /></aside>
    </div>
  );
}

function CardStats({ detail }: { detail: OracleDetail }) {
  const { oracle } = detail;
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      {oracle.energy != null ? <EnergyCost energy={oracle.energy} oracle={oracle} /> : null}
      {oracle.power != null ? <PowerStat power={oracle.power} /> : null}
    </span>
  );
}

function DetailRow({ label, alignTop = false, children }: { label: string; alignTop?: boolean; children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className={`text-muted-foreground w-1/3 font-semibold ${alignTop ? "align-top" : ""}`}>{label}</TableCell>
      <TableCell className={`min-w-0 whitespace-normal wrap-break-word ${alignTop ? "align-top" : ""}`}>{children}</TableCell>
    </TableRow>
  );
}

function ArtistLink({ artist }: { artist?: string }) {
  if (!artist) return <>—</>;
  return (
    <Link href={searchHref(artistSearchQuery(artist))} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
      <span className="icon-artist" aria-hidden="true" />{artist}
    </Link>
  );
}

function SetLink({ detail }: { detail: OracleDetail }) {
  const set = detail.printing.set;
  if (!set?.set_code) return <>—</>;
  return (
    <Link href={`/sets/${set.set_code.toLowerCase()}`} className="hover:text-primary underline-offset-4 hover:underline">
      <span className="uppercase">{set.set_code}</span>{set.set_name ? ` · ${set.set_name}` : null}
    </Link>
  );
}

function RelatedTables({ detail }: { detail: OracleDetail }) {
  const { oracle, printing } = detail;
  return (
    <div className="space-y-6">
      <CardPrintingsTable rows={detail.printings} oracleName={oracle.name} currentPrintingId={printing.id} showPrices />
      {detail.tokens.length > 0 ? <OracleReferencesTable rows={detail.tokens} label="Tokens made" caption={`Tokens made by ${oracle.name}`} /> : null}
      {detail.used_by.length > 0 ? <OracleReferencesTable rows={detail.used_by} label="Used by" caption={`Cards that use ${oracle.name}`} /> : null}
      {detail.characters.length > 0 ? <OracleReferencesTable rows={detail.characters} label="Related characters" caption={`Characters linked to ${oracle.name}`} /> : null}
      {detail.signatures.length > 0 ? <OracleReferencesTable rows={detail.signatures} label="Signature cards" caption={`Signature cards linked to ${oracle.name}`} /> : null}
    </div>
  );
}

function BuyPanel({ detail }: { detail: OracleDetail }) {
  const { printing } = detail;
  const markets = [
    { name: "TCGPlayer", logoSrc: "/icons/markets/tcgplayer.png", url: detail.purchase.tcgplayer, price: formatUsd(tcgplayerUsdPrice(printing.prices?.tcgplayer)) },
    { name: "Cardmarket", logoSrc: "/icons/markets/cardmarket.png", url: detail.purchase.cardmarket, price: formatEur(printing.prices?.cardmarket?.normal) },
  ].filter((market) => market.url);
  if (markets.length === 0) return null;
  return (
    <section>
      <h2 className="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">Buy</h2>
      <div className="flex flex-col gap-2">
        {markets.map((market) => (
          <Button key={market.name} variant="outline" size="sm" className="h-9 w-full justify-between gap-3 px-3" asChild>
            <a href={market.url} target="_blank" rel="noreferrer nofollow">
              <span className="inline-flex min-w-0 items-center gap-2"><img src={market.logoSrc} alt="" width={16} height={16} className="size-4 shrink-0" />{market.name}</span>
              <span className="inline-flex shrink-0 items-center gap-2"><span className="text-muted-foreground tabular-nums">{market.price}</span><ExternalLinkIcon className="size-3.5" /></span>
            </a>
          </Button>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">Prices are provided for reference and may be out of date. Purchases through these links may earn Riftseer a commission.</p>
    </section>
  );
}

function ToolsPanel({ detail, imageUrl }: { detail: OracleDetail; imageUrl: string | undefined }) {
  const { oracle, printing } = detail;
  const downloadUrl = printingImageDownloadUrl(printing) ?? imageUrl;
  return (
    <section aria-label="Images and data">
      <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">Images &amp; data</h2>
      <div className="flex flex-wrap items-center gap-2">
        {downloadUrl ? <Button variant="outline" size="sm" asChild><a href={downloadUrl} target="_blank" rel="noreferrer" download><DownloadIcon />Download image</a></Button> : null}
        <CopyButton url={cardExportUrls.text(oracle.id)} label="Copy card text" variant="outline" />
        <CopyButton url={cardExportUrls.json(oracle.id)} label="Copy card JSON" variant="outline" />
        <Button variant="ghost" size="sm" asChild><a href={reportCardIssueUrl(oracle, printing)} target="_blank" rel="noreferrer nofollow"><FlagIcon />Report card issue</a></Button>
      </div>
    </section>
  );
}
