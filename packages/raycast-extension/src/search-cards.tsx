import { Action, ActionPanel, Grid, Icon, List, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { useFetch, useLocalStorage } from "@raycast/utils";
import { useEffect, useState } from "react";
import Jimp from "jimp";
import { CardDetail, formatTypeLine } from "./components/CardDetail";
import type { Card, CardsSearchResponse } from "./types";

// Cache rotated images by URL to avoid re-processing on re-render
const rotatedImageCache = new Map<string, string>();

async function rotateImageCW90(url: string): Promise<string> {
  if (rotatedImageCache.has(url)) return rotatedImageCache.get(url)!;
  const image = await Jimp.read(url);
  image.rotate(-90); // jimp rotate is CCW; -90 = CW 90°
  const dataUrl = await image.getBase64Async(Jimp.MIME_JPEG);
  rotatedImageCache.set(url, dataUrl);
  return dataUrl;
}

interface Preferences {
  apiBaseUrl: string;
  siteBaseUrl: string;
}

type ViewType = "list" | "3" | "5" | "6";

const VIEW_OPTIONS: { value: ViewType; title: string }[] = [
  { value: "list", title: "List" },
  { value: "3", title: "3 Columns" },
  { value: "5", title: "5 Columns" },
  { value: "6", title: "6 Columns" },
];

function cardAccessory(card: Card): List.Item.Accessory {
  const attrs = card.attributes;
  if (attrs?.energy != null) return { text: `⚡ ${attrs.energy}` };
  if (card.classification?.rarity) return { text: card.classification.rarity };
  return {};
}

function cardActions(card: Card, siteBaseUrl: string) {
  const siteUrl = `${siteBaseUrl.replace(/\/$/, "")}/card/${card.id}`;
  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action.Push
          title="View Card"
          target={<CardDetail card={card} siteBaseUrl={siteBaseUrl} />}
        />
        <Action.OpenInBrowser title="Open on RiftSeer" url={siteUrl} />
        <Action.CopyToClipboard
          title="Copy Card Name"
          content={card.name}
          shortcut={{ modifiers: ["cmd"], key: "c" }}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

function CardSidebarDetail({ card, siteBaseUrl }: { card: Card; siteBaseUrl: string }) {
  const siteUrl = `${siteBaseUrl.replace(/\/$/, "")}/card/${card.id}`;
  const isLandscape = card.media?.orientation === "landscape";
  const imgUrl = card.media?.media_urls?.small ?? card.media?.media_urls?.normal;
  const altText = card.media?.accessibility_text ?? card.name;

  const [displayUrl, setDisplayUrl] = useState<string | null>(isLandscape ? null : (imgUrl ?? null));

  useEffect(() => {
    if (isLandscape && imgUrl) {
      rotateImageCW90(imgUrl).then(setDisplayUrl).catch(() => setDisplayUrl(imgUrl ?? null));
    } else {
      setDisplayUrl(imgUrl ?? null);
    }
  }, [imgUrl, isLandscape]);

  return (
    <List.Item.Detail
      markdown={displayUrl ? `![${altText}](${displayUrl})` : ""}
      metadata={
        <List.Item.Detail.Metadata>
          {formatTypeLine(card.classification?.type, card.classification?.supertype) && (
            <List.Item.Detail.Metadata.Label title="Type" text={formatTypeLine(card.classification?.type, card.classification?.supertype)!} />
          )}
          {card.classification?.rarity && (
            <List.Item.Detail.Metadata.Label title="Rarity" text={card.classification.rarity} />
          )}
          {card.set && (
            <List.Item.Detail.Metadata.Label
              title="Set"
              text={`${card.set.set_name}${card.collector_number ? ` #${card.collector_number}` : ""}`}
            />
          )}
          {card.attributes?.energy != null && (
            <List.Item.Detail.Metadata.Label title="Energy" text={String(card.attributes.energy)} />
          )}
          {card.attributes?.power != null && (
            <List.Item.Detail.Metadata.Label title="Power" text={String(card.attributes.power)} />
          )}
          {card.attributes?.might != null && (
            <List.Item.Detail.Metadata.Label title="Might" text={String(card.attributes.might)} />
          )}
          {card.classification?.domains?.length ? (
            <List.Item.Detail.Metadata.TagList title="Domains">
              {card.classification.domains.map((d) => (
                <List.Item.Detail.Metadata.TagList.Item key={d} text={d} />
              ))}
            </List.Item.Detail.Metadata.TagList>
          ) : null}
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Link title="RiftSeer" target={siteUrl} text="Open in RiftSeer" />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

// 1×1 transparent PNG — used as a blank placeholder while a landscape image is being rotated
const TRANSPARENT =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

function GridCardItem({ card, siteBaseUrl }: { card: Card; siteBaseUrl: string }) {
  const isLandscape = card.media?.orientation === "landscape";
  const imgUrl = card.media?.media_urls?.normal;
  const [displayUrl, setDisplayUrl] = useState<string>(isLandscape ? TRANSPARENT : (imgUrl ?? TRANSPARENT));

  useEffect(() => {
    if (isLandscape && imgUrl) {
      rotateImageCW90(imgUrl).then(setDisplayUrl).catch(() => setDisplayUrl(imgUrl));
    } else {
      setDisplayUrl(imgUrl ?? TRANSPARENT);
    }
  }, [imgUrl, isLandscape]);

  return (
    <Grid.Item
      content={{ source: displayUrl }}
      title={card.name}
      subtitle={card.set?.set_name}
      actions={cardActions(card, siteBaseUrl)}
    />
  );
}

function ViewDropdownList({
  viewType,
  onChange,
}: {
  viewType: ViewType;
  onChange: (v: ViewType) => void;
}) {
  return (
    <List.Dropdown tooltip="View" value={viewType} onChange={(v) => onChange(v as ViewType)}>
      {VIEW_OPTIONS.map((o) => (
        <List.Dropdown.Item key={o.value} title={o.title} value={o.value} />
      ))}
    </List.Dropdown>
  );
}

function ViewDropdownGrid({
  viewType,
  onChange,
}: {
  viewType: ViewType;
  onChange: (v: ViewType) => void;
}) {
  return (
    <Grid.Dropdown tooltip="View" value={viewType} onChange={(v) => onChange(v as ViewType)}>
      {VIEW_OPTIONS.map((o) => (
        <Grid.Dropdown.Item key={o.value} title={o.title} value={o.value} />
      ))}
    </Grid.Dropdown>
  );
}

export default function SearchCards() {
  const prefs = getPreferenceValues<Preferences>();
  const api = prefs.apiBaseUrl.replace(/\/$/, "");
  const site = prefs.siteBaseUrl.replace(/\/$/, "");

  const [query, setQuery] = useState("");
  const { value: savedView, setValue: saveView } = useLocalStorage<ViewType>(
    "search-view-type",
    "list",
  );
  const viewType: ViewType = savedView ?? "list";

  function handleViewChange(v: ViewType) {
    saveView(v);
  }

  const { data, isLoading, error } = useFetch<CardsSearchResponse>(
    `${api}/api/v1/cards?name=${encodeURIComponent(query.trim())}&fuzzy=true&limit=20`,
    {
      execute: query.trim().length > 0,
      onError: (err) => {
        showToast({ style: Toast.Style.Failure, title: "Search failed", message: String(err) });
      },
    },
  );

  const cards = data?.cards ?? [];

  // ── Grid view ────────────────────────────────────────────────────────────────
  if (viewType !== "list") {
    const columns = parseInt(viewType, 10);
    return (
      <Grid
        columns={columns}
        // Contain (not Fill) so landscape cards render at their natural proportions
        // without cropping or stretching — landscape cards naturally appear shorter
        aspectRatio="2/3"
        fit={Grid.Fit.Fill}
        isLoading={isLoading}
        searchBarPlaceholder="Search Riftbound cards…"
        onSearchTextChange={setQuery}
        throttle
        searchBarAccessory={
          <ViewDropdownGrid viewType={viewType} onChange={handleViewChange} />
        }
      >
        {!query.trim() && !isLoading && (
          <Grid.EmptyView title="Search for a card" description="Type a card name to search." />
        )}
        {query.trim() && !isLoading && cards.length === 0 && !error && (
          <Grid.EmptyView title="No cards found" description={`No results for "${query}".`} />
        )}
        {cards.map((card) => (
          <GridCardItem key={card.id} card={card} siteBaseUrl={site} />
        ))}
      </Grid>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Search Riftbound cards…"
      onSearchTextChange={setQuery}
      throttle
      searchBarAccessory={
        <ViewDropdownList viewType={viewType} onChange={handleViewChange} />
      }
    >
      {!query.trim() && !isLoading && (
        <List.EmptyView title="Search for a card" description="Type a card name to search." />
      )}
      {query.trim() && !isLoading && cards.length === 0 && !error && (
        <List.EmptyView title="No cards found" description={`No results for "${query}".`} />
      )}
      {cards.map((card) => (
        <List.Item
          key={card.id}
          title={card.name}
          subtitle={card.set?.set_name}
          accessories={[cardAccessory(card)]}
          detail={<CardSidebarDetail card={card} siteBaseUrl={site} />}
          actions={cardActions(card, site)}
        />
      ))}
    </List>
  );
}
