import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSets, type CardSet } from "../api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Layers } from "lucide-react";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function SetsTable({ sets }: { sets: CardSet[] }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Set Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Released</TableHead>
            <TableHead className="text-right">Cards</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sets.map((s) => (
            <TableRow key={s.setCode}>
              <TableCell>
                <Link
                  to={`/search?q=&set=${s.setCode}`}
                  className="text-primary hover:underline font-medium"
                >
                  {s.setName}
                </Link>
              </TableCell>
              <TableCell>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {s.setCode}
                </code>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDate(s.publishedOn)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {s.cardCount > 0 ? s.cardCount : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function byDateDesc(a: CardSet, b: CardSet): number {
    const aDate = a.publishedOn ?? "";
    const bDate = b.publishedOn ?? "";
    if (aDate && bDate) {
      if (bDate > aDate) return 1;
      if (bDate < aDate) return -1;
      return a.setName.localeCompare(b.setName);
    }
    if (aDate) return -1;
    if (bDate) return 1;
    return a.setName.localeCompare(b.setName);
}

export function SetsPage() {
  const [sets, setSets] = useState<CardSet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSets()
      .then((res) => setSets(res.sets))
      .finally(() => setLoading(false));
  }, []);

  const mainSets = sets.filter((s) => !s.isPromo).sort(byDateDesc);
  const promoSets = sets.filter((s) => s.isPromo).sort(byDateDesc);

  const setsDescription =
    sets.length > 0
      ? `All ${mainSets.length} Riftbound sets on Riftseer.`
      : "All Riftbound sets on Riftseer.";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <title>All Sets — Riftseer</title>
      <meta name="description" content={setsDescription} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="All Sets — Riftseer" />
      <meta property="og:description" content={setsDescription} />
      <meta property="og:url" content={window.location.href} />

      <div className="flex items-center gap-2 mb-6">
        <Layers className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Card Sets</h1>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading sets...</p>
      ) : sets.length === 0 ? (
        <p className="text-muted-foreground">No sets found.</p>
      ) : (
        <div className="space-y-8">
          {mainSets.length > 0 && <SetsTable sets={mainSets} />}

          {promoSets.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Promo &amp; Special Sets
              </h2>
              <SetsTable sets={promoSets} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
