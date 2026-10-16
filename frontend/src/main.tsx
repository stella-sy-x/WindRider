import "@fontsource-variable/cinzel";
import "@fontsource/philosopher/400.css";
import "@fontsource/philosopher/700.css";
import "@fontsource-variable/plus-jakarta-sans";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import "./index.css";
import { watchTouchMode } from "./game/touch.ts";
import { watchForStaleBuild } from "./staleBuild.ts";

watchForStaleBuild();
watchTouchMode();

// A promise nobody awaited (a fire-and-forget request, a failed lazy import) would otherwise fail silently
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection", event.reason);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
