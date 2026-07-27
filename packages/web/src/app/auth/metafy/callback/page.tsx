"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { completeMetafyCallbackAction } from "@/features/metafy/actions";

type State =
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string };

export default function MetafyCallbackPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const startedRef = useRef(false);

  useEffect(() => {
    // Strict mode / re-renders must not exchange the authorization code twice.
    if (startedRef.current) return;
    startedRef.current = true;

    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthState = params.get("state");
    const error = params.get("error");
    const errorDescription = params.get("error_description");

    if (error || errorDescription) {
      // Upstream text is not shown to the user — it is attacker-influenced.
      console.error("[metafy callback] authorization failed:", { error, errorDescription });
      setState({ status: "error", message: "Metafy authorization was denied." });
      return;
    }

    if (!code || !oauthState) {
      setState({ status: "error", message: "Missing OAuth parameters. Please try again." });
      return;
    }

    completeMetafyCallbackAction(code, oauthState)
      .then((result) => {
        if ("error" in result) {
          setState({ status: "error", message: result.error });
        } else {
          setState({ status: "success" });
          redirectTimer = setTimeout(() => router.replace("/settings/donations?linked=1"), 1000);
        }
      })
      .catch((err: unknown) => {
        console.error("[metafy callback] link request failed:", err);
        setState({ status: "error", message: "Could not link your Metafy account. Please try again." });
      });

    return () => {
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [router]);

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Linking your Metafy account…</p>;
  }

  if (state.status === "success") {
    return (
      <div className="text-center space-y-2">
        <p className="font-medium">Metafy account linked!</p>
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-2">
      <p className="font-medium text-destructive">Something went wrong</p>
      <p className="text-sm text-muted-foreground">{state.message}</p>
      <p className="text-sm">
        <Link href="/settings/donations" className="underline underline-offset-4">
          Back to donations settings
        </Link>
      </p>
    </div>
  );
}
