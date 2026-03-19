# Creature sprite sheets

Runtime creature animation expects sprite sheets at:

`/public/assets/creatures/{creatureType}/{animation}.png`

Each sheet should be a 4x4 grid ordered left-to-right, top-to-bottom (16 frames total).

Animations currently expected by the runtime:

- `idle.png`
- `attack.png`
- `hit.png`
- `backfire.png`
- `recharge.png`
- `victory.png`
- `defeat.png`

This repository intentionally does not commit binary placeholder PNGs because the review environment does not support binary file diffs. When a PNG is missing, the runtime generates an in-memory procedural fallback sheet so animation flow, timing, and palette tinting can still be exercised without checked-in binary assets.
