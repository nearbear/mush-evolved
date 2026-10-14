# Site design catalog

Descriptions of `Mush/www/img/design/*` (325 files, the old website chrome), written 2026-10-13 from contact sheets (`npm run contact-sheet -- Mush/www/img/design --zoom 2`, plus zoomed sheets of the tiny files). Names are Motion Twin's. Descriptions say what the picture shows. Meaning in the original site is a guess where marked **(?)**. `_over` is a hover variant and `_on` a pressed/active one, so only the base file is listed unless the variants differ. `.gif` files are animated. Icons live in `Mush/www/img/icons/ui`, see `icon-catalog.md`.

**Already used by the game:** `bg.jpg`, `bg_start.jpg`, `but*` (3-slice buttons), `buttonchat`, `chatbox`, `loading51.gif`, `pa1`, `pa2`, `lifebar`, `lifebar2`, `tiptop`, `tipbg`, `tipbottom` (panel frame).

**Do not use (trademark or marketing):** the `logo*` files, `twinoid.png`, `mush_stamp.png`, `beta.png`, `tag*.png` ribbons. Shop and promo art (`pack*`, `gold_*`, `goldbanner*`, `goldframe*`, `goldplus`, `rank_*`) is not a fit for the game. See `docs/mush-assets.md`.

Most box and bar pieces are semi-transparent blue, so they pick up whatever sits behind them.

## Backgrounds
| File | Shows |
|---|---|
| `bg.jpg` | Deep-blue starfield, bright blue lens flare at the top, small dark planet at lower left |
| `bg_start.jpg` | Same starfield, flare is a flat-bottomed block (start screen) |
| `bg_left.png`, `bg_right.png`, `bgcontent.png` | Thin transparent side/edge strips for the page layout |
| `bg_machine.png` | Dark navy square with one cut corner |
| `bbg.png`, `bg_btdistr.gif` | Tiny flat fills |
| `sheetmain.jpg` | Tall blue starfield panel with a darker strip on the right |
| `sheetmain.png` | Tall translucent grey-blue panel |
| `sheetbg.png`, `sheetpabg.jpg/png`, `sheetpatop.jpg/png`, `sheetpabottom.jpg` | Starfield strips for the top, middle and bottom of a sheet panel |
| `sidemenubg.png`, `sidemenubottom.png` | Thin side-menu strips |
| `itemactionsbg.jpg/png`, `itemactionsbottom.jpg`, `itemactionstop.png` | Wide starfield panel for an item-actions popup; the top has a small dark triangle pointer |
| `popbg.png`, `poptop.png`, `popbottom.png` | Popup frame: transparent middle, blue glowing top and bottom bars |
| `tipbg.png`, `tiptop.png`, `tipbottom.png` | Tooltip frame, same idea, smaller |
| `astro_bg.png` | Light-blue swirl tile |
| `nav_bg.png` | Pale cyan tile with a faint compass and cursor |
| `neroncore_bg.png`, `neron_bg.png` | Pale cyan hex/gear tile; a cyan quarter-circle corner |
| `bios_bg.png` | Small dark-blue tile **(?)** |
| `sensor_bg.png` | Light-blue radio-wave arcs |
| `planet_h.png` | Plain pale-cyan square (planet highlight **(?)**) |
| `danger_bg.png` | Dark-red warning triangle |
| `art_tips.jpg`, `h1gameguide.png` | Banner art of an astronaut with a blaster (guide header) |
| `art_tips_02.jpg` | Near-white filler for the same banner |
| `banner_neron.jpg` | Black circuit-trace banner with the red NERON eye |

## Panels, boxes, and frames
| File | Shows |
|---|---|
| `box1_*` (`topleft`, `topright`, `bottomleft`, `bottomright`, `bgleft`, `bgright`, `bg`, `top`, `bottom`) | Dark-blue starfield box with chamfered corners, as separate corner and edge pieces for 9-slice |
| `box2bg/top/bottom`, `box3bg/top/bottom` | Translucent blue panel, chamfered corners, 3-slice vertical (box3 is wider) |
| `boxextra.png` | Violet-blue panel, one cut corner |
| `boxguest.png` | Tall gradient panel, dark navy to lilac, cut top-left corner |
| `boxstar.png` | Wide version of `boxguest` |
| `topleft.png`, `topright.png`, `topright2.png`, `bottomleft.png`, `bottomright.png`, `bottomcontent.png`, `centertop.png`, `centertopiso.png` | Corner and edge pieces of the page frame (the glowing outline of the main column) |
| `maintop.png` | Wide bright-blue grid header with chamfered corners |
| `mxtopmaincontent.png`, `2`, `3` | Same header style; 2 and 3 have inset dark wells split into 3 and 2 columns |
| `mxbottommaincontent.png`, `mxbordercontent.png` | Matching footer and side border |
| `xptop.png` | Dark navy bar with one cut corner (XP header) |
| `table_header.png`, `th.gif` | Thin table header strips |
| `quote.png` | Dark navy quote box with a soft grey border |
| `blockquote_arrow.png` | Small dark-blue left-pointing speech arrow |
| `mustknow_left/right.png` | Navy right-triangle corner pieces |
| `welcome_frame.png`, `gold_frame.png`, `screen_frame.png`, `screen_frame_b.png` | Tall ornamental blue-metal vertical bars with cyan lights |
| `ranking_bar1/2.png` | Tall chrome-and-cyan glowing bars, left-facing and right-facing |
| `ugoals_headerLeft/Right.png` | Slim header end caps |
| `skill_inside.png`, `skillblock.png`, `skillblock_boost.png` | Dark-navy rounded tiles, the last with a lighter inner glow |
| `gold_skill.png`, `once_skill.png` | Dark-navy square with a gold / pink outlined cut corner |
| `slot.png`, `bigslot.png`, `slotcool.png` | Blue rounded slot tile; larger slot; glossy white-rimmed tile |
| `oselected.png` | Glowing green square outline (selection ring) |
| `learning.png` | Dark-blue rounded empty bar frame |

## Tabs
| File | Shows |
|---|---|
| `gen_tab.png`, `gold_tab.png`, `news_tab.png` | Blue tab tops: plain, gold-outlined, pink-outlined |
| `taboff.gif`, `tabon.gif` | Tiny flat tab fills, off and on |

## Buttons and controls
| File | Shows |
|---|---|
| `butleft/butbg/butright.png` | Blue 3-slice button (`_over` lighter, `_on.gif` animated pressed). `butbg_tease.png` is a variant fill |
| `but2left/but2bg/but2right.png` | Second blue 3-slice button style (`_over` brighter) |
| `but2left/right`, `but2leftover/rightover` | Also read as hex arrow buttons, left and right chevrons (blue, brighter on hover) |
| `butsocialbg/left/right.png` | Pale 3-slice button for social actions |
| `buttonchat.png` | Blue rounded button with a white return arrow (`over` brighter) |
| `buttonmute.png` | Blue rounded button with a pink square (mute, `over` brighter) |
| `arrowup/down/left/right.png` | Blue chevrons (`_over` white) |
| `arrow_anim_up/down/left/right.gif`, `arrow_anim.gif` | White outlined block arrows, animated |
| `arrow_bt.png`, `mini_arrow_left/right.gif`, `up.png`, `down.png` | Small plain arrows |
| `bdd.png`, `bdd_off.png` | Small square toggle frames **(?)** |
| `bdd_off_over.png` | Green square with "?" |
| `switch.png`, `switch_bg.gif` | Grey toggle knob; green-and-blue switch track |
| `spot.png`, `spot_over.png` | Small blue dot / white dot (radio-style marker) |
| `alarm_left/bg/right.png`, `alarm_on_*.gif` | Thin alarm button 3-slice, plain and flashing |
| `distrib.gif`, `distrib_over.gif` | Cyan vending-machine box, animated |
| `distrib_bt.gif`, `distrib_bt_hover.gif`, `distrib_bt_bg.gif` | Dark-teal screen button with a spiky burst; hover adds a gold ring. The bg is a pale "INSERT COINS" strip |
| `yesno.png`, `yesnomask.png` | Green tick and red cross sprite; its mask |
| `mask.png` | Small grey square mask **(?)** |
| `empty.png`, `pixel.gif`, `pchoose.png`, `here.png` | Transparent spacers and 1px helpers |

## Bars, meters, and counters
| File | Shows |
|---|---|
| `pvsm.png`, `pvsm.gif` | Blue capsule meter with ticks (gif animated); `pvsm_gold` gold-rimmed; `pvsm_mini` short rounded cap |
| `pabar.png` | Tall vertical blue bar with black segments |
| `prog_bg/left/right.png` | Thin blue 3-slice progress track |
| `barprogress.png`, `barinprogress.png` | Green "NERON" progress bar; blue one in progress |
| `bar1`–`bar14.gif` | 1–2 px-tall coloured stripes in several colours (bar fills **(?)**) |
| `lifebar.png`, `lifebar2.png` | Tiny yellow / gold bar fills |
| `percentage.png` | 1px green bar fill |
| `learning_block.png` | Green block segment |
| `level.png`, `level2.png`, `level_bar.png` | Level plates (grey and navy, cut corner) and a blue vertical bar |
| `level_ingame.png` | Grey level plate with an empty pink gauge |
| `level_ingame_on.png`, `_on_over`, `_anim.png/.gif`, `_anim_level2.gif` | Blue level plate with a pink gauge and green up arrow (level-up available), several animated states |
| `counter.png`, `counting.png` | Dark-blue rounded counter well; small counter fill |
| `xp_completion.png`, `xp_completion_fill.png`, `xp_counter.png` | Blue XP bar frame, its pink fill, and a counter well fading to the right |
| `treelast.png`, `treeinfinite.png`, `tree.png` | Thin vertical connector lines for a skill tree |

## Chat
| File | Shows |
|---|---|
| `chatbox.png` | White rounded input box (used) |
| `chatbgtop.png` | Chat panel top bar with a small corner tab |
| `chat_from_left.png`, `chat_from_right.png` | Pale bubble tails, left and right |

## NERON and Mush art
| File | Shows |
|---|---|
| `neron.png`, `neron_b.png`, `neron_chat.png` | Red glowing NERON eye in a steel ring (three sizes) |
| `avatar_neron.gif`, `atar7_blindeyes.gif` | Same eye with cyan circuitry; the second is a large animated version |
| `neroncorecorner.png` | Tiny pale corner piece |
| `dlhelp.png` | Empty dark rounded tile (frame for the `dlhelp_*` icons) |
| `dlhelp_boss/com/neron/scan.png` | Four room illustrations in rounded tiles: captain's chair, comms, NERON core, scan/lab |
| `mush.gif` | Small red Mush creature sprite |
| `medal.png` | Large gold winged emblem with a pink core |
| `podium.png`, `podium_mush.png` | Glowing teleporter pad: blue (human) and pink (Mush) |
| `throne_bronze/silver/gold.png` | Small glowing rings in three metals |
| `transport0`–`3.png` | Four dark tiles with isometric pixel art: crate machine, two kinds of hatch, a round probe/ship |
| `screen_temp.png` | Screenshot of the isometric Daedalus bridge with characters |
| `empty_planet.png` | Blue banded planet |
| `figure.png` | Small silver disc/ufo (figure **(?)**) |
| `sensor01–04.png` | Blue key-hole and radio-wave tiles, signal strength 0 to 3 |

## Small icons and decoration
| File | Shows |
|---|---|
| `lock_basic.png`, `lock_gold.png` | Teal / gold padlock (also in `icons/ui`) |
| `mail.png` | Pink envelope |
| `rss.png` | Orange RSS logo |
| `doc.png`, `guide.png` | Blue document; open book |
| `loading51.gif` | Grey spinner, animated (used) |
| `pa1.png`, `pa1bis.png`, `pa2.png` | Tiny cyan marker dots (`pa1bis` is a larger star) |
| `soon.png`, `soon_text.png`, `pronto.png` | "SOON", "BIENTÔT DISPONIBLE !", "PRONTO" labels (French/Spanish, not translatable) |
| `gold_blocked.png`, `gold_features_arrow1–3.png` | Yellow bug warning; light-blue triangles (shop pieces) |

## Not for the game
| File | Why |
|---|---|
| `Pamplemousse.jpg`, `Pamplemousse_small.jpg` | Photo of two grapefruit, placeholder |
| `quote_lai.jpg`, `quote_terrence.jpg`, `quote_wang.jpg` | Painted portraits of three male characters, from the original site's quotes |
| `logo*.png`, `twinoid.png`, `beta.png`, `mush_stamp.png` | Mush/Twinoid branding and trademarks |
| `tag.png`, `tag_en.png`, `tag_es.png` | Pink corner ribbons ("seen on YouTube", "launch imminent", in fr/en/es) |
| `pack*.png` | Shop boxes ("Gold mode", "Welcome pack") with a "SNC" logo, fr/en/es |
| `gold_*`, `goldbanner*`, `goldframe*`, `goldplus*`, `rank_*` | Shop and ranking art tied to the original's paid mode |
