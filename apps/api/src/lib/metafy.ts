import { authAdminClient } from "./supabase";
import { runInBackground } from "./background";
import { createLinkedAccountsRepository } from "../repos/linked-accounts.repo";

const linkedAccounts = authAdminClient ? createLinkedAccountsRepository(authAdminClient) : null;

/** Upstream Metafy calls must not hold a request open until the platform limit. */
const METAFY_TIMEOUT_MS = 8_000;

// ─── Webhook ──────────────────────────────────────────────────────────────────

interface WebhookSubscriptionData {
  id: string;
  user_id: string;
  email: string;
  community_id: string;
  tier_id?: string;
  tier_name?: string;
}

interface MetafyWebhookPayload {
  id: string;
  version: string;
  type: string;
  occurred_at: string;
  account_id: string;
  data: WebhookSubscriptionData;
}

async function verifyWebhookSignature(
  secret: string,
  signature: string,
  timestamp: string,
  rawBody: string,
): Promise<boolean> {
  const message = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = `sha256=${hex}`;

  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function handleMetafyWebhook(request: Request): Promise<Response> {
  const webhookSecret = process.env.METAFY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response("Webhook not configured", { status: 503 });
  }

  const signature = request.headers.get("x-webhook-signature") ?? "";
  const timestamp = request.headers.get("x-webhook-timestamp") ?? "";

  if (!signature || !timestamp) {
    return new Response("Missing webhook headers", { status: 400 });
  }

  // Reject events older than 5 minutes
  const eventTime = new Date(timestamp).getTime();
  if (isNaN(eventTime) || Date.now() - eventTime > 5 * 60 * 1000) {
    return new Response("Timestamp too old", { status: 400 });
  }

  const rawBody = await request.text();

  const valid = await verifyWebhookSignature(webhookSecret, signature, timestamp, rawBody);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: MetafyWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetafyWebhookPayload;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  // Process asynchronously — respond 200 first, then update DB
  runInBackground(processWebhookEvent(payload), `metafy-webhook ${payload.type}`);

  return new Response("OK", { status: 200 });
}

/** Status columns each event type writes, or null for events we ignore. */
function webhookStatusUpdate(type: string): Record<string, boolean> | null {
  switch (type) {
    case "member.joined":
      return { is_member: true };
    case "member.left":
      // Left the community entirely — remove both member and supporter status
      return { is_member: false, is_supporter: false };
    case "subscription.created":
    case "subscription.renewed":
    case "subscription.upgraded":
    case "subscription.downgraded":
      // Subscribers are always members
      return { is_supporter: true, is_member: true };
    case "subscription.expired":
    case "subscription.canceled":
      // Only remove supporter status — they may remain a free member
      return { is_supporter: false };
    default:
      return null;
  }
}

async function processWebhookEvent(payload: MetafyWebhookPayload): Promise<void> {
  if (!linkedAccounts) return;

  const { type, data } = payload;
  const metafyUserId = data?.user_id;
  if (!metafyUserId) return;

  const updates = webhookStatusUpdate(type);
  if (!updates) return;

  const parsedOccurredAt = Date.parse(payload.occurred_at);
  const occurredAt = Number.isNaN(parsedOccurredAt) ? Date.now() : parsedOccurredAt;

  const { data: linked, error: lookupError } =
    await linkedAccounts.findMetafyLinkByProviderUser(metafyUserId);

  if (lookupError) {
    console.error(
      `[metafy-webhook] ${type}: lookup failed for provider user ${metafyUserId}:`,
      lookupError.message,
    );
    return;
  }
  if (!linked) return; // User hasn't linked their Riftseer account yet

  // Redelivered and out-of-order events must not overwrite newer state.
  const lastChecked = linked.status_checked_at
    ? Date.parse(linked.status_checked_at as string)
    : NaN;
  if (!Number.isNaN(lastChecked) && lastChecked > occurredAt) return;

  const { error: updateError } = await linkedAccounts.updateMetafyStatus(linked.user_id, {
    ...updates,
    status_checked_at: new Date(occurredAt).toISOString(),
  });

  if (updateError) {
    console.error(
      `[metafy-webhook] ${type}: status update failed for user ${linked.user_id}:`,
      updateError.message,
    );
  }
}

export const METAFY_AUTHORIZE_URL = "https://metafy.gg/auth/authorize";
export const METAFY_TOKEN_URL = "https://metafy.gg/irk/oauth/token";
export const METAFY_API_BASE = "https://metafy.gg/irk/api";
export const METAFY_SCOPES = "profile purchases community";

/**
 * Calls GET /v1/community/list-joined-communities to check if the user
 * is a member of our community (free or paid). Returns null on error.
 */
export async function checkMetafyMembership(
  accessToken: string,
  communityId: string,
): Promise<boolean | null> {
  try {
    const res = await fetch(`${METAFY_API_BASE}/v1/community/list-joined-communities`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(METAFY_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      communities?: Array<{ id?: string; community_id?: string }>;
    } | null;
    if (!data?.communities) return null;
    return data.communities.some((c) => c.id === communityId || c.community_id === communityId);
  } catch {
    return null;
  }
}

/**
 * Calls GET /v1/me/purchases/communities/{communityId} with the stored access
 * token to check active supporter status. 200 + has_access = true means
 * supporter; 404 means no subscription; 401 means expired token.
 *
 * Updates linked_accounts.is_supporter and status_checked_at in place.
 * Returns the new supporter boolean. Non-2xx (except 404) is treated as unknown
 * and leaves the existing value unchanged (returns false on first call).
 */
export async function refreshMetafySupporterStatus(
  userId: string,
  accessToken: string,
  communityId: string,
): Promise<boolean> {
  let isSupporter = false;
  let gotDefinitiveAnswer = false;

  try {
    const res = await fetch(
      `${METAFY_API_BASE}/v1/me/purchases/communities/${encodeURIComponent(communityId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(METAFY_TIMEOUT_MS),
      },
    );

    if (res.ok) {
      const data = (await res.json().catch(() => null)) as {
        community?: { has_access?: boolean };
      } | null;
      isSupporter = data?.community?.has_access === true;
      gotDefinitiveAnswer = true;
    } else if (res.status === 404 || res.status === 403) {
      // 404 = no subscription to this community; 403 = not authorized
      isSupporter = false;
      gotDefinitiveAnswer = true;
    }
    // 401 = token expired; 5xx = upstream error — skip update, return false
  } catch {
    // Network error — best-effort, skip update
  }

  if (gotDefinitiveAnswer && linkedAccounts) {
    const { error } = await linkedAccounts.updateMetafyStatus(userId, {
      is_supporter: isSupporter,
      status_checked_at: new Date().toISOString(),
    });
    if (error) {
      console.error(`[metafy] supporter status update failed for user ${userId}:`, error.message);
    }
  }

  return isSupporter;
}
