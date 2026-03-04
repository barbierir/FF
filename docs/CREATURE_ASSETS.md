# Creature Idle Animation Assets

Upload real animated idle assets to:

- `public/creatures/idle/`

## Required filename format

For each creature class, provide either:

- `<classKey>.webp` (preferred)
- or `<classKey>.gif` (fallback)

Examples:

- `goblin.webp`
- `slime.webp`
- `skeleton.webp`
- `demon.webp`
- `dragon.webp`
- `wizard.webp`

You can also add assets for existing game classes such as `skunk`, `troll`, and `fairy` using the same filename pattern.

## Current placeholder files

This repo intentionally keeps only text placeholders in `public/creatures/idle/` so PR validation can pass without binary files.

## Activation behavior

No code changes are needed after upload:

1. The UI first requests `/creatures/idle/<classKey>.webp`.
2. If that fails, it automatically requests `/creatures/idle/<classKey>.gif`.
3. If both fail, it renders a safe fallback creature tile.

Once the correctly named files exist on GitHub, animated idle sprites will display automatically.
