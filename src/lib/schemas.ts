import { z } from "zod";
import { MUSCLES } from "./exercise/muscles";
import { PATTERN_IDS } from "./exercise/patterns";

/** ~3 MB of base64 keeps every request under Vercel's 4.5 MB body limit. */
const MAX_IMAGE_BASE64_LENGTH = 3_000_000;

export const imageDataUrlSchema = z
  .string()
  .max(MAX_IMAGE_BASE64_LENGTH, "Image is too large. Use a photo under 2 MB.")
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Image must be a JPEG, PNG or WebP data URL.");

/* ---------- POST /api/v1/machines/identify ---------- */

export const identifyRequestSchema = z.object({
  image: imageDataUrlSchema,
});
export type IdentifyRequest = z.infer<typeof identifyRequestSchema>;

/** What the vision model returns. Kept separate from the API response so the contract stays stable. */
export const identificationSchema = z.object({
  isGymEquipment: z.boolean().describe("False when the photo does not show gym equipment."),
  machineName: z.string().describe("Specific name of the machine, including brand if a logo is visible."),
  pattern: z
    .enum([...PATTERN_IDS, "unsupported"])
    .describe("The closest movement pattern from the list, or 'unsupported' if none fits."),
  confidence: z.enum(["high", "medium", "low"]),
  primaryMuscles: z.array(z.enum(MUSCLES)).min(1).max(3),
  secondaryMuscles: z.array(z.enum(MUSCLES)).max(5),
  machineNotes: z
    .array(z.string())
    .max(4)
    .describe("Setup details specific to this exact machine as seen in the photo: adjustment pins, levers, seat markings."),
  alternatives: z
    .array(z.enum(PATTERN_IDS))
    .max(2)
    .describe("Other patterns this machine could plausibly be, most likely first."),
});
export type Identification = z.infer<typeof identificationSchema>;

export type IdentifyResponse = Identification;

/* ---------- POST /api/v1/form-reviews ---------- */

export const repMetricSchema = z.object({
  index: z.number().int().nonnegative(),
  startSec: z.number(),
  peakSec: z.number(),
  endSec: z.number(),
  liftSec: z.number(),
  lowerSec: z.number(),
  startValue: z.number(),
  peakValue: z.number(),
});
export type RepMetric = z.infer<typeof repMetricSchema>;

export const FORM_FLAGS = [
  "no_reps",
  "low_visibility",
  "short_range_start",
  "short_range_end",
  "fast_lowering",
  "torso_swing",
  "uneven_sides",
  "inconsistent_reps",
] as const;
export type FormFlag = (typeof FORM_FLAGS)[number];

export const setMetricsSchema = z.object({
  pattern: z.enum(PATTERN_IDS),
  durationSec: z.number().nonnegative(),
  framesAnalysed: z.number().int().nonnegative(),
  detectionRate: z.number().min(0).max(1),
  signal: z.string(),
  signalUnit: z.enum(["deg", "ratio"]),
  targetStart: z.number(),
  targetEnd: z.number(),
  reps: z.array(repMetricSchema).max(100),
  torsoSwingDeg: z.number().nonnegative(),
  sideDifference: z.number().nonnegative(),
  flags: z.array(z.enum(FORM_FLAGS)),
});
export type SetMetrics = z.infer<typeof setMetricsSchema>;

export const reviewRequestSchema = z.object({
  metrics: setMetricsSchema,
  frames: z
    .array(
      z.object({
        label: z.string().max(80),
        timeSec: z.number().nonnegative(),
        image: imageDataUrlSchema,
      }),
    )
    .min(1)
    .max(3),
});
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

export const reviewSchema = z.object({
  verdict: z.enum(["solid", "needs_work", "unsafe", "unclear"]),
  summary: z.string().describe("Two sentences at most, addressed to the lifter as 'you'."),
  strengths: z.array(z.string()).max(3),
  fixes: z
    .array(
      z.object({
        title: z.string().describe("Short imperative fix, e.g. 'Keep your elbows pinned'."),
        why: z.string().describe("One sentence on what was seen and why it matters."),
        how: z.string().describe("One concrete cue the lifter can apply on the next set."),
        severity: z.enum(["high", "medium", "low"]),
        timeSec: z.number().nullable().describe("Video time where it is most visible, or null."),
      }),
    )
    .max(4),
  nextSetCue: z.string().describe("The single most important thing to think about on the next set."),
});
export type Review = z.infer<typeof reviewSchema>;
export type ReviewResponse = Review;

/* ---------- Errors ---------- */

export const API_ERROR_CODES = [
  "INVALID_REQUEST",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "AI_UNAVAILABLE",
  "AI_BAD_OUTPUT",
  "INTERNAL_ERROR",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.enum(API_ERROR_CODES),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
