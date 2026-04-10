/**
 * Riftseer — Devvit mod-tool bot
 *
 * Triggers:
 *   CommentCreate  → detects [[Card Name]] calls in new comments, replies with
 *                    card image + links.
 *   PostCreate     → same, for new self-posts (title + selftext).
 *
 * Deduplication:
 *   Devvit KV store tracks replied comment/post IDs so the bot never double-replies,
 *   even across re-deploys.
 *
 * Card data:
 *   Delegated to the external Riftseer Elysia API (packages/api).
 *   URLs are stored as app-level secrets (shared across all subreddits).
 *   Set them once with:
 *     npx devvit settings set apiBaseUrl
 *     npx devvit settings set siteBaseUrl
 *
 * Deploy:
 *   cd packages/bot
 *   npm install
 *   npx devvit login        # one-time auth
 *   npx devvit upload       # deploys to your Devvit app
 *   npx devvit playtest r/yoursubreddit  # local live testing
 */

import { Devvit, SettingScope } from "@devvit/public-api";
import { parseCardRequests } from "@riftseer/types";
import { buildReply } from "./handler.js";

// ─── Capabilities ─────────────────────────────────────────────────────────────

Devvit.configure({
  redditAPI: true, // post comment replies
  kvStore: true, // track replied IDs
  http: {
    domains: ["api.riftseer.com"],
  },
});

// ─── App-level secrets (set once by the developer, shared across subreddits) ──
// Set via CLI: npx devvit settings set <name>

Devvit.addSettings([
  {
    type: "string",
    name: "apiBaseUrl",
    label: "Riftseer API base URL",
    helpText: "Full URL of the Riftseer Elysia API.",
    scope: SettingScope.App,
    isSecret: true,
  },
  {
    type: "string",
    name: "siteBaseUrl",
    label: "Riftseer site base URL",
    helpText:
      "URL of the React card browser site, used for [site] and [txt] links in replies.",
    scope: SettingScope.App,
    isSecret: false,
  },
]);

// ─── CommentCreate ────────────────────────────────────────────────────────────

Devvit.addTrigger({
  event: "CommentCreate",

  async onEvent(event, context) {
    const comment = event.comment;
    console.log(
      `[Riftseer] CommentCreate fired — id=${comment?.id} author=${comment?.author} body=${comment?.body?.slice(0, 80)}`,
    );
    try {
      if (!comment) return;

      if (comment.spam || comment.deleted) return;
      if (comment.author.toLowerCase().endsWith("bot")) return;

      const kvKey = `replied:c:${comment.id}`;
      if (await context.kvStore.get(kvKey)) {
        console.log(`[Riftseer] Skipping comment ${comment.id} — already replied`);
        return;
      }

      const requests = parseCardRequests(comment.body);
      await context.kvStore.put(kvKey, "1");

      if (requests.length === 0) {
        console.log(`[Riftseer] No [[...]] tokens in comment ${comment.id}`);
        return;
      }

      console.log(`[Riftseer] Found ${requests.length} card request(s): ${requests.map((r) => r.raw).join(", ")}`);

      const apiBaseUrl = (await context.settings.get<string>("apiBaseUrl")) ?? "";
      const siteBaseUrl =
        (await context.settings.get<string>("siteBaseUrl")) ||
        "https://example.com";

      console.log(`[Riftseer] apiBaseUrl=${apiBaseUrl ? "(set)" : "(empty)"} siteBaseUrl=${siteBaseUrl}`);

      if (!apiBaseUrl) {
        console.error(
          "[Riftseer] apiBaseUrl secret is not set. Run: npx devvit settings set apiBaseUrl",
        );
        return;
      }

      const reply = await buildReply(requests, apiBaseUrl, siteBaseUrl);
      if (!reply) {
        console.log("[Riftseer] buildReply returned null");
        return;
      }

      const commentId = comment.id.startsWith("t1_") ? comment.id : `t1_${comment.id}`;
      await context.reddit.submitComment({
        id: commentId,
        text: reply,
      });

      console.log(`[Riftseer] Replied to comment ${commentId} (${requests.length} card(s))`);
    } catch (err) {
      console.error(`[Riftseer] CommentCreate handler error: ${err}`);
    }
  },
});

// ─── PostCreate (self-posts only) ─────────────────────────────────────────────

Devvit.addTrigger({
  event: "PostCreate",

  async onEvent(event, context) {
    const post = event.post;
    console.log(
      `[Riftseer] PostCreate fired — id=${post?.id} title=${post?.title?.slice(0, 80)}`,
    );
    try {
      if (!post) return;

      if (!post.isSelf) return;
      if (post.spam || post.deleted) return;

      const authorName = event.author?.name ?? "";
      if (authorName.toLowerCase().endsWith("bot")) return;

      const kvKey = `replied:p:${post.id}`;
      if (await context.kvStore.get(kvKey)) return;

      const combined = `${post.title}\n\n${post.selftext}`;
      const requests = parseCardRequests(combined);
      await context.kvStore.put(kvKey, "1");

      if (requests.length === 0) return;

      console.log(`[Riftseer] Found ${requests.length} card request(s) in post: ${requests.map((r) => r.raw).join(", ")}`);

      const apiBaseUrl = (await context.settings.get<string>("apiBaseUrl")) ?? "";
      const siteBaseUrl =
        (await context.settings.get<string>("siteBaseUrl")) ||
        "https://example.com";

      if (!apiBaseUrl) {
        console.error(
          "[Riftseer] apiBaseUrl secret is not set. Run: npx devvit settings set apiBaseUrl",
        );
        return;
      }

      const reply = await buildReply(requests, apiBaseUrl, siteBaseUrl);
      if (!reply) {
        console.log("[Riftseer] buildReply returned null");
        return;
      }

      const postId = post.id.startsWith("t3_") ? post.id : `t3_${post.id}`;
      await context.reddit.submitComment({
        id: postId,
        text: reply,
      });

      console.log(`[Riftseer] Replied to post ${postId} (${requests.length} card(s))`);
    } catch (err) {
      console.error(`[Riftseer] PostCreate handler error: ${err}`);
    }
  },
});

export default Devvit;
