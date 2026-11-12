import "server-only";
import { google } from "@ai-sdk/google";
import { APICallError, generateText, NoObjectGeneratedError, Output } from "ai";
import { PATTERN_LIST, getPattern } from "@/lib/exercise/patterns";
import {
  identificationSchema,
  reviewSchema,
  type Identification,
  type ReviewRequest,
  type Review,
} from "@/lib/schemas";

/**
 * Vision-capable Gemini model, called directly. The provider reads GOOGLE_GENERATIVE_AI_API_KEY
 * from the server environment; this module is server-only, so the key never reaches the browser.
 */
const VISION_MODEL = google(process.env.VISION_MODEL ?? "gemini-3.8-flash");
const TIMEOUT_MS = 45_000;

export class AiFailure extends Error {
  constructor(
    readonly kind: "unavailable" | "bad_output",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AiFailure";
  }
}

function toAiFailure(error: unknown): AiFailure {
  if (NoObjectGeneratedError.isInstance(error)) {
    return new AiFailure("bad_output", "Model returned output that did not match the schema.", { cause: error });
  }
  if (APICallError.isInstance(error)) {
    return new AiFailure("unavailable", `AI provider call failed (${error.statusCode ?? "no status"}).`, { cause: error });
  }
  return new AiFailure("unavailable", "AI request failed.", { cause: error });
}

const PATTERN_GUIDE = PATTERN_LIST.map(
  (p) => `- ${p.id}: ${p.name} (also called ${p.aliases.join(", ")}). ${p.summary}`,
).join("\n");

const IDENTIFY_INSTRUCTIONS = `You identify gym machines from photos for people who have never used them.
Map the machine to the closest movement pattern from this list:
${PATTERN_GUIDE}

Rules:
- If the photo does not show gym equipment, set isGymEquipment to false and pattern to "unsupported".
- If it is gym equipment but no pattern fits (free weights, cardio machines, racks without a cable), use "unsupported" and still name the equipment.
- Multi-station machines: pick the station most prominent in the photo, and list the others in alternatives.
- machineNotes must describe what is visible on this specific machine (pin positions, levers, seat height markings, pad positions). Never invent features you cannot see. Return an empty list if nothing machine-specific is visible.
- Use plain language a beginner understands. No jargon without explanation.`;

export async function identifyMachine(imageDataUrl: string): Promise<Identification> {
  try {
    const { output } = await generateText({
      model: VISION_MODEL,
      instructions: IDENTIFY_INSTRUCTIONS,
      output: Output.object({ schema: identificationSchema }),
      timeout: TIMEOUT_MS,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Identify this machine." },
            { type: "file", mediaType: "image", data: imageDataUrl },
          ],
        },
      ],
    });
    return output;
  } catch (error) {
    throw toAiFailure(error);
  }
}

const REVIEW_INSTRUCTIONS = `You are a certified strength coach reviewing one set filmed in a commercial gym.
You receive measured joint data from pose tracking plus up to three still frames with the tracked skeleton drawn on them.

Rules:
- The measurements are the ground truth for range of motion, tempo and rep count. Use the frames for what numbers cannot show: posture, grip, seat setup, joint alignment.
- Only report problems you can support with the numbers or clearly see in a frame. If the footage is unclear, say so with verdict "unclear" and explain how to film it better.
- Use "unsafe" only for form likely to cause injury (for example, loaded spinal rounding, knees collapsing under heavy load, hyperextending a locked joint).
- Order fixes by importance. Give at most four. Each "how" must be a single cue the lifter can use on the next set.
- Speak directly to the lifter as "you". Plain words, no anatomy jargon without explanation. No medical diagnosis.`;

export async function reviewForm({ metrics, frames }: ReviewRequest): Promise<Review> {
  const pattern = getPattern(metrics.pattern);
  const context = {
    exercise: pattern.name,
    goodRep: {
      lift: pattern.lift,
      lower: pattern.lower,
      cues: pattern.cues,
      commonMistakes: pattern.mistakes,
    },
    measured: metrics,
    notes: {
      signal: `${metrics.signal} (${metrics.signalUnit === "deg" ? "interior joint angle, 180 = straight" : "wrist distance ÷ shoulder width"})`,
      target: `A full rep moves from about ${metrics.targetStart} to about ${metrics.targetEnd}.`,
      flagsAreAutomatic: "Flags come from simple thresholds; confirm them against the frames before reporting.",
    },
  };

  try {
    const { output } = await generateText({
      model: VISION_MODEL,
      instructions: REVIEW_INSTRUCTIONS,
      output: Output.object({ schema: reviewSchema }),
      timeout: TIMEOUT_MS,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: JSON.stringify(context) },
            ...frames.flatMap((frame) => [
              { type: "text" as const, text: `Frame: ${frame.label} at ${frame.timeSec.toFixed(1)} s` },
              { type: "file" as const, mediaType: "image", data: frame.image },
            ]),
          ],
        },
      ],
    });
    return output;
  } catch (error) {
    throw toAiFailure(error);
  }
}
