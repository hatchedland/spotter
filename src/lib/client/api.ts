import type { z } from "zod";
import {
  apiErrorSchema,
  identificationSchema,
  reviewSchema,
  type ApiErrorCode,
  type IdentifyRequest,
  type IdentifyResponse,
  type ReviewRequest,
  type ReviewResponse,
} from "@/lib/schemas";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode | "NETWORK_ERROR",
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function postJson<S extends z.ZodType>(url: string, body: unknown, schema: S, signal?: AbortSignal): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError("You appear to be offline. Check your connection and try again.", "NETWORK_ERROR");
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    if (parsed.success) throw new ApiRequestError(parsed.data.error, parsed.data.code);
    throw new ApiRequestError("Something went wrong on our side. Try again.", "INTERNAL_ERROR");
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiRequestError("We received an unexpected response. Try again.", "INTERNAL_ERROR");
  return parsed.data;
}

export function identifyMachine(body: IdentifyRequest, signal?: AbortSignal): Promise<IdentifyResponse> {
  return postJson("/api/v1/machines/identify", body, identificationSchema, signal);
}

export function requestFormReview(body: ReviewRequest, signal?: AbortSignal): Promise<ReviewResponse> {
  return postJson("/api/v1/form-reviews", body, reviewSchema, signal);
}
