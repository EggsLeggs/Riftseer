"use client";

import * as React from "react";
import { ConsentDialogLink } from "@c15t/nextjs";
import {
  LayoutGrid,
  LayoutList,
  MonitorIcon,
  MoonIcon,
  Rows2,
  SunIcon,
  Table2,
} from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AppDialogContent } from "@/components/layout/clear-body-pointer-events";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CARD_DETAIL_VIEW_OPTIONS,
  CARD_RESULTS_VIEW_OPTIONS,
  type CardDetailViewPreference,
  type CardResultsViewPreference,
} from "@/features/site-preferences/accessibility-prefs";
import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

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

function ThemePreferenceControl({ id }: { id: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const value = mounted ? (theme ?? "system") : "system";

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/15 px-3 py-3">
      <div className="space-y-1">
        <Label id={`${id}-theme-label`} className="text-sm font-medium text-foreground">
          Color theme
        </Label>
        <p
          id={`${id}-theme-hint`}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          Choose light, dark, or match your device settings.
        </p>
      </div>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => {
          if (next) setTheme(next);
        }}
        variant="outline"
        size="sm"
        spacing={0}
        className="w-full"
        aria-labelledby={`${id}-theme-label`}
        aria-describedby={`${id}-theme-hint`}
      >
        {THEME_OPTIONS.map(({ value: option, label, icon: Icon }) => (
          <ToggleGroupItem
            key={option}
            value={option}
            aria-label={label}
            className="flex-1 gap-1.5 px-2"
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
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
    <AppDialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
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
          aria-labelledby={`${switchId}-appearance-heading`}
        >
          <div className="space-y-1">
            <h2
              id={`${switchId}-appearance-heading`}
              className="text-sm font-medium text-foreground"
            >
              Appearance
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              How the site looks on this device.
            </p>
          </div>

          <ThemePreferenceControl id={switchId} />

          <div className="space-y-3 rounded-lg border border-border bg-muted/15 px-3 py-3">
            <div className="space-y-1">
              <Label
                id={`${switchId}-detail-view-label`}
                className="text-sm font-medium text-foreground"
              >
                Card page layout
              </Label>
              <p
                id={`${switchId}-detail-view-hint`}
                className="text-xs leading-relaxed text-muted-foreground"
              >
                Default layout for individual card pages. You can still switch on
                the page itself.
              </p>
            </div>
            <ToggleGroup
              type="single"
              value={accessibility.cardDetailView}
              onValueChange={(next) => {
                if (
                  next &&
                  (CARD_DETAIL_VIEW_OPTIONS as readonly string[]).includes(next)
                ) {
                  patchAccessibility({
                    cardDetailView: next as CardDetailViewPreference,
                  });
                }
              }}
              variant="outline"
              size="sm"
              spacing={0}
              className="w-full"
              aria-labelledby={`${switchId}-detail-view-label`}
              aria-describedby={`${switchId}-detail-view-hint`}
            >
              <ToggleGroupItem value="detailed" className="flex-1 gap-1.5 px-2">
                <LayoutList className="size-3.5" aria-hidden />
                Detailed
              </ToggleGroupItem>
              <ToggleGroupItem value="simple" className="flex-1 gap-1.5 px-2">
                <Rows2 className="size-3.5" aria-hidden />
                Simple
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/15 px-3 py-3">
            <div className="space-y-1">
              <Label
                id={`${switchId}-results-view-label`}
                className="text-sm font-medium text-foreground"
              >
                Card gallery layout
              </Label>
              <p
                id={`${switchId}-results-view-hint`}
                className="text-xs leading-relaxed text-muted-foreground"
              >
                Default layout for All Cards, search, and set browse. Page toggles
                still override for that visit.
              </p>
            </div>
            <ToggleGroup
              type="single"
              value={accessibility.cardResultsView}
              onValueChange={(next) => {
                if (
                  next &&
                  (CARD_RESULTS_VIEW_OPTIONS as readonly string[]).includes(next)
                ) {
                  patchAccessibility({
                    cardResultsView: next as CardResultsViewPreference,
                  });
                }
              }}
              variant="outline"
              size="sm"
              spacing={0}
              className="w-full"
              aria-labelledby={`${switchId}-results-view-label`}
              aria-describedby={`${switchId}-results-view-hint`}
            >
              <ToggleGroupItem value="details" className="flex-1 gap-1.5 px-2">
                <LayoutList className="size-3.5" aria-hidden />
                Details
              </ToggleGroupItem>
              <ToggleGroupItem value="images" className="flex-1 gap-1.5 px-2">
                <LayoutGrid className="size-3.5" aria-hidden />
                Images
              </ToggleGroupItem>
              <ToggleGroupItem value="table" className="flex-1 gap-1.5 px-2">
                <Table2 className="size-3.5" aria-hidden />
                Table
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {consentReady && !canPersistAccessibility ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Layout choices apply for this session. Enable{" "}
              <strong className="font-medium text-foreground">
                functional cookies
              </strong>{" "}
              in{" "}
              <ConsentDialogLink
                className="text-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  window.setTimeout(() => {
                    onDismiss();
                  }, 0);
                }}
              >
                cookie preferences
              </ConsentDialogLink>{" "}
              to remember them.
            </p>
          ) : null}
        </section>

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
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/15 px-3 py-3 sm:items-center">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label
                    htmlFor={`${switchId}-card-names`}
                    className="text-sm font-medium leading-snug text-foreground"
                  >
                    Show card names below cards in search
                  </Label>
                  <p
                    id={`${switchId}-card-names-hint`}
                    className="text-xs leading-relaxed text-muted-foreground"
                  >
                    Shows each card&apos;s name under its image on the search results
                    grid instead of overlaying selectable text on the artwork.
                  </p>
                </div>
                <Switch
                  id={`${switchId}-card-names`}
                  checked={accessibility.showCardNamesBelowSearch}
                  onCheckedChange={(checked: boolean) =>
                    patchAccessibility({ showCardNamesBelowSearch: checked })
                  }
                  aria-describedby={`${switchId}-card-names-hint`}
                />
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/15 px-3 py-3 sm:items-center">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label
                    htmlFor={`${switchId}-text-symbols`}
                    className="text-sm font-medium leading-snug text-foreground"
                  >
                    Use text instead of symbols
                  </Label>
                  <p
                    id={`${switchId}-text-symbols-hint`}
                    className="text-xs leading-relaxed text-muted-foreground"
                  >
                    Shows readable labels where icons stand in for words or costs,
                    such as “Exhaust” or “3 Energy”.
                  </p>
                </div>
                <Switch
                  id={`${switchId}-text-symbols`}
                  checked={accessibility.preferTextOverSymbols}
                  onCheckedChange={(checked: boolean) =>
                    patchAccessibility({ preferTextOverSymbols: checked })
                  }
                  aria-describedby={`${switchId}-text-symbols-hint`}
                />
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="flex justify-end border-t border-border bg-muted/25 px-4 py-3 sm:px-5">
        <DialogClose asChild>
          <Button type="button" variant="secondary" size="sm">
            Done
          </Button>
        </DialogClose>
      </div>
    </AppDialogContent>
  );
}
