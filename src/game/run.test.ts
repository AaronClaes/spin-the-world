import { describe, expect, it } from "vitest";
import { meadow } from "../records/meadow";
import type { RecordDef } from "../records/types";
import type { ResolveEvent } from "./run";
import { createRun, resolveCrossings } from "./run";

// A minimal record: one note at beat 2 (lane 0), one piece at beat 3 (lane 1).
const tiny: RecordDef = {
  ...meadow,
  id: "tiny",
  totalBeats: 32,
  worldPieces: [{ id: "wp01", beat: 3, lane: 1, prop: "box" }],
  notePatterns: [
    { fromBar: 0, toBar: 1, lanes: ["----x---", "--------", "--------"] },
  ],
  stemUnlockAtPieces: [0, 0, 1, 1],
};

const drain = (
  run: ReturnType<typeof createRun>,
  beatPos: number,
  lane: 0 | 1 | 2,
) => {
  const out: ResolveEvent[] = [];
  resolveCrossings(run, beatPos, lane, out);
  return out;
};

describe("resolveCrossings", () => {
  it("collects an item when the committed lane matches at crossing", () => {
    const run = createRun(tiny);
    const events = drain(run, 2.01, 0);
    expect(events).toHaveLength(1);
    expect(events[0].collected).toBe(true);
    expect(events[0].item.status).toBe("collected");
  });

  it("consumes a missed note — it does not recur", () => {
    const run = createRun(tiny);
    drain(run, 2.01, 1); // wrong lane for the note
    const later = drain(run, 12, 1);
    // only the piece at beat 3 resolves later (collected, lane 1)
    expect(later).toHaveLength(1);
    expect(later[0].item.kind).toBe("piece");
  });

  it("re-inserts a missed piece one revolution later, sorted", () => {
    const run = createRun(tiny);
    drain(run, 3.01, 0); // note missed at 2, piece missed at 3
    const piece = run.pieces[0];
    expect(piece.status).toBe("pending");
    expect(piece.beat).toBe(11); // 3 + 8
    // list stays sorted and the pointer hasn't skipped anything
    for (let i = run.next; i < run.items.length - 1; i++) {
      expect(run.items[i].beat).toBeLessThanOrEqual(run.items[i + 1].beat);
    }
    // catch it on the recurrence
    const events = drain(run, 11.01, 1);
    expect(events.some((e) => e.item.kind === "piece" && e.collected)).toBe(
      true,
    );
  });

  it("loses a piece whose recurrence would land past the end", () => {
    const late: RecordDef = {
      ...tiny,
      worldPieces: [{ id: "wp01", beat: 27, lane: 1, prop: "box" }],
    };
    const run = createRun(late);
    drain(run, 28, 0); // missed at 27; 27 + 8 = 35 > 32
    expect(run.pieces[0].status).toBe("lost");
  });

  it("resolves multiple crossings in one frame in beat order", () => {
    const run = createRun(tiny);
    const events = drain(run, 4, 1); // note at 2 (miss), piece at 3 (collect)
    expect(events.map((e) => e.item.kind)).toEqual(["note", "piece"]);
    expect(events.map((e) => e.collected)).toEqual([false, true]);
  });

  it("a piece can recur repeatedly until the track runs out", () => {
    const run = createRun(tiny);
    let beat = 3;
    // miss it on every lap: 3 → 11 → 19 → 27 → lost (35 > 32)
    for (let lap = 0; lap < 3; lap++) {
      drain(run, beat + 0.01, 0);
      beat += 8;
      expect(run.pieces[0].beat).toBe(beat);
    }
    drain(run, beat + 0.01, 0);
    expect(run.pieces[0].status).toBe("lost");
  });
});
