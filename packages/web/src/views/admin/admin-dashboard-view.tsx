import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  Gavel,
  Inbox,
  Layers,
  Library,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AdminPageHeader } from "./admin-page-header";

import type { AdminStats } from "@/features/admin/types";

interface AdminSection {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

const ADMIN_SECTIONS: AdminSection[] = [
  {
    href: "/admin/cards",
    icon: Library,
    title: "Cards",
    description:
      "Search every printing, edit fields, upload art, fix slugs, and record deletions.",
  },
  {
    href: "/admin/sets",
    icon: Layers,
    title: "Sets",
    description:
      "Create manual sets, correct names and release dates, and remove empty sets.",
  },
  {
    href: "/admin/formats",
    icon: Gavel,
    title: "Formats",
    description:
      "Add, retire and reorder play formats. Per-card legalities are edited on the card itself.",
  },
  {
    href: "/admin/rulings",
    icon: BookOpen,
    title: "Rulings",
    description:
      "Notes and rulings, targeted at a card, a single printing, or a saved search that keeps covering cards released after it.",
  },
  {
    href: "/admin/review",
    icon: Inbox,
    title: "Review queue",
    description:
      "What ingest could not reconcile, from TCGPlayer and Riot's official gallery both. Confirm or dismiss — nothing applies itself.",
  },
  {
    href: "/admin/audit",
    icon: ScrollText,
    title: "Audit log",
    description:
      "Trace every admin change with the payload that was submitted, filterable by action and target.",
  },
];

interface Props {
  /** Null when the API could not be reached — the page still renders its links. */
  stats: AdminStats | null;
  email?: string;
}

export function AdminDashboardView({ stats, email }: Props) {
  return (
    <>
      <AdminPageHeader
        title="Admin"
        description={
          email
            ? `Signed in as ${email}. Every change here is written to the audit log.`
            : "Every change here is written to the audit log."
        }
      />

      {/* Oracles and printings are both shown because the split makes them
          different questions: one card can be printed many times, so neither
          number answers the other. */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Sets" value={stats ? stats.sets.toLocaleString() : "—"} />
        <StatTile
          label="Oracles"
          value={stats ? stats.oracles.toLocaleString() : "—"}
          hint="Distinct cards"
        />
        <StatTile
          label="Printings"
          value={stats ? stats.printings.toLocaleString() : "—"}
          hint="Physical cards"
        />
        <StatTile
          label="Review"
          value={stats ? stats.pending_review.toLocaleString() : "—"}
          hint="Pending entries"
        />
      </div>

      {!stats && (
        <p className="text-muted-foreground mb-8 text-sm">
          Totals are unavailable right now. The rest of the admin tools still work.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ADMIN_SECTIONS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} className="group block">
            <Card className="h-full transition-colors hover:border-foreground/30">
              <CardContent className="flex flex-col gap-4 px-5 pt-6 pb-5">
                <Icon className="size-6 text-violet-400" strokeWidth={1.75} />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{title}</span>
                    <ChevronRight className="text-muted-foreground size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                    {description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="text-muted-foreground mt-8 flex items-start gap-2 text-xs">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="leading-relaxed">
          Oracle, printing and set edits lock the fields an admin chose, so the
          scheduled RiftCodex ingest cannot overwrite those decisions.
        </p>
      </div>
    </>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}
