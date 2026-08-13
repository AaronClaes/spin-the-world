import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadProgress, saveRunResult } from "./persistence";

// Minimal localStorage stand-in — the vitest environment is node.
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe("persistence", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeStorage();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("returns empty progress for an unseen record", () => {
    expect(loadProgress("meadow")).toEqual({
      highScore: 0,
      stars: 0,
      completed: false,
    });
  });

  it("round-trips a run result", () => {
    const { progress, newHighScore } = saveRunResult("meadow", {
      score: 4200,
      stars: 2,
      completed: false,
    });
    expect(newHighScore).toBe(true);
    expect(progress).toEqual({ highScore: 4200, stars: 2, completed: false });
    expect(loadProgress("meadow")).toEqual(progress);
  });

  it("keeps the best of each field across runs", () => {
    saveRunResult("meadow", { score: 4200, stars: 2, completed: true });
    const { progress, newHighScore } = saveRunResult("meadow", {
      score: 1000,
      stars: 1,
      completed: false,
    });
    expect(newHighScore).toBe(false);
    expect(progress).toEqual({ highScore: 4200, stars: 2, completed: true });
  });

  it("survives corrupted stored JSON", () => {
    localStorage.setItem("locked-groove:meadow", "{not json");
    expect(loadProgress("meadow")).toEqual({
      highScore: 0,
      stars: 0,
      completed: false,
    });
  });

  it("works without localStorage at all", () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(loadProgress("meadow").highScore).toBe(0);
    expect(
      saveRunResult("meadow", { score: 10, stars: 0, completed: false })
        .progress.highScore,
    ).toBe(10);
  });
});
