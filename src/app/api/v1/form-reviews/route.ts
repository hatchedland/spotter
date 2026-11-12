import { AiFailure, reviewForm } from "@/server/ai";
import { jsonError, parseJsonBody } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { reviewRequestSchema, type ReviewResponse } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const limited = rateLimit("review", request);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, reviewRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const review: ReviewResponse = await reviewForm(parsed.data);
    return Response.json(review, { status: 201 });
  } catch (error) {
    if (error instanceof AiFailure) {
      console.error("[form-review]", error.message, error.cause);
      return error.kind === "bad_output"
        ? jsonError(502, "AI_BAD_OUTPUT", "The coach couldn't produce feedback for this clip. Your measured results are shown below.")
        : jsonError(503, "AI_UNAVAILABLE", "Coaching feedback is unavailable right now. Your measured results are shown below.");
    }
    console.error("[form-review] unexpected", error);
    return jsonError(500, "INTERNAL_ERROR", "Something went wrong on our side. Your measured results are shown below.");
  }
}
