import type { DeckComment } from "./types";

/**
 * Arranging the API's flat comment list into the tree the page renders.
 *
 * Pure, so the collapse rules can be tested without a network: roots default
 * to newest first (the page can ask for oldest), each reply list oldest first
 * (a conversation reads downward), and an orphan — its parent beyond the list
 * cap, or racing a delete — is promoted to a root rather than dropped, because
 * losing a comment is worse than losing its indentation.
 */

export interface DeckCommentNode {
  comment: DeckComment;
  replies: DeckCommentNode[];
}

export type CommentSort = "newest" | "oldest";

export function buildCommentTree(
  comments: readonly DeckComment[],
  sort: CommentSort = "newest",
): DeckCommentNode[] {
  const nodes = new Map<string, DeckCommentNode>();
  for (const comment of comments) {
    nodes.set(comment.id, { comment, replies: [] });
  }

  const roots: DeckCommentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.comment.parent_id ? nodes.get(node.comment.parent_id) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }

  const byNewest = (a: DeckCommentNode, b: DeckCommentNode) =>
    b.comment.created_at.localeCompare(a.comment.created_at);
  const byOldest = (a: DeckCommentNode, b: DeckCommentNode) =>
    a.comment.created_at.localeCompare(b.comment.created_at);

  roots.sort(sort === "oldest" ? byOldest : byNewest);
  const sortReplies = (node: DeckCommentNode) => {
    node.replies.sort(byOldest);
    node.replies.forEach(sortReplies);
  };
  roots.forEach(sortReplies);
  return roots;
}

/** Every comment in a subtree, for "Show N replies". */
export function countReplies(node: DeckCommentNode): number {
  return node.replies.reduce((sum, reply) => sum + 1 + countReplies(reply), 0);
}
