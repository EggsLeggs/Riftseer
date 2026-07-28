"use client";

import * as React from "react";
import { ImageOffIcon, RotateCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Full-size card art. Landscape cards (battlefields) can be rotated upright so
 * the text is readable without turning your head.
 */
export function CardArt({
  imageUrl,
  name,
  isLandscape,
}: {
  imageUrl: string | undefined;
  name: string;
  isLandscape: boolean;
}) {
  const [rotated, setRotated] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setRotated(false);
    setFailed(false);
  }, [imageUrl]);

  if (!imageUrl || failed) {
    return (
      <div className="bg-muted flex aspect-[5/7] w-full flex-col items-center justify-center gap-2 rounded-xl">
        <ImageOffIcon className="text-muted-foreground/60 size-7" aria-hidden="true" />
        <span className="text-muted-foreground text-xs">Image coming soon</span>
      </div>
    );
  }

  const showUpright = isLandscape && rotated;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "bg-muted relative w-full overflow-hidden rounded-xl",
          showUpright ? "aspect-[5/7]" : isLandscape ? "aspect-[7/5]" : "aspect-[5/7]",
        )}
      >
        {showUpright ? (
          // Rotating a 7:5 image into a 5:7 slot: size the wrapper to the
          // post-rotation dimensions, then spin it about its centre.
          <div className="absolute top-1/2 left-1/2 h-[calc(100%*5/7)] w-[140%] origin-center -translate-x-1/2 -translate-y-1/2 rotate-90">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={name}
              className="h-full w-full object-contain transition-transform duration-300"
              fetchPriority="high"
              decoding="async"
              onError={() => setFailed(true)}
            />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-contain transition-transform duration-300"
            fetchPriority="high"
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
      </div>

      {isLandscape ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setRotated((current) => !current)}
        >
          <RotateCwIcon aria-hidden="true" />
          {rotated ? "Lay flat" : "Rotate upright"}
        </Button>
      ) : null}
    </div>
  );
}
