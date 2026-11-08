import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { App } from "./App.tsx";
import { ToastProvider } from "./Toasts.tsx";
import "./i18n/index.ts";
import "./styles.css";

// Client-side routes (React Router, declarative mode). The Worker serves index.html for any unknown path
// (`not_found_handling` in server/wrangler.jsonc) and Vite does the same in dev, so a reload on any route works.

// The ship map editor, in dev builds only (`npm run dev`, then /editor): never in a production bundle.
const ShipEditor = import.meta.env.DEV ? lazy(() => import("./editor/ShipEditor.tsx")) : null;
// The mush2 design kit, a showcase of our own components, also dev builds only (/design-kit-mush2).
const Mush2Kit = import.meta.env.DEV ? lazy(() => import("./designKit/Mush2Kit.tsx")) : null;
// The finished games list (#155), at /games: loaded only when first visited.
const GamesPage = lazy(() => import("./games/GamesPage.tsx"));
// A finished game's replay (#370), at /replay/<id>: also loaded only when first visited.
const ReplayPage = lazy(() => import("./replay/ReplayPage.tsx"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/games" element={<GamesPage />} />
            <Route path="/replay/:id" element={<ReplayPage />} />
            {ShipEditor && <Route path="/editor" element={<ShipEditor />} />}
            {Mush2Kit && <Route path="/design-kit-mush2" element={<Mush2Kit />} />}
            {/* Everything else: the lobby at / and the game at /play (App has its own routes), and unknown paths. */}
            <Route path="*" element={<App />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
