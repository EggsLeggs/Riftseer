"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  /** Shows a free-text field whose value is passed to `onConfirm` for the audit log. */
  reasonLabel?: string;
  onConfirm: (reason: string) => void;
}

/** Confirmation step for the irreversible admin actions (delete card / delete set). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  pending = false,
  reasonLabel,
  onConfirm,
}: Props) {
  const [reason, setReason] = React.useState("");

  // Each invocation starts clean — a reason typed for one card must not carry
  // over into the audit log of the next.
  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {reasonLabel && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-reason">{reasonLabel}</Label>
            <Input
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              placeholder="Why is this being removed?"
            />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => onConfirm(reason.trim())}
            disabled={pending}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
