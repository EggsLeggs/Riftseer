/**
 * RiftSeer — Devvit mod-tool bot
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
 *   Delegated to the external RiftSeer Elysia API (packages/api).
 *   Configure the URL in the app's Settings after installing it on your subreddit.
 *
 * Deploy:
 *   cd packages/bot
 *   npm install
 *   npx devvit login        # one-time auth
 *   npx devvit upload       # deploys to your Devvit app
 *   npx devvit playtest r/yoursubreddit  # local live testing
 */

import { Devvit } from "@devvit/public-api";
import { parseCardRequests } from "./parser.js";
import { buildReply } from "./handler.js";

// ─── Capabilities ─────────────────────────────────────────────────────────────

Devvit.configure({
  redditAPI: true, // post comment replies
  kvStore: true,   // track replied IDs
  http: true,      // call external RiftSeer API
});

// ─── Installer-configurable settings ─────────────────────────────────────────
// Mods configure these from the subreddit's App settings page after installing.

Devvit.addSettings([
  {
    type: "string",
    name: "apiBaseUrl",
    label: "RiftSeer API base URL",
    helpText:
      "Full URL of your running RiftSeer Elysia API, e.g. https://api.riftseer.example.com",
    isSecret: false,
    defaultValue: "",
  },
  {
    type: "string",
    name: "siteBaseUrl",
    label: "RiftSeer site base URL",
    helpText:
      "URL of the future React card browser site, used for [site] and [txt] links in replies.",
    isSecret: false,
    defaultValue: "https://example.com",
  },
]);

// ─── CommentCreate ────────────────────────────────────────────────────────────

Devvit.addTrigger({
  event: "CommentCreate",

  async onEvent(event, context) {
    const comment = event.comment;
    if (!comment) return;

    // Skip spam, deleted, and apparent bot accounts
    if (comment.spam || comment.deleted) return;
    if (comment.author.toLowerCase().endsWith("bot")) return;

    // Skip if we already replied (survives re-deploys via KV store)
    const kvKey = `replied:c:${comment.id}`;
    if (await context.kvStore.get(kvKey)) return;

    // Parse [[...]] tokens; mark as seen even if none found (avoids re-checking)
    const requests = parseCardRequests(comment.body);
    await context.kvStore.put(kvKey, "1");

    if (requests.length === 0) return;

    // Resolve via external API
    const apiBaseUrl = (await context.settings.get<string>("apiBaseUrl")) ?? "";
    const siteBaseUrl =
      (await context.settings.get<string>("siteBaseUrl")) || "https://example.com";

    if (!apiBaseUrl) {
      console.error("[RiftSeer] apiBaseUrl setting is not configured. Skipping.");
      return;
    }

    const reply = await buildReply(requests, apiBaseUrl, siteBaseUrl);
    if (!reply) return;

    await context.reddit.submitComment({
      id: `t1_${comment.id}`,
      text: reply,
    });

    console.log(`[RiftSeer] Replied to comment t1_${comment.id} (${requests.length} card(s))`);
  },
});

// ─── PostCreate (self-posts only) ─────────────────────────────────────────────

Devvit.addTrigger({
  event: "PostCreate",

  async onEvent(event, context) {
    const post = event.post;
    if (!post) return;

    // Only process self-posts (text posts, not link posts)
    if (!post.isSelf) return;
    if (post.spam || post.deleted) return;

    // Use event.author for the username (PostV2.authorId is an ID, not a name)
    const authorName = event.author?.name ?? "";
    if (authorName.toLowerCase().endsWith("bot")) return;

    const kvKey = `replied:p:${post.id}`;
    if (await context.kvStore.get(kvKey)) return;

    // Scan both title and selftext for card calls
    const combined = `${post.title}\n\n${post.selftext}`;
    const requests = parseCardRequests(combined);
    await context.kvStore.put(kvKey, "1");

    if (requests.length === 0) return;

    const apiBaseUrl = (await context.settings.get<string>("apiBaseUrl")) ?? "";
    const siteBaseUrl =
      (await context.settings.get<string>("siteBaseUrl")) || "https://example.com";

    if (!apiBaseUrl) {
      console.error("[RiftSeer] apiBaseUrl setting is not configured. Skipping.");
      return;
    }

    const reply = await buildReply(requests, apiBaseUrl, siteBaseUrl);
    if (!reply) return;

    await context.reddit.submitComment({
      id: `t3_${post.id}`,
      text: reply,
    });

    console.log(`[RiftSeer] Replied to post t3_${post.id} (${requests.length} card(s))`);
  },
});

export default Devvit;
