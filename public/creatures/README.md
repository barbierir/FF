# Creature assets

Place creature visual assets under `public/creatures/<creature-id>/`.

## Canonical structure

```text
/public/creatures/
  goblin/
    idle.gif
    attack_basic.gif
    attack_special.gif
    attack_ultimate.gif
    backfire.gif
  ogre/
  slime/
  imp/
  troll/
  demon/
```

## Frontend static paths

Assets in this folder are served from `/creatures/...`.

Examples:

- `/creatures/goblin/idle.gif`
- `/creatures/goblin/attack_basic.gif`

## Placeholder files in this PR

This PR only adds non-binary placeholder files (for example `idle_placeholder.png`) to establish folder structure.
After merge, upload real GIFs and update references from placeholder filenames to the final `*.gif` files.
