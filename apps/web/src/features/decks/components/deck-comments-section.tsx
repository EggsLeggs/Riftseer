"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { EllipsisIcon, HeartIcon, MessageSquareIcon } from "lucide-react";
import { toast } from "sonner";

import { ProfileIcon } from "@/components/profile-icon";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { AppDropdownMenuContent } from "@/components/layout/clear-body-pointer-events";
import { cn } from "@/lib/utils";
import {
  deleteDeckCommentAction,
  postDeckCommentAction,
  setDeckCommentLikeAction,
} from "../actions";
import { deckQueryKeys } from "../api";
import { useDeckComments } from "../hooks/use-deck-comments";
import {
  buildCommentTree,
  countReplies,
  type CommentSort,
  type DeckCommentNode,
} from "../deck-comments";
import { deckHref, userDecksHref } from "../paths";

import type { DeckComment, DeckCommentsPage, DeckDetail } from "../types";
import { useResetWhen } from "@/lib/use-derived-state";

/**
 * The deck's comment thread, Reddit/YouTube-shaped: roots expanded, the first
 * levels of replies visible, anything deeper behind "Show N replies".
 *
 * The API hands back a flat list with each row's `can_delete` and `is_liked`
 * already decided, so nothing here re-derives moderation or like state.
 * Deleting always leaves a tombstone in place — the thread never re-flows
 * under someone mid-read.
 */

/** Replies deeper than this start collapsed. */
const VISIBLE_DEPTH = 3;

export function DeckCommentsSection({
  deck,
  isSignedIn,
}: {
  deck: DeckDetail;
  isSignedIn: boolean;
}) {
  const queryClient = useQueryClient();
  const comments = useDeckComments(deck.id, isSignedIn);
  const [sort, setSort] = React.useState<CommentSort>("oldest");

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: deckQueryKeys.comments(deck.id) });

  const tree = React.useMemo(
    () => buildCommentTree(comments.data?.items ?? [], sort),
    [comments.data?.items, sort],
  );
  const total = comments.data?.total ?? 0;

  return (
    // `id` is the header chip's anchor. Full width of the page, not a narrow column.
    <section id="comments" aria-label="Comments" className="scroll-mt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold">
          Comments
          {total > 0 && (
            <span className="text-muted-foreground ml-1.5 tabular-nums">({total})</span>
          )}
        </h2>
        <CommentSortBar value={sort} onChange={setSort} />
      </div>

      {isSignedIn ? (
        <CommentComposer deckId={deck.id} placeholder="Add a comment…" onPosted={refresh} />
      ) : (
        <p className="text-muted-foreground mb-4 text-sm">
          <Link
            href={`/auth/login?next=${encodeURIComponent(deckHref(deck))}`}
            className="underline underline-offset-4"
          >
            Sign in
          </Link>{" "}
          to join the conversation.
        </p>
      )}

      {comments.isPending ? (
        <p className="text-muted-foreground text-sm">Loading comments…</p>
      ) : comments.isError ? (
        <p className="text-muted-foreground text-sm">{(comments.error as Error).message}</p>
      ) : tree.length === 0 ? (
        <p className="text-muted-foreground text-sm">No comments yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-5">
          {tree.map((node) => (
            <CommentThread
              key={node.comment.id}
              deckId={deck.id}
              node={node}
              isSignedIn={isSignedIn}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentSortBar({
  value,
  onChange,
}: {
  value: CommentSort;
  onChange: (next: CommentSort) => void;
}) {
  return (
    <p className="text-muted-foreground text-xs">
      Sort:{" "}
      <button
        type="button"
        className={cn("hover:text-foreground", value === "oldest" && "text-primary font-medium")}
        onClick={() => onChange("oldest")}
      >
        Oldest first
      </button>
      <span aria-hidden="true"> / </span>
      <button
        type="button"
        className={cn("hover:text-foreground", value === "newest" && "text-primary font-medium")}
        onClick={() => onChange("newest")}
      >
        Newest first
      </button>
    </p>
  );
}

function CommentComposer({
  deckId,
  placeholder,
  parentId,
  autoFocus,
  onPosted,
  onCancel,
}: {
  deckId: string;
  placeholder: string;
  parentId?: string;
  autoFocus?: boolean;
  onPosted: () => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = React.useState("");
  const [posting, setPosting] = React.useState(false);

  const post = async () => {
    const text = body.trim();
    if (!text) return;
    setPosting(true);
    const result = await postDeckCommentAction(deckId, text, parentId);
    setPosting(false);
    if (result.ok) {
      setBody("");
      onPosted();
      onCancel?.();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="mb-4 flex w-full flex-col gap-2">
      <Textarea
        value={body}
        rows={parentId ? 2 : 3}
        maxLength={2000}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        className="w-full"
        onChange={(event) => setBody(event.target.value)}
      />
      {(body.trim() || onCancel) && (
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={posting}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={post} disabled={posting || !body.trim()}>
            {posting ? "Posting…" : parentId ? "Reply" : "Comment"}
          </Button>
        </div>
      )}
    </div>
  );
}

function CommentThread({
  deckId,
  node,
  isSignedIn,
  onChanged,
}: {
  deckId: string;
  node: DeckCommentNode;
  isSignedIn: boolean;
  onChanged: () => void;
}) {
  const { comment } = node;
  const [replying, setReplying] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [expanded, setExpanded] = React.useState(comment.depth < VISIBLE_DEPTH);
  const hiddenReplies = countReplies(node);
  const replyCount = node.replies.length;

  return (
    <li className={comment.depth > 0 ? "border-border border-l pl-3 sm:pl-4" : undefined}>
      <div className="flex gap-3">
        <ProfileIcon
          username={comment.author?.username}
          handle={comment.author?.handle}
          size="md"
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                {comment.author ? (
                  <Link
                    href={userDecksHref(comment.author.handle)}
                    className="text-foreground font-semibold hover:underline"
                  >
                    {comment.author.username}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Deleted user</span>
                )}
                {comment.author && (
                  <span className="text-muted-foreground">@{comment.author.handle}</span>
                )}
                <span className="text-muted-foreground" aria-hidden="true">
                  ·
                </span>
                <time
                  className="text-muted-foreground text-xs"
                  dateTime={comment.created_at}
                  suppressHydrationWarning
                >
                  {shortCommentDate(comment.created_at)}
                </time>
              </div>

              {comment.deleted ? (
                <p className="text-muted-foreground mt-1 text-sm italic">Comment deleted.</p>
              ) : (
                <p className="mt-1 text-sm whitespace-pre-line">{comment.body}</p>
              )}
            </div>

            {comment.can_delete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground -mr-1 rounded p-1"
                    aria-label="Comment actions"
                  >
                    <EllipsisIcon className="size-4" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <AppDropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                    Delete
                  </DropdownMenuItem>
                </AppDropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {!comment.deleted && (
            <div className="text-muted-foreground mt-2 flex items-center gap-4 text-xs">
              {isSignedIn && comment.depth < 7 ? (
                <button
                  type="button"
                  className="hover:text-foreground inline-flex items-center gap-1"
                  onClick={() => setReplying((current) => !current)}
                >
                  <MessageSquareIcon className="size-3.5" aria-hidden="true" />
                  {replyCount}
                  <span className="sr-only">{replyCount === 1 ? "reply" : "replies"}</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <MessageSquareIcon className="size-3.5" aria-hidden="true" />
                  {replyCount}
                </span>
              )}
              <CommentLikeButton deckId={deckId} comment={comment} isSignedIn={isSignedIn} />
            </div>
          )}

          {replying && (
            <div className="mt-3">
              <CommentComposer
                deckId={deckId}
                placeholder="Write a reply…"
                parentId={comment.id}
                autoFocus
                onPosted={onChanged}
                onCancel={() => setReplying(false)}
              />
            </div>
          )}

          {node.replies.length > 0 &&
            (expanded ? (
              <ul className="mt-4 flex flex-col gap-4">
                {node.replies.map((reply) => (
                  <CommentThread
                    key={reply.comment.id}
                    deckId={deckId}
                    node={reply}
                    isSignedIn={isSignedIn}
                    onChanged={onChanged}
                  />
                ))}
              </ul>
            ) : (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground mt-2 text-xs underline-offset-4 hover:underline"
                onClick={() => setExpanded(true)}
              >
                Show {hiddenReplies} {hiddenReplies === 1 ? "reply" : "replies"}
              </button>
            ))}
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete comment"
        description="The comment is replaced by a tombstone so replies keep their place."
        confirmLabel="Delete comment"
        destructive
        onConfirm={() => {
          void deleteDeckCommentAction(deckId, comment.id).then((result) => {
            setDeleting(false);
            if (result.ok) onChanged();
            else toast.error(result.error);
          });
        }}
      />
    </li>
  );
}

function CommentLikeButton({
  deckId,
  comment,
  isSignedIn,
}: {
  deckId: string;
  comment: DeckComment;
  isSignedIn: boolean;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = React.useState({
    liked: comment.is_liked ?? false,
    count: comment.like_count ?? 0,
  });
  const [pending, setPending] = React.useState(false);

  useResetWhen([comment.is_liked, comment.like_count], () =>
    setState({ liked: comment.is_liked ?? false, count: comment.like_count ?? 0 }),
  );

  if (!isSignedIn) {
    return (
      <Link
        href={`/auth/login?next=${encodeURIComponent(`/deck/${deckId}`)}`}
        className="hover:text-foreground inline-flex items-center gap-1"
        aria-label="Sign in to like this comment"
      >
        <HeartIcon className="size-3.5" aria-hidden="true" />
        {state.count}
      </Link>
    );
  }

  const toggle = async () => {
    const next = !state.liked;
    const before = state;
    setState({ liked: next, count: Math.max(0, state.count + (next ? 1 : -1)) });
    setPending(true);
    const result = await setDeckCommentLikeAction(deckId, comment.id, next);
    setPending(false);
    if (result.ok) {
      setState({ liked: result.data.liked, count: result.data.like_count });
      queryClient.setQueryData<DeckCommentsPage>(deckQueryKeys.comments(deckId), (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === comment.id
                  ? { ...item, like_count: result.data.like_count, is_liked: result.data.liked }
                  : item,
              ),
            }
          : current,
      );
    } else {
      setState(before);
      toast.error(result.error);
    }
  };

  return (
    <button
      type="button"
      className={cn(
        "hover:text-foreground inline-flex items-center gap-1",
        state.liked && "text-red-500 dark:text-red-400",
      )}
      disabled={pending}
      aria-pressed={state.liked}
      aria-label={state.liked ? "Unlike this comment" : "Like this comment"}
      onClick={toggle}
    >
      <HeartIcon className={cn("size-3.5", state.liked && "fill-current")} aria-hidden="true" />
      {state.count}
    </button>
  );
}

function shortCommentDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
