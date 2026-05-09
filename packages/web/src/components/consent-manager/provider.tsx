"use client";

import { type ReactNode } from "react";
import { ConsentManagerProvider, ConsentDialog } from "@c15t/nextjs";

import { CustomConsentBanner } from "./custom-consent-banner";

export default function ConsentManagerClient({
  children,
}: {
  children: ReactNode;
}) {
  const overrideCountry = process.env.NEXT_PUBLIC_CONSENT_OVERRIDE_COUNTRY;
  const allowOverride =
    process.env.NODE_ENV !== "production" && Boolean(overrideCountry);

  return (
    <ConsentManagerProvider
      options={{
        mode: "hosted",
        backendURL: "/api/c15t",
        consentCategories: [
          "necessary",
          "functionality",
          "measurement",
          "marketing",
        ],
        i18n: {
          locale: "en",
          messages: {
            en: {
              consentTypes: {
                functionality: {
                  title: "Preferences & embedded content",
                  description:
                    "Remembers choices such as theme and enables optional embedded media. The site remains usable without this; some convenience or embedded features may be limited.",
                },
                measurement: {
                  title: "Analytics",
                  description:
                    "Helps us understand how visitors use the site so we can improve it.",
                },
                marketing: {
                  title: "Advertising",
                  description:
                    "Used to deliver and measure ads when we run advertising or remarketing.",
                },
              },
            },
          },
        },
        ...(allowOverride && {
          overrides: { country: overrideCountry },
        }),
      }}
    >
      <CustomConsentBanner />
      <ConsentDialog hideBranding />
      {children}
    </ConsentManagerProvider>
  );
}
