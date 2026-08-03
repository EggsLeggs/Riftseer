"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/views/admin/admin-form-field";
import { ConfirmDialog } from "@/views/admin/confirm-dialog";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { deckJoinHref } from "../paths";
import { useDeckMutations } from "../hooks/use-deck-mutations";
import type { DeckCollaborator, DeckCollaboratorRole, DeckDetail } from "../types";

/**
 * Sharing: the invite link and the collaborator roster.
 *
 * Owner-only, and the API says so too — this is the convenience gate. The two
 * mechanisms are separate on purpose: redeeming a link writes a collaborator
 * row, so regenerating the link locks out nobody who already joined, and
 * removing a person is a separate, individual act.
 */

const ROLE_OPTIONS: Array<{ value: DeckCollaboratorRole; label: string }> = [
  { value: "editor", label: "Editor — can add and cut cards" },
  { value: "viewer", label: "Viewer — can read the deck" },
];

function CollaboratorRow({
  collaborator,
  onRemove,
  disabled,
}: {
  collaborator: DeckCollaborator;
  onRemove: (handle: string) => void;
  disabled: boolean;
}) {
  const handle = collaborator.handle;
  return (
    <li className="flex items-center gap-3 border-b py-2 text-sm last:border-b-0">
      <span className="min-w-0 flex-1 truncate">
        {collaborator.username ?? handle ?? collaborator.user_id}
        {handle && <span className="text-muted-foreground ml-1.5">@{handle}</span>}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs capitalize">
        {collaborator.role}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs">
        via {collaborator.added_via}
      </span>
      {handle && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={disabled}
          onClick={() => onRemove(handle)}
        >
          Remove
        </Button>
      )}
    </li>
  );
}

export function DeckSharingPanel({ deck }: { deck: DeckDetail }) {
  const mutations = useDeckMutations(deck.id);
  const [role, setRole] = React.useState<DeckCollaboratorRole>(
    (deck.invite_role as DeckCollaboratorRole) ?? "editor",
  );
  const [inviteCode, setInviteCode] = React.useState<string | null>(deck.invite_code ?? null);
  const [handle, setHandle] = React.useState("");
  const [addRole, setAddRole] = React.useState<DeckCollaboratorRole>("editor");
  const [pendingRemoval, setPendingRemoval] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");

  // The absolute link is only knowable in the browser, and rendering it during
  // SSR would hydrate-mismatch against whatever origin the page was served on.
  React.useEffect(() => setOrigin(window.location.origin), []);

  React.useEffect(() => setInviteCode(deck.invite_code ?? null), [deck.invite_code]);

  const inviteUrl = inviteCode ? `${origin}${deckJoinHref(inviteCode)}` : "";

  const createInvite = async () => {
    try {
      const result = await mutations.setInvite.mutateAsync([deck.id, role]);
      setInviteCode(result.invite_code);
    } catch {
      // toast already raised
    }
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy manually.");
    }
  };

  const addCollaborator = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    try {
      await mutations.addCollaborator.mutateAsync([deck.id, trimmed, addRole]);
      setHandle("");
    } catch {
      // toast already raised
    }
  };

  const collaborators = deck.collaborators ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-1 text-sm font-medium">Invite link</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Anyone with the link joins with the role you choose. Regenerating
          replaces the link; people who already joined keep their access.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            id="deck-invite-role"
            label="Role"
            className="w-56"
            value={role}
            onChange={(event) => setRole(event.target.value as DeckCollaboratorRole)}
            options={ROLE_OPTIONS}
          />
          <Button
            type="button"
            onClick={createInvite}
            disabled={mutations.setInvite.isPending}
          >
            {inviteCode ? "Regenerate link" : "Create link"}
          </Button>
          {inviteCode && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setInviteCode(null);
                void mutations.clearInvite.mutateAsync([deck.id]).catch(() => {
                  setInviteCode(deck.invite_code ?? null);
                });
              }}
              disabled={mutations.clearInvite.isPending}
            >
              Revoke
            </Button>
          )}
        </div>

        {inviteCode && (
          <div className="mt-3 flex items-center gap-2">
            <Label htmlFor="deck-invite-url" className="sr-only">
              Invite link
            </Label>
            <Input
              id="deck-invite-url"
              readOnly
              value={inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" onClick={copyInvite}>
              Copy
            </Button>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-medium">Collaborators</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Editors can change cards and details. Only you can change who can see
          the deck.
        </p>

        <form onSubmit={addCollaborator} className="mb-3 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-collaborator-handle">Handle</Label>
            <Input
              id="deck-collaborator-handle"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="riftwalker"
              className="w-56"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-collaborator-role">Role</Label>
            <select
              id="deck-collaborator-role"
              className={CARD_BROWSE_SELECT_CLASS}
              value={addRole}
              onChange={(event) => setAddRole(event.target.value as DeckCollaboratorRole)}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={mutations.addCollaborator.isPending}>
            Add
          </Button>
        </form>

        {collaborators.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nobody else has access yet.</p>
        ) : (
          <ul>
            {collaborators.map((collaborator) => (
              <CollaboratorRow
                key={collaborator.user_id}
                collaborator={collaborator}
                disabled={mutations.removeCollaborator.isPending}
                onRemove={setPendingRemoval}
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title="Remove collaborator"
        description={`@${pendingRemoval ?? ""} will lose access to this deck.`}
        confirmLabel="Remove"
        destructive
        pending={mutations.removeCollaborator.isPending}
        onConfirm={() => {
          const target = pendingRemoval;
          if (!target) return;
          void mutations.removeCollaborator
            .mutateAsync([deck.id, target])
            .catch(() => undefined)
            .finally(() => setPendingRemoval(null));
        }}
      />
    </div>
  );
}
