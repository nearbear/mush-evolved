# Tab icons

Icons are `Mush/www/img/icons/ui/*.png`, exported as `TAB_ICONS` in `web/src/art/assets.ts`. Chosen by the user 2026-10-13.

| Tab | File | Status |
|---|---|---|
| Global chat | `talk.gif` (blue speech bubble; was `wall.png` until 2026-10-21) | in use (iTrackie) |
| Threads | `wall.png` | in use (iTrackie, threads under global chat) |
| Room log | `local.gif` | in use (iTrackie) |
| Features | `basicplus.png` | in use (iTrackie) |
| New private channel button | `goldplus.png` ("glodplus" typo) | in use (button, not a tab) |
| iTrackie (phone bottom nav) | `talkie.png` | in use |
| Inspect (phone bottom nav) | `search.png` | in use |
| Comms | `comm.png` | Features thread (exists); icon registered |
| Inventory | `stock.png` | Features thread (exists); icon registered |
| Books | `learned.png` | new feature, to be announced (TBA); not built |
| Room (phone bottom nav) | `awake.png` | in use |
| Expeditions | `survival.png` | tab wanted, not built |
| Global log | `infoalert.png` | tab wanted, not built |
| Astrophysics | `planet.png` | Features thread (added) |
| Space combat | `shield.png` | tab wanted, not built (Features thread `space_battle`) |
| Private channels | `private.png` | in use (iTrackie) |
| Research | `microsc.png` | tab wanted, not built (only a Features drop-down thread) |
| Botany | `pa_garden.png` | tab wanted, not built (Features thread) |
| PILGRED | `pa_pilgred.png` | tab wanted, not built (Features thread) |
| NERON projects | `conceptor.png` (changed from `projects_done.png`) | tab wanted, not built (Features thread) |
| Items | `search.png` | tab wanted, not built |
| NERON bios | `neron.png` | tab wanted, not built |
| Notebook | `notebook.png` | tab wanted, not built |
| Food | `pa_cook.png` | tab wanted, not built |
| Health | `pa_heal.png` | tab wanted, not built |
| Mush chat | `spore.png` | in use (iTrackie, Mush only, far right) |
| Favorited threads | `fav.png` (no `favorite.png` exists) | tab wanted, not built |
| Goals | `triumph.png` | tab wanted, not built |

Every existing tab, button and Features thread now has an icon. The Features drop-down is a Base UI Select (`web/src/hud/FeatureSelect.tsx`) so its options can show them; the private-channel picker is still a native select. 
