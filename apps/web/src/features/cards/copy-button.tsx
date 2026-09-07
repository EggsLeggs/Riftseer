"use client";

import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { fetchCardExportText } from "@/features/cards/api";
import { cn } from "@/lib/utils";

async function readText(source: CopySource): Promise<string> {
  if ("text" in source) return source.text;
  return fetchCardExportText(source.url);
}

/** Either literal text, or a URL to fetch the text from on click. */
type CopySource = { text: string } | { url: string };

type CopyButtonProps = CopySource & {
  label: string;
  /** Message shown in the toast on success. Defaults to `${label} copied`. */
  successMessage?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  /** When false, only the icon renders — used for compact rows. */
  showLabel?: boolean;
};

export function CopyButton(props: CopyButtonProps) {
  const {
    label,
    successMessage,
    variant = "ghost",
    size = "sm",
    className,
    showLabel = true,
  } = props;
  const [copied, setCopied] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    setPending(true);
    try {
      await navigator.clipboard.writeText(await readText(props));
      setCopied(true);
      toast.success(successMessage ?? `${label} copied`);
    } catch {
      toast.error(`Couldn't copy ${label.toLowerCase()}`);
    } finally {
      setPending(false);
    }
  }

  const Icon = copied ? CheckIcon : CopyIcon;

  return (
    <Button
      type="button"
      variant={variant}
      size={showLabel ? size : "icon-sm"}
      className={cn(className)}
      disabled={pending}
      onClick={copy}
      aria-label={showLabel ? undefined : label}
      title={showLabel ? undefined : label}
    >
      <Icon aria-hidden="true" />
      {showLabel ? label : null}
    </Button>
  );
}
