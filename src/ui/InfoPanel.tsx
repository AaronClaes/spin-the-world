import { useEffect } from "react";

interface Props {
  onClose: () => void;
}

// Credits and colophon, behind the ⓘ on the studio wall. The wall itself
// should read as a room, not a README — everything anyone has to be told
// (jam, assets, stack) lives in here instead of along the bottom edge.
export function InfoPanel({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="info-scrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Credits and colophon"
    >
      {/* the card swallows clicks so only the scrim closes */}
      <div className="info-card pop-in" onClick={(e) => e.stopPropagation()}>
        <button className="info-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2>Spin the World</h2>
        <p className="info-lede">
          A Three.js Game Jam entry — theme: tiny worlds. Every record holds a
          world; you play it into existence by running the groove.
        </p>

        <h3>Credits</h3>
        <dl className="info-list">
          <div>
            <dt>Music</dt>
            <dd>
              sequenced live with{" "}
              <a
                href="https://tonejs.github.io/"
                target="_blank"
                rel="noreferrer"
              >
                Tone.js
              </a>{" "}
              — no audio files, the transport is the game clock
            </dd>
          </div>
          <div>
            <dt>Runner</dt>
            <dd>
              the Rogue, with the Ranger's head, from the{" "}
              <a
                href="https://kaylousberg.itch.io/kaykit-adventurers"
                target="_blank"
                rel="noreferrer"
              >
                KayKit Adventurers
              </a>{" "}
              pack by Kay Lousberg — CC0, repainted into modern clothes with
              headphones added
            </dd>
          </div>
          <div>
            <dt>Props</dt>
            <dd>
              the{" "}
              <a
                href="https://kaylousberg.itch.io/kaykit-medieval-hexagon"
                target="_blank"
                rel="noreferrer"
              >
                KayKit Medieval Hexagon
              </a>{" "}
              pack by Kay Lousberg — CC0
            </dd>
          </div>
          <div>
            <dt>Sheep, bushes &amp; clouds</dt>
            <dd>
              by{" "}
              <a
                href="https://quaternius.com/"
                target="_blank"
                rel="noreferrer"
              >
                Quaternius
              </a>{" "}
              — CC0, via{" "}
              <a href="https://poly.pizza/" target="_blank" rel="noreferrer">
                poly.pizza
              </a>
            </dd>
          </div>
        </dl>

        <h3>Built with</h3>
        <dl className="info-list">
          <div>
            <dt>Rendering</dt>
            <dd>Three.js via React Three Fiber, drei, postprocessing</dd>
          </div>
          <div>
            <dt>Audio</dt>
            <dd>Tone.js — sequenced stems, SFX, and the clock itself</dd>
          </div>
          <div>
            <dt>App</dt>
            <dd>React, TypeScript, Zustand, Vite</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
