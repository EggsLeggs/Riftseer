"use client";

import { useState, useTransition, useActionState } from "react";
import Link from "next/link";
import { ChevronRight, Pencil, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateHandleAction } from "@/features/profile/actions";
import { changeEmailAction, changePasswordAction, deleteAccountAction } from "@/features/auth/actions";
import type { Session } from "@/features/auth/types";

interface Props {
  session: Session;
}

// ── Change Username Dialog ────────────────────────────────────────────────────

function ChangeUsernameDialog({ currentHandle }: { currentHandle: string }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState(currentHandle);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const result = await updateHandleAction(handle.trim().toLowerCase());
      if ("error" in result) {
        setFeedback({ type: "error", message: result.error ?? "Failed to update username." });
      } else {
        setFeedback({ type: "success", message: `Username changed to @${result.handle ?? handle}.` });
        setTimeout(() => setOpen(false), 1200);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5 mr-1.5" />
          Edit username
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change username</DialogTitle>
          <DialogDescription>
            Choose a new @handle. This will break any existing links to your profile.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-handle">New username</Label>
            <div className="flex items-center">
              <span className="flex h-9 items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground select-none">
                @
              </span>
              <Input
                id="new-handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                className="rounded-l-none"
                minLength={3}
                maxLength={30}
                pattern="[a-z0-9_]{3,30}"
                required
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              3–30 characters: lowercase letters, numbers, underscores.
            </p>
          </div>

          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Changing your username will break existing profile links. There is no redirect.
            </AlertDescription>
          </Alert>

          {feedback && (
            <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{feedback.message}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || handle.trim() === currentHandle}>
              {isPending ? "Saving…" : "Save username"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Change Email Dialog ───────────────────────────────────────────────────────

function ChangeEmailDialog({ currentEmail }: { currentEmail: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, isPending] = useActionState(changeEmailAction, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5 mr-1.5" />
          Change email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change email address</DialogTitle>
          <DialogDescription>
            A confirmation link will be sent to your new address. Your current email stays active
            until you confirm.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-email">Current email</Label>
            <Input id="current-email" value={currentEmail} disabled className="bg-muted/50" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-email">New email</Label>
            <Input
              id="new-email"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              autoFocus
            />
          </div>

          {state && "error" in state && state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state && "ok" in state && state.ok && (
            <Alert>
              <AlertDescription>
                Confirmation email sent. Check your inbox to complete the change.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Sending…" : "Send confirmation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Change Password Dialog ────────────────────────────────────────────────────

function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, isPending] = useActionState(changePasswordAction, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5 mr-1.5" />
          Change password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Enter your current password and choose a new one.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              name="current_password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              name="new_password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              name="confirm_password"
              type="password"
              required
              autoComplete="new-password"
            />
          </div>

          {state && "error" in state && state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state && "ok" in state && state.ok && (
            <Alert>
              <AlertDescription>Password changed successfully.</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Updating…" : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Account Dialog ─────────────────────────────────────────────────────

function DeleteAccountDialog({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, action, isPending] = useActionState(deleteAccountAction, null);

  const confirmed = confirmation.toLowerCase() === handle.toLowerCase();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Delete account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>
            This is permanent. All your data will be deleted and cannot be recovered.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Deleting your account will permanently remove your profile, social links, follower
              connections, and any other data associated with @{handle}.
            </AlertDescription>
          </Alert>

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">
              Type <strong>@{handle}</strong> to confirm
            </Label>
            <Input
              id="delete-confirm"
              name="confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={handle}
              autoComplete="off"
              autoFocus
            />
          </div>

          {state && "error" in state && state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!confirmed || isPending}
            >
              {isPending ? "Deleting…" : "Permanently delete account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function SecurityView({ session }: Props) {
  const handle = session.user.handle ?? "";
  const email = session.user.email ?? "";

  const maskedEmail = email.includes("@")
    ? `${email.slice(0, 2)}${"•".repeat(Math.max(0, email.indexOf("@") - 2))}${email.slice(email.indexOf("@"))}`
    : email;

  return (
    <div className="container py-8">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <Link href="/settings" className="hover:text-foreground transition-colors">
          Settings
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">Login &amp; Security</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Login &amp; Security</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your username, email address, and password.
        </p>
      </div>

      <div className="space-y-8">
        {/* Account */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Account
          </h2>
          <div className="rounded-lg border divide-y">
            <div className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Username</p>
                <p className="mt-0.5 text-sm text-muted-foreground">@{handle}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Changing your username will break existing links to your profile.
                </p>
              </div>
              <div className="shrink-0">
                <ChangeUsernameDialog currentHandle={handle} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Email address</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{maskedEmail}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  A confirmation link will be sent to your new address.
                </p>
              </div>
              <div className="shrink-0">
                <ChangeEmailDialog currentEmail={email} />
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Password */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Password
          </h2>
          <div className="rounded-lg border">
            <div className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Password</p>
                <p className="mt-0.5 text-sm text-muted-foreground tracking-widest">
                  ••••••••••••
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  You&apos;ll need your current password to set a new one.
                </p>
              </div>
              <div className="shrink-0 flex flex-col gap-2 items-end">
                <ChangePasswordDialog />
                <Button asChild variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground">
                  <Link href="/auth/forgot-password">Forgot password?</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Danger zone */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-destructive">
            Danger Zone
          </h2>
          <div className="rounded-lg border border-destructive/30">
            <div className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Delete account</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Permanently delete your account and all associated data. This cannot be undone.
                </p>
              </div>
              <div className="shrink-0">
                <DeleteAccountDialog handle={handle} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
