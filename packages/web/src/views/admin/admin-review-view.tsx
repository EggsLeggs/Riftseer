"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Plus, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  isConfirmableReconciliationField,
  reconciliationFieldScope,
} from "@riftseer/types/reconciliation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listReviewAction } from "@/features/admin/actions";
import {
  adminReviewQueryKey,
  useReviewMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import { stashReviewCreateDraft } from "@/features/admin/review-draft";
import type {
  AdminReviewEntry,
  AdminReviewKind,
  AdminReviewSource,
  AdminReviewPage,
  AdminReviewStatus,
} from "@/features/admin/types";
import { AdminPageHeader } from "./admin-page-header";
import { SelectField } from "./admin-form-field";
import { AdminListState, AdminPager } from "./admin-list";

const PAGE_SIZE = 50;

const STATUS_TABS: Array<{ value: AdminReviewStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "dismissed", label: "Dismissed" },
];

const KIND_LABELS: Record<AdminReviewKind, string> = {
  unmatched_product: "Unmatched product",
  field_diff: "Field difference",
  missing_printing: "Missing printing",
  unmatched_oracle: "Unmatched oracle",
};

const SOURCE_LABELS: Record<AdminReviewSource, string> = {
  tcgplayer: "TCGPlayer",
  gallery: "Official gallery",
};

const FIELD_LABELS: Record<string, string> = {
  collector_number: "Collector number",
  released_at: "Release date",
  rarity: "Rarity",
  type: "Card type",
  energy: "Energy",
  might: "Might",
  power: "Power",
  text: "Rules text",
};

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "unknown";
  return parsed.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function AdminReviewView() {
  const [status, setStatus] = React.useState<AdminReviewStatus>("pending");
  const [kind, setKind] = React.useState<AdminReviewKind | "">("");
  const [source, setSource] = React.useState<AdminReviewSource | "">("");
  const [page, setPage] = React.useState(0);

  const { confirm, dismiss } = useReviewMutations();

  const review = useQuery({
    queryKey: [...adminReviewQueryKey, status, kind, source, page],
    queryFn: async (): Promise<AdminReviewPage> => {
      const result = await listReviewAction({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        status,
        kind: kind || undefined,
        source: source || undefined,
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
  }, [status, kind, source]);

  const entries = review.data?.entries ?? [];
  const counts = review.data?.counts;
  const total = review.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AdminPageHeader
        title="Ingest review"
        description="What ingest could not reconcile: TCGPlayer products that match no card, printings the official gallery lists that we do not hold, and fields where either source disagrees with us. Nothing here is applied automatically — confirming writes a durable card override, dismissing is remembered so the next ingest stays quiet."
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

        <SelectField
          id="review-kind"
          label="Type"
          value={kind}
          onChange={(e) => setKind(e.target.value as AdminReviewKind | "")}
          options={[
            { value: "", label: "All types" },
            // Built from the label maps so a new kind cannot be added to one and
            // forgotten in the other.
            ...Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />

        <SelectField
          id="review-source"
          label="Source"
          value={source}
          onChange={(e) => setSource(e.target.value as AdminReviewSource | "")}
          options={[
            { value: "", label: "All sources" },
            ...Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>

      <AdminListState
        isError={review.isError}
        isPending={review.isPending}
        isEmpty={entries.length === 0}
        errorMessage={
          review.error instanceof Error
            ? review.error.message
            : "Couldn't load the review queue."
        }
        loadingMessage="Loading review queue…"
        emptyMessage={
          status === "pending"
            ? "Nothing to review — every product matched a card and both sources agree with us."
            : `No ${status} entries.`
        }
      >
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
                  onConfirm={(printingId, oracleId) =>
                    confirm.mutate([entry.id, printingId || undefined, oracleId || undefined])
                  }
                  onDismiss={() => dismiss.mutate([entry.id])}
                />
              ))}
            </TableBody>
          </Table>

          <AdminPager page={page} totalPages={totalPages} onPageChange={setPage} />
      </AdminListState>

      <p className="text-muted-foreground mt-8 text-xs leading-relaxed">
        Prices are never queued here — they change every run and are applied
        automatically. Confirming an unmatched product stores its TCGPlayer ID on
        the card, so later ingests match and price it without asking again.
        Missing printings: use Create to open a prefilled form; confirming stamps the
        gallery&apos;s Riftbound ID onto the card.
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
  onConfirm: (printingId: string, oracleId: string) => void;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const { product, gallery, field, current_value, proposed_value, printing_name } =
    entry.payload;
  // Field diffs are anchored to a known card; an unmatched product and a
  // missing card both need a target chosen, so the suggestion (where there is
  // one) is pre-filled and stays editable.
  const fixedCard = entry.kind === "field_diff";
  const [printingId, setPrintingId] = React.useState(entry.proposed_printing_id ?? "");
  const [oracleId, setOracleId] = React.useState(entry.proposed_oracle_id ?? "");
  // Shown as context only. The API derives the oracle from the printing when the
  // entry does not name one, so this no longer gates Confirm.
  const oracleField =
    isConfirmableReconciliationField(field) &&
    reconciliationFieldScope(field) === "oracle";

  // A diff on a field the API cannot patch is dismiss-only; there is nothing
  // for confirming to write. `buildConfirmPatch` answers REVIEW_FIELD_UNSUPPORTED
  // for exactly these, so the button never promises a write the API rejects.
  const unconfirmable =
    entry.kind === "field_diff" && !isConfirmableReconciliationField(field);
  const unconfirmableId = `review-unconfirmable-${entry.id}`;

  function confirmEntry() {
    const printing = printingId.trim();
    const oracle = oracleId.trim();
    if (entry.kind === "unmatched_product" && !printing) {
      toast.error(
        "Enter the printing ID this product belongs to",
      );
      return;
    }
    onConfirm(printing, oracle);
  }

  function createMissingCard() {
    if (!gallery) {
      toast.error("This entry has no gallery payload to prefill from");
      return;
    }
    stashReviewCreateDraft(entry);
    router.push(
      `/admin/cards/new?review=${encodeURIComponent(entry.id)}`,
    );
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Badge variant={entry.kind === "field_diff" ? "secondary" : "outline"}>
            {KIND_LABELS[entry.kind]}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {SOURCE_LABELS[entry.source]}
          </span>
        </div>
      </TableCell>

      <TableCell className="max-w-96">
        <div className="flex flex-col gap-1">
          {product ? (
            <>
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
                {product.collector_number
                  ? ` · #${product.collector_number}`
                  : ""}
                {` · product ${product.product_id}`}
              </span>
            </>
          ) : null}

          {gallery ? (
            <>
              <span className="font-medium">{gallery.name}</span>
              <span className="text-muted-foreground text-xs">
                {gallery.public_code ?? gallery.riftbound_id}
                {gallery.type ? ` · ${gallery.type}` : ""}
                {gallery.rarity ? ` · ${gallery.rarity}` : ""}
                {gallery.collector_number
                  ? ` · #${gallery.collector_number}`
                  : ""}
              </span>
            </>
          ) : null}

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
          entry.proposed_printing_id ? (
            <Link
              href={`/admin/cards/${encodeURIComponent(entry.proposed_printing_id)}/edit`}
              className="font-mono text-xs underline-offset-4 hover:underline"
            >
              {printing_name ?? entry.proposed_printing_id}
            </Link>
          ) : (
            <span className="text-muted-foreground text-xs">No card</span>
          )
        ) : (
          <div className="flex flex-col gap-1">
            <Input
              aria-label="Printing ID"
              value={printingId}
              onChange={(e) => setPrintingId(e.target.value)}
              placeholder="Printing ID"
              className="font-mono text-xs"
            />
            {(oracleField || entry.kind === "unmatched_oracle") ? <Input aria-label="Oracle ID" value={oracleId} onChange={(event) => setOracleId(event.target.value)} placeholder="Oracle UUID" className="font-mono text-xs" /> : null}
            {printing_name && entry.kind !== "missing_printing" && entry.kind !== "unmatched_oracle" && (
              <span className="text-muted-foreground text-xs">
                Suggested: {printing_name}
              </span>
            )}
            {(entry.kind === "missing_printing" || entry.kind === "unmatched_oracle") && (
              <span className="text-muted-foreground text-xs">
                Prefer Create — it prefills from the gallery.
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
          <div className="flex flex-col items-end gap-1">
          <div className="flex justify-end gap-1">
            {(entry.kind === "missing_printing" || entry.kind === "unmatched_oracle") && gallery && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={createMissingCard}
              >
                <Plus aria-hidden="true" />
                Create
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || unconfirmable}
              onClick={confirmEntry}
              // A disabled button is not focusable, so a `title` tooltip is
              // unreachable by keyboard and unreliable for screen readers —
              // the reason is rendered below instead.
              aria-describedby={unconfirmable ? unconfirmableId : undefined}
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
            {unconfirmable && (
              <p
                id={unconfirmableId}
                className="text-muted-foreground max-w-64 text-right text-xs"
              >
                {FIELD_LABELS[field ?? ""] ?? field} differences can&apos;t be
                applied automatically — edit the card, then dismiss this entry.
              </p>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
