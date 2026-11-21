// The desktop's space backdrop (SpaceBackdrop.tsx): a fixed layer behind the whole game screen. When one is given,
// the Pixi renderer puts its canvas there instead of in the room panel, so the star field fills the viewport; the
// room is still drawn in the panel, with the same camera. Phones (and the DOM renderer) have none.

import { createContext } from "react";

export const BackdropContext = createContext<HTMLElement | null>(null);
