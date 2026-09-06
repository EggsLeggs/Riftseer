import { describe, expect, test } from "bun:test";
import { buildCommentTree, countReplies } from "./deck-comments";
import type { DeckComment } from "./types";

function comment(overrides: Partial<DeckComment> = {}): DeckComment {
  return {
    id: "c1",
    parent_id: null,
    depth: 0,
    body: "hello",
    deleted: false,
    created_at: "2026-09-01T00:00:00Z",
    author: { id: "u1", handle: "amory", username: "Amory" },
    like_count: 0,
    ...overrides,
  } as DeckComment;
}

describe("buildCommentTree", () => {
  test("roots newest first by default, replies oldest first", () => {
    const tree = buildCommentTree([
      comment({ id: "old-root", created_at: "2026-09-01T00:00:00Z" }),
      comment({ id: "new-root", created_at: "2026-09-03T00:00:00Z" }),
      comment({ id: "r2", parent_id: "old-root", depth: 1, created_at: "2026-09-02T10:00:00Z" }),
      comment({ id: "r1", parent_id: "old-root", depth: 1, created_at: "2026-09-02T09:00:00Z" }),
    ]);
    expect(tree.map((node) => node.comment.id)).toEqual(["new-root", "old-root"]);
    expect(tree[1]?.replies.map((node) => node.comment.id)).toEqual(["r1", "r2"]);
  });

  test("roots oldest first when asked", () => {
    const tree = buildCommentTree(
      [
        comment({ id: "old-root", created_at: "2026-09-01T00:00:00Z" }),
        comment({ id: "new-root", created_at: "2026-09-03T00:00:00Z" }),
      ],
      "oldest",
    );
    expect(tree.map((node) => node.comment.id)).toEqual(["old-root", "new-root"]);
  });

  test("an orphan parent promotes the reply to a root instead of dropping it", () => {
    const tree = buildCommentTree([
      comment({ id: "reply", parent_id: "missing", depth: 3 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.comment.id).toBe("reply");
  });

  test("tombstones keep their place in the thread", () => {
    const tree = buildCommentTree([
      comment({ id: "root", body: null, deleted: true }),
      comment({ id: "child", parent_id: "root", depth: 1, created_at: "2026-09-02T00:00:00Z" }),
    ]);
    expect(tree[0]?.comment.deleted).toBe(true);
    expect(tree[0]?.replies[0]?.comment.id).toBe("child");
  });

  test("countReplies counts the whole subtree", () => {
    const tree = buildCommentTree([
      comment({ id: "root" }),
      comment({ id: "a", parent_id: "root", depth: 1, created_at: "2026-09-02T00:00:00Z" }),
      comment({ id: "b", parent_id: "a", depth: 2, created_at: "2026-09-03T00:00:00Z" }),
      comment({ id: "c", parent_id: "root", depth: 1, created_at: "2026-09-04T00:00:00Z" }),
    ]);
    expect(countReplies(tree[0]!)).toBe(3);
  });
});
