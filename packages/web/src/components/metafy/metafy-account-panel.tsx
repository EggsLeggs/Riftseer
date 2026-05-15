"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  connectMetafyAction,
  disconnectMetafyAction,
  refreshMetafyStatusAction,
} from "@/features/metafy/actions";
import type { MetafyStatusResult } from "@/features/metafy/types";

interface MetafyAccountPanelProps {
  initialStatus: MetafyStatusResult | null;
}

export function MetafyAccountPanel({ initialStatus }: MetafyAccountPanelProps) {
  const searchParams = useSearchParams();
  const justLinked = searchParams.get("linked") === "1";
  const justErrored = searchParams.get("error") === "1";

  const [status, setStatus] = useState<MetafyStatusResult | null>(initialStatus);
  const [feedback, setFeedback] = useState<string | null>(
    justLinked ? "Metafy account linked!" : justErrored ? "Failed to link Metafy account. Please try again." : null,
  );
  const [connectPending, startConnect] = useTransition();
  const [disconnectPending, startDisconnect] = useTransition();
  const [refreshPending, startRefresh] = useTransition();

  function handleConnect() {
    startConnect(async () => {
      const result = await connectMetafyAction();
      if ("error" in result) setFeedback(result.error);
      // On success, connectMetafyAction redirects — no further state update needed
    });
  }

  function handleDisconnect() {
    startDisconnect(async () => {
      const result = await disconnectMetafyAction();
      if ("error" in result) {
        setFeedback(result.error);
      } else {
        setStatus({ linked: false });
        setFeedback("Metafy account unlinked.");
      }
    });
  }

  function handleRefresh() {
    startRefresh(async () => {
      const result = await refreshMetafyStatusAction();
      if ("error" in result) {
        setFeedback(result.error);
      } else {
        setStatus((prev) =>
          prev?.linked
            ? { ...prev, is_supporter: result.is_supporter }
            : prev,
        );
        setFeedback(
          result.is_supporter
            ? "You are an active Metafy supporter."
            : "Supporter status updated — no active membership found.",
        );
      }
    });
  }

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
        {feedback && (
          <p className="text-xs text-muted-foreground">{feedback}</p>
        )}
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
      {feedback && (
        <p className="text-xs text-muted-foreground">{feedback}</p>
      )}
    </div>
  );
}
