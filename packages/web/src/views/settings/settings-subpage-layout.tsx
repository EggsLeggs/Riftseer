import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface SettingRow {
  title: string;
  description?: string;
  control?: React.ReactNode;
}

export interface SettingsSection {
  heading?: string;
  rows: SettingRow[];
}

interface Props {
  title: string;
  description: string;
  sections?: SettingsSection[];
}

export function SettingsSubpageLayout({ title, description, sections = [] }: Props) {
  return (
    <div className="container py-8">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <Link href="/settings" className="hover:text-foreground transition-colors">
          Settings
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{title}</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No settings available yet.</p>
      ) : (
        <div className="space-y-8">
          {sections.map((section, i) => (
            <div key={i}>
              {section.heading && (
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {section.heading}
                </h2>
              )}
              <div className="rounded-lg border divide-y">
                {section.rows.map((row, j) => (
                  <div key={j} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{row.title}</p>
                      {row.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
                      )}
                    </div>
                    {row.control && <div className="shrink-0">{row.control}</div>}
                  </div>
                ))}
              </div>
              {i < sections.length - 1 && <Separator className="mt-8" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
