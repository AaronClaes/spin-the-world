interface Props {
  onStart: () => void;
}

// The click is the user gesture that unlocks the AudioContext.
export function StartOverlay({ onStart }: Props) {
  return (
    <div className="overlay">
      <h1>Locked Groove</h1>
      <p>milestone 1 — clock &amp; sync</p>
      <button onClick={onStart}>Drop the needle</button>
    </div>
  );
}
