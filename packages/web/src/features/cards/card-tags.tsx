"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { styleForKeyword } from "@riftseer/types/keywords";

import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";
import { searchHref, tagSearchQuery } from "@/features/cards/search-links";

/**
 * Classification tags as keyword rhombuses, or `[Tag]` when text-over-symbols
 * is on.
 *
 * `linked` is opt-in rather than the default because most callers render these
 * inside an already-clickable row or grid tile, where a nested link would
 * swallow the row's own navigation.
 */
export function CardTags({
  tags,
  linked = false,
}: {
  tags: string[];
  /** Link each tag to a `tag:` search. Card detail only. */
  linked?: boolean;
}) {
  const { accessibility } = useSitePreferences();

  if (accessibility.preferTextOverSymbols) {
    if (!linked) return <span className="font-medium">{tags.join(", ")}</span>;
    return (
      <span className="font-medium">
        {tags.map((tag, index) => (
          <span key={tag}>
            {index > 0 && ", "}
            <Link
              href={searchHref(tagSearchQuery(tag))}
              className="underline-offset-4 hover:underline"
            >
              {tag}
            </Link>
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tags.map((tag) => {
        const style = styleForKeyword(tag);
        const badge = (
          <span
            className="card-keyword !mx-0"
            style={
              {
                "--keyword-bg": style.background,
                "--keyword-fg": style.color,
              } as CSSProperties
            }
          >
            <span className="card-keyword-label">{tag}</span>
          </span>
        );

        if (!linked) return <span key={tag}>{badge}</span>;

        return (
          <Link
            key={tag}
            href={searchHref(tagSearchQuery(tag))}
            aria-label={`Search for ${tag} cards`}
            title={`Search for ${tag} cards`}
            className="inline-flex rounded-sm transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {badge}
          </Link>
        );
      })}
    </span>
  );
}
