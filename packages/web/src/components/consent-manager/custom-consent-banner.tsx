"use client";

import { ConsentBanner, ConsentButton, useConsentManager } from "@c15t/nextjs";
import type { AllConsentNames } from "c15t";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Keeps banner action labels on a single line (c15t buttons can wrap by default on narrow widths). */
const ACTION_LABEL_ROW = "whitespace-nowrap";

const OPTIONAL_OFF: AllConsentNames[] = [
  "experience",
  "measurement",
  "marketing",
];

/** Preset: necessary + functionality on; analytics & marketing off. */
function EssentialsAndPreferencesButton({
  consentAction,
  isPrimary,
  style,
  className,
}: Pick<
  ComponentProps<typeof ConsentButton>,
  "consentAction" | "isPrimary" | "style" | "className"
>) {
  const { setSelectedConsent } = useConsentManager();

  return (
    <ConsentButton
      action="custom-consent"
      consentAction={consentAction}
      isPrimary={isPrimary}
      closeConsentBanner
      data-testid="consent-banner-reject-button"
      className={cn(ACTION_LABEL_ROW, className)}
      style={style}
      onClick={() => {
        setSelectedConsent("necessary", true);
        setSelectedConsent("functionality", true);
        for (const name of OPTIONAL_OFF) {
          setSelectedConsent(name, false);
        }
      }}
    >
      Essentials & preferences
    </ConsentButton>
  );
}

/**
 * Same outer structure as stock ConsentBanner: `cardShell` caps width at 440px;
 * without it the card stretches full width and feels much larger.
 */
export function CustomConsentBanner() {
  return (
    <ConsentBanner.Root>
      {/** Matches c15t `cardShell`: max 440px so the card is not full-viewport width. */}
      <div className="flex w-full max-w-[440px] flex-col">
        <ConsentBanner.Card>
          <ConsentBanner.Header>
            <ConsentBanner.Title />
            <ConsentBanner.Description />
          </ConsentBanner.Header>
          <ConsentBanner.PolicyActions
            renderAction={(action, props) => {
              const { key, ...rest } = props;
              switch (action) {
                case "reject":
                  return (
                    <EssentialsAndPreferencesButton key={key} {...rest} />
                  );
                case "accept":
                  return (
                    <ConsentBanner.AcceptButton
                      key={key}
                      {...rest}
                      className={ACTION_LABEL_ROW}
                    />
                  );
                case "customize":
                  return (
                    <ConsentBanner.CustomizeButton
                      key={key}
                      {...rest}
                      className={ACTION_LABEL_ROW}
                    />
                  );
                default:
                  return undefined;
              }
            }}
          />
        </ConsentBanner.Card>
      </div>
    </ConsentBanner.Root>
  );
}
