import { create } from "zustand";
import type { Lane } from "./geometry";

// Event-rate game state (input, score, collected pieces). Frame-rate state
// lives in clockState, not here — this store re-renders the HUD and diorama,
// which only change a few times per second at most.

export const NOTE_SCORE = 10; // × combo (spec §8.7)
export const PIECE_SCORE = 100;

interface GameState {
  lane: Lane; // committed integer — collection resolves against this
  score: number;
  combo: number;
  bestCombo: number;
  notesHit: number;
  notesMissed: number;
  piecesCollected: string[]; // prop names, in collect order
  piecesLost: number;

  moveLane: (dir: -1 | 1) => void;
  collectNote: () => void;
  missNote: () => void;
  collectPiece: (prop: string) => void;
  losePiece: () => void;
  resetRun: () => void;
}

const initialRun = {
  lane: 1 as Lane,
  score: 0,
  combo: 0,
  bestCombo: 0,
  notesHit: 0,
  notesMissed: 0,
  piecesCollected: [] as string[],
  piecesLost: 0,
};

export const useGameStore = create<GameState>((set) => ({
  ...initialRun,

  moveLane: (dir) =>
    set((s) => ({ lane: Math.min(2, Math.max(0, s.lane + dir)) as Lane })),

  collectNote: () =>
    set((s) => {
      const combo = s.combo + 1;
      return {
        combo,
        bestCombo: Math.max(s.bestCombo, combo),
        notesHit: s.notesHit + 1,
        score: s.score + NOTE_SCORE * combo,
      };
    }),

  // A note miss resets combo; world pieces punish via recurrence instead.
  missNote: () => set((s) => ({ combo: 0, notesMissed: s.notesMissed + 1 })),

  collectPiece: (prop) =>
    set((s) =>
      // idempotent — props are unique per record (validated at load)
      s.piecesCollected.includes(prop)
        ? s
        : {
            score: s.score + PIECE_SCORE,
            piecesCollected: [...s.piecesCollected, prop],
          },
    ),

  losePiece: () => set((s) => ({ piecesLost: s.piecesLost + 1 })),

  resetRun: () => set(initialRun),
}));
