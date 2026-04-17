/**
 * Task completion celebration: weighted random sound (mostly applause) + Partycles burst.
 * MP3s live under `public/audio/applaud/` and `public/audio/task-complete/`.
 * @see https://github.com/jonathanleane/partycles
 */

/** Applause / claps — primary pool (majority of plays). */
export const APPLAUD_SOUND_URLS: readonly string[] = [
  "/audio/applaud/01.mp3",
  "/audio/applaud/02.mp3",
  "/audio/applaud/03.mp3",
  "/audio/applaud/04.mp3",
  "/audio/applaud/05.mp3",
];

/**
 * Short voice clips (e.g. “amazing”, “excellent”) — occasional spice.
 * Kept separate from applause so we can weight them lower.
 */
export const TASK_COMPLETE_VOICE_URLS: readonly string[] = [
  "/audio/task-complete/01.mp3",
  "/audio/task-complete/02.mp3",
  "/audio/task-complete/03.mp3",
  "/audio/task-complete/04.mp3",
  "/audio/task-complete/05.mp3",
  "/audio/task-complete/06.mp3",
  "/audio/task-complete/07.mp3",
  "/audio/task-complete/08.mp3",
];

/**
 * Probability of picking a voice clip when both pools are non-empty (~18% voice, ~82% applaud).
 */
export const VOICE_CLIP_WEIGHT = 0.18;

/**
 * Partycles animation keys used for completions — order must match
 * `rewardControllers` in `BoardTaskCompletionCelebrationRewards.tsx`.
 * Indices 0–2: ~90% combined (30% each). Indices 3–10: ~10% combined (rare variety).
 */
export const COMPLETION_PARTYCLES_ANIMATIONS = [
  "confetti",
  "magicdust",
  "stars",
  "crystals",
  "coins",
  "paint",
  "galaxy",
  "fireworks",
  "hearts",
  "emoji",
  "mortar",
] as const;

export type CompletionPartyclesAnimation =
  (typeof COMPLETION_PARTYCLES_ANIMATIONS)[number];

/** ~90%: indices 0–2 (confetti, magicdust, stars). ~10%: indices 3–10 (the rest). */
export function pickWeightedCompletionAnimationIndex(): number {
  if (Math.random() < 0.9) {
    return Math.floor(Math.random() * 3);
  }
  return 3 + Math.floor(Math.random() * 8);
}

export function pickRandom<T>(items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)] as T;
}

/** Pick a URL: mostly `APPLAUD_SOUND_URLS`, sometimes `TASK_COMPLETE_VOICE_URLS`. */
export function pickWeightedCompletionSoundUrl(): string | undefined {
  const hasApplaud = APPLAUD_SOUND_URLS.length > 0;
  const hasVoice = TASK_COMPLETE_VOICE_URLS.length > 0;
  if (!hasApplaud && !hasVoice) return undefined;
  if (!hasApplaud) return pickRandom(TASK_COMPLETE_VOICE_URLS);
  if (!hasVoice) return pickRandom(APPLAUD_SOUND_URLS);
  if (Math.random() < VOICE_CLIP_WEIGHT) {
    return pickRandom(TASK_COMPLETE_VOICE_URLS);
  }
  return pickRandom(APPLAUD_SOUND_URLS);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Plays one completion sound unless `muted` or no URL resolved. */
export function playCompletionSound(muted: boolean): void {
  if (muted) return;
  const url = pickWeightedCompletionSoundUrl();
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = 0.35;
  void audio.play().catch(() => {
    // Missing file, autoplay policy, or decode error — ignore.
  });
}
