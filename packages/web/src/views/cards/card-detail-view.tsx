"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { CardDetail } from "@riftseer/types";
import {
  DownloadIcon,
  ExternalLinkIcon,
  FlagIcon,
  LayoutList,
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
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
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
import { CardPrintingsTable } from "@/features/cards/card-printings-table";
import { CardTags } from "@/features/cards/card-tags";
import { CardText } from "@/features/cards/card-text";
import { CopyButton } from "@/features/cards/copy-button";
import {
  cardIsLandscapeOriented,
  formatEur,
  formatUsd,
  meaningfulCardDomains,
  meaningfulRulesText,
} from "@/features/cards/format";
import { cardHref } from "@/features/cards/paths";
import { reportCardIssueUrl } from "@/features/cards/report-issue";
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

export function CardDetailView({ detail }: { detail: CardDetail }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessibility, patchAccessibility } = useSitePreferences();
  const view =
    parseViewParam(searchParams.get("view")) ?? accessibility.cardDetailView;

  const setView = React.useCallback(
    (next: CardDetailViewPreference) => {
      patchAccessibility({ cardDetailView: next });
      const p = new URLSearchParams(searchParams.toString());
      if (next === "detailed") p.delete("view");
      else p.set("view", next);
      const qs = p.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [patchAccessibility, router, searchParams],
  );

  const { card } = detail;
  const domains = meaningfulCardDomains(card);
  const tags = card.classification?.tags ?? [];
  const rulesText = meaningfulRulesText(card.text?.plain) ?? null;
  const imageUrl =
    card.media?.media_urls?.large ??
    card.media?.media_urls?.normal ??
    card.media?.media_urls?.png ??
    card.media?.media_urls?.small;
  const isGear = card.classification?.type?.toLowerCase() === "gear";

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {card.set?.set_code ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href={`/sets/${card.set.set_code.toLowerCase()}`}>
                      {card.set.set_name ?? card.set.set_code}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            ) : null}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{card.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            spacing={0}
            variant="outline"
            size="sm"
            className="h-7 rounded-[min(var(--radius-md),12px)]"
            value={view}
            onValueChange={(v: string) => {
              if (!v) return;
              setView(v as CardDetailViewPreference);
            }}
            aria-label="Card page layout"
          >
            <ToggleGroupItem
              value="detailed"
              className="h-7 gap-1 rounded-none px-2.5 text-[0.8rem] first:rounded-l-[min(var(--radius-md),12px)] last:rounded-r-[min(var(--radius-md),12px)]"
            >
              <LayoutList data-icon="inline-start" className="size-3.5" />
              Detailed
            </ToggleGroupItem>
            <ToggleGroupItem
              value="simple"
              className="h-7 gap-1 rounded-none px-2.5 text-[0.8rem] first:rounded-l-[min(var(--radius-md),12px)] last:rounded-r-[min(var(--radius-md),12px)]"
            >
              <Rows2 data-icon="inline-start" className="size-3.5" />
              Simple
            </ToggleGroupItem>
          </ToggleGroup>
          <ShareButton title={card.name} path={cardHref(card)} />
        </div>
      </div>

      {view === "simple" ? (
        <SimpleCardBody
          detail={detail}
          imageUrl={imageUrl}
          domains={domains}
          tags={tags}
          rulesText={rulesText}
          isGear={isGear}
        />
      ) : (
        <DetailedCardBody
          detail={detail}
          imageUrl={imageUrl}
          domains={domains}
          tags={tags}
          rulesText={rulesText}
          isGear={isGear}
        />
      )}

      <Separator />

      <ToolsPanel detail={detail} imageUrl={imageUrl} />
    </div>
  );
}

// ─── Detailed (3-column) ──────────────────────────────────────────────────────

function DetailedCardBody({
  detail,
  imageUrl,
  domains,
  tags,
  rulesText,
  isGear,
}: {
  detail: CardDetail;
  imageUrl: string | undefined;
  domains: string[];
  tags: string[];
  rulesText: string | null;
  isGear: boolean;
}) {
  const { card } = detail;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <CardArt
          imageUrl={imageUrl}
          name={card.media?.accessibility_text ?? card.name}
          isLandscape={cardIsLandscapeOriented(card)}
        />
      </div>

      <section className="lg:col-span-5" aria-label="Card details">
        <Table>
          <TableBody>
            <DetailRow label="Name">
              <div className="flex items-center justify-between gap-3">
                <h1 className="tk-arpona text-lg font-bold">{card.name}</h1>
                <span className="inline-flex shrink-0 items-center gap-2">
                  {card.attributes?.energy != null ? (
                    <EnergyCost
                      energy={card.attributes.energy}
                      isGear={isGear}
                    />
                  ) : null}
                  {card.attributes?.power != null ? (
                    <PowerStat power={card.attributes.power} />
                  ) : null}
                </span>
              </div>
            </DetailRow>

            <DetailRow label="Type">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <CardTypeLine card={card} badge />
              </span>
            </DetailRow>

            {domains.length > 0 ? (
              <DetailRow label="Domain">
                <DomainRunes domains={domains} />
              </DetailRow>
            ) : null}

            {tags.length > 0 ? (
              <DetailRow label="Tags">
                <CardTags tags={tags} />
              </DetailRow>
            ) : null}

            {rulesText ? (
              <DetailRow label="Ability" alignTop>
                <CardText text={rulesText} />
              </DetailRow>
            ) : null}

            {card.text?.flavour?.trim() ? (
              <DetailRow label="Flavour" alignTop>
                <p className="text-muted-foreground text-sm italic">
                  {card.text.flavour}
                </p>
              </DetailRow>
            ) : null}

            {card.attributes?.might != null ? (
              <DetailRow label="Might">
                <MightStat might={card.attributes.might} />
              </DetailRow>
            ) : null}

            <DetailRow label="Artist">
              {card.artist ? (
                <span className="inline-flex items-center gap-1">
                  <span className="icon-artist" aria-hidden="true" />
                  {card.artist}
                </span>
              ) : (
                "—"
              )}
            </DetailRow>

            <DetailRow label="Rarity">
              {card.classification?.rarity ? (
                <span className="inline-flex items-center gap-1.5">
                  <RarityIcon rarity={card.classification.rarity} />
                  {card.classification.rarity}
                </span>
              ) : (
                "—"
              )}
            </DetailRow>

            <DetailRow label="Set">
              {card.set?.set_code ? (
                <Link
                  href={`/sets/${card.set.set_code.toLowerCase()}`}
                  className="hover:text-primary underline-offset-4 hover:underline"
                >
                  <span className="uppercase">{card.set.set_code}</span>
                  {card.set.set_name ? ` · ${card.set.set_name}` : null}
                </Link>
              ) : (
                "—"
              )}
            </DetailRow>

            <DetailRow label="Collector number">
              <span className="tabular-nums">
                {detail.printings.find((p) => p.is_current)?.collector_label ??
                  card.collector_number ??
                  "—"}
              </span>
            </DetailRow>
          </TableBody>
        </Table>
      </section>

      <div className="space-y-6 lg:col-span-4">
        <RelatedTables detail={detail} />
        <BuyPanel detail={detail} />
      </div>
    </div>
  );
}

// ─── Simple (MTG-style text block) ────────────────────────────────────────────

function SimpleCardBody({
  detail,
  imageUrl,
  domains,
  tags,
  rulesText,
  isGear,
}: {
  detail: CardDetail;
  imageUrl: string | undefined;
  domains: string[];
  tags: string[];
  rulesText: string | null;
  isGear: boolean;
}) {
  const { card } = detail;
  const { accessibility } = useSitePreferences();
  const preferText = accessibility.preferTextOverSymbols;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <CardArt
          imageUrl={imageUrl}
          name={card.media?.accessibility_text ?? card.name}
          isLandscape={cardIsLandscapeOriented(card)}
        />
      </div>

      <section
        className="flex min-w-0 flex-col lg:col-span-5"
        aria-label="Card details"
      >
        {/* Name + energy/power — same row, costs flush right */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="tk-arpona min-w-0 text-xl font-bold tracking-tight sm:text-2xl">
            {card.name}
          </h1>
          <span className="inline-flex shrink-0 items-center gap-2 pt-0.5">
            {card.attributes?.energy != null ? (
              <EnergyCost energy={card.attributes.energy} isGear={isGear} />
            ) : null}
            {card.attributes?.power != null ? (
              <PowerStat power={card.attributes.power} />
            ) : null}
          </span>
        </div>

        {/* Type + tags; domain sits opposite as the "color" signal */}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div
            className={`inline-flex min-w-0 flex-wrap items-center text-sm ${
              preferText ? "gap-x-0" : "gap-x-2 gap-y-1"
            }`}
          >
            <CardTypeLine card={card} badge />
            {tags.length > 0 ? (
              <>
                {preferText ? (
                  <span className="text-muted-foreground px-1.5" aria-hidden="true">
                    ·
                  </span>
                ) : null}
                <CardTags tags={tags} />
              </>
            ) : null}
          </div>
          {domains.length > 0 ? (
            <DomainRunes domains={domains} className="shrink-0" />
          ) : null}
        </div>

        {/* Rules text — breathing room like Scryfall's oracle block */}
        {rulesText ? (
          <CardText
            text={rulesText}
            className="text-foreground mt-6 max-w-prose text-[0.95rem] leading-relaxed"
          />
        ) : null}

        {/* Might sits where P/T would on an MTG card */}
        {card.attributes?.might != null ? (
          <div className="mt-4 flex justify-end">
            <MightStat might={card.attributes.might} />
          </div>
        ) : null}

        {card.text?.flavour?.trim() ? (
          <p className="text-muted-foreground mt-6 max-w-prose text-sm italic">
            {card.text.flavour}
          </p>
        ) : null}
      </section>

      <div className="space-y-6 lg:col-span-4">
        <RelatedTables detail={detail} />
        <BuyPanel detail={detail} />
      </div>
    </div>
  );
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

function DetailRow({
  label,
  alignTop = false,
  children,
}: {
  label: string;
  alignTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        className={`text-muted-foreground w-1/3 font-semibold ${alignTop ? "align-top" : ""}`}
      >
        {label}
      </TableCell>
      <TableCell
        className={`min-w-0 whitespace-normal wrap-break-word ${alignTop ? "align-top" : ""}`}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

function RelatedSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RelatedTables({ detail }: { detail: CardDetail }) {
  const { card } = detail;

  return (
    <div className="space-y-6">
      {detail.printings.length > 0 ? (
        <CardPrintingsTable
          rows={detail.printings}
          label="Prints"
          showRarity
          showPrices
          caption={`All printings of ${card.name}`}
        />
      ) : null}

      {detail.tokens.length > 0 ? (
        <CardPrintingsTable
          rows={detail.tokens}
          label="Tokens used"
          showName
          caption={`Tokens used by ${card.name}`}
        />
      ) : null}

      {detail.used_by.length > 0 ? (
        <CardPrintingsTable
          rows={detail.used_by}
          label="Used by"
          showName
          caption={`Cards that use ${card.name}`}
        />
      ) : null}

      {detail.champions.length > 0 ? (
        <CardPrintingsTable
          rows={detail.champions}
          label="Champions"
          showName
          caption={`Champions linked to ${card.name}`}
        />
      ) : null}

      {detail.legends.length > 0 ? (
        <CardPrintingsTable
          rows={detail.legends}
          label="Legends"
          showName
          caption={`Legends linked to ${card.name}`}
        />
      ) : null}

      {detail.signatures.length > 0 ? (
        <CardPrintingsTable
          rows={detail.signatures}
          label="Signature cards"
          showName
          caption={`Signature cards linked to ${card.name}`}
        />
      ) : null}
    </div>
  );
}

function BuyPanel({ detail }: { detail: CardDetail }) {
  const current = detail.printings.find((p) => p.is_current);
  const markets: Array<{
    name: string;
    logoSrc: string;
    url: string | undefined;
    price: string;
  }> = [
    {
      name: "TCGPlayer",
      logoSrc: "/icons/markets/tcgplayer.png",
      url: detail.purchase.tcgplayer,
      price: formatUsd(current?.prices?.tcgplayer?.normal),
    },
    {
      name: "Cardmarket",
      logoSrc: "/icons/markets/cardmarket.png",
      url: detail.purchase.cardmarket,
      price: formatEur(current?.prices?.cardmarket?.normal),
    },
  ];

  const available = markets.filter((market) => market.url);

  if (available.length === 0) return null;

  return (
    <RelatedSection title="Buy">
      <div className="flex flex-col gap-2">
        {available.map((market) => (
          <Button
            key={market.name}
            variant="outline"
            size="sm"
            className="h-9 w-full justify-between gap-3 px-3"
            asChild
          >
            <a href={market.url} target="_blank" rel="noreferrer nofollow">
              <span className="inline-flex min-w-0 items-center gap-2">
                <img
                  src={market.logoSrc}
                  alt=""
                  width={16}
                  height={16}
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">{market.name}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-2">
                <span className="text-muted-foreground tabular-nums">
                  {market.price}
                </span>
                <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
              </span>
            </a>
          </Button>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Prices are provided for reference and may be out of date. Purchases through
        these links may earn Riftseer a commission.
      </p>
    </RelatedSection>
  );
}

function ToolsPanel({
  detail,
  imageUrl,
}: {
  detail: CardDetail;
  imageUrl: string | undefined;
}) {
  const { card } = detail;
  const downloadUrl = card.media?.media_urls?.png ?? imageUrl;

  return (
    <section aria-label="Images and data">
      <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
        Images &amp; data
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        {downloadUrl ? (
          <Button variant="outline" size="sm" asChild>
            <a href={downloadUrl} target="_blank" rel="noreferrer" download>
              <DownloadIcon aria-hidden="true" />
              Download image
            </a>
          </Button>
        ) : null}
        <CopyButton
          url={cardExportUrls.text(card.id)}
          label="Copy card text"
          variant="outline"
        />
        <CopyButton
          url={cardExportUrls.json(card.id)}
          label="Copy card JSON"
          variant="outline"
        />
        <Button variant="ghost" size="sm" asChild>
          <a
            href={reportCardIssueUrl(card)}
            target="_blank"
            rel="noreferrer nofollow"
          >
            <FlagIcon aria-hidden="true" />
            Report card issue
          </a>
        </Button>
      </div>
    </section>
  );
}
