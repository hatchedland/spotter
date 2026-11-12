import type { MuscleTargets } from "./muscles";
import { definePose, type Pose, type Tempo } from "./pose";

export const PATTERN_IDS = [
  "lat_pulldown",
  "seated_row",
  "chest_press",
  "shoulder_press",
  "pec_deck",
  "cable_fly",
  "cable_curl",
  "triceps_pushdown",
  "leg_press",
  "leg_extension",
  "seated_leg_curl",
  "hip_abduction",
  "hip_adduction",
  "smith_squat",
  "ab_crunch",
] as const;

export type PatternId = (typeof PATTERN_IDS)[number];

export function isPatternId(value: string): value is PatternId {
  return (PATTERN_IDS as readonly string[]).includes(value);
}

type Vec3 = readonly [number, number, number];

export interface SceneProps {
  /** Seat surface height in metres, or null when standing. */
  seat: { height: number; backrest: boolean } | null;
  grip: "bar" | "handles" | "none";
  /** Cable anchor points. One anchor pulls from the middle of the grip, two anchors pull from each hand. */
  cable: readonly Vec3[];
  legPad: "shin_front" | "shin_back" | "knees_outside" | "knees_inside" | "footplate" | "none";
  /** Fixed vertical guide rails, as on a Smith machine. */
  rails: boolean;
}

/**
 * The signal analysed in a form-check video.
 * Angle signals are interior joint angles (180° = straight). `wrist_gap` is
 * wrist distance divided by shoulder width.
 */
export type TrackedSignal =
  | "elbow"
  | "knee"
  | "hip"
  | "shoulder"
  | "thigh_spread"
  | "wrist_gap";

export interface AnalysisConfig {
  signal: TrackedSignal;
  /** Whether the signal goes up or down during the lifting part of the rep. */
  liftDirection: "increase" | "decrease";
  /** Signal value at the start and at the end of a good rep. */
  start: number;
  end: number;
  /** Largest acceptable torso movement across the set, in degrees. */
  maxTorsoSwing: number;
  cameraTip: string;
}

export interface MovementPattern {
  id: PatternId;
  name: string;
  /** Other names people and manufacturers use for this machine. */
  aliases: readonly string[];
  summary: string;
  muscles: MuscleTargets;
  scene: SceneProps;
  start: Pose;
  end: Pose;
  /** Hold the pelvis so the feet stay planted (standing exercises only). */
  grounded: boolean;
  tempo: Tempo;
  setup: readonly string[];
  lift: string;
  lower: string;
  cues: readonly string[];
  mistakes: readonly { mistake: string; fix: string }[];
  analysis: AnalysisConfig;
}

const SEATED = { hipFlex: 90, kneeFlex: 90 } as const;
const STANDARD_TEMPO: Tempo = { lift: 1.2, hold: 0.4, lower: 2, rest: 0.6 };

export const PATTERNS: Record<PatternId, MovementPattern> = {
  lat_pulldown: {
    id: "lat_pulldown",
    name: "Lat pulldown",
    aliases: ["Pulldown", "Lat pull", "Wide-grip pulldown"],
    summary: "Pull a bar from overhead down to your upper chest while seated under knee pads.",
    muscles: { primary: ["lats"], secondary: ["upper_back", "biceps", "rear_delts", "forearms"] },
    scene: { seat: { height: 0.46, backrest: false }, grip: "bar", cable: [[0, 2.3, 0.25]], legPad: "none", rails: false },
    start: definePose({ ...SEATED, torsoPitch: -8, shoulderAbd: 150, shoulderFlex: 20, elbowFlex: 10 }),
    end: definePose({ ...SEATED, torsoPitch: -14, shoulderAbd: 35, shoulderFlex: 25, elbowFlex: 125 }),
    grounded: false,
    tempo: STANDARD_TEMPO,
    setup: [
      "Set the knee pad so your thighs are pinned and your feet are flat on the floor.",
      "Stand up, take the bar with hands just wider than your shoulders, then sit down with it.",
      "Lean back slightly and lift your chest toward the bar.",
    ],
    lift: "Drive your elbows down toward your back pockets until the bar touches your upper chest.",
    lower: "Let the bar rise slowly until your arms are straight and you feel a stretch under your armpits.",
    cues: ["Shoulders down, away from your ears", "Pull with your elbows, not your hands", "Chest stays tall"],
    mistakes: [
      { mistake: "Leaning far back and rowing the weight", fix: "Keep the lean small and fixed; lighten the stack if you need to swing." },
      { mistake: "Pulling the bar behind the neck", fix: "Always bring the bar to the front, to your upper chest." },
      { mistake: "Stopping halfway on the way up", fix: "Let your arms straighten fully at the top of every rep." },
    ],
    analysis: {
      signal: "elbow",
      liftDirection: "decrease",
      start: 165,
      end: 70,
      maxTorsoSwing: 15,
      cameraTip: "Film from the side, level with your shoulders, with the whole bar in frame.",
    },
  },
  seated_row: {
    id: "seated_row",
    name: "Seated cable row",
    aliases: ["Low row", "Cable row", "Seated row machine"],
    summary: "Pull a handle toward your stomach while sitting tall with your feet braced.",
    muscles: { primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps", "forearms"] },
    scene: { seat: { height: 0.36, backrest: false }, grip: "handles", cable: [[0, 0.5, 1.35]], legPad: "footplate", rails: false },
    start: definePose({ hipFlex: 85, kneeFlex: 25, torsoPitch: 5, shoulderFlex: 78, elbowFlex: 0, shoulderAbd: 6 }),
    end: definePose({ hipFlex: 85, kneeFlex: 25, torsoPitch: -4, shoulderFlex: -18, elbowFlex: 105, shoulderAbd: 10 }),
    grounded: false,
    tempo: STANDARD_TEMPO,
    setup: [
      "Sit with your feet on the platform and knees slightly bent.",
      "Grab the handle and sit upright with your arms straight.",
      "Brace your stomach as if about to be poked.",
    ],
    lift: "Pull the handle to your belly button, squeezing your shoulder blades together.",
    lower: "Reach your arms forward slowly until they are straight, keeping your back tall.",
    cues: ["Sit tall the whole time", "Elbows travel close to your sides", "Squeeze your shoulder blades at the end"],
    mistakes: [
      { mistake: "Rocking the torso back and forth", fix: "Lock your torso upright and move only your arms and shoulder blades." },
      { mistake: "Rounding the lower back at the reach", fix: "Stop the reach where your back starts to round." },
    ],
    analysis: {
      signal: "elbow",
      liftDirection: "decrease",
      start: 165,
      end: 75,
      maxTorsoSwing: 15,
      cameraTip: "Film from the side at seat height so your hips, shoulders and hands are visible.",
    },
  },
  chest_press: {
    id: "chest_press",
    name: "Seated chest press",
    aliases: ["Chest press machine", "Machine press", "Converging chest press"],
    summary: "Push two handles forward from chest level while your back stays on the pad.",
    muscles: { primary: ["chest"], secondary: ["front_delts", "triceps"] },
    scene: { seat: { height: 0.46, backrest: true }, grip: "handles", cable: [], legPad: "none", rails: false },
    start: definePose({ ...SEATED, shoulderAbd: 70, shoulderFlex: 12, elbowFlex: 95 }),
    end: definePose({ ...SEATED, shoulderAbd: 18, shoulderFlex: 82, elbowFlex: 6 }),
    grounded: false,
    tempo: STANDARD_TEMPO,
    setup: [
      "Raise or lower the seat so the handles line up with the middle of your chest.",
      "Sit with your back and head against the pad and feet flat.",
      "Hold the handles with your wrists straight, not bent back.",
    ],
    lift: "Press the handles forward until your arms are almost straight.",
    lower: "Bring the handles back slowly until they are level with your chest.",
    cues: ["Shoulder blades pinned to the pad", "Elbows slightly below shoulder height", "Do not lock your elbows hard"],
    mistakes: [
      { mistake: "Seat too low, so the handles sit at your neck", fix: "Raise the seat until the handles meet mid-chest." },
      { mistake: "Shoulders rolling forward off the pad", fix: "Keep your upper back on the pad and stop slightly before lockout." },
    ],
    analysis: {
      signal: "elbow",
      liftDirection: "increase",
      start: 80,
      end: 165,
      maxTorsoSwing: 10,
      cameraTip: "Film from the side at shoulder height so one full arm is visible.",
    },
  },
  shoulder_press: {
    id: "shoulder_press",
    name: "Seated shoulder press",
    aliases: ["Overhead press machine", "Military press machine"],
    summary: "Press handles from shoulder height up overhead with your back on the pad.",
    muscles: { primary: ["front_delts", "side_delts"], secondary: ["triceps", "upper_back"] },
    scene: { seat: { height: 0.46, backrest: true }, grip: "handles", cable: [], legPad: "none", rails: false },
    start: definePose({ ...SEATED, shoulderAbd: 82, shoulderTwist: 90, shoulderFlex: 18, elbowFlex: 100 }),
    end: definePose({ ...SEATED, shoulderAbd: 160, shoulderTwist: 90, shoulderFlex: 12, elbowFlex: 10 }),
    grounded: false,
    tempo: STANDARD_TEMPO,
    setup: [
      "Set the seat so the handles start level with your shoulders.",
      "Sit back against the pad with feet flat and a small arch in your lower back.",
      "Hold the handles with wrists stacked over your elbows.",
    ],
    lift: "Press straight up until your arms are nearly straight overhead.",
    lower: "Lower the handles slowly back to shoulder height.",
    cues: ["Ribs down, back on the pad", "Wrists over elbows", "Stop just short of locking out"],
    mistakes: [
      { mistake: "Arching your back off the pad to push the weight", fix: "Brace your stomach and use a weight you can press with your back flat." },
      { mistake: "Lowering only halfway", fix: "Bring the handles all the way down to shoulder level each rep." },
    ],
    analysis: {
      signal: "elbow",
      liftDirection: "increase",
      start: 85,
      end: 165,
      maxTorsoSwing: 10,
      cameraTip: "Film from the front or side at shoulder height with the handles in frame at the top.",
    },
  },
  pec_deck: {
    id: "pec_deck",
    name: "Pec deck",
    aliases: ["Chest fly machine", "Butterfly", "Rear delt / pec fly"],
    summary: "Bring two arms of the machine together in front of your chest in a hugging motion.",
    muscles: { primary: ["chest"], secondary: ["front_delts"] },
    scene: { seat: { height: 0.46, backrest: true }, grip: "handles", cable: [], legPad: "none", rails: false },
    start: definePose({ ...SEATED, shoulderAbd: 85, shoulderFlex: 0, elbowFlex: 20 }),
    end: definePose({ ...SEATED, shoulderAbd: 85, shoulderFlex: 78, elbowFlex: 20 }),
    grounded: false,
    tempo: STANDARD_TEMPO,
    setup: [
      "Set the seat so the handles are at chest height.",
      "Set the arm start position so you feel a light chest stretch, not a shoulder strain.",
      "Sit back with your chest up and a soft bend in your elbows.",
    ],
    lift: "Sweep the handles together in a wide arc until they meet in front of your chest.",
    lower: "Open your arms slowly until your hands are just behind your shoulders.",
    cues: ["Hug a big tree", "Keep the elbow bend fixed", "Back stays on the pad"],
    mistakes: [
      { mistake: "Stretching too far back at the start", fix: "Move the start position forward until the stretch is comfortable." },
      { mistake: "Bending and straightening the elbows", fix: "Keep the same soft elbow bend through the whole rep." },
    ],
    analysis: {
      signal: "wrist_gap",
      liftDirection: "decrease",
      start: 3,
      end: 0.6,
      maxTorsoSwing: 10,
      cameraTip: "Film from the front at chest height so both hands stay in frame.",
    },
  },
  cable_fly: {
    id: "cable_fly",
    name: "Cable crossover fly",
    aliases: ["Cable crossover", "Standing cable fly"],
    summary: "Stand between two high cable stacks and bring the handles together in front of you.",
    muscles: { primary: ["chest"], secondary: ["front_delts", "abs"] },
    scene: { seat: null, grip: "handles", cable: [[0.95, 1.9, -0.35], [-0.95, 1.9, -0.35]], legPad: "none", rails: false },
    start: definePose({ torsoPitch: 12, hipFlex: 8, kneeFlex: 12, shoulderAbd: 75, shoulderFlex: 0, elbowFlex: 18 }),
    end: definePose({ torsoPitch: 12, hipFlex: 8, kneeFlex: 12, shoulderAbd: 55, shoulderFlex: 78, elbowFlex: 18 }),
    grounded: true,
    tempo: STANDARD_TEMPO,
    setup: [
      "Set both pulleys just above head height and attach single handles.",
      "Take a handle in each hand and step forward into a split stance.",
      "Lean forward slightly from the hips with a soft bend in your elbows.",
    ],
    lift: "Bring your hands down and together in front of your lower chest.",
    lower: "Let your arms open slowly until your hands are in line with your shoulders.",
    cues: ["Lead with your hands, not your elbows", "Keep the elbow bend fixed", "Stay still from the hips down"],
    mistakes: [
      { mistake: "Pressing the handles instead of sweeping them", fix: "Lock the elbow bend and move only at the shoulder." },
      { mistake: "Letting the cables pull you backward", fix: "Use a staggered stance and lighter weight." },
    ],
    analysis: {
      signal: "wrist_gap",
      liftDirection: "decrease",
      start: 3,
      end: 0.6,
      maxTorsoSwing: 12,
      cameraTip: "Film from the front at chest height with both handles in frame.",
    },
  },
  cable_curl: {
    id: "cable_curl",
    name: "Cable biceps curl",
    aliases: ["Cable curl", "Low pulley curl", "Biceps curl machine"],
    summary: "Curl a bar from a low pulley up to your shoulders while your upper arms stay still.",
    muscles: { primary: ["biceps"], secondary: ["forearms"] },
    scene: { seat: null, grip: "bar", cable: [[0, 0.15, 0.55]], legPad: "none", rails: false },
    start: definePose({ shoulderFlex: 6, elbowFlex: 8, shoulderAbd: 8 }),
    end: definePose({ shoulderFlex: 14, elbowFlex: 135, shoulderAbd: 8 }),
    grounded: true,
    tempo: STANDARD_TEMPO,
    setup: [
      "Set the pulley at the lowest position and attach a straight or EZ bar.",
      "Stand close with feet hip-width apart and hold the bar with palms facing up.",
      "Pin your elbows to your sides.",
    ],
    lift: "Curl the bar up toward your shoulders without moving your elbows forward.",
    lower: "Lower the bar slowly until your arms are straight.",
    cues: ["Elbows glued to your sides", "No hip swing", "Full stretch at the bottom"],
    mistakes: [
      { mistake: "Swinging the body to start the rep", fix: "Lower the weight and keep your hips and shoulders still." },
      { mistake: "Elbows drifting forward at the top", fix: "Stop the curl when your elbows want to move." },
    ],
    analysis: {
      signal: "elbow",
      liftDirection: "decrease",
      start: 160,
      end: 50,
      maxTorsoSwing: 8,
      cameraTip: "Film from the side at hip height with your whole body in frame.",
    },
  },
  triceps_pushdown: {
    id: "triceps_pushdown",
    name: "Triceps pushdown",
    aliases: ["Cable pushdown", "Rope pushdown", "Triceps press-down"],
    summary: "Push a bar or rope from chest height down to your thighs using only your elbows.",
    muscles: { primary: ["triceps"], secondary: ["forearms"] },
    scene: { seat: null, grip: "bar", cable: [[0, 2.15, 0.4]], legPad: "none", rails: false },
    start: definePose({ torsoPitch: 10, hipFlex: 10, kneeFlex: 10, shoulderFlex: 10, elbowFlex: 100, shoulderAbd: 6 }),
    end: definePose({ torsoPitch: 10, hipFlex: 10, kneeFlex: 10, shoulderFlex: 2, elbowFlex: 6, shoulderAbd: 6 }),
    grounded: true,
    tempo: STANDARD_TEMPO,
    setup: [
      "Set the pulley at the top and attach a bar or rope.",
      "Stand close, hinge forward slightly and tuck your elbows to your sides.",
      "Start with your forearms roughly level with the floor.",
    ],
    lift: "Push down until your arms are straight and your hands reach your thighs.",
    lower: "Let your hands rise slowly to chest height, elbows staying put.",
    cues: ["Elbows stay pinned", "Shoulders down", "Squeeze at the bottom"],
    mistakes: [
      { mistake: "Leaning over the bar and pushing with body weight", fix: "Stand taller and lighten the stack." },
      { mistake: "Elbows flaring and rising on the way up", fix: "Only let your hands rise until your elbows start to move." },
    ],
    analysis: {
      signal: "elbow",
      liftDirection: "increase",
      start: 80,
      end: 165,
      maxTorsoSwing: 8,
      cameraTip: "Film from the side at hip height with your whole upper body in frame.",
    },
  },
  leg_press: {
    id: "leg_press",
    name: "Leg press",
    aliases: ["45° leg press", "Seated leg press", "Sled press"],
    summary: "Push a sled or platform away with your feet while lying back on a reclined seat.",
    muscles: { primary: ["quads", "glutes"], secondary: ["hamstrings", "adductors", "calves"] },
    scene: { seat: { height: 0.5, backrest: true }, grip: "handles", cable: [], legPad: "footplate", rails: false },
    start: definePose({ rootPitch: -45, hipFlex: 125, kneeFlex: 100, shoulderFlex: 20, elbowFlex: 40, shoulderAbd: 18 }),
    end: definePose({ rootPitch: -45, hipFlex: 60, kneeFlex: 10, shoulderFlex: 20, elbowFlex: 40, shoulderAbd: 18 }),
    grounded: false,
    tempo: STANDARD_TEMPO,
    setup: [
      "Sit with your back and hips flat against the pad.",
      "Place your feet shoulder-width apart in the middle of the platform.",
      "Hold the side handles and release the safety stops.",
    ],
    lift: "Push the platform away through your whole foot until your legs are almost straight.",
    lower: "Bend your knees slowly toward your chest, stopping before your hips lift off the seat.",
    cues: ["Push through your heels and mid-foot", "Knees track over your toes", "Never lock your knees"],
    mistakes: [
      { mistake: "Lowering so deep your hips roll off the seat", fix: "Stop the lowering once your lower back starts to lift." },
      { mistake: "Snapping the knees straight at the top", fix: "Keep a small bend at the top of every rep." },
      { mistake: "Knees caving inward", fix: "Push your knees out in line with your toes." },
    ],
    analysis: {
      signal: "knee",
      liftDirection: "increase",
      start: 85,
      end: 165,
      maxTorsoSwing: 10,
      cameraTip: "Film from the side at seat height so your hip, knee and ankle are visible.",
    },
  },
  leg_extension: {
    id: "leg_extension",
    name: "Leg extension",
    aliases: ["Quad extension", "Knee extension machine"],
    summary: "Straighten your knees against a pad resting on your lower shins.",
    muscles: { primary: ["quads"], secondary: [] },
    scene: { seat: { height: 0.5, backrest: true }, grip: "handles", cable: [], legPad: "shin_front", rails: false },
    start: definePose({ ...SEATED, torsoPitch: -8, shoulderFlex: 12, elbowFlex: 25, shoulderAbd: 22 }),
    end: definePose({ hipFlex: 90, kneeFlex: 6, torsoPitch: -8, shoulderFlex: 12, elbowFlex: 25, shoulderAbd: 22 }),
    grounded: false,
    tempo: STANDARD_TEMPO,
    setup: [
      "Move the back pad so your knees line up with the machine's pivot point.",
      "Set the shin pad just above your ankles.",
      "Hold the side handles to keep your hips in the seat.",
    ],
    lift: "Straighten your legs until your knees are fully extended and squeeze your thighs.",
    lower: "Lower the pad slowly back until your knees are bent to about 90°.",
    cues: ["Knees on the pivot line", "Hips stay down", "Pause at the top"],
    mistakes: [
      { mistake: "Kicking the weight up with momentum", fix: "Lift for a count of one and lower for a count of two." },
      { mistake: "Hips lifting off the seat", fix: "Pull down on the handles and reduce the weight." },
    ],
    analysis: {
      signal: "knee",
      liftDirection: "increase",
      start: 95,
      end: 170,
      maxTorsoSwing: 8,
      cameraTip: "Film from the side at seat height with your hip, knee and ankle in frame.",
    },
  },
  seated_leg_curl: {
    id: "seated_leg_curl",
    name: "Seated leg curl",
    aliases: ["Hamstring curl", "Leg curl machine"],
    summary: "Bend your knees to pull a pad down and back under the seat.",
    muscles: { primary: ["hamstrings"], secondary: ["calves"] },
    scene: { seat: { height: 0.5, backrest: true }, grip: "handles", cable: [], legPad: "shin_back", rails: false },
    start: definePose({ hipFlex: 90, kneeFlex: 8, torsoPitch: -8, shoulderFlex: 12, elbowFlex: 25, shoulderAbd: 22 }),
    end: definePose({ hipFlex: 90, kneeFlex: 100, torsoPitch: -8, shoulderFlex: 12, elbowFlex: 25, shoulderAbd: 22 }),
    grounded: false,
    tempo: STANDARD_TEMPO,
    setup: [
      "Line your knees up with the machine's pivot point.",
      "Rest the lower pad on the back of your ankles and lock the thigh pad down on your legs.",
      "Hold the handles and sit tall.",
    ],
    lift: "Bend your knees to pull the pad down and under the seat as far as you can.",
    lower: "Let your legs straighten slowly back to the start.",
    cues: ["Thigh pad snug", "Toes pulled toward your shins", "Control the return"],
    mistakes: [
      { mistake: "Thigh pad left loose so the hips rise", fix: "Lower the thigh pad until it presses firmly on your thighs." },
      { mistake: "Short reps", fix: "Pull until your heels are well under the seat." },
    ],
    analysis: {
      signal: "knee",
      liftDirection: "decrease",
      start: 165,
      end: 80,
      maxTorsoSwing: 8,
      cameraTip: "Film from the side at seat height with your hip, knee and ankle in frame.",
    },
  },
  hip_abduction: {
    id: "hip_abduction",
    name: "Hip abduction machine",
    aliases: ["Outer thigh machine", "Abductor machine"],
    summary: "Push your knees apart against pads on the outside of your legs.",
    muscles: { primary: ["abductors", "glutes"], secondary: [] },
    scene: { seat: { height: 0.5, backrest: true }, grip: "handles", cable: [], legPad: "knees_outside", rails: false },
    start: definePose({ ...SEATED, torsoPitch: -10, shoulderFlex: 12, elbowFlex: 25, shoulderAbd: 22 }),
    end: definePose({ ...SEATED, hipAbd: 32, torsoPitch: -10, shoulderFlex: 12, elbowFlex: 25, shoulderAbd: 22 }),
    grounded: false,
    tempo: STANDARD_TEMPO,
    setup: [
      "Sit back with the pads on the outside of your knees.",
      "Set the start width so your legs are together, then place feet on the foot rests.",
      "Hold the handles.",
    ],
    lift: "Push your knees outward as wide as you can control.",
    lower: "Let your knees come back together slowly, without the weights touching down.",
    cues: ["Push from the outside of your hips", "Back on the pad", "Slow return"],
    mistakes: [
      { mistake: "Letting the stack slam between reps", fix: "Stop just before the plates touch, then push again." },
    ],
    analysis: {
      signal: "thigh_spread",
      liftDirection: "increase",
      start: 10,
      end: 60,
      maxTorsoSwing: 10,
      cameraTip: "Film from the front at knee height so both knees are visible.",
    },
  },
  hip_adduction: {
    id: "hip_adduction",
    name: "Hip adduction machine",
    aliases: ["Inner thigh machine", "Adductor machine"],
    summary: "Squeeze your knees together against pads on the inside of your legs.",
    muscles: { primary: ["adductors"], secondary: [] },
    scene: { seat: { height: 0.5, backrest: true }, grip: "handles", cable: [], legPad: "knees_inside", rails: false },
    start: definePose({ ...SEATED, hipAbd: 32, torsoPitch: -10, shoulderFlex: 12, elbowFlex: 25, shoulderAbd: 22 }),
    end: definePose({ ...SEATED, hipAbd: 2, torsoPitch: -10, shoulderFlex: 12, elbowFlex: 25, shoulderAbd: 22 }),
    grounded: false,
    tempo: STANDARD_TEMPO,
    setup: [
      "Sit back with the pads on the inside of your knees.",
      "Set the start width so you feel a light stretch in your inner thighs.",
      "Hold the handles.",
    ],
    lift: "Squeeze your knees together until the pads meet.",
    lower: "Let your legs open slowly back to the stretch.",
    cues: ["Squeeze, don't bounce", "Back on the pad", "Comfortable stretch only"],
    mistakes: [
      { mistake: "Setting the start too wide", fix: "Narrow the start so the stretch is mild." },
    ],
    analysis: {
      signal: "thigh_spread",
      liftDirection: "decrease",
      start: 60,
      end: 10,
      maxTorsoSwing: 10,
      cameraTip: "Film from the front at knee height so both knees are visible.",
    },
  },
  smith_squat: {
    id: "smith_squat",
    name: "Smith machine squat",
    aliases: ["Smith squat", "Smith machine"],
    summary: "Squat with a bar that runs on fixed rails resting across your upper back.",
    muscles: { primary: ["quads", "glutes"], secondary: ["hamstrings", "adductors", "lower_back", "abs"] },
    scene: { seat: null, grip: "bar", cable: [], legPad: "none", rails: true },
    start: definePose({ torsoPitch: 4, shoulderAbd: 62, shoulderTwist: 90, shoulderFlex: -18, elbowFlex: 115 }),
    end: definePose({ torsoPitch: 34, hipFlex: 95, kneeFlex: 112, shoulderAbd: 62, shoulderTwist: 90, shoulderFlex: -18, elbowFlex: 115 }),
    grounded: true,
    tempo: { lift: 1.4, hold: 0.3, lower: 2, rest: 0.6 },
    setup: [
      "Set the safety stops just below the depth you plan to squat to.",
      "Step under the bar so it rests on your upper back, not your neck.",
      "Place feet shoulder-width apart, slightly in front of the bar.",
    ],
    lift: "Stand up by pushing the floor away until your hips and knees are straight.",
    lower: "Sit your hips back and down until your thighs are about level with the floor.",
    cues: ["Chest up", "Knees follow your toes", "Whole foot stays flat"],
    mistakes: [
      { mistake: "Heels lifting at the bottom", fix: "Move your feet a little further forward and keep weight mid-foot." },
      { mistake: "Knees caving in on the way up", fix: "Push your knees out in line with your toes." },
    ],
    analysis: {
      signal: "knee",
      liftDirection: "increase",
      start: 85,
      end: 170,
      maxTorsoSwing: 50,
      cameraTip: "Film from the side at hip height with your whole body and the bar in frame.",
    },
  },
  ab_crunch: {
    id: "ab_crunch",
    name: "Ab crunch machine",
    aliases: ["Abdominal machine", "Crunch machine"],
    summary: "Curl your ribcage toward your hips against a padded lever.",
    muscles: { primary: ["abs"], secondary: ["obliques"] },
    scene: { seat: { height: 0.5, backrest: false }, grip: "handles", cable: [], legPad: "none", rails: false },
    start: definePose({ ...SEATED, torsoPitch: -6, shoulderFlex: 150, elbowFlex: 125, shoulderAbd: 20 }),
    end: definePose({ ...SEATED, torsoPitch: 38, shoulderFlex: 150, elbowFlex: 125, shoulderAbd: 20 }),
    grounded: false,
    tempo: { lift: 1, hold: 0.6, lower: 1.8, rest: 0.4 },
    setup: [
      "Set the seat so the handles or chest pad sit at your upper chest.",
      "Hook your feet under the rollers if the machine has them.",
      "Hold the handles lightly; your arms just ride along.",
    ],
    lift: "Curl your chest down toward your hips by squeezing your stomach.",
    lower: "Uncurl slowly back to upright.",
    cues: ["Breathe out as you crunch", "Round your spine, don't hinge at the hips", "Arms stay passive"],
    mistakes: [
      { mistake: "Pulling with your arms", fix: "Loosen your grip and let your stomach do the work." },
    ],
    analysis: {
      signal: "hip",
      liftDirection: "decrease",
      start: 110,
      end: 70,
      maxTorsoSwing: 90,
      cameraTip: "Film from the side at seat height with your head and hips in frame.",
    },
  },
};

export function getPattern(id: PatternId): MovementPattern {
  return PATTERNS[id];
}

export const PATTERN_LIST: readonly MovementPattern[] = PATTERN_IDS.map((id) => PATTERNS[id]);
