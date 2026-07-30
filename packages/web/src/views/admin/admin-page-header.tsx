import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface AdminCrumb {
  label: string;
  href?: string;
}

interface Props {
  title: string;
  description?: string;
  crumbs?: AdminCrumb[];
  actions?: React.ReactNode;
}

/** Title block shared by the admin pages — mirrors the settings subpage layout. */
export function AdminPageHeader({ title, description, crumbs = [], actions }: Props) {
  return (
    <div className="mb-8">
      {crumbs.length > 0 && (
        <nav className="text-muted-foreground mb-4 flex flex-wrap items-center gap-1.5 text-sm">
          {crumbs.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3.5" aria-hidden="true" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-foreground transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
