"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type State =
  | { status: "loading" }
  | { status: "confirmed" }
  | { status: "error"; message: string };

export default function AuthCallbackPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);

    const type = params.get("type");
    const accessToken = params.get("access_token");
    const errorDescription = params.get("error_description");

    if (errorDescription) {
      setState({ status: "error", message: decodeURIComponent(errorDescription) });
      return;
    }

    if (type === "recovery" && accessToken) {
      sessionStorage.setItem("rs_recovery_token", accessToken);
      router.replace("/auth/reset-password");
      return;
    }

    if (type === "signup") {
      setState({ status: "confirmed" });
      return;
    }

    setState({ status: "error", message: "Unknown callback type." });
  }, [router]);

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Processing…</p>;
  }

  if (state.status === "confirmed") {
    return (
      <div className="text-center space-y-2">
        <p className="font-medium">Email confirmed!</p>
        <p className="text-sm text-muted-foreground">
          <Link href="/auth/login" className="underline underline-offset-4">
            Sign in to continue
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-2">
      <p className="font-medium text-destructive">Something went wrong</p>
      <p className="text-sm text-muted-foreground">{state.message}</p>
      <p className="text-sm">
        <Link href="/auth/login" className="underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
