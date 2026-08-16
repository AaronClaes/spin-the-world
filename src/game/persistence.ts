// Per-record progress in localStorage (spec §8.7), plus the one global
// preference worth remembering. No backend. Guarded — storage can be absent
// (tests) or throw (private browsing quota).

export interface RecordProgress {
  highScore: number;
  stars: number;
  completed: boolean; // ever collected every world piece
}

const KEY_PREFIX = "locked-groove:";

const EMPTY: RecordProgress = { highScore: 0, stars: 0, completed: false };

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadProgress(recordId: string): RecordProgress {
  const store = storage();
  if (!store) return { ...EMPTY };
  try {
    const raw = store.getItem(KEY_PREFIX + recordId);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<RecordProgress>;
    return {
      highScore: typeof parsed.highScore === "number" ? parsed.highScore : 0,
      stars: typeof parsed.stars === "number" ? parsed.stars : 0,
      completed: parsed.completed === true,
    };
  } catch {
    return { ...EMPTY };
  }
}

// Merges a finished run into stored progress; returns the merged result and
// whether the run set a new high score.
export function saveRunResult(
  recordId: string,
  run: { score: number; stars: number; completed: boolean },
): { progress: RecordProgress; newHighScore: boolean } {
  const prev = loadProgress(recordId);
  const newHighScore = run.score > prev.highScore;
  const progress: RecordProgress = {
    highScore: Math.max(prev.highScore, run.score),
    stars: Math.max(prev.stars, run.stars),
    completed: prev.completed || run.completed,
  };
  try {
    storage()?.setItem(KEY_PREFIX + recordId, JSON.stringify(progress));
  } catch {
    // quota/private mode — progress just isn't persisted
  }
  return { progress, newHighScore };
}

// Mute is a preference, not run state: someone who muted because they're in
// an office is still in an office after a reload, and having to find the
// button again before the wall preview starts playing is the whole problem
// they were trying to solve.
const MUTED_KEY = KEY_PREFIX + "muted";

export function loadMuted(): boolean {
  try {
    return storage()?.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    storage()?.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // quota/private mode — the toggle still works, it just won't be remembered
  }
}
