"use client";

import { type ReactNode } from "react";
import {
  ConsentManagerProvider,
  ConsentBanner,
  ConsentDialog,
} from "@c15t/nextjs";

export default function ConsentManagerClient({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConsentManagerProvider
      options={{
        mode: "hosted",
        backendURL: "/api/c15t",
        consentCategories: ["necessary", "measurement", "marketing"],
        ...(process.env.NODE_ENV !== "production" && {
          overrides: { country: "DE" },
        }),
      }}
    >
      <ConsentBanner hideBranding />
      <ConsentDialog hideBranding />
      {children}
    </ConsentManagerProvider>
  );
}
