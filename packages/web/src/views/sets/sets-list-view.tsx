"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { setsApi, setsQueryKeys, type SetInfo } from "@/features/sets/api";

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function SetCard({ set }: { set: SetInfo }) {
  const href = `/sets/${set.setCode.toLowerCase()}`;
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold leading-snug tracking-tight text-card-foreground group-hover:text-primary">
          {set.setName}
        </h2>
        <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium uppercase text-muted-foreground">
          {set.setCode}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{set.cardCount} {set.cardCount === 1 ? "card" : "cards"}</span>
        <span>{formatDate(set.publishedOn)}</span>
        {set.isPromo ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide">
            Promo
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function SetCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-12" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}

export function SetsListView() {
  const { data, isPending, isError } = useQuery({
    queryKey: setsQueryKeys.list(),
    queryFn: setsApi.getSets,
    staleTime: 5 * 60_000,
  });

  const sets = data?.sets ?? [];
  const mainSets = sets.filter((s) => !s.isPromo);
  const promoSets = sets.filter((s) => s.isPromo);

  return (
    <div className="container py-8">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Sets</h1>
        {!isPending && !isError && (
          <p className="mt-1 text-sm text-muted-foreground">
            {sets.length} {sets.length === 1 ? "set" : "sets"}
          </p>
        )}
      </header>

      {isError ? (
        <p className="text-sm text-muted-foreground">Failed to load sets. Try refreshing.</p>
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SetCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {mainSets.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mainSets.map((set) => (
                <SetCard key={set.setCode} set={set} />
              ))}
            </div>
          )}
          {promoSets.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Promo Sets
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {promoSets.map((set) => (
                  <SetCard key={set.setCode} set={set} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
