# web/ guidelines

Loaded when working in `web/`. These are the single source of truth for the UI rules; the root CLAUDE.md only points here.

- **Thin view layer.** Components render a `PlayerView` and emit player intents. No game logic in components. The renderer must be swappable: DOM now, possibly react-three-fiber or something more experimental later. Keep chat and text input in the DOM regardless of renderer. I want to experiment with custom animated UI later, so do not couple rendering to game logic.

- **Mobile is first-class.** Below 1024px wide (`MOBILE_QUERY` in `web/src/useMobile.ts`, mirrored by one `@media` block in `styles.css`) the game is a tabbed phone layout: the top bar always shows; one panel at a time below it; a bottom nav of Inspect (left) | Room (middle, default) | iTrackie (right). Tapping a person, equipment, or a door in the room opens a peek bar above the nav (name, legal actions, Go for doors, More to open Inspect). The ship map is hidden; doors are how you move. Every UI change must work in both layouts:
   - Nothing important may be hover-only or double-click-only (touch has neither reliably).
   - The iso room never scales below 1x on phones; wide rooms scroll sideways, centred on you.
   - 360px wide is the minimum supported width, and must look good, not just work. No sideways page scroll; nothing under the notch or the nav.
   - Panels are hidden with CSS, not unmounted, so chat drafts and tabs survive switching.
   - When the user asks for a visual check (`play` skill, never run unprompted), check both screenshot passes. The on-screen keyboard can only be checked on a real phone.

- **Buttons use the Mush style.** Every button uses the global `button` rule in `styles.css`: the original site's 3-slice sprites with hover and pressed variants, or `button.big` for the 40px variant. New buttons set only layout (size, padding, grid), never their own background, border, or colors. Base UI has no theme object; its parts render native elements, so a Base UI part that renders a `<button>` picks up the same rule, and its states are styled through the `data-*` attributes it sets. The only deliberate exceptions are widgets that aren't plain buttons (tabs, map rooms), which replace the background.
