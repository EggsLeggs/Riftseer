import {
  Action,
  ActionPanel,
  Color,
  Grid,
  Image,
  List,
  getPreferenceValues,
  showToast,
  Toast,
} from "@raycast/api";
import { useFetch, useLocalStorage } from "@raycast/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import Jimp from "jimp";
import { CardDetail, formatTypeLine } from "./components/CardDetail";
import { parseMaxRecentHistory, useRecentCardHistory } from "./recentHistory";
import type { Card } from "@riftseer/types";
import type { CardsSearchResponse } from "./types";

// Cache rotated images by URL to avoid re-processing on re-render
const rotatedImageCache = new Map<string, string>();
const rotatedImageInflight = new Map<string, Promise<string>>();

async function rotateImageCW90(url: string): Promise<string> {
  const cached = rotatedImageCache.get(url);
  if (cached !== undefined) return cached;

  const inflight = rotatedImageInflight.get(url);
  if (inflight) return inflight;

  const promise = (async (): Promise<string> => {
    try {
      const image = await Jimp.read(url);
      image.rotate(-90); // jimp rotate is CCW; -90 = CW 90°
      const dataUrl = await image.getBase64Async(Jimp.MIME_JPEG);
      rotatedImageCache.set(url, dataUrl);
      return dataUrl;
    } catch {
      return url;
    } finally {
      rotatedImageInflight.delete(url);
    }
  })();

  rotatedImageInflight.set(url, promise);
  return promise;
}

type ViewType = "list" | "3" | "5" | "6";

const SELECTION_DEBOUNCE_MS = 750;

const VIEW_OPTIONS: { value: ViewType; title: string }[] = [
  { value: "list", title: "List" },
  { value: "3", title: "3 Columns" },
  { value: "5", title: "5 Columns" },
  { value: "6", title: "6 Columns" },
];

const TYPE_ICONS: Record<string, string> = {
  unit: "icons/types/unit.png",
  champion: "icons/types/champion.png",
  legend: "icons/types/legend.png",
  spell: "icons/types/spell.png",
  gear: "icons/types/gear.png",
  battlefield: "icons/types/battlefield.png",
  rune: "icons/types/rune.png",
};

type SearchApiError = {
  error: string;
  code: string;
};

function isSearchApiError(value: unknown): value is SearchApiError {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.error === "string" && typeof candidate.code === "string"
  );
}

function parseErrorInfo(err: unknown): { message: string; code?: string } {
  if (!err || typeof err !== "object") return { message: String(err) };
  const candidate = err as Record<string, unknown>;
  const message =
    typeof candidate.message === "string" ? candidate.message : String(err);
  const code = typeof candidate.code === "string" ? candidate.code : undefined;
  return { message, code };
}

function cardTypeIcon(card: Card): Image.ImageLike | undefined {
  const tl = card.classification?.type?.toLowerCase();
  const st = card.classification?.supertype?.toLowerCase();
  const key =
    st === "token" || st === "basic"
      ? tl === "token"
        ? "unit"
        : tl
      : (tl ?? st);
  const src = key ? TYPE_ICONS[key] : undefined;
  return src ? { source: src, tintColor: Color.PrimaryText } : undefined;
}

function cardAccessory(card: Card): List.Item.Accessory | null {
  const icon = cardTypeIcon(card);
  if (icon) return { icon };
  return null;
}

function cardSiteUrl(card: Card, siteBaseUrl: string): string {
  return (
    card.riftseer_uri ??
    `${siteBaseUrl.replace(/\/$/, "")}/card/${card.id}`
  );
}

function cardActions(
  card: Card,
  siteBaseUrl: string,
  onViewCard: (c: Card) => void,
) {
  const siteUrl = cardSiteUrl(card, siteBaseUrl);
  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action.Push
          title="View Card"
          target={
            <CardDetail
              card={card}
              siteBaseUrl={siteBaseUrl}
              onView={onViewCard}
            />
          }
        />
        <Action.OpenInBrowser title="Open on Riftseer" url={siteUrl} />
        <Action.CopyToClipboard
          title="Copy Card Name"
          content={card.name}
          shortcut={{ modifiers: ["cmd"], key: "c" }}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

function CardSidebarDetail({
  card,
  siteBaseUrl,
}: {
  card: Card;
  siteBaseUrl: string;
}) {
  const siteUrl = cardSiteUrl(card, siteBaseUrl);
  const isLandscape = card.media?.orientation === "landscape";
  const imgUrl =
    card.media?.media_urls?.small ?? card.media?.media_urls?.normal;
  const altText = card.media?.accessibility_text ?? card.name;

  const [displayUrl, setDisplayUrl] = useState<string | null>(
    isLandscape ? null : (imgUrl ?? null),
  );

  useEffect(() => {
    if (isLandscape && imgUrl) {
      rotateImageCW90(imgUrl)
        .then(setDisplayUrl)
        .catch(() => setDisplayUrl(imgUrl ?? null));
    } else {
      setDisplayUrl(imgUrl ?? null);
    }
  }, [imgUrl, isLandscape]);

  const typeLine = formatTypeLine(
    card.classification?.type,
    card.classification?.supertype,
  );

  return (
    <List.Item.Detail
      markdown={
        displayUrl ? `![${altText.replace(/\n/g, " ")}](${displayUrl})` : ""
      }
      metadata={
        <List.Item.Detail.Metadata>
          {typeLine && (
            <List.Item.Detail.Metadata.Label title="Type" text={typeLine} />
          )}
          {card.classification?.rarity && (
            <List.Item.Detail.Metadata.Label
              title="Rarity"
              text={card.classification.rarity}
            />
          )}
          {card.set && (
            <List.Item.Detail.Metadata.Label
              title="Set"
              text={`${card.set.set_name}${card.collector_number ? ` #${card.collector_number}` : ""}`}
            />
          )}
          {card.attributes?.energy != null && (
            <List.Item.Detail.Metadata.Label
              title="Energy"
              text={String(card.attributes.energy)}
            />
          )}
          {card.attributes?.power != null && (
            <List.Item.Detail.Metadata.Label
              title="Power"
              text={String(card.attributes.power)}
            />
          )}
          {card.attributes?.might != null && (
            <List.Item.Detail.Metadata.Label
              title="Might"
              text={String(card.attributes.might)}
            />
          )}
          {card.classification?.domains?.length ? (
            <List.Item.Detail.Metadata.TagList title="Domains">
              {card.classification.domains.map((d) => (
                <List.Item.Detail.Metadata.TagList.Item key={d} text={d} />
              ))}
            </List.Item.Detail.Metadata.TagList>
          ) : null}
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Link
            title="Riftseer"
            target={siteUrl}
            text="Open in Riftseer"
          />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

// 1×1 transparent PNG — used as a blank placeholder while a landscape image is being rotated
const TRANSPARENT =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

function GridCardItem({
  card,
  siteBaseUrl,
  onViewCard,
}: {
  card: Card;
  siteBaseUrl: string;
  onViewCard: (c: Card) => void;
}) {
  const isLandscape = card.media?.orientation === "landscape";
  const imgUrl = card.media?.media_urls?.normal;
  const [displayUrl, setDisplayUrl] = useState<string>(
    isLandscape ? TRANSPARENT : (imgUrl ?? TRANSPARENT),
  );

  useEffect(() => {
    if (isLandscape && imgUrl) {
      rotateImageCW90(imgUrl)
        .then(setDisplayUrl)
        .catch(() => setDisplayUrl(imgUrl));
    } else {
      setDisplayUrl(imgUrl ?? TRANSPARENT);
    }
  }, [imgUrl, isLandscape]);

  return (
    <Grid.Item
      id={card.id}
      content={{ source: displayUrl }}
      title={card.name}
      subtitle={card.set?.set_name}
      actions={cardActions(card, siteBaseUrl, onViewCard)}
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
    <List.Dropdown
      tooltip="View"
      value={viewType}
      onChange={(v) => onChange(v as ViewType)}
    >
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
    <Grid.Dropdown
      tooltip="View"
      value={viewType}
      onChange={(v) => onChange(v as ViewType)}
    >
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
  const maxRecent = parseMaxRecentHistory(prefs.maxRecentHistory);

  const [query, setQuery] = useState("");
  const { value: savedView, setValue: saveView } = useLocalStorage<ViewType>(
    "search-view-type",
    "list",
  );
  const viewType: ViewType = savedView ?? "list";

  const { recentCards, recordVisit, isLoadingHistory } =
    useRecentCardHistory(maxRecent);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const displayCardsRef = useRef<Card[]>([]);

  const scheduleRecordSelection = useCallback(
    (id: string | null) => {
      if (maxRecent <= 0 || id == null) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const card = displayCardsRef.current.find((c) => c.id === id);
        if (card) recordVisit(card);
      }, SELECTION_DEBOUNCE_MS);
    },
    [maxRecent, recordVisit],
  );

  function handleViewChange(v: ViewType) {
    saveView(v);
  }

  const hasQuery = query.trim().length > 0;
  const trimmedQuery = query.trim();
  const [queryErrorMessage, setQueryErrorMessage] = useState<string | null>(
    null,
  );
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(
    null,
  );
  const searchPath = hasQuery
    ? `${api}/api/v1/cards?q=${encodeURIComponent(trimmedQuery)}&fuzzy=true&limit=20`
    : "";

  const { data, isLoading, error } = useFetch<CardsSearchResponse>(
    searchPath,
    {
      execute: hasQuery,
      parseResponse: async (response) => {
        const body = (await response.json()) as
          | CardsSearchResponse
          | SearchApiError;
        if (response.ok) return body as CardsSearchResponse;
        if (isSearchApiError(body)) {
          const apiErr = new Error(body.error) as Error & { code?: string };
          apiErr.code = body.code;
          throw apiErr;
        }
        throw new Error(`Request failed (${response.status})`);
      },
      onError: (err) => {
        const { message, code } = parseErrorInfo(err);
        if (code === "BAD_QUERY") {
          setQueryErrorMessage(message);
          setRequestErrorMessage(null);
          return;
        }
        setQueryErrorMessage(null);
        setRequestErrorMessage(message);
        showToast({
          style: Toast.Style.Failure,
          title: "Search failed",
          message,
        });
      },
    },
  );

  useEffect(() => {
    if (!hasQuery) {
      setQueryErrorMessage(null);
      setRequestErrorMessage(null);
      return;
    }
    if (data) {
      setQueryErrorMessage(null);
      setRequestErrorMessage(null);
    }
  }, [hasQuery, data]);

  const cards = data?.cards ?? [];
  const showRecent = !hasQuery && maxRecent > 0;
  const displayCards = hasQuery ? cards : maxRecent > 0 ? recentCards : [];
  const viewLoading = hasQuery ? isLoading : maxRecent > 0 && isLoadingHistory;

  useEffect(() => {
    displayCardsRef.current = displayCards;
  }, [displayCards]);

  const emptySearchHint = (
    <Grid.EmptyView
      title="Search for a card"
      description="Type a card name to search."
    />
  );
  const emptySearchHintList = (
    <List.EmptyView
      title="Search for a card"
      description="Type a card name to search."
    />
  );

  // ── Grid view ────────────────────────────────────────────────────────────────
  if (viewType !== "list") {
    const columns = parseInt(viewType, 10);
    return (
      <Grid
        columns={columns}
        // Fill scales artwork to the 2:3 grid cell; landscape cards read shorter in the cell
        aspectRatio="2/3"
        fit={Grid.Fit.Fill}
        isLoading={viewLoading}
        searchBarPlaceholder="Search Riftbound cards…"
        onSearchTextChange={setQuery}
        throttle
        onSelectionChange={scheduleRecordSelection}
        searchBarAccessory={
          <ViewDropdownGrid viewType={viewType} onChange={handleViewChange} />
        }
      >
        {!hasQuery &&
          !viewLoading &&
          displayCards.length === 0 &&
          emptySearchHint}
        {hasQuery && !isLoading && cards.length === 0 && !error && (
          <Grid.EmptyView
            title="No cards found"
            description={`No results for "${trimmedQuery}".`}
          />
        )}
        {hasQuery && !isLoading && queryErrorMessage && (
          <Grid.EmptyView
            title="Invalid search syntax"
            description={queryErrorMessage}
          />
        )}
        {hasQuery && !isLoading && !queryErrorMessage && requestErrorMessage && (
          <Grid.EmptyView
            title="Search failed"
            description={requestErrorMessage}
          />
        )}
        {showRecent && displayCards.length > 0 ? (
          <Grid.Section title="Recent">
            {displayCards.map((card) => (
              <GridCardItem
                key={card.id}
                card={card}
                siteBaseUrl={site}
                onViewCard={recordVisit}
              />
            ))}
          </Grid.Section>
        ) : (
          displayCards.map((card) => (
            <GridCardItem
              key={card.id}
              card={card}
              siteBaseUrl={site}
              onViewCard={recordVisit}
            />
          ))
        )}
      </Grid>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <List
      isLoading={viewLoading}
      isShowingDetail
      searchBarPlaceholder="Search Riftbound cards…"
      onSearchTextChange={setQuery}
      throttle
      onSelectionChange={scheduleRecordSelection}
      searchBarAccessory={
        <ViewDropdownList viewType={viewType} onChange={handleViewChange} />
      }
    >
      {!hasQuery &&
        !viewLoading &&
        displayCards.length === 0 &&
        emptySearchHintList}
      {hasQuery && !isLoading && cards.length === 0 && !error && (
        <List.EmptyView
          title="No cards found"
          description={`No results for "${trimmedQuery}".`}
        />
      )}
      {hasQuery && !isLoading && queryErrorMessage && (
        <List.EmptyView
          title="Invalid search syntax"
          description={queryErrorMessage}
        />
      )}
      {hasQuery && !isLoading && !queryErrorMessage && requestErrorMessage && (
        <List.EmptyView
          title="Search failed"
          description={requestErrorMessage}
        />
      )}
      {showRecent && displayCards.length > 0 ? (
        <List.Section title="Recent">
          {displayCards.map((card) => (
            <List.Item
              key={card.id}
              id={card.id}
              title={card.name}
              subtitle={card.set?.set_name}
              accessories={[cardAccessory(card)].filter(
                (a): a is List.Item.Accessory => a !== null,
              )}
              detail={<CardSidebarDetail card={card} siteBaseUrl={site} />}
              actions={cardActions(card, site, recordVisit)}
            />
          ))}
        </List.Section>
      ) : (
        displayCards.map((card) => (
          <List.Item
            key={card.id}
            id={card.id}
            title={card.name}
            subtitle={card.set?.set_name}
            accessories={[cardAccessory(card)].filter(
              (a): a is List.Item.Accessory => a !== null,
            )}
            detail={<CardSidebarDetail card={card} siteBaseUrl={site} />}
            actions={cardActions(card, site, recordVisit)}
          />
        ))
      )}
    </List>
  );
}
