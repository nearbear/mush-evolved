# Attribution

The contents of this folder are from **Mush** by **Motion Twin**, taken from the
`Mush/` folder of [motion-twin/WebGamesArchives](https://github.com/motion-twin/WebGamesArchives).

Licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
(see `LICENSE.txt`, copied from the upstream repository root).

Changes: some third-party logos and award badges were removed (see `docs/mush-assets.md`). The web
client keys out the solid background color of the character sprites at runtime;
the files themselves are unmodified.

`derived/` holds files generated from this material (`ship-layout.json` and
`ship-rooms.json`, built from `clients/iso/gfx/ShipMap.png` and
`clients/iso/xml/tiles.xml`, and `ship-plan.json`, decoded from the ship plan
serialized in `src/common/data/Map.hx`, all by `npm run ship-layout`). They are
adaptations and are also licensed CC BY-NC-SA 4.0.

`package.json` is project metadata, not part of the upstream material; it lets
the game's code import `derived/` by package name.

This project is not affiliated with or endorsed by Motion Twin. "Mush" is used
only to credit the source.
