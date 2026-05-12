"use client";

import * as React from "react";
import { ConsentDialogLink } from "@c15t/nextjs";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";

export function SitePreferencesFooterTrigger() {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-4"
        >
          Site preferences
        </button>
      </DialogTrigger>
      <SitePreferencesDialogContent onDismiss={() => setOpen(false)} />
    </Dialog>
  );
}

function SitePreferencesDialogContent({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const switchId = React.useId();
  const {
    accessibility,
    canPersistAccessibility,
    consentReady,
    patchAccessibility,
  } = useSitePreferences();

  return (
    <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
      <div className="border-b border-border bg-muted/30 px-4 py-4 sm:px-5">
        <DialogHeader className="gap-1.5">
          <DialogTitle>Site preferences</DialogTitle>
          <DialogDescription>
            Optional display settings that change your experience on the site.
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="space-y-6 px-4 py-4 sm:px-5">
        <section
          className="space-y-3"
          aria-labelledby={`${switchId}-accessibility-heading`}
        >
          <div className="space-y-1">
            <h2
              id={`${switchId}-accessibility-heading`}
              className="text-sm font-medium text-foreground"
            >
              Accessibility
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Choices that affect how certain content appears on your device.
            </p>
          </div>

          {!consentReady ? (
            <p className="text-sm text-muted-foreground">Loading preferences…</p>
          ) : !canPersistAccessibility ? (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                To remember accessibility choices in this browser, enable{" "}
                <strong className="font-medium text-foreground">
                  functional cookies
                </strong>{" "}
                (preferences &amp; embedded content) in{" "}
                <ConsentDialogLink
                  className="text-foreground underline-offset-4 hover:underline"
                  onClick={() => {
                    // Nested modal: our Radix dialog stays modal + traps focus while open, so the
                    // CMP preference center opens underneath and cannot receive clicks. Close this
                    // dialog after the consent dialog has mounted (next task).
                    window.setTimeout(() => {
                      onDismiss();
                    }, 0);
                  }}
                >
                  cookie preferences
                </ConsentDialogLink>
                .
              </p>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/15 px-3 py-3 sm:items-center">
              <div className="min-w-0 flex-1 space-y-1">
                <Label
                  htmlFor={switchId}
                  className="text-sm font-medium leading-snug text-foreground"
                >
                  Show card names below cards in search
                </Label>
                <p
                  id={`${switchId}-hint`}
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  Shows each card&apos;s name under its image on the search results
                  grid instead of overlaying selectable text on the artwork.
                </p>
              </div>
              <Switch
                id={switchId}
                checked={accessibility.showCardNamesBelowSearch}
                onCheckedChange={(checked: boolean) =>
                  patchAccessibility({ showCardNamesBelowSearch: checked })
                }
                aria-describedby={`${switchId}-hint`}
              />
            </div>
          )}
        </section>

        {/* Future categories: add new <section> blocks here with the same spacing pattern. */}
      </div>

      <div className="flex justify-end border-t border-border bg-muted/25 px-4 py-3 sm:px-5">
        <DialogClose asChild>
          <Button type="button" variant="secondary" size="sm">
            Done
          </Button>
        </DialogClose>
      </div>
    </DialogContent>
  );
}
