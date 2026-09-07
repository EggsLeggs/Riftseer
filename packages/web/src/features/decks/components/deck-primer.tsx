"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { printingImageUrl, type Oracle, type Printing } from "@riftseer/types";

import { ProfileIcon } from "@/components/profile-icon";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cardsApi, cardsQueryKeys } from "@/features/cards/api";
import { CardArt } from "@/features/cards/card-art";
import { CardTextInline } from "@/features/cards/card-text";
import { cardIsLandscapeOriented } from "@/features/cards/format";
import { cardHref } from "@riftseer/types/render";
import { profileApi, profileQueryKeys } from "@/features/profile/api";
import { parseMentionHref, primerMarkup, type PrimerMention } from "../primer-markup";
import { userDecksHref } from "../paths";

/**
 * The deck's guide: the `primer` field rendered as Markdown, with
 * `[[Card Name]]` as a hoverable card mention, `![[Card Name]]` as an
 * inline card image, `[@handle]` as a profile chip, and the same
 * `:rb_…:` / `[Keyword]` tokens the card page paints.
 *
 * react-markdown never renders raw HTML, so a primer cannot script the page;
 * it is also ~35KB the card list does not need, so it loads only when a primer
 * exists, through `next/dynamic`. Mentioned names resolve in one batch through
 * `POST /cards/resolve` — the bots' contract — and an unresolved name renders
 * as plain text rather than an error: the guide is prose first.
 */

const Markdown = dynamic(() => import("react-markdown"), {
  ssr: false,
  loading: () => <div className="bg-muted h-24 animate-pulse rounded-lg" />,
});

type Resolved = { oracle: Oracle | null; printing: Printing | null };

export function DeckPrimer({ primer }: { primer: string }) {
  const { markdown, mentions } = React.useMemo(() => primerMarkup(primer), [primer]);
  const uniqueRaws = React.useMemo(
    () =>
      [
        ...new Set(
          mentions.flatMap((mention) => (mention.kind === "card" ? [mention.raw] : [])),
        ),
      ].sort(),
    [mentions],
  );

  const resolved = useQuery({
    queryKey: cardsQueryKeys.resolve(uniqueRaws),
    queryFn: () => cardsApi.resolve(uniqueRaws),
    enabled: uniqueRaws.length > 0,
    staleTime: Infinity,
    retry: false,
  });

  const byRaw = React.useMemo(() => {
    const map = new Map<string, Resolved>();
    resolved.data?.forEach((result, index) => {
      const raw = uniqueRaws[index];
      if (raw != null) map.set(raw, result);
    });
    return map;
  }, [resolved.data, uniqueRaws]);

  const components = React.useMemo(
    () => ({
      a: (props: React.ComponentProps<"a">) => {
        const mentionRef = parseMentionHref(props.href);
        const mention = mentionRef != null ? mentions[mentionRef.index] : undefined;
        if (!mention) {
          return (
            <a
              {...props}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4"
            />
          );
        }
        if (mention.kind === "user") return <UserMention handle={mention.handle} />;
        const card = byRaw.get(mention.raw);
        return mention.embed ? (
          <CardEmbed mention={mention} card={card} />
        ) : (
          <CardMention mention={mention} card={card} />
        );
      },
      p: ({ children }: { children?: React.ReactNode }) => (
        <p>{withSymbols(children)}</p>
      ),
      li: ({ children }: { children?: React.ReactNode }) => (
        <li>{withSymbols(children)}</li>
      ),
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1>{withSymbols(children)}</h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2>{withSymbols(children)}</h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3>{withSymbols(children)}</h3>
      ),
    }),
    [byRaw, mentions],
  );

  return (
    // No typography plugin in this project, so the handful of elements a guide
    // actually uses are styled here and nowhere else.
    <div className="max-w-prose text-sm leading-relaxed [&_blockquote]:border-border [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:border-border [&_hr]:my-4 [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:bg-muted [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
      <Markdown components={components}>{markdown}</Markdown>
    </div>
  );
}

function withSymbols(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") return <CardTextInline text={child} />;
    if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.props.children) {
      return React.cloneElement(child, { children: withSymbols(child.props.children) });
    }
    return child;
  });
}

function UserMention({ handle }: { handle: string }) {
  const profile = useQuery({
    queryKey: profileQueryKeys.byHandle(handle),
    queryFn: () => profileApi.getProfile(handle),
    staleTime: 60_000,
    retry: false,
  });
  const username =
    profile.data?.status === "ok" ? profile.data.profile.username : handle;

  return (
    <Link
      href={userDecksHref(handle)}
      className="text-foreground inline-flex items-center gap-1 font-medium hover:underline"
    >
      <ProfileIcon username={username} handle={handle} size="sm" className="size-4 text-[8px]" />
      {username}
    </Link>
  );
}

function CardMention({
  mention,
  card,
}: {
  mention: Extract<PrimerMention, { kind: "card" }>;
  card: Resolved | undefined;
}) {
  const printing = card?.printing;
  if (!printing) {
    return <span title={card ? "No card by this name" : undefined}>{mention.label}</span>;
  }
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Link
          href={cardHref(printing)}
          className="decoration-muted-foreground underline decoration-dotted underline-offset-4"
        >
          {mention.label}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-56 p-2">
        <CardArt
          imageUrl={printingImageUrl(printing, "normal")}
          name={mention.label}
          isLandscape={cardIsLandscapeOriented(printing)}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

function CardEmbed({
  mention,
  card,
}: {
  mention: Extract<PrimerMention, { kind: "card" }>;
  card: Resolved | undefined;
}) {
  const printing = card?.printing;
  if (!printing) {
    return <span title={card ? "No card by this name" : undefined}>{mention.label}</span>;
  }
  return (
    <Link
      href={cardHref(printing)}
      className={
        cardIsLandscapeOriented(printing)
          ? "my-2 block w-full max-w-72"
          : "my-2 block w-full max-w-56"
      }
      title={mention.label}
    >
      <CardArt
        imageUrl={printingImageUrl(printing, "normal")}
        name={mention.label}
        isLandscape={cardIsLandscapeOriented(printing)}
      />
    </Link>
  );
}
