import { AiFailure, identifyMachine } from "@/server/ai";
import { jsonError, parseJsonBody } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { identifyRequestSchema, type IdentifyResponse } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const limited = rateLimit("identify", request);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, identifyRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result: IdentifyResponse = await identifyMachine(parsed.data.image);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AiFailure) {
      console.error("[identify]", error.message, error.cause);
      return error.kind === "bad_output"
        ? jsonError(502, "AI_BAD_OUTPUT", "We couldn't read that photo clearly. Try again with the whole machine in frame.")
        : jsonError(503, "AI_UNAVAILABLE", "Machine recognition is unavailable right now. Pick your machine from the list instead.");
    }
    console.error("[identify] unexpected", error);
    return jsonError(500, "INTERNAL_ERROR", "Something went wrong on our side. Try again.");
  }
}
