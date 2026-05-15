"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    const errorDescription = params.get("error_description");

    if (error || errorDescription) {
      setState({
        status: "error",
        message: errorDescription ?? error ?? "Metafy authorization was denied.",
      });
      return;
    }

    if (!code || !state) {
      setState({ status: "error", message: "Missing OAuth parameters. Please try again." });
      return;
    }

    completeMetafyCallbackAction(code, state).then((result) => {
      if ("error" in result) {
        setState({ status: "error", message: result.error });
      } else {
        setState({ status: "success" });
        setTimeout(() => router.replace("/settings/donations?linked=1"), 1000);
      }
    });
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
