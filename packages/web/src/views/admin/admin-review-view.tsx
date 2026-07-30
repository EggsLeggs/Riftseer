"use client";

import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { listReviewAction } from "@/features/admin/actions";
import {
  adminReviewQueryKey,
  useReviewMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import type {
  AdminReviewEntry,
  AdminReviewKind,
  AdminReviewPage,
  AdminReviewStatus,
} from "@/features/admin/types";
import { AdminPageHeader } from "./admin-page-header";

const PAGE_SIZE = 50;

const STATUS_TABS: Array<{ value: AdminReviewStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "dismissed", label: "Dismissed" },
];

const KIND_LABELS: Record<AdminReviewKind, string> = {
  unmatched_product: "Unmatched product",
  field_diff: "Field difference",
};

const FIELD_LABELS: Record<string, string> = {
  collector_number: "Collector number",
  released_at: "Release date",
};

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "unknown";
  return parsed.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function AdminReviewView() {
  const [status, setStatus] = React.useState<AdminReviewStatus>("pending");
  const [kind, setKind] = React.useState<AdminReviewKind | "">("");
  const [page, setPage] = React.useState(0);

  const { confirm, dismiss } = useReviewMutations();

  const review = useQuery({
    queryKey: [...adminReviewQueryKey, status, kind, page],
    queryFn: async (): Promise<AdminReviewPage> => {
      const result = await listReviewAction({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        status,
        kind: kind || undefined,
      });
      // Server actions resolve rather than throw, so surface the API's message
      // instead of rendering an empty queue.
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });

  React.useEffect(() => {
    setPage(0);
  }, [status, kind]);

  const entries = review.data?.entries ?? [];
  const counts = review.data?.counts;
  const total = review.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AdminPageHeader
        title="TCGPlayer review"
        description="Products ingest could not attach to a card, and fields where TCGPlayer disagrees with us. Nothing here is applied automatically — confirming writes a durable card override, dismissing is remembered so the next ingest stays quiet."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Review" }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void review.refetch()}
            disabled={review.isFetching}
          >
            <RotateCw aria-hidden="true" />
            {review.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div
          role="tablist"
          aria-label="Entry status"
          className="bg-muted flex gap-1 rounded-md p-1"
        >
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              onClick={() => setStatus(tab.value)}
              className={
                status === tab.value
                  ? "bg-background rounded px-3 py-1.5 text-sm font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground rounded px-3 py-1.5 text-sm font-medium"
              }
            >
              {tab.label}
              {counts ? (
                <span className="text-muted-foreground ml-1.5 tabular-nums">
                  {counts[tab.value]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="review-kind">Type</Label>
          <select
            id="review-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AdminReviewKind | "")}
            className={CARD_BROWSE_SELECT_CLASS}
          >
            <option value="">All types</option>
            <option value="unmatched_product">Unmatched products</option>
            <option value="field_diff">Field differences</option>
          </select>
        </div>
      </div>

      {review.isError ? (
        <p className="text-destructive text-sm">
          {review.error instanceof Error
            ? review.error.message
            : "Couldn't load the review queue."}
        </p>
      ) : review.isPending ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading review queue…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {status === "pending"
            ? "Nothing to review — every TCGPlayer product matched a card."
            : `No ${status} entries.`}
        </p>
      ) : (
        <>
          <p className="text-muted-foreground mb-3 text-sm">
            {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
            {totalPages > 1 ? ` · page ${page + 1} of ${totalPages}` : ""}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Discrepancy</TableHead>
                <TableHead>Card</TableHead>
                <TableHead>Seen</TableHead>
                {status === "pending" && (
                  <TableHead className="text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <ReviewRow
                  key={entry.id}
                  entry={entry}
                  editable={status === "pending"}
                  pending={confirm.isPending || dismiss.isPending}
                  onConfirm={(cardId) =>
                    confirm.mutate([entry.id, cardId || undefined])
                  }
                  onDismiss={() => dismiss.mutate([entry.id])}
                />
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <p className="text-muted-foreground mt-8 text-xs leading-relaxed">
        Prices are never queued here — they change every run and are applied
        automatically. Confirming an unmatched product stores its TCGPlayer ID on
        the card, so later ingests match and price it without asking again.
      </p>
    </>
  );
}

function ReviewRow({
  entry,
  editable,
  pending,
  onConfirm,
  onDismiss,
}: {
  entry: AdminReviewEntry;
  editable: boolean;
  pending: boolean;
  onConfirm: (cardId: string) => void;
  onDismiss: () => void;
}) {
  const { product, field, current_value, proposed_value, card_name } =
    entry.tcgplayer_payload;
  // Field diffs are anchored to a known card; only an unmatched product needs a
  // target chosen, so its suggestion is pre-filled and stays editable.
  const fixedCard = entry.kind === "field_diff";
  const [cardId, setCardId] = React.useState(entry.proposed_card_id ?? "");

  function confirmEntry() {
    const trimmed = cardId.trim();
    if (!fixedCard && !trimmed) {
      toast.error("Enter the card ID this product belongs to");
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <TableRow>
      <TableCell>
        <Badge variant={entry.kind === "field_diff" ? "secondary" : "outline"}>
          {KIND_LABELS[entry.kind]}
        </Badge>
      </TableCell>

      <TableCell className="max-w-96">
        <div className="flex flex-col gap-1">
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            {product.name || `Product ${product.product_id}`}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
          <span className="text-muted-foreground text-xs">
            {product.set_code ?? "unknown set"}
            {product.collector_number ? ` · #${product.collector_number}` : ""}
            {` · product ${product.product_id}`}
          </span>
          {field && (
            <span className="text-xs">
              {FIELD_LABELS[field] ?? field}:{" "}
              <span className="text-muted-foreground line-through">
                {current_value || "empty"}
              </span>{" "}
              → <span className="font-medium">{proposed_value}</span>
            </span>
          )}
        </div>
      </TableCell>

      <TableCell className="max-w-64">
        {fixedCard || !editable ? (
          entry.proposed_card_id ? (
            <Link
              href={`/admin/cards/${encodeURIComponent(entry.proposed_card_id)}/edit`}
              className="font-mono text-xs underline-offset-4 hover:underline"
            >
              {card_name ?? entry.proposed_card_id}
            </Link>
          ) : (
            <span className="text-muted-foreground text-xs">No card</span>
          )
        ) : (
          <div className="flex flex-col gap-1">
            <Input
              aria-label="Card ID to link"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
              placeholder="Card ID"
              className="font-mono text-xs"
            />
            {card_name && (
              <span className="text-muted-foreground text-xs">
                Suggested: {card_name}
              </span>
            )}
          </div>
        )}
      </TableCell>

      <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
        {formatTimestamp(entry.last_seen_at || entry.created_at)}
      </TableCell>

      {editable && (
        <TableCell>
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={confirmEntry}
            >
              <Check aria-hidden="true" />
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onDismiss}
              title="Dismiss permanently"
            >
              <X aria-hidden="true" />
              Dismiss
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
