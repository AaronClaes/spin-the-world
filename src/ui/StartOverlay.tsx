interface Props {
  onStart: () => void;
}

// The click is the user gesture that unlocks the AudioContext.
export function StartOverlay({ onStart }: Props) {
  return (
    <div className="overlay">
      <h1>Locked Groove</h1>
      <p>
        ← → (or A/D) to switch lanes. Catch the notes; catch the world pieces.
      </p>
      <button onClick={onStart}>Drop the needle</button>
    </div>
  );
}
