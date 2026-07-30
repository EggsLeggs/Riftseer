import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminRpcResult {
  ok: boolean;
  reason?: string;
  [key: string]: unknown;
}

export interface AdminSlugCard {
  id: string;
  name: string;
  name_normalized: string;
  collector_number?: string;
  set?: {
    set_code: string;
    set_name: string;
  };
  metadata?: {
    alternate_art?: boolean;
    signature?: boolean;
  };
}

export interface AdminDataRepository {
  callRpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<AdminRpcResult>;
  getSlugCard(cardId: string): Promise<AdminSlugCard | null>;
  getTakenSlugs(excludeCardId?: string): Promise<Set<string>>;
}

export class AdminRepositoryError extends Error {
  constructor(
    message: string,
    readonly databaseCode?: string,
  ) {
    super(message);
    this.name = "AdminRepositoryError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSlugCard(value: unknown): AdminSlugCard | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.name_normalized !== "string"
  ) {
    return null;
  }

  const joinedSet = Array.isArray(value.sets) ? value.sets[0] : value.sets;
  const set =
    isRecord(joinedSet) &&
    typeof joinedSet.set_code === "string" &&
    typeof joinedSet.set_name === "string"
      ? {
          set_code: joinedSet.set_code,
          set_name: joinedSet.set_name,
        }
      : undefined;
  const metadata = isRecord(value.metadata)
    ? {
        alternate_art:
          typeof value.metadata.alternate_art === "boolean"
            ? value.metadata.alternate_art
            : undefined,
        signature:
          typeof value.metadata.signature === "boolean"
            ? value.metadata.signature
            : undefined,
      }
    : undefined;

  return {
    id: value.id,
    name: value.name,
    name_normalized: value.name_normalized,
    collector_number:
      typeof value.collector_number === "string"
        ? value.collector_number
        : undefined,
    set,
    metadata,
  };
}

export function createAdminDataRepository(
  client: SupabaseClient,
): AdminDataRepository {
  return {
    async callRpc(name, args) {
      const { data, error } = await client.rpc(name, args);
      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }
      if (!isRecord(data) || typeof data.ok !== "boolean") {
        throw new AdminRepositoryError(
          `${name} returned an invalid response`,
          "INVALID_RPC_RESPONSE",
        );
      }
      const { ok, reason, ...rest } = data;
      return {
        ...rest,
        ok,
        ...(typeof reason === "string" ? { reason } : {}),
      };
    },

    async getSlugCard(cardId) {
      const { data, error } = await client
        .from("cards")
        .select(
          "id, name, name_normalized, collector_number, metadata, sets:set_id(set_code, set_name)",
        )
        .eq("id", cardId)
        .maybeSingle();
      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }
      return data ? parseSlugCard(data) : null;
    },

    async getTakenSlugs(excludeCardId) {
      const taken = new Set<string>();
      const pageSize = 1000;

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await client
          .from("cards")
          .select("id, public_slug")
          .order("id")
          .range(from, from + pageSize - 1);
        if (error) {
          throw new AdminRepositoryError(error.message, error.code);
        }

        const rows = data ?? [];
        for (const row of rows) {
          if (
            row.id !== excludeCardId &&
            typeof row.public_slug === "string" &&
            row.public_slug
          ) {
            taken.add(row.public_slug);
          }
        }
        if (rows.length < pageSize) break;
      }

      return taken;
    },
  };
}
