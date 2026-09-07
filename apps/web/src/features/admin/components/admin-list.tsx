"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The four states every admin list renders, in one place.
 *
 * Each list view had its own copy of this ladder. They agreed by coincidence
 * rather than construction, which is the same reason the pager below drifted
 * into two different end-of-list conditions.
 */
export function AdminListState({
  isError,
  isPending,
  isEmpty,
  errorMessage,
  loadingMessage,
  emptyMessage,
  children,
}: {
  isError: boolean;
  isPending: boolean;
  isEmpty: boolean;
  errorMessage: string;
  loadingMessage: string;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  if (isError) return <p className="text-destructive text-sm">{errorMessage}</p>;
  if (isPending) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {loadingMessage}
      </p>
    );
  }
  if (isEmpty) return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  return <>{children}</>;
}

/**
 * Zero-based page control. `page + 1 >= totalPages` is the end of the list —
 * one of the four copies this replaces used `page >= totalPages - 1`, which is
 * the same thing only while `totalPages` is at least 1.
 */
export function AdminPager({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-between">
      <Button
        variant="outline"
        size="sm"
        disabled={page === 0}
        onClick={() => onPageChange(Math.max(0, page - 1))}
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
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
