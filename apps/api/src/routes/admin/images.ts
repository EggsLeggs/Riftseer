import { t, Elysia } from "elysia";
import { adminUploadObjectKey } from "@riftseer/types";
import { ImageMutationResponseSchema, AdminErrorResponses } from "./schemas";
import {
  MAX_IMAGE_BYTES,
  ADMIN_IMAGE_CACHE_CONTROL,
  safely,
  type AdminImageBindings,
  type AdminRouteContext,
} from "./shared";

// ─── Admin printing images ────────────────────────────────────────────────────

function normalizeBaseUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("CARD_IMAGE_BASE_URL must use HTTP or HTTPS");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

async function sha256Hex(value: ArrayBuffer | Uint8Array): Promise<string> {
  // A `Uint8Array` is typed over `ArrayBufferLike`, which neither `BufferSource`
  // in scope accepts: the workers one rejects it for admitting
  // `SharedArrayBuffer`, and `@types/node`'s `NodeJS.BufferSource` is a
  // different type again, so naming `BufferSource` picks whichever lib won.
  // Every runtime we target takes the view as-is, and copying would clone whole
  // uploads, so assert a concrete type rather than reallocating.
  const digest = await crypto.subtle.digest("SHA-256", value as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sourceHash(sourceUrl: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(sourceUrl));
}

function detectAdminImageType(bytes: ArrayBuffer): string | null {
  const value = new Uint8Array(bytes);
  if (
    value.length >= 8 &&
    value[0] === 0x89 &&
    value[1] === 0x50 &&
    value[2] === 0x4e &&
    value[3] === 0x47 &&
    value[4] === 0x0d &&
    value[5] === 0x0a &&
    value[6] === 0x1a &&
    value[7] === 0x0a
  ) {
    return "image/png";
  }
  if (value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) {
    return "image/jpeg";
  }

  const ascii = (start: number, end: number) => String.fromCharCode(...value.slice(start, end));
  if (value.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) {
    return "image/gif";
  }
  if (value.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "image/webp";
  }
  if (
    value.length >= 12 &&
    ascii(4, 8) === "ftyp" &&
    (ascii(8, 12) === "avif" || ascii(8, 12) === "avis")
  ) {
    return "image/avif";
  }
  return null;
}

async function cleanupUpload(bindings: AdminImageBindings, key: string): Promise<void> {
  try {
    await bindings.bucket.delete(key);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "admin image cleanup failed",
        key,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

/** Bounded, content-addressed source bytes to R2; transformation is queued, never inline. */
export function imageRoutes(ctx: AdminRouteContext) {
  const { repository, imageBindings } = ctx;
  return new Elysia().use(ctx.adminPlugin).post(
    "/printings/:id/image",
    async ({ params, body, adminUser, status }) => {
      if (!repository || !imageBindings) {
        return status(503, {
          error: "Admin image service unavailable",
          code: "SERVICE_UNAVAILABLE",
        });
      }

      const bytes = await body.file.arrayBuffer();
      const detectedContentType = detectAdminImageType(bytes);
      if (!detectedContentType || body.file.type !== detectedContentType) {
        return status(400, {
          error: "Unsupported image type or mismatched content",
          code: "INVALID_IMAGE_TYPE",
        });
      }
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
        return status(400, {
          error: "Image must be between 1 byte and 20 MB",
          code: "INVALID_IMAGE_SIZE",
        });
      }

      const contentHash = await sha256Hex(bytes);
      const key = adminUploadObjectKey(params.id, contentHash);
      const baseUrl = normalizeBaseUrl(imageBindings.baseUrl);
      const uploadedSourceUrl = `${baseUrl}/${key}`;
      const uploadedSourceHash = await sourceHash(uploadedSourceUrl);

      const putResult = await safely("printing.image.store", () =>
        imageBindings.bucket.put(key, bytes, {
          httpMetadata: {
            contentType: detectedContentType,
            cacheControl: ADMIN_IMAGE_CACHE_CONTROL,
          },
          customMetadata: {
            printingId: params.id,
            contentHash,
            sourceProvider: "admin",
          },
        }),
      );
      if ("error" in putResult) {
        return status(503, {
          error: "Admin image storage unavailable",
          code: "IMAGE_STORAGE_UNAVAILABLE",
        });
      }

      const persisted = await safely("printing.image.persist", () =>
        repository.setPrintingImageSource(
          params.id,
          {
            source_url: uploadedSourceUrl,
            source_hash: uploadedSourceHash,
            alt_text: body.accessibility_text,
          },
          adminUser.id,
        ),
      );
      if ("error" in persisted) {
        await cleanupUpload(imageBindings, key);
        return status(persisted.error.status, persisted.error.body);
      }
      if (!persisted.data) {
        await cleanupUpload(imageBindings, key);
        return status(404, {
          error: "Printing not found",
          code: "PRINTING_NOT_FOUND",
        });
      }

      // A failed enqueue is reported, not rolled back. The printing already
      // carries the admin source_url, a valid source_hash and a null
      // image_hosted_at, which is exactly the state the ingest catalogue scan
      // looks for, so the next run re-queues it. Rolling back would instead
      // discard an upload the admin made.
      let queued = true;
      try {
        await imageBindings.queue.send({
          version: 1,
          printingId: params.id,
          sourceUrl: uploadedSourceUrl,
          sourceHash: uploadedSourceHash,
          sourceProvider: "admin",
        });
      } catch (error) {
        queued = false;
        console.error(
          JSON.stringify({
            message: "admin image queue send failed",
            printingId: params.id,
            sourceHash: uploadedSourceHash,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }

      return status(202, {
        ok: true as const,
        printing_id: params.id,
        source_url: uploadedSourceUrl,
        source_hash: uploadedSourceHash,
        queued,
      });
    },
    {
      body: t.Object({
        file: t.File({
          minSize: 1,
          maxSize: "20m",
        }),
        accessibility_text: t.Optional(t.String({ maxLength: 2000 })),
      }),
      response: {
        202: ImageMutationResponseSchema,
        ...AdminErrorResponses,
      },
      detail: {
        tags: ["Admin"],
        summary: "Upload a printing's image",
        description:
          "Stores a content-addressed admin source in R2, points the printing at it, locks the image against ingest, and queues WebP variants.",
      },
    },
  );
}
