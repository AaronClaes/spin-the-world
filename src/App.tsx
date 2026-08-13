import { useState } from "react";
import { startPlayback } from "./audio/transport";
import { clockState } from "./game/clockState";
import { useLaneInput } from "./game/useLaneInput";
import { meadow } from "./records/meadow";
import { Scene } from "./scene/Scene";
import { DebugHud } from "./ui/DebugHud";
import { StartOverlay } from "./ui/StartOverlay";

export default function App() {
  const [started, setStarted] = useState(false);
  useLaneInput();

  const start = async () => {
    await startPlayback(meadow, () => {
      clockState.ended = true;
    });
    clockState.playing = true;
    setStarted(true);
  };

  return (
    <>
      <Scene />
      <DebugHud />
      {!started && <StartOverlay onStart={start} />}
    </>
  );
}
