"use client";

import type { CSSProperties } from "react";
import { styleForKeyword } from "@riftseer/types/keywords";

import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";

/** Classification tags as keyword rhombuses, or `[Tag]` when text-over-symbols is on. */
export function CardTags({ tags }: { tags: string[] }) {
  const { accessibility } = useSitePreferences();

  if (accessibility.preferTextOverSymbols) {
    return <span className="font-medium">{tags.join(", ")}</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tags.map((tag) => {
        const style = styleForKeyword(tag);
        return (
          <span
            key={tag}
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
      })}
    </span>
  );
}
