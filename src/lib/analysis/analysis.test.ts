import { describe, expect, it } from "vitest";
import { distance, jointAngle, LM, torsoLean, vectorAngle, type ImagePoint, type Point3 } from "./geometry";
import { analyseSet, deriveFlags, FLAG_COPY } from "./metrics";
import { detectReps, median, robustRange } from "./reps";
import { measureSignal, signalLandmarks, smooth, type PoseFrame } from "./signals";
import { FORM_FLAGS } from "@/lib/schemas";

const p = (x: number, y: number, z = 0): Point3 => ({ x, y, z });

describe("geometry", () => {
  it("measures a right angle and a straight joint", () => {
    expect(jointAngle(p(0, 1), p(0, 0), p(1, 0))).toBeCloseTo(90);
    expect(jointAngle(p(0, 1), p(0, 0), p(0, -1))).toBeCloseTo(180);
  });

  it("returns NaN for a zero-length vector", () => {
    expect(vectorAngle(p(0, 0), p(1, 0))).toBeNaN();
  });

  it("measures distance in 3D", () => {
    expect(distance(p(0, 0, 0), p(1, 2, 2))).toBeCloseTo(3);
  });

  it("measures torso lean from image landmarks, correcting aspect ratio", () => {
    const image = blankImage();
    setImage(image, LM.leftHip, 0.5, 0.6);
    setImage(image, LM.rightHip, 0.5, 0.6);
    setImage(image, LM.leftShoulder, 0.5, 0.3);
    setImage(image, LM.rightShoulder, 0.5, 0.3);
    expect(torsoLean(image, 16 / 9)).toBeCloseTo(0);

    setImage(image, LM.leftShoulder, 0.6, 0.3);
    setImage(image, LM.rightShoulder, 0.6, 0.3);
    // dx = 0.1 * 3 = 0.3, dy = 0.3 → 45°
    expect(torsoLean(image, 3)).toBeCloseTo(45);
  });
});

describe("smooth", () => {
  it("fills gaps linearly and at the edges", () => {
    const out = smooth([Number.NaN, 0, Number.NaN, 4, Number.NaN], 1);
    expect(out).toEqual([0, 0, 2, 4, 4]);
  });

  it("returns input unchanged when nothing is known", () => {
    expect(smooth([Number.NaN, Number.NaN])).toEqual([Number.NaN, Number.NaN]);
  });

  it("averages with a centred window", () => {
    expect(smooth([0, 3, 0], 3)).toEqual([1.5, 1, 1.5]);
  });
});

describe("statistics", () => {
  it("computes the median for odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  it("ignores outliers in robustRange", () => {
    const values = Array.from({ length: 100 }, (_, i) => (i === 50 ? 1000 : i % 10));
    expect(robustRange(values)).toBeLessThan(20);
    expect(robustRange([1])).toBe(0);
  });
});

/** Simulates an elbow angle for a curl: 160° → 50° → 160°, one rep every `period` seconds. */
function curlSeries(reps: number, period: number, fps = 15, top = 50, bottom = 160) {
  const times: number[] = [];
  const values: number[] = [];
  const total = reps * period + 1;
  for (let i = 0; i <= total * fps; i++) {
    const t = i / fps;
    const phase = t < reps * period ? (t % period) / period : 0;
    const v = bottom - (bottom - top) * Math.sin(Math.PI * phase);
    times.push(t);
    values.push(v);
  }
  return { times, values };
}

describe("detectReps", () => {
  it("counts reps and their timings for a falling signal", () => {
    const { times, values } = curlSeries(4, 3);
    const reps = detectReps(times, values, "decrease", 20);
    expect(reps).toHaveLength(4);
    expect(reps[0].peakValue).toBeCloseTo(50, 0);
    expect(reps[0].liftSec).toBeCloseTo(1.5, 0);
    expect(reps[0].lowerSec).toBeCloseTo(1.5, 0);
  });

  it("counts reps for a rising signal", () => {
    const { times, values } = curlSeries(3, 2);
    const rising = values.map((v) => 210 - v);
    expect(detectReps(times, rising, "increase", 20)).toHaveLength(3);
  });

  it("ignores movement smaller than the minimum range", () => {
    const { times, values } = curlSeries(3, 2, 15, 150, 160);
    expect(detectReps(times, values, "decrease", 20)).toHaveLength(0);
  });

  it("rejects mismatched or tiny inputs", () => {
    expect(detectReps([0, 1], [1, 2], "increase", 1)).toEqual([]);
    expect(detectReps([0, 1, 2], [1, 2], "increase", 1)).toEqual([]);
  });

  it("waits for the start zone when the clip begins mid-rep", () => {
    const { times, values } = curlSeries(3, 2);
    const offset = 15; // begin halfway into the first rep
    const reps = detectReps(times.slice(offset), values.slice(offset), "decrease", 20);
    expect(reps).toHaveLength(2);
  });
});

function blankImage(): ImagePoint[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
}
function setImage(image: ImagePoint[], i: number, x: number, y: number) {
  image[i] = { ...image[i], x, y };
}

/** Builds pose frames where the left and right elbows follow `angles` (degrees). */
function elbowFrames(angles: readonly number[], fps = 15, rightOffset = 0): PoseFrame[] {
  return angles.map((deg, i) => {
    const world: Point3[] = Array.from({ length: 33 }, () => p(0, 0));
    const place = (shoulder: number, elbow: number, wrist: number, angle: number, x: number) => {
      const rad = (angle * Math.PI) / 180;
      world[shoulder] = p(x, 0.3);
      world[elbow] = p(x, 0);
      world[wrist] = p(x + 0.25 * Math.sin(rad), 0.25 * Math.cos(rad));
    };
    place(LM.leftShoulder, LM.leftElbow, LM.leftWrist, deg, 0.2);
    place(LM.rightShoulder, LM.rightElbow, LM.rightWrist, deg + rightOffset, -0.2);
    world[LM.leftKnee] = p(0.2, -0.4);
    world[LM.rightKnee] = p(-0.2, -0.4);
    world[LM.leftHip] = p(0.1, 0);
    world[LM.rightHip] = p(-0.1, 0);

    const image = blankImage();
    setImage(image, LM.leftShoulder, 0.5, 0.3);
    setImage(image, LM.rightShoulder, 0.5, 0.3);
    setImage(image, LM.leftHip, 0.5, 0.6);
    setImage(image, LM.rightHip, 0.5, 0.6);
    return { t: i / fps, world, image };
  });
}

describe("measureSignal", () => {
  it("measures the elbow angle and side difference", () => {
    const [frame] = elbowFrames([90], 15, 10);
    const sample = measureSignal(frame, "elbow");
    expect(sample.value).toBeCloseTo(90);
    expect(sample.sideDiff).toBeCloseTo(-10);
  });

  it("returns NaN when nobody is in frame", () => {
    expect(measureSignal({ t: 0, world: null, image: null }, "elbow").value).toBeNaN();
  });

  it("returns NaN when the chain is not visible", () => {
    const [frame] = elbowFrames([90]);
    const image = frame.image!.map((pt) => ({ ...pt, visibility: 0.1 }));
    expect(measureSignal({ ...frame, image }, "knee").value).toBeNaN();
    expect(measureSignal({ ...frame, image }, "wrist_gap").value).toBeNaN();
    expect(measureSignal({ ...frame, image }, "thigh_spread").value).toBeNaN();
  });

  it("measures wrist gap relative to shoulder width", () => {
    const [frame] = elbowFrames([180]);
    expect(measureSignal(frame, "wrist_gap").value).toBeCloseTo(1);
  });

  it("measures the angle between the thighs", () => {
    const [frame] = elbowFrames([90]);
    expect(measureSignal(frame, "thigh_spread").value).toBeCloseTo(28.07, 1);
  });
});

describe("analyseSet", () => {
  it("produces metrics and no flags for a clean set", () => {
    const { values } = curlSeries(5, 3.5, 15, 45, 165);
    const metrics = analyseSet("cable_curl", elbowFrames(values), 16 / 9);
    expect(metrics.reps).toHaveLength(5);
    expect(metrics.detectionRate).toBe(1);
    expect(metrics.flags).toEqual([]);
  });

  it("flags partial range and fast lowering", () => {
    const { values } = curlSeries(5, 1.2, 15, 100, 165);
    const metrics = analyseSet("cable_curl", elbowFrames(values), 16 / 9);
    expect(metrics.flags).toContain("short_range_end");
    expect(metrics.flags).toContain("fast_lowering");
  });

  it("flags an empty clip", () => {
    const frames: PoseFrame[] = [0, 1, 2].map((t) => ({ t, world: null, image: null }));
    const metrics = analyseSet("cable_curl", frames, 1);
    expect(metrics.flags).toEqual(["low_visibility", "no_reps"]);
  });

  it("flags uneven sides", () => {
    const { values } = curlSeries(4, 3, 15, 45, 165);
    const metrics = analyseSet("cable_curl", elbowFrames(values, 15, 25), 16 / 9);
    expect(metrics.flags).toContain("uneven_sides");
  });
});

describe("deriveFlags", () => {
  const base = {
    pattern: "leg_extension" as const,
    durationSec: 20,
    framesAnalysed: 300,
    detectionRate: 1,
    signal: "knee",
    signalUnit: "deg" as const,
    targetStart: 95,
    targetEnd: 170,
    torsoSwingDeg: 2,
    sideDifference: 0,
  };
  const rep = (startValue: number, peakValue: number, index = 0) => ({
    index,
    startSec: 0,
    peakSec: 1,
    endSec: 3,
    liftSec: 1,
    lowerSec: 2,
    startValue,
    peakValue,
  });

  it("flags a start that never reaches the stretch for a rising signal", () => {
    const flags = deriveFlags({ ...base, reps: [rep(130, 170)] }, "increase", 8);
    expect(flags).toEqual(["short_range_start"]);
  });

  it("flags torso swing", () => {
    const flags = deriveFlags({ ...base, torsoSwingDeg: 20, reps: [rep(95, 170)] }, "increase", 8);
    expect(flags).toEqual(["torso_swing"]);
  });

  it("flags inconsistent reps", () => {
    const reps = [rep(95, 170, 0), rep(95, 170, 1), rep(95, 120, 2), rep(95, 110, 3)];
    expect(deriveFlags({ ...base, reps }, "increase", 8)).toContain("inconsistent_reps");
  });

  it("has fallback copy for every flag", () => {
    for (const flag of FORM_FLAGS) expect(FLAG_COPY[flag].title.length).toBeGreaterThan(0);
  });
});

describe("signalLandmarks", () => {
  it("lists the joints for each signal", () => {
    expect(signalLandmarks("elbow")).toContain(LM.leftElbow);
    expect(signalLandmarks("thigh_spread")).toEqual([LM.leftHip, LM.leftKnee, LM.rightHip, LM.rightKnee]);
    expect(signalLandmarks("wrist_gap")).toContain(LM.rightWrist);
  });
});
