import { CARD_IMAGE_JOB_VERSION } from "@riftseer/types/card-image";
import {
  AdminRepositoryError,
  type AdminDataRepository,
  type AdminRpcResult,
} from "../../repos/admin.repo";
import type { createAdminPlugin } from "../../plugins/admin-auth";

// ─── Admin route helpers ──────────────────────────────────────────────────────

export const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
export const NON_BLANK_PATTERN = ".*\\S.*";
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const AUDIT_LOG_MAX_LIMIT = 200;
export const RECONCILIATION_MAX_LIMIT = 200;
export const PRINTING_LIST_MAX_LIMIT = 200;
export const ADMIN_IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface AdminImageJob {
  version: typeof CARD_IMAGE_JOB_VERSION;
  printingId: string;
  sourceUrl: string;
  sourceHash: string;
  sourceProvider: "admin";
}

export interface AdminImageBindings {
  bucket: {
    put(
      key: string,
      value: ArrayBuffer,
      options: {
        httpMetadata: {
          contentType: string;
          cacheControl: string;
        };
        customMetadata: Record<string, string>;
      },
    ): Promise<unknown>;
    delete(key: string): Promise<void>;
  };
  queue: {
    send(job: AdminImageJob): Promise<unknown>;
  };
  baseUrl: string;
}

export interface FailureResponse {
  status: 400 | 404 | 409;
  body: {
    error: string;
    code: string;
  };
}

export type SafeResult<T> =
  | { data: T }
  | {
      error: {
        status: 409 | 500;
        body: {
          error: string;
          code: string;
        };
      };
    };

export function mutationFailure(result: AdminRpcResult): FailureResponse | null {
  if (result.ok) return null;

  switch (result.reason) {
    case "oracle_not_found":
      return {
        status: 404,
        body: { error: "Card not found", code: "ORACLE_NOT_FOUND" },
      };
    case "printing_not_found":
      return {
        status: 404,
        body: { error: "Printing not found", code: "PRINTING_NOT_FOUND" },
      };
    case "related_oracle_not_found":
      return {
        status: 404,
        body: {
          error: "Related card not found",
          code: "RELATED_ORACLE_NOT_FOUND",
        },
      };
    case "set_not_found":
      return {
        status: 404,
        body: { error: "Set not found", code: "SET_NOT_FOUND" },
      };
    case "format_not_found":
      return {
        status: 404,
        body: { error: "Format not found", code: "FORMAT_NOT_FOUND" },
      };
    case "ruling_not_found":
      return {
        status: 404,
        body: { error: "Ruling not found", code: "RULING_NOT_FOUND" },
      };
    case "reconciliation_entry_not_found":
      return {
        status: 404,
        body: {
          error: "Review entry not found",
          code: "REVIEW_ENTRY_NOT_FOUND",
        },
      };
    case "oracle_exists":
      return {
        status: 409,
        body: { error: "Card already exists", code: "ORACLE_EXISTS" },
      };
    case "printing_exists":
      return {
        status: 409,
        body: { error: "Printing id already exists", code: "PRINTING_EXISTS" },
      };
    case "set_exists":
      return {
        status: 409,
        body: { error: "Set already exists", code: "SET_EXISTS" },
      };
    case "format_exists":
      return {
        status: 409,
        body: { error: "Format code already exists", code: "FORMAT_EXISTS" },
      };
    case "slug_taken":
      return {
        status: 409,
        body: { error: "That slug is already in use", code: "SLUG_TAKEN" },
      };
    case "set_not_empty":
      return {
        status: 409,
        body: {
          error: "Move or delete every printing in the set first",
          code: "SET_NOT_EMPTY",
        },
      };
    case "reconciliation_entry_resolved":
      return {
        status: 409,
        body: {
          error: "Review entry has already been resolved",
          code: "REVIEW_ENTRY_RESOLVED",
        },
      };
    case "invalid_kind":
      return {
        status: 400,
        body: {
          error: "Unsupported relationship kind",
          code: "INVALID_RELATIONSHIP_KIND",
        },
      };
    case "self_relation":
      return {
        status: 400,
        body: {
          error: "A card cannot be related to itself",
          code: "SELF_RELATIONSHIP",
        },
      };
    case "invalid_zone":
      return {
        status: 400,
        body: { error: "Unknown deck zone", code: "INVALID_ZONE" },
      };
    case "invalid_status":
      return {
        status: 400,
        body: { error: "Unknown legality status", code: "INVALID_STATUS" },
      };
    case "invalid_severity":
      return {
        status: 400,
        body: { error: "Unknown violation severity", code: "INVALID_SEVERITY" },
      };
    case "invalid_count":
      return {
        status: 400,
        body: {
          error: "Zone counts cannot be negative. Leave a bound empty to make it unconstrained.",
          code: "INVALID_COUNT",
        },
      };
    case "invalid_range":
      return {
        status: 400,
        body: {
          error: "A zone's minimum cannot exceed its maximum",
          code: "INVALID_RANGE",
        },
      };
    default:
      return {
        status: 400,
        body: {
          error: "Admin mutation was rejected",
          code: "ADMIN_MUTATION_REJECTED",
        },
      };
  }
}

export async function safely<T>(
  action: string,
  operation: () => Promise<T>,
): Promise<SafeResult<T>> {
  try {
    return { data: await operation() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown admin operation error";
    const databaseCode = error instanceof AdminRepositoryError ? error.databaseCode : undefined;
    console.error(
      JSON.stringify({
        message: "admin operation failed",
        action,
        error: message,
        databaseCode,
      }),
    );
    const isConflict = databaseCode === "23505";
    return {
      error: {
        status: isConflict ? 409 : 500,
        body: isConflict
          ? {
              error: "Admin mutation conflicts with existing data",
              code: "ADMIN_CONFLICT",
            }
          : {
              error: "Admin operation failed",
              code: "ADMIN_OPERATION_FAILED",
            },
      },
    };
  }
}

/** What every admin route group shares. Built once by `adminRoutes()` in `index.ts`. */
export interface AdminRouteContext {
  repository: AdminDataRepository | null;
  imageBindings: AdminImageBindings | null;
  adminPlugin: ReturnType<typeof createAdminPlugin>;
}
