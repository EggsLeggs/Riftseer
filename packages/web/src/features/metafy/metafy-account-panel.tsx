"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  connectMetafyAction,
  disconnectMetafyAction,
  refreshMetafyStatusAction,
} from "./actions";
import type { MetafyStatusResult } from "./types";

interface MetafyAccountPanelProps {
  initialStatus: MetafyStatusResult | null;
}

type Feedback = { message: string; isError: boolean };

export function MetafyAccountPanel({ initialStatus }: MetafyAccountPanelProps) {
  const searchParams = useSearchParams();
  const justLinked = searchParams.get("linked") === "1";
  const justErrored = searchParams.get("error") === "1";

  const [status, setStatus] = useState<MetafyStatusResult | null>(initialStatus);
  const [feedback, setFeedback] = useState<Feedback | null>(
    justLinked
      ? { message: "Metafy account linked!", isError: false }
      : justErrored
        ? { message: "Failed to link Metafy account. Please try again.", isError: true }
        : null,
  );
  const [connectPending, startConnect] = useTransition();
  const [disconnectPending, startDisconnect] = useTransition();
  const [refreshPending, startRefresh] = useTransition();

  function handleConnect() {
    startConnect(async () => {
      const result = await connectMetafyAction();
      if ("error" in result) setFeedback({ message: result.error, isError: true });
      // On success, connectMetafyAction redirects — no further state update needed
    });
  }

  function handleDisconnect() {
    startDisconnect(async () => {
      const result = await disconnectMetafyAction();
      if ("error" in result) {
        setFeedback({ message: result.error, isError: true });
      } else {
        setStatus({ linked: false });
        setFeedback({ message: "Metafy account unlinked.", isError: false });
      }
    });
  }

  function handleRefresh() {
    startRefresh(async () => {
      const result = await refreshMetafyStatusAction();
      if ("error" in result) {
        setFeedback({ message: result.error, isError: true });
      } else {
        setStatus((prev) =>
          prev?.linked
            ? { ...prev, is_supporter: result.is_supporter }
            : prev,
        );
        setFeedback({
          message: result.is_supporter
            ? "You are an active Metafy supporter."
            : "Supporter status updated — no active membership found.",
          isError: false,
        });
      }
    });
  }

  const feedbackMessage = feedback && (
    <p
      role={feedback.isError ? "alert" : "status"}
      aria-live={feedback.isError ? "assertive" : "polite"}
      className={feedback.isError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
    >
      {feedback.message}
    </p>
  );

  if (!status?.linked) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <Button
          size="sm"
          onClick={handleConnect}
          disabled={connectPending}
        >
          {connectPending ? "Redirecting…" : "Link Metafy Account"}
        </Button>
        {feedbackMessage}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-medium text-green-600">
          <CheckCircle2 className="size-3" />
          Connected
        </span>
        {status.is_supporter && (
          <span className="flex items-center gap-1 text-xs font-medium text-violet-500">
            <Star className="size-3 fill-current" />
            Supporter
          </span>
        )}
        {!status.is_supporter && status.is_member && (
          <span className="flex items-center gap-1 text-xs font-medium text-blue-500">
            <Users className="size-3" />
            Member
          </span>
        )}
        {status.provider_username && (
          <span className="text-sm text-muted-foreground">@{status.provider_username}</span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshPending || disconnectPending}
        >
          {refreshPending ? "Checking…" : "Refresh"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDisconnect}
          disabled={disconnectPending || refreshPending}
        >
          {disconnectPending ? "Unlinking…" : "Unlink"}
        </Button>
      </div>
      {feedbackMessage}
    </div>
  );
}
