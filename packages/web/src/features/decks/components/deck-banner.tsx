"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { printingImageUrl } from "@riftseer/types";

import { cardsApi, cardsQueryKeys } from "@/features/cards/api";
import { NEUTRAL_DOMAIN_RGB, domainWashRgb } from "@riftseer/types/render";
import { cn } from "@/lib/utils";

/**
 * The deck's identity, over its own card art.
 *
 * The art bleeds in from the right and dissolves into a domain-tinted wash on
 * the left, which is what keeps the title legible without a scrim heavy enough
 * to make the art pointless. The tint is decoration and carries no meaning —
 * every domain the deck actually plays is still named in the statistics panel.
 */

/** What the banner reads off a deck row. Structural, so a fixture also fits. */
export interface BannerCard {
  printing_id: string;
  domains: string[];
  zone: string;
  is_champion?: boolean;
}

/**
 * Every number that decides how the art is framed, in one place rather than
 * scattered through the markup — they are chosen together, by looking, and
 * they only make sense read against each other.
 */
const FRAMING = {
  /** Banner height from `sm` up, in pixels. */
  heightPx: 256,
  /** The masked box, as a percentage of the banner — where the fade sits. */
  boxWidthPct: 52,
  /** The zoom holder, as a percentage of the box. Smaller draws a smaller card. */
  holderWidthPct: 69,
  /** The card, as a percentage of the holder. Above 100 crops its sides. */
  imageWidthPct: 126,
  /** How far the card is pulled left, as a percentage of the holder. */
  imageLeftPct: -18,
  /**
   * How far down the card its subject sits, 0–1.
   *
   * Riftbound art is only ever delivered as the **whole card** — frame, text
   * box and all — so a banner has to crop one rather than ask for an art-only
   * variant. Two facts make a fixed rule work better than it sounds: the frame
   * is a printed template, so the art window is in the same place on every card
   * of a layout; and within it, TCG art composes its subject high.
   *
   * Deliberately expressed against the **card**, not as an `object-position`.
   * Those percentages are relative to how much the image overflows its box, so
   * one value picks a different part of the card as the banner changes height —
   * which is exactly how an earlier version landed on Azir's chest.
   */
  focus: 0.23,
  /**
   * Nothing of the card shows before this point, as a percentage of the box.
   *
   * It has to be a *held* transparent stop, not merely the first one in the
   * ramp: a gradient interpolates from its opening `transparent` toward the
   * next stop from 0% onward, so a mask that only names its low stop is
   * already a few percent opaque well before it — enough to leave the domain
   * rune faintly legible.
   *
   * The rune and the frame ornament down the card's left side are the parts
   * that read as page furniture rather than art. Cropping cannot reach them —
   * they sit inboard of the border — so the mask has to hide them instead.
   */
  fadeStartPct: 30,
  /** Where the card is fully itself, as a percentage of the box. */
  fadeEndPct: 84,
  /**
   * How opaque the ground behind the art is where the art has fully faded out.
   *
   * Alpha does not blend art into a background, it multiplies it toward one —
   * so half-faded art over the near-black card surface simply goes dark, which
   * is what made the left of the subject's face muddy and the transition read
   * as harsher than it is. Giving the art a mid-tone ground of its own domain
   * hue to dissolve into fixes the cause rather than the symptom.
   */
  groundAlpha: 0.72,
  /**
   * Where the bottom-edge fade finishes, as a percentage of the banner height.
   * Without it the art hard-stops against the band's rounded bottom border —
   * the other cut the eye reads as abrupt.
   */
  bottomFadePct: 14,
  /** Where the surface wash starts letting go, as a percentage of the banner. */
  surfaceStartPct: 30,
  /** Where the surface wash reaches transparent, as a percentage of the banner. */
  surfaceEndPct: 68,
  /** Where the domain tint reaches transparent, as a percentage of the banner. */
  tintEndPct: 100,
} as const;

/** Decorative domain washes, in the game's own hues — `DOMAIN_WASH_RGB` in `@riftseer/types/render`. */

/**
 * The art's mask: held at nothing, then eased in.
 *
 * Sampled from a smoothstep rather than written as a few hand-placed stops.
 * Hand-placed stops meet at corners — the slope changes abruptly where one
 * segment ends and the next begins — and the eye reads a corner in a fade as an
 * edge. Smoothstep is flat at both ends, so the fade leaves nothing and arrives
 * at the full image without a seam at either.
 */
function smoothstepRamp(
  startPct: number,
  endPct: number,
  steps: number,
  stop: (alpha: number, positionPct: number) => string,
): string {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const alpha = t * t * (3 - 2 * t);
    return stop(alpha, startPct + (endPct - startPct) * t);
  }).join(", ");
}

function artFade(startPct: number, endPct: number, steps = 16): string {
  const ramp = smoothstepRamp(
    startPct,
    endPct,
    steps,
    (alpha, position) => `rgb(0 0 0 / ${alpha.toFixed(3)}) ${position.toFixed(1)}%`,
  );
  return `linear-gradient(to right, transparent 0%, transparent ${startPct}%, ${ramp})`;
}

const ART_FADE = artFade(FRAMING.fadeStartPct, FRAMING.fadeEndPct);

/**
 * The bottom edge's mask, intersected with the horizontal one so the art also
 * dissolves before it can hit the band's rounded border.
 */
const BOTTOM_FADE = `linear-gradient(to top, ${smoothstepRamp(
  0,
  FRAMING.bottomFadePct,
  8,
  (alpha, position) => `rgb(0 0 0 / ${alpha.toFixed(3)}) ${position.toFixed(1)}%`,
)}, rgb(0 0 0) 100%)`;

/**
 * The surface colour easing off the art, sampled from the same smoothstep as
 * the mask: hand-placed stops meet at corners, and a corner in a fade reads as
 * an edge here exactly as it did on the art. `color-mix` because the surface
 * is a theme token, not a literal colour we could restate with an alpha.
 */
const SURFACE_WASH = `linear-gradient(to right, var(--card) 0%, var(--card) ${
  FRAMING.surfaceStartPct
}%, ${smoothstepRamp(
  FRAMING.surfaceStartPct,
  FRAMING.surfaceEndPct,
  12,
  (alpha, position) =>
    `color-mix(in srgb, var(--card) ${((1 - alpha) * 100).toFixed(1)}%, transparent) ${position.toFixed(1)}%`,
)})`;

/**
 * The card that represents the deck: its legend, then its chosen champion,
 * then whatever is first. The legend is the deck's identity — it is the one
 * card every deck has exactly one of, and the one people name it after.
 *
 * A deck with nothing in it has no art and the banner is the wash alone, which
 * is a fine empty state rather than a broken one.
 */
export function deckBannerCard<T extends BannerCard>(cards: readonly T[]): T | null {
  return (
    cards.find((card) => card.zone === "legend") ??
    cards.find((card) => card.is_champion && card.zone === "main") ??
    cards.find((card) => card.zone === "main") ??
    cards[0] ??
    null
  );
}

export function DeckBanner({
  cards,
  className,
  children,
}: {
  cards: readonly BannerCard[];
  className?: string;
  /** The deck's title block, rendered over the wash. */
  children: React.ReactNode;
}) {
  const card = deckBannerCard(cards);
  const printingId = card?.printing_id;

  const detail = useQuery({
    queryKey: cardsQueryKeys.detail({ printing: printingId ?? "" }),
    queryFn: () => cardsApi.getDetail({ printing: printingId! }),
    enabled: printingId != null,
    staleTime: Infinity,
  });

  // The tint comes from the deck row, which is already loaded, so the banner
  // has its colour on the first frame and only the art arrives late.
  const tints = tintsFor(card);
  const imageUrl = printingImageUrl(detail.data?.printing, "large");

  return (
    <header
      className={cn(
        // A floor rather than a fixed height: the art needs room to read as
        // scenery, but a long description must still be able to grow the band.
        "bg-card relative isolate flex min-h-48 items-end overflow-hidden rounded-xl border sm:min-h-(--banner-h)",
        className,
      )}
      style={{ "--banner-h": `${FRAMING.heightPx}px` } as React.CSSProperties}
    >
      {/* The ground the art dissolves into, beneath everything.
          Not the same layer as the tint below, which sits *over* the art and
          is decoration. This one is only ever seen through half-faded art, and
          exists so that what shows through is a mid-tone in the card's own
          domain rather than the near-black page surface. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20"
        style={{ background: groundWash(tints) }}
      />

      {imageUrl && (
        <div
          aria-hidden="true"
          // This box owns *where the fade is*, and nothing else. Zoom lives on
          // the holder inside it, so the two can be adjusted independently —
          // narrowing this box to zoom out would drag the whole transition
          // rightward with it, and those are not the same knob.
          className="absolute inset-y-0 right-0 -z-10 w-full overflow-hidden sm:w-(--banner-box-w)"
          // The art dissolves rather than being covered. A wash painted over it
          // has to be opaque enough to hide this box's own left edge, and at
          // that opacity it has already flattened the art it was meant to
          // reveal — so the fade belongs to the image, where alpha actually
          // reaches zero and no cut is left to hide.
          style={
            {
              "--banner-box-w": `${FRAMING.boxWidthPct}%`,
              // Two masks, kept only where both keep: the horizontal fade and
              // the bottom edge's. WebKit spells "intersect" as "source-in".
              maskImage: `${ART_FADE}, ${BOTTOM_FADE}`,
              maskComposite: "intersect",
              WebkitMaskImage: `${ART_FADE}, ${BOTTOM_FADE}`,
              WebkitMaskComposite: "source-in",
            } as React.CSSProperties
          }
        >
          {/* The zoom dial. The card is drawn at a multiple of *this* width,
              so shrinking the holder draws a smaller card and fits more of it
              in the band, while the fade above stays exactly where it is. What
              the holder leaves bare on the left is the faintest end of the
              mask, so nothing shows there. */}
          <div
            className="absolute inset-y-0 right-0 w-full sm:w-(--banner-holder-w)"
            style={
              { "--banner-holder-w": `${FRAMING.holderWidthPct}%` } as React.CSSProperties
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              // Wider than the holder and pulled left, so the card's printed
              // border, the rail inside it and its corner ornaments are cropped
              // away. They sit further in than they look, and read as page
              // furniture rather than art when they survive the crop.
              className="absolute top-1/2 max-w-none opacity-90"
              style={{
                width: `${FRAMING.imageWidthPct}%`,
                left: `${FRAMING.imageLeftPct}%`,
                // Its top pinned to the band's middle, then pulled up by a
                // fraction of **its own** height — so the anchor is a property
                // of the card and not of the box it sits in.
                transform: `translateY(-${(FRAMING.focus * 100).toFixed(2)}%)`,
              }}
              decoding="async"
            />
          </div>
        </div>
      )}

      {/* Two washes, in order: the surface colour dissolving the art away to
          the left, then the domain hue over the top of it. Splitting them lets
          the first stay a theme token and the second stay a fixed hue. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        // Stops well before the art does. With the image masked there is no
        // edge left for this to hide, so reaching further would only be
        // flattening art that is already fading out on its own.
        style={{ background: SURFACE_WASH }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{ background: tintWash(tints) }}
      />
      {/* On a narrow screen the art sits behind the whole banner, so the text
          needs its own floor. Harmless at width, where it is already opaque. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 sm:hidden"
        style={{
          background: "linear-gradient(to top, var(--card) 20%, transparent 100%)",
        }}
      />

      <div className="relative w-full px-5 py-6 sm:px-7 sm:py-8">{children}</div>
    </header>
  );
}

/** The banner card's domains as tint values, deduplicated, at most two. */
function tintsFor(card: BannerCard | null): string[] {
  const seen: string[] = [];
  for (const domain of card?.domains ?? []) {
    const tint = domainWashRgb(domain);
    if (tint && !seen.includes(tint)) seen.push(tint);
    if (seen.length === 2) break;
  }
  return seen.length > 0 ? seen : [NEUTRAL_DOMAIN_RGB];
}

/**
 * The ground behind the art, in the card's own domain hue.
 *
 * Absent on the left, where the surface wash is opaque and it would only
 * muddy the title's backing, and strongest from the fade onward — which is the
 * only place it is ever visible, since opaque art covers it entirely.
 */
function groundWash(tints: string[]): string {
  const hue = tints[tints.length - 1]!;
  const alpha = FRAMING.groundAlpha;
  return (
    `linear-gradient(to right, transparent 30%, ` +
    `rgb(${hue} / ${(alpha * 0.6).toFixed(2)}) 52%, rgb(${hue} / ${alpha}) 72%)`
  );
}

/**
 * One hue, or two blended left to right for a dual-domain card. Both fade out
 * before the art does, so the hue reads as a wash rather than a colour cast
 * over the illustration.
 */
function tintWash(tints: string[]): string {
  const [first, second] = tints;
  if (second) {
    return (
      `linear-gradient(to right, rgb(${first} / 0.42) 0%, ` +
      `rgb(${second} / 0.30) 44%, transparent ${FRAMING.tintEndPct}%)`
    );
  }
  return (
    `linear-gradient(to right, rgb(${first} / 0.38) 0%, ` +
    `rgb(${first} / 0.20) 48%, transparent ${FRAMING.tintEndPct}%)`
  );
}
