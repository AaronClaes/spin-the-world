# Spin the World

Three.js Game Jam entry — theme: **Tiny Worlds**.

You run on a spinning vinyl record. Items are pressed into the grooves; catch
them and they assemble into a tiny world on the label. Every record contains a
tiny world, and you play it into existence by running the groove.

Build spec: [musical-worlds.md](musical-worlds.md)

## Records

Two are pressed, both playable from the start:

|                | tempo                                   | world                                            |
| -------------- | --------------------------------------- | ------------------------------------------------ |
| **Meadow 45**  | 120bpm · 15 RPM · folk, G major         | a windmill village with a pond and a dirt track  |
| **Harbour 33** | 100bpm · 12.5 RPM · sea shanty, D minor | a lighthouse coast with a jetty out over the bay |

BPM sets RPM — eight beats to a revolution — so the 33 is a genuinely calmer
record to stand on as well as a slower tune.

## How to play

Click a record on the studio wall to drop the needle. **← → (or A/D)** switch
grooves — on touch, tap the left/right half of the screen. Catch the notes for
score and combo; catch the world pieces to build the tiny world on the label.
Missed pieces come back around next revolution, but the needle is spiralling
inward and the track is finite. **Esc** (or the ⏸ button) pauses.

## Development

```bash
npm install
npm run dev    # dev server
npm test       # unit tests (geometry + clock)
npm run build  # production build
```

Append `?debug` to the URL for the sync/drift debug HUD.

## Ship

`npm run build` emits a fully static site in `dist/` (~3.4MB total) — deploy
as-is to Vercel or Netlify, no server or config needed.

## Credits

- Music: sequenced with [Tone.js](https://tonejs.github.io/)
- Runner: based on the Knight from the [KayKit Adventurers Character Pack](https://kaylousberg.itch.io/kaykit-adventurers) by Kay Lousberg — CC0 (reworked: flat repaint, headphones added, see `scripts/build-runner.mjs`)
- Meadow props: [KayKit Medieval Hexagon Pack](https://kaylousberg.itch.io/kaykit-medieval-hexagon) by Kay Lousberg — CC0 (windmill, home, well, trees, stone fence, wheelbarrow, waterlily)
- Harbour props: [Quaternius](https://quaternius.com/) — CC0 (hut, dock, sail boat, crate, barrel, rocks, palm tree, anchor, chest). The lighthouse is built from primitives in `src/scene/procProps.ts` so its beam can turn.
- Sheep, flower bushes, and sky clouds by [Quaternius](https://quaternius.com/) — CC0
- Every model is CC0. Sourced from [poly.pizza](https://poly.pizza/) with `scripts/poly-search.py`, which refuses to download anything not marked CC0.
- Kitbash sources live in `assets-src/`; `scripts/build-diorama.mjs` merges them into one GLB per record under `public/models/`
