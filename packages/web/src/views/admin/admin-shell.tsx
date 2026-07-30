"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gavel,
  Layers,
  LayoutDashboard,
  Library,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/cards", label: "Cards", icon: Library },
  { href: "/admin/sets", label: "Sets", icon: Layers },
  { href: "/admin/formats", label: "Formats", icon: Gavel },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Section nav shared by every `/admin` page. */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="flex flex-wrap gap-1">
      {ADMIN_LINKS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            isActive(pathname, href)
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
