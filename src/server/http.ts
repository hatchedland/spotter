import "server-only";
import type { z } from "zod";
import type { ApiError, ApiErrorCode } from "@/lib/schemas";

export function jsonError(status: number, code: ApiErrorCode, error: string): Response {
  const body: ApiError = { error, code };
  return Response.json(body, { status });
}

/** 4 MB, just under the platform's 4.5 MB body limit. */
const MAX_BODY_BYTES = 4_000_000;

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Reads and validates a JSON body. Never trust raw request bodies. */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<ParseResult<z.infer<S>>> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError(413, "PAYLOAD_TOO_LARGE", "Upload is too large. Use a smaller photo.") };
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "INVALID_REQUEST", "Request body must be valid JSON.") };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Request body is invalid.";
    return { ok: false, response: jsonError(422, "INVALID_REQUEST", message) };
  }
  return { ok: true, data: parsed.data };
}
