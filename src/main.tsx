import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource-variable/baloo-2";
import "./styles.css";

createRoot(document.getElementById("root")!, {
  // A throw inside the Canvas leaves a black screen and a generic React
  // warning — the stack never reaches the console. Park it somewhere a
  // headless check can read it back after the reload that caused it.
  onUncaughtError: import.meta.env.DEV
    ? (error) => {
        try {
          sessionStorage.setItem(
            "last-uncaught",
            String((error as Error)?.stack ?? error),
          );
        } catch {
          // storage unavailable — nothing to do
        }
        console.error(error);
      }
    : undefined,
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
