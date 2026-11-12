"use client";

import { useSyncExternalStore } from "react";

export interface SceneColors {
  body: string;
  muscleIdle: string;
  primary: string;
  secondary: string;
  metal: string;
  pad: string;
  floor: string;
}

const FALLBACK: SceneColors = {
  body: "#b9c2c7",
  muscleIdle: "#9aa5ac",
  primary: "#2148d0",
  secondary: "#9db1f2",
  metal: "#5d6870",
  pad: "#2c3338",
  floor: "#dde3e1",
};

const VARS: Record<keyof SceneColors, string> = {
  body: "--scene-body",
  muscleIdle: "--scene-muscle-idle",
  primary: "--plate",
  secondary: "--plate-soft",
  metal: "--scene-metal",
  pad: "--scene-pad",
  floor: "--scene-floor",
};

let cached: SceneColors | null = null;

function read(): SceneColors {
  const style = getComputedStyle(document.documentElement);
  const next = { ...FALLBACK };
  for (const key of Object.keys(VARS) as (keyof SceneColors)[]) {
    const value = style.getPropertyValue(VARS[key]).trim();
    if (value) next[key] = value;
  }
  return next;
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    cached = read();
    onChange();
  };
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}

function getSnapshot(): SceneColors {
  cached ??= read();
  return cached;
}

/** Design-token colours for three.js materials, kept in sync with light/dark mode. */
export function useSceneColors(): SceneColors {
  return useSyncExternalStore(subscribe, getSnapshot, () => FALLBACK);
}
