import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ToastProvider } from "./Toasts.tsx";
import "./i18n/index.ts";
import "./styles.css";

// The ship map editor, in dev builds only (`npm run dev`, then /editor): never in a production bundle.
const ShipEditor = import.meta.env.DEV && location.pathname === "/editor" ? lazy(() => import("./editor/ShipEditor.tsx")) : null;
// The finished games list (#155), at /games: a page of its own, loaded only there.
const GamesPage = location.pathname === "/games" ? lazy(() => import("./games/GamesPage.tsx")) : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {ShipEditor ? (
      <Suspense fallback={null}>
        <ShipEditor />
      </Suspense>
    ) : GamesPage ? (
      <Suspense fallback={null}>
        <GamesPage />
      </Suspense>
    ) : (
      <ToastProvider>
        <App />
      </ToastProvider>
    )}
  </StrictMode>,
);
