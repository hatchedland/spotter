import { describe, expect, it } from "vitest";
import { MUSCLES, MUSCLE_LABELS, muscleRole } from "./muscles";
import { getPattern, isPatternId, PATTERN_IDS, PATTERN_LIST } from "./patterns";
import {
  BODY,
  definePose,
  easeInOutSine,
  groundedPelvis,
  lerpPose,
  NEUTRAL_POSE,
  sampleRep,
  tempoDuration,
} from "./pose";
import { identificationSchema, imageDataUrlSchema, reviewRequestSchema } from "@/lib/schemas";

describe("pose maths", () => {
  it("interpolates and clamps", () => {
    const a = definePose({ elbowFlex: 0 });
    const b = definePose({ elbowFlex: 100 });
    expect(lerpPose(a, b, 0.25).elbowFlex).toBe(25);
    expect(lerpPose(a, b, 2).elbowFlex).toBe(100);
    expect(lerpPose(a, b, -1).elbowFlex).toBe(0);
  });

  it("eases symmetrically", () => {
    expect(easeInOutSine(0)).toBeCloseTo(0);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5);
    expect(easeInOutSine(1)).toBeCloseTo(1);
  });

  it("keeps the feet on the ground for a standing pose", () => {
    const [y, z] = groundedPelvis(NEUTRAL_POSE);
    expect(y).toBeCloseTo(BODY.thigh + BODY.shin + BODY.ankleHeight);
    expect(z).toBeCloseTo(0);
  });

  it("drops and shifts the hips back in a squat", () => {
    const [y, z] = groundedPelvis(definePose({ hipFlex: 95, kneeFlex: 112 }));
    expect(y).toBeLessThan(0.6);
    expect(z).toBeLessThan(0);
  });

  it("walks through the rep phases in order", () => {
    const tempo = { lift: 1, hold: 1, lower: 2, rest: 1 };
    expect(tempoDuration(tempo)).toBe(5);
    expect(sampleRep(tempo, 0.5).phase).toBe("lift");
    expect(sampleRep(tempo, 1.5)).toMatchObject({ phase: "hold", progress: 1 });
    expect(sampleRep(tempo, 3).phase).toBe("lower");
    expect(sampleRep(tempo, 4.5)).toMatchObject({ phase: "rest", progress: 0 });
    expect(sampleRep(tempo, 5.5).phase).toBe("lift");
    expect(sampleRep({ lift: 0, hold: 0, lower: 0, rest: 0 }, 1).phase).toBe("rest");
    expect(sampleRep({ lift: 1, hold: 0, lower: 1, rest: 0 }, 1.99).phase).toBe("lower");
  });
});

describe("pattern catalogue", () => {
  it("has a complete entry for every id", () => {
    expect(PATTERN_LIST).toHaveLength(PATTERN_IDS.length);
    for (const id of PATTERN_IDS) {
      const pattern = getPattern(id);
      expect(pattern.id).toBe(id);
      expect(pattern.muscles.primary.length).toBeGreaterThan(0);
      expect(pattern.setup.length).toBeGreaterThan(0);
      expect(pattern.mistakes.length).toBeGreaterThan(0);
      expect(pattern.analysis.start).not.toBe(pattern.analysis.end);
      const rises = pattern.analysis.end > pattern.analysis.start;
      expect(rises ? "increase" : "decrease").toBe(pattern.analysis.liftDirection);
    }
  });

  it("guards pattern ids", () => {
    expect(isPatternId("leg_press")).toBe(true);
    expect(isPatternId("bench")).toBe(false);
  });
});

describe("muscles", () => {
  it("labels every muscle and resolves roles", () => {
    for (const m of MUSCLES) expect(MUSCLE_LABELS[m]).toBeTruthy();
    const targets = { primary: ["lats"], secondary: ["biceps"] } as const;
    expect(muscleRole(targets, "lats")).toBe("primary");
    expect(muscleRole(targets, "biceps")).toBe("secondary");
    expect(muscleRole(targets, "quads")).toBe("idle");
  });
});

describe("API schemas", () => {
  const tinyJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

  it("accepts image data URLs and rejects other strings", () => {
    expect(imageDataUrlSchema.safeParse(tinyJpeg).success).toBe(true);
    expect(imageDataUrlSchema.safeParse("https://example.com/a.jpg").success).toBe(false);
    expect(imageDataUrlSchema.safeParse("data:image/gif;base64,AAAA").success).toBe(false);
  });

  it("rejects unknown patterns in identification output", () => {
    const valid = {
      isGymEquipment: true,
      machineName: "Lat pulldown",
      pattern: "lat_pulldown",
      confidence: "high",
      primaryMuscles: ["lats"],
      secondaryMuscles: [],
      machineNotes: [],
      alternatives: [],
    };
    expect(identificationSchema.safeParse(valid).success).toBe(true);
    expect(identificationSchema.safeParse({ ...valid, pattern: "bench_press" }).success).toBe(false);
  });

  it("requires at least one frame for a review", () => {
    const metrics = {
      pattern: "cable_curl",
      durationSec: 10,
      framesAnalysed: 150,
      detectionRate: 1,
      signal: "elbow",
      signalUnit: "deg",
      targetStart: 160,
      targetEnd: 50,
      reps: [],
      torsoSwingDeg: 0,
      sideDifference: 0,
      flags: ["no_reps"],
    };
    expect(reviewRequestSchema.safeParse({ metrics, frames: [] }).success).toBe(false);
    expect(
      reviewRequestSchema.safeParse({ metrics, frames: [{ label: "Start", timeSec: 0, image: tinyJpeg }] }).success,
    ).toBe(true);
  });
});

describe("groundedPelvis with custom legs", () => {
  it("uses the supplied leg lengths", () => {
    const [y] = groundedPelvis(NEUTRAL_POSE, { thigh: 0.5, shin: 0.4, ankleHeight: 0.1 });
    expect(y).toBeCloseTo(1);
  });
});
