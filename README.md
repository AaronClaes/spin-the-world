# Spin the World

Three.js Game Jam entry — theme: **Tiny Worlds**.

You run on a spinning vinyl record. Items are pressed into the grooves; catch
them and they assemble into a tiny world on the label. Every record contains a
tiny world, and you play it into existence by running the groove.

Build spec: [musical-worlds.md](musical-worlds.md)

## Records

Three are pressed, all playable from the start, and they hang on the wall left
to right in the order they're listed here:

|                | badge  | tempo                                   | world                                        |
| -------------- | ------ | --------------------------------------- | -------------------------------------------- |
| **Harbour 33** | easy   | 100bpm · 12.5 RPM · sea shanty, D minor | a pirate cove with a fort tower over the bay |
| **Meadow 45**  | medium | 120bpm · 15 RPM · folk, G major         | a wooded village, a windmill and a watermill |
| **Neon 78**    | hard   | 140bpm · 17.5 RPM · city pop, A minor   | a city block after dark, ten buildings deep  |

BPM sets RPM — eight beats to a revolution — so the 33 is a genuinely calmer
record to stand on as well as a slower tune, and the 78 is the hard one: more
notes, and stems that only unlock on the ninth of ten world pieces. The badges
are authored per record rather than derived from tempo, and a test keeps them
in the same order as the wall.

## How to play

Click a record on the studio wall to select it — it lifts off the wall, starts
turning, and its own rhythm bed starts playing under the room. **Play** drops
the needle, and the camera dives to the deck over a 3-2-1 counted on that
record's tempo. **← → (or A/D)** switch
grooves — on touch, tap the left/right half of the screen. Catch the notes for
score and combo; catch the world pieces to build the tiny world on the label.
Missed pieces come back around next revolution, but the needle is spiralling
inward and the track is finite. **Esc** (or the pause button) pauses. The
top-right corner also carries mute — everything, on any screen, remembered
between visits — and fullscreen, where the browser supports it (iPhone Safari
doesn't, so the button isn't there).

## Development

```bash
npm install
npm run dev    # dev server
npm test       # unit tests (geometry + clock)
npm run build  # production build
```

Append `?debug` to the URL for the sync/drift debug HUD.

## Ship

`npm run build` emits a fully static site in `dist/` (~4MB total) — deploy
as-is to Vercel or Netlify, no server or config needed.

## Credits

- Music: sequenced with [Tone.js](https://tonejs.github.io/)
- Icons: [Phosphor Icons](https://phosphoricons.com/) — MIT
- Runner: the Rogue wearing the Ranger's head, both from the [KayKit Adventurers Character Pack](https://kaylousberg.itch.io/kaykit-adventurers) by Kay Lousberg — CC0 (reworked: cape dropped, gear repainted into a sweatshirt/jeans/trainers, headphones added, run clip from the pack’s 2.0 animation library, idle and cheer from its 1.x rig, see `scripts/build-runner.mjs`)
- Meadow props: [KayKit Medieval Hexagon Pack](https://kaylousberg.itch.io/kaykit-medieval-hexagon) 1.0 by Kay Lousberg — CC0 (windmill, watermill, home, well, trees, stone fence, wheelbarrow, waterlily, plus the scenery: tree clusters, stumps, rocks, rail fence, crates, sacks, barrels, buckets, a woodpile, lilies and reeds). The windmill's sails and the watermill's wheel are separate nodes, so both turn.
- Harbour props: [Kenney Pirate Kit](https://kenney.nl/assets/pirate-kit) — CC0 (fort tower, shed, dock, pirate ship, crate, barrel, chest, rocks, palm, cannon, plus the scenery: shore rocks, tufts, plants, a rowboat, bottles and a flag). One pack for the whole island, world pieces and scenery alike, so it all shades off a single atlas.
- Neon props: [KayKit City Builder Bits](https://kaylousberg.itch.io/city-builder-bits) 1.0 by Kay Lousberg — CC0 (six buildings, taxi, street light, traffic signal, rooftop water tank, dumpster, plus the scenery: parked cars, pedestrian signals, hydrants, benches, planters and cartons). One pack for the whole record, sized by a single `packScale` factor so the block keeps the artist's own proportions, and repainted for night per prop by `recolor`. The lit windows are found by shape rather than by material — the pack samples one atlas for everything — see `src/scene/neonDressing.ts`. The neon sign is built from primitives so its tubes can flicker.
- Sheep and sky clouds by [Quaternius](https://quaternius.com/) — CC0. The sheep is the one model in the meadow from outside KayKit; neither that pack nor Kenney's ships an animal.
- Every model is CC0. Sourced from [poly.pizza](https://poly.pizza/) with `scripts/poly-search.py`, which refuses to download anything not marked CC0.
- Kitbash sources live in `assets-src/`; `scripts/build-diorama.mjs` merges them into one GLB per record under `public/models/`
