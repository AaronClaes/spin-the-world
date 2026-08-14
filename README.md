# Locked Groove

Three.js Game Jam entry — theme: **Tiny Worlds**.

You run on a spinning vinyl record. Items are pressed into the grooves; catch
them and they assemble into a tiny world on the label. Every record contains a
tiny world, and you play it into existence by running the groove.

Build spec: [musical-worlds.md](musical-worlds.md)

## Development

```bash
npm install
npm run dev    # dev server
npm test       # unit tests (geometry + clock)
npm run build  # production build
```

## Credits

- Music: sequenced with [Tone.js](https://tonejs.github.io/)
- Runner: based on the Knight from the [KayKit Adventurers Character Pack](https://kaylousberg.itch.io/kaykit-adventurers) by Kay Lousberg — CC0 (reworked: flat repaint, headphones added, see `scripts/build-runner.mjs`)
- Diorama props: [KayKit Medieval Hexagon Pack](https://kaylousberg.itch.io/kaykit-medieval-hexagon) by Kay Lousberg — CC0 (windmill, home, well, trees, stone fence, wheelbarrow, waterlily)
- Sheep and flower bushes by [Quaternius](https://quaternius.com/) — CC0 (via [poly.pizza](https://poly.pizza/))
- Kitbash sources live in `assets-src/`; `scripts/build-diorama.mjs` merges them into `public/models/meadow-diorama.glb`
