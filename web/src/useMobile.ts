import { useSyncExternalStore } from "react";

/** Keep in sync with the `@media (max-width: 1023px)` block in styles/responsive.css. */
const MOBILE_QUERY = "(max-width: 1023px)";

const query = window.matchMedia(MOBILE_QUERY);
const subscribe = (onChange: () => void) => {
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** True when the tabbed phone layout is active (bottom nav, one panel at a time). */
export function useMobile(): boolean {
  return useSyncExternalStore(subscribe, () => query.matches);
}
