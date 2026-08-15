# Spin the World

Three.js Game Jam entry — theme: **Tiny Worlds**.

You run on a spinning vinyl record. Items are pressed into the grooves; catch
them and they assemble into a tiny world on the label. Every record contains a
tiny world, and you play it into existence by running the groove.

Build spec: [musical-worlds.md](musical-worlds.md)

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

`npm run build` emits a fully static site in `dist/` (~2.6MB total) — deploy
as-is to Vercel or Netlify, no server or config needed.

## Credits

- Music: sequenced with [Tone.js](https://tonejs.github.io/)
- Runner: based on the Knight from the [KayKit Adventurers Character Pack](https://kaylousberg.itch.io/kaykit-adventurers) by Kay Lousberg — CC0 (reworked: flat repaint, headphones added, see `scripts/build-runner.mjs`)
- Diorama props: [KayKit Medieval Hexagon Pack](https://kaylousberg.itch.io/kaykit-medieval-hexagon) by Kay Lousberg — CC0 (windmill, home, well, trees, stone fence, wheelbarrow, waterlily)
- Sheep, flower bushes, and sky clouds by [Quaternius](https://quaternius.com/) — CC0 (via [poly.pizza](https://poly.pizza/))
- Kitbash sources live in `assets-src/`; `scripts/build-diorama.mjs` merges them into `public/models/meadow-diorama.glb`
