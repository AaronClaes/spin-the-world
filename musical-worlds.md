# Locked Groove — build spec

Working title. A "locked groove" is the endless loop cut into the run-out of a vinyl record, which is a decent name for a game about running in circles on a record.

**Three.js Game Jam entry — theme: Tiny Worlds**
7-day jam. Scope is fixed and small on purpose; see §4 and §11.

---

## 1. The pitch

You run on a spinning vinyl record. The record is playing. Items are pressed into the grooves; catch them and they fly to the centre of the disc and assemble into a tiny world on the label. Collect the full set before the needle reaches the centre and the world comes alive — and the record earns its place on your studio wall.

Each record is a different genre and a different world.

One sentence for the submission comment: _every record contains a tiny world, and you play it into existence by running the groove._

---

## 2. Jam constraints

| Rule                                         | Consequence for us                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| 7 days                                       | Cut list (§12) is live from day 1. Behind at the halfway mark = start cutting           |
| Must use Three.js                            | R3F is fine (it is Three.js)                                                            |
| Must incorporate theme significantly         | The world is literally built on the label, at miniature scale, and is the win condition |
| AI tools allowed                             | Yes                                                                                     |
| Built from scratch — no reusing old projects | **Fresh repo, fresh git history.** Do not import from any existing project              |
| External assets allowed if credited          | Credits on title screen AND in README                                                   |

Judged 1–10 on: Art, Creativity, Gameplay, Polish, Theme. Judges: Anderson Mancini, mrdoob, and the organiser.

Design implication: Polish and Art are worth 20 of the 50 points and are the categories most within our control on a short clock. A smaller game that runs at 60fps with no bugs beats a bigger game with a stutter.

---

## 3. Core loop

1. Pick a record from the studio wall. Needle drops.
2. Character runs in place at a fixed point on the disc. **The disc rotates beneath them — the character never travels forward.**
3. Player input: move between three lanes (radially in/out).
4. Notes and world pieces sweep toward the player on the beat. Catch them by being in the right lane at the right moment.
5. The three-lane band drifts inward as the track plays. The needle rides with it. You end the run beside the label.
6. Each world piece collected drops a prop onto the diorama on the label. Stems unmute at per-record piece thresholds.
7. Track ends → needle lifts. All pieces → the world animates and the record goes up on the wall. Fewer → a partial world, replayable. Score converts to 1–3 stars either way.

### What the player actually controls

One input. That's the whole game.

- **Left / Right** (A/D, arrows, or swipe): change lane

---

## 4. Non-goals — do not build these

Explicitly out of scope. If you find yourself building one of these, stop.

- No speed/boost mechanic. Cut by design — one input, one speed. Do not let it creep back in
- No character controller, physics engine, or collision detection (see §6.4 — collection is arithmetic)
- No procedural generation
- No terrain, no open world, no free camera
- No multiplayer, no leaderboard backend, no accounts (local persistence only, §8.7)
- No dialogue, cutscenes, or narrative
- No animation state machines, blend trees, or transitions — one looping run clip only (§8.2)
- No retargeting animations onto a rig they weren't authored for
- No level editor
- No multiple scenes or router. One canvas, HTML overlay for UI.

---

## 5. Stack

- Vite + React + TypeScript
- `three`, `@react-three/fiber`, `@react-three/drei`
- `@react-three/postprocessing` — bloom, vignette, tone mapping only
- `zustand` for game state
- `tone` for audio — everything hangs off `Tone.Transport`: the sequenced stems, SFX scheduling, and the game clock itself (§6.2)
- `leva` during development only; strip before shipping
- Deploy: Vercel or Netlify. Static build.

Explicitly **not** using: any physics library, `ecctrl`, any animation-mixer-driven character, any audio files for music (music is sequenced, §10 — sample one-shots for instruments are fine).

---

## 6. The math — get this exactly right

This is the part that makes everything else easy. Implement `src/game/geometry.ts` and `src/game/clock.ts` first and test them before writing any visuals.

### 6.1 Beat ↔ angle

One revolution equals 2 bars of 4/4 = **8 beats**. Therefore one beat is 45° of disc rotation.

```ts
export const BEATS_PER_REV = 8;
export const RAD_PER_BEAT = (Math.PI * 2) / BEATS_PER_REV;
```

Why 8: at 120bpm this spins the disc at **15 RPM** — close to real 16⅔ RPM vinyl territory, fast enough to visibly _be_ a spinning record. (8 beats/rev at 7.5 RPM read as sluggish.) A pleasant side effect: BPM sets RPM, so a 100bpm folk record turns lazily at 12.5 RPM and a 140bpm electronic record whips around at 17.5 — per-genre character for free.

Items are authored by **beat number**, never by angle. An item authored at `beat` sits at disc-local angle `beat * RAD_PER_BEAT`.

The disc's rotation is driven directly from beat position:

```ts
export const discRotation = (beatPos: number) => -beatPos * RAD_PER_BEAT;
```

Which gives the single most useful identity in the codebase — the world angle of an item, where 0 means "at the player":

```ts
export const worldAngle = (beat: number, beatPos: number) =>
  (beat - beatPos) * RAD_PER_BEAT;
```

**An item authored at beat N arrives at the player at exactly `beatPos === N`.** It recurs at N + 8, N + 16, and so on. Because every item's beat is an integer (or a clean subdivision), every arrival lands on the pulse. This is not approximate — it is structural. There is no way to place an off-beat item.

Subdivisions: eighths are `beat + 0.5`, sixteenths `beat + 0.25`. Same rule.

### 6.2 The clock — the Transport IS the clock

Since the music is sequenced on `Tone.Transport` (§10), `beatPos` is not integrated at all — it is **derived**:

```ts
export const getBeatPos = (bpm: number) =>
  Tone.getTransport().seconds * (bpm / 60);
```

Read it once per frame in `useFrame`, write it into the store (as a plain value read imperatively — never through a React render path). The disc, items, runner cadence, and band radius are all pure functions of it.

Do **not** accumulate `delta` from `useFrame`, and do not use `performance.now()`. Deriving from the Transport means the disc _cannot_ drift relative to the music — they are the same number — even across frame drops. It also makes pause free: `Transport.pause()` freezes the music and, because everything derives from `beatPos`, the entire game with it (§8.8).

`songProgress = beatPos / totalBeats`, clamped to [0, 1].

### 6.3 The band spirals inward

The three lanes are a band whose centre radius migrates from the rim to the label over the track.

```ts
export const bandCenter = (progress: number, r0: number, r1: number) =>
  r0 + (r1 - r0) * progress;

export const laneRadius = (lane: 0 | 1 | 2, center: number, gap: number) =>
  center + (lane - 1) * gap;
```

Suggested units (disc radius = 5, label radius = 1.2):

- `startRadius: 4.5`, `endRadius: 2.0`, `laneGap: 0.45`

Lane 0 is innermost (toward the world), lane 2 outermost (toward the rim).

**Item radius is fixed in disc space.** An item renders at `laneRadius(lane, bandCenter(item.beat / totalBeats))` — the band centre evaluated at _its own_ arrival beat, not the current one. Items are pressed into the groove where the needle will be when they arrive; they don't slide across the vinyl. At arrival the player's radius equals the item's by construction. A missed world piece re-inserted at `beat + 8` recomputes its radius — it visibly migrates inward each lap, like the groove spiral it lives in.

Note on feel: surface speed is `ω × r`, so the disc visually slows as the band moves inward, but _timing difficulty is unchanged_ because arrivals are measured in beats, not distance. The ending feels calmer and more intimate while remaining just as demanding. That is the correct tradeoff — don't "fix" it.

### 6.4 Collection — there is no collision detection

Because you know from `item.beat` exactly when each item arrives, you never raycast and never test bounding volumes.

Keep items in a list sorted by `beat`, plus a pointer to the next unresolved index. Each frame, resolve every item whose beat `beatPos` has just crossed:

```ts
while (next < items.length && items[next].beat <= beatPos) {
  const item = items[next];
  if (item.lane === playerLane) collect(item);
  else miss(item);
  next++;
}
```

`playerLane` is the committed integer lane, not the interpolated visual radius — otherwise mid-transition arrivals become ambiguous. Commit the lane on input, animate the radius separately.

No tunnelling. No physics. One integer comparison per item.

### 6.5 Needle lead

The needle sits ahead of the player on the disc. Items rise out of the vinyl as they pass under it, which gives the player their read-ahead window and makes the needle diegetically responsible for "reading" the world out of the groove.

```ts
export const NEEDLE_LEAD_BEATS = 2; // 90° ahead; 1s at 120bpm
export const RISE_LEAD_BEATS = 4; // items rise this far ahead; 180°, 2s at 120bpm
```

These are deliberately decoupled: at 8 beats per revolution, a needle 4 beats ahead would sit at 180° — directly opposite the player, out of frame. So the needle stays at 2 beats for visuals, and items rise at 4. Tune `RISE_LEAD_BEATS` between 3 and 6, **never ≥ 8** — an item risen a full revolution early occupies the same angle as the previous lap's items. The needle radius uses `bandCenter` evaluated at `beatPos + NEEDLE_LEAD_BEATS`, not at the player's progress.

---

## 7. Data format

A record is a JSON file plus a music module. Once the first one renders, every additional record is authoring, not programming.

```jsonc
{
  "id": "meadow",
  "title": "Meadow 45",
  "genre": "folk",
  "bpm": 120,
  "totalBeats": 176, // 22 revolutions, 88s at 120bpm; must be a multiple of 16
  "band": { "startRadius": 4.5, "endRadius": 2.0, "laneGap": 0.45 },

  "music": "meadow", // key into src/music/, a TS module with the four sequenced stems (§10)
  "stems": ["drums", "bass", "keys", "lead"], // channel names, in unlock order
  "stemUnlockAtPieces": [0, 2, 5, 8], // stem 0 plays from the start; must have 4 entries ≤ piece count

  "starThresholds": [0.5, 0.75, 0.9], // fraction of the chart's max score for 1/2/3 stars

  // Piece count is per record — 9 to 12 is the sweet spot. The win condition
  // is "all of them", however many that is. Fewer pieces = less diorama art.
  "worldPieces": [
    { "id": "wp01", "beat": 14, "lane": 2, "prop": "mill" },
    { "id": "wp02", "beat": 29, "lane": 0, "prop": "cottage" },
    { "id": "wp03", "beat": 45, "lane": 1, "prop": "oak" },
    // ...
  ],

  // Notes are authored as per-bar patterns and expanded at load.
  // 8 steps per bar (eighth notes), one string per lane, lane 0 first.
  "notePatterns": [
    { "fromBar": 0, "toBar": 8, "lanes": ["x---x---", "--x---x-", "--------"] },
    {
      "fromBar": 8,
      "toBar": 24,
      "lanes": ["x-x-x-x-", "--x---x-", "x---x---"],
    },
    {
      "fromBar": 24,
      "toBar": 44,
      "lanes": ["x-xx-x-x", "-x--x-x-", "x---x-x-"],
    },
  ],

  "diorama": {
    "model": "/models/meadow.glb", // all props in one file, named nodes
    "aliveAnimations": ["mill-spin", "smoke", "bird-loop"],
  },
}
```

### Authoring rules

- **World pieces roughly every 12–16 beats** (about every other revolution), unevenly spaced, **every piece on its own beat**. Same-beat clusters in different lanes were tried and cut: a charted forced miss reads as unfair, not tense. Perfection should be hard because the lane dance is demanding, never because the chart forbids it.
- **Notes match the drum pattern.** Dense in choruses, sparse in the intro. Expand patterns into concrete `{beat, lane}` at load — never hand-write 90 note entries. Pattern rows fix the rhythm only: lanes are re-dealt at expansion by a scatter seeded on the record id (identical chart every load), constrained to one lane step per half beat so every note and every piece stays reachable — repeating one lane string for ten bars telegraphs the route.
- Validate on load: no note and world piece on the same beat+lane; every `prop` name exists in the GLB; `totalBeats` is a multiple of 16; `stemUnlockAtPieces` has 4 entries within the piece count.
- **Prove completability on load.** Pieces recur at +8 beats when missed, but anything whose recurrence lands past `totalBeats` is gone forever. Run a small solver over the chart (greedy or brute-force — the choice space is tiny) that verifies a perfect player can collect every piece before the track ends. A chart that fails this check is a bug, not a difficulty setting.

---

## 8. Systems

### 8.1 Miss handling — two tiers

|                  | Notes                         | World pieces                                                                                                    |
| ---------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Count per record | ~90                           | 9–12                                                                                                            |
| Purpose          | Score, rhythm, feel           | Build the diorama                                                                                               |
| On miss          | Consumed, gone; combo resets  | **Returns next revolution** (`beat += 8`), re-inserted into the sorted list                                     |
| Feedback on miss | Small visual dim, near-silent | **Record-skip glitch** (the diegetic fail sound — make it good), dim pulse, marker on the rim showing its angle |

The record-skip sound belongs to world pieces **only**. There are ~90 notes; if every note miss glitched the audio, a struggling player would hear their reward — the music — butchered for the whole run. Note misses stay nearly silent, but never fully invisible: a silent, markless miss reads as a dropped input.

World pieces returning is what makes the game forgiving without removing tension: the clock is finite and the band is spiralling inward, so anything you're still chasing when the needle reaches the label is a permanent hole in your world. Two pieces left with one revolution to go is the best moment in the game and it emerges from this rule alone.

### 8.2 The runner — rigged, one clip

Source a low-poly character **and its run clip from the same pack.** That's the whole trick. Retargeting a clip onto a rig it wasn't authored for is what eats a day; a matched pair is a fifteen-minute job.

Sources, all free:

- **KayKit** (Kay Lousberg) — CC0, stylish low-poly characters with run/idle/jump already attached. Best match for our flat-shaded look.
- **Quaternius** — CC0, animated character packs, GLB direct.
- **Mixamo** — free with an Adobe account, huge animation library, auto-rigger if you want a custom model. Clips are already root-motion-free ("in place"), which is exactly what a run-in-place needs.

Implementation is one clip on a loop:

```tsx
const { scene, animations } = useGLTF("/models/runner.glb");
const { actions } = useAnimations(animations, group);

useEffect(() => {
  actions.Run?.reset().play();
}, [actions]);

useFrame(() => {
  const v = angularVelocity * visualLaneRadius; // surface speed under the feet
  actions.Run!.timeScale = v / STRIDE_SPEED; // STRIDE_SPEED: tune once, by eye
});
```

**Foot sliding is the only thing to get right.** The character runs in place on a moving surface, so the clip's cadence has to match surface speed or the feet skate. Tune `STRIDE_SPEED` once in the middle lane; after that it is automatically correct in every lane, because both sides of the ratio are physical. On pause, set `timeScale` to 0 — the whole scene freezes with the Transport (§8.8).

No state machine, no blending, no transitions. One clip, one `timeScale`.

**Character design:** a small figure with oversized headphones. It reads as a _listener_, which is what someone running around a playing record should be. At the size it appears on screen (~130px tall, from behind, on a near-black disc) silhouette and one accent colour carry it entirely — facial detail is invisible, so low-poly is the correct choice rather than a compromise. Headphones are one extra mesh and give a distinctive outline.

Flat-shade to match everything else. Contact shadow is a dark ellipse sprite on the disc surface, not a shadow map.

### 8.3 Tonearm

- Pivot outside the disc, fixed world position
- Needle at world angle `NEEDLE_LEAD_BEATS * RAD_PER_BEAT`, radius `bandCenter` at `beatPos + NEEDLE_LEAD_BEATS`
- Compute arm rotation by aiming the pivot at the needle point
- On track end, lift and swing out

### 8.4 Diorama

One GLB containing all props plus the base terrain of the label, with named nodes. All props start hidden at scale 0. On collect:

1. Item mesh lerps from its groove position to its diorama slot over ~0.6s with an arc
2. Prop scales in with a spring overshoot, small dust puff, chime
3. Camera does _not_ cut — the diorama is always in frame, so the player just sees it happen

On full completion: enable `aliveAnimations`, warm the lighting, swell the mix.

### 8.5 Audio

Music is **sequenced with Tone.js** — no stem files (§10 has the full rationale). Four "stems" are four `Tone.Channel`s: drums, bass, keys/chords, lead.

- Each record's music module (`src/music/<id>.ts`) defines the instruments and their `Tone.Part`/`Tone.Sequence` data, all scheduled on the Transport from `0`
- Everything plays from track start; all channels at `volume = -Infinity` except stem 0
- `stemUnlockAtPieces` triggers `channel.volume.rampTo(0, 0.5)`

Critical: every part is scheduled from the start and stays running — **never start a part late, unmute it.** Phase lock is then structural.

Instruments: raw oscillator synths sound cheap fast. Prefer `Tone.Sampler` loaded with CC0 one-shot samples (single piano/guitar/marimba notes are tiny files and trivially licensed) for anything melodic, `Tone.Players`/`Tone.Sampler` with one-shot hits for drums, and a shared effects bus (reverb, a little delay) — that's most of the distance between "programmer music" and "music".

SFX (do not skip, this is the cheapest polish available):

- note pickup — pitched to the record's scale, cycling up a pentatonic run as the combo grows
- world piece pickup — chime plus a low thump
- world piece miss — the record-skip glitch (§8.1; reserved for pieces only)
- needle drop, needle lift, disc spin-up

### 8.6 Camera

No orbit, no shake (except one small impulse on a record-skip) — but not frozen either. Two movements, both subtle:

- **Slow dolly.** The player's world position migrates ~2.5 units inward over the run as the band spirals in; a truly fixed camera that frames the rim misframes the label. The camera rig tracks `bandCenter` (heavily lerped, orientation unchanged), so the framing at beat 0 and beat 176 is the same framing.
- **Lane lean.** On a lane switch, the camera eases laterally toward the target lane by ~15–20% of `laneGap`, with a soft lerp and optionally ~1° of roll. Enough that the world responds to input and the game stops feeling static; not enough to read as camera movement.

Base placement: behind the player along the tangential direction, a few units up, looking forward along the groove and biased ~20% toward the disc centre so the label sits in frame off to one side. The track curves away ahead of you; the world you're building is visible the entire run.

Tune all of it by hand with leva, then hardcode the numbers. Verify framing in landscape-phone aspect as well as desktop (§9) before locking.

### 8.7 Score, stars, and the studio wall

- **Score:** notes are 10 × combo (consecutive catches; a note miss resets combo), world pieces are 100 flat. Max score is computable from the chart at load.
- **Stars:** 1–3 stars from `starThresholds` as fractions of max score, shown on the results screen with the (partial or alive) world.
- **Persistence:** `localStorage`, per record: high score, stars, completed flag. No backend.
- **The studio wall is the title screen.** Records hang framed on a wall like plaques in a music studio. Uncompleted records are sleeves; a completed record hangs gold with its tiny world alive on the label and its stars beneath it. Clicking one drops the needle — that click is also the user gesture that unlocks the AudioContext. This replaces any menu: the wall is the meta-game, the progression display, and the title screen in one shot, and it restates the theme (a wall of tiny worlds) before the game even starts.

### 8.8 Pause

A pause button (and `Esc`) opens an HTML overlay menu: resume / restart record / back to the wall. Implementation is `Transport.pause()` — because `beatPos` is derived from the Transport (§6.2), the disc, items, and music freeze together with zero extra state. Set the run clip's `timeScale` to 0. Also auto-pause on `visibilitychange` — a backgrounded tab suspends the AudioContext and judges _will_ alt-tab mid-run.

---

## 9. Art direction

Lock this once during the art pass and do not revisit it.

- **No textures anywhere.** Flat-shaded low-poly, `MeshStandardMaterial`, colour and light only.
- **Vinyl:** near-black base (`#1a1c21`), low roughness so it catches one strong specular streak from the key light. Add concentric groove rings as thin, slightly lighter circles — geometry or a cheap radial normal, not a texture map.
- **Rotation must read.** Concentric rings are rotation-invariant — a bare disc at 15 RPM barely looks like it's moving. Cheap cues, in order of value: off-centre/asymmetric label art, a few light dust specks on the vinyl surface, and optionally a very slight eccentric wobble like a real pressing. The spinning record is the whole pitch; it has to visibly spin.
- **Palette:** one warm key light (desk-lamp amber), one cool fill, dark navy void background. Each record gets its own accent colour for notes and its own world palette.
- **Post:** bloom (subtle), vignette, ACES tone mapping. Optional mild DOF at the near and far extremes of the disc — this is the effect that makes it read as a physical miniature, so try it, but cut it immediately if it costs frames.
- **Void:** the record floats in near-black with a scatter of dust motes. Nothing else in the scene. This is free atmosphere.

### Performance budget

Non-negotiable, because Polish is 10 points and the judges will open this on unknown hardware.

- `InstancedMesh` for all notes (hundreds of them, one draw call)
- `dpr={[1, 2]}` capped
- **No shadow maps.** Contact shadows are sprites.
- Target 60fps on integrated graphics. Test in a throttled tab.
- Phones: landscape orientation, and it must be _playable_ on a mid-range phone — but do not burn days optimising for weak devices. If bloom costs frames on mobile, drop bloom on mobile and move on.
- Total download under ~15MB. Music is sequenced (kilobytes) plus small one-shot samples, so the budget is effectively all models — use Draco or meshopt on the GLBs.

---

## 10. Music and licensing

**Decided: the music is sequenced with Tone.js.** Chords + drums + bass + lead as four instrument groups, which map exactly onto the four "stems".

Why sequenced beats found stems:

- Perfect sync is structural — the Transport is the game clock (§6.2), so music and gameplay cannot drift
- Zero licensing risk; CC0 one-shot samples for `Tone.Sampler` instruments are trivial to source and credit
- Kilobytes instead of ~5MB of mp3 per record — the entire download budget goes to art
- Per-record variation is authoring, not audio production; stems mute/unmute as channel volumes with no phase concerns
- Finding CC0 stems that are separable, loop-clean, same-length, _and_ good was always the long pole; composition we control

The risk moves to composition quality, and the user's bar is explicit: **the music must be good, fun and enjoyable — it is the reward the whole game hands out.** Mitigations: pick a reference track per genre before writing a note; use `Tone.Sampler` with real one-shots instead of raw oscillators for everything melodic; a shared reverb/delay bus; keep each record to a tight 4-chord loop with one strong lead hook rather than attempting arrangement complexity. Timebox each record's music to half a day; if it isn't fun by then, simplify the drums and the hook — don't add layers.

**Do not use commercial music under any circumstances**, including "just for the demo".

---

## 11. Build order

Dependency order, not a schedule. Each milestone must actually run before the next one starts.

1. **Clock and sync.** `constants.ts`, `geometry.ts`, `clock.ts`, the Transport with one sequenced stem playing, a dark disc rotating from `beatPos`, and a debug cube that scales on the beat. Verify zero drift over a full track before writing anything else — sync is not retrofittable.
2. **Playable loop.** Runner with its run clip, lane switching, item loading and pattern expansion, chart completability solver, rise-at-needle, collection and miss resolution, world pieces recurring. Placeholder diorama of grey boxes.
3. **Full arc.** Band spiralling inward, tonearm riding with it and lifting at the end, stems unlocking, props flying in, the alive state, results screen with stars, localStorage persistence.
4. **Art pass.** Models, materials, lighting, palette, post stack, rotation-readability cues. Lock the look here and stop changing it.
5. **Ship.** SFX, the studio wall, pause menu, HUD, mobile landscape touch input, credits, deployed build played from the public URL.
6. **Polish.** Playtest, fix what annoys you, performance pass. No new features.

---

## 12. Cut list, in order

When you're behind, cut from the top:

1. Record 3
2. DOF post effect
3. Record 2 — one record is a complete game
4. Studio wall presentation — falls back to a plain record-select screen (keep stars and persistence)
5. Diorama alive-state animations (a static completed world is still a win)

Never cut: audio sync, the diorama assembling, SFX, the title screen, pause, mobile controls.

---

## 13. Definition of done for MVP

- [ ] One record playable start to finish at 60fps on desktop
- [ ] Disc provably in sync with the music across a full track
- [ ] Three lanes, responsive input, no dropped inputs
- [ ] All world pieces (count per record) assemble a visible diorama
- [ ] 4 stems unlock as you progress
- [ ] Win state and partial-completion state both work
- [ ] Chart completability validated at load
- [ ] Stars awarded from score; high score and stars persisted and shown on the wall
- [ ] Skip/miss feedback exists and feels good
- [ ] Pause menu: resume / restart / back to wall; auto-pause on tab switch
- [ ] Playable on a phone in landscape
- [ ] Title screen (studio wall) with credits
- [ ] Deployed to a public URL, tested from that URL in a fresh browser

---

## 14. Risks

| Risk                                   | Mitigation                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio sync drifts                      | Derive `beatPos` from the Transport — they are the same number. Verify at milestone 1.                                                                         |
| Sequenced music sounds cheap           | Reference track per genre, `Tone.Sampler` with real one-shots, shared effects bus, half-day timebox per record. This is the biggest risk left — front-load it. |
| A chart can't be completed perfectly   | Load-time solver proves every piece is collectable (§7). Every piece sits on its own beat — no charted forced misses.                                          |
| Radial lane motion reads confusingly   | Get a second pair of eyes as soon as it is playable. Widen `laneGap` or tilt the camera if lanes are ambiguous.                                                |
| Disc doesn't read as spinning          | 8 beats/rev = 15 RPM at 120bpm, plus off-centre label art and surface specks (§9).                                                                             |
| Autoplay blocked by browser            | Clicking a record on the wall is the user gesture that starts the AudioContext.                                                                                |
| Perf tanks from post/DOF               | Ship without DOF. Bloom only, and drop bloom on mobile if needed.                                                                                              |
| Runner's feet slide on the disc        | Tune `STRIDE_SPEED` at milestone 2, before the art pass — the eye stops noticing it after a while. Character and clip from the same pack; never retarget.      |
| Diorama art volume (9–12 props/record) | The real art bottleneck. Kitbash from CC0 packs (KayKit, Quaternius, Kenney) into one GLB per record; lower per-record piece counts are legal (§7).            |
| Scope creep into a third record        | See §12.                                                                                                                                                       |

---

## 15. Submission checklist

- [ ] Playable demo URL, tested in a private window on desktop and mobile
- [ ] Comment on the jam post with the link
- [ ] Theme explanation, one or two sentences (§1)
- [ ] All external assets credited on the title screen and in the README
- [ ] Repo public (optional but looks good)
- [ ] Submitted well before the deadline, not against it

---

## 16. Notes for Claude Code

- Start by implementing and unit-testing `geometry.ts` and `clock.ts`. Everything else depends on them being right.
- `beatPos` lives outside the React render path — a ref or a zustand value read imperatively in `useFrame`. One accidental per-frame re-render and the perf budget is gone.
- `playerLane` is a committed integer in the store; the visual radius is a separate lerped value. Never resolve collection against the interpolated radius.
- Items are authored in beats. If you find yourself writing an angle in degrees anywhere outside `geometry.ts`, something has gone wrong.
- Item render radius uses the band centre at the item's own beat, not the current one (§6.3).
- Prefer adding a constant to `constants.ts` over a magic number in a component.
- Strip leva from the production build.
