export const MUSCLES = [
  "chest",
  "front_delts",
  "side_delts",
  "rear_delts",
  "upper_back",
  "lats",
  "lower_back",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "abductors",
  "calves",
] as const;

export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: "Chest",
  front_delts: "Front shoulders",
  side_delts: "Side shoulders",
  rear_delts: "Rear shoulders",
  upper_back: "Upper back",
  lats: "Lats",
  lower_back: "Lower back",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  adductors: "Inner thighs",
  abductors: "Outer hips",
  calves: "Calves",
};

export interface MuscleTargets {
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
}

export type MuscleRole = "primary" | "secondary" | "idle";

export function muscleRole(targets: MuscleTargets, muscle: Muscle): MuscleRole {
  if (targets.primary.includes(muscle)) return "primary";
  if (targets.secondary.includes(muscle)) return "secondary";
  return "idle";
}
