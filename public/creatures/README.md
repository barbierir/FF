# Creature assets

Place creature visual assets under `public/creatures/<creature-id>/`.

## Canonical placeholder structure

Each creature directory must include placeholders for this exact animation set:

### Match animations

- `idle_placeholder.png`
- `prepare_placeholder.png`
- `charge_placeholder.png`
- `attack_normal_placeholder.png`
- `attack_cataclysm_placeholder.png`
- `attack_backfire_placeholder.png`
- `attack_toxic_placeholder.png`
- `hit_placeholder.png`
- `defend_placeholder.png`
- `critical_hit_placeholder.png`
- `stunned_placeholder.png`
- `revenge_placeholder.png`
- `defeat_placeholder.png`
- `victory_placeholder.png`

### Selection animation

- `idle_choose_placeholder.png`

## Frontend static paths

Assets in this folder are served from `/creatures/...`.

Examples:

- `/creatures/goblin/idle_placeholder.png`
- `/creatures/goblin/attack_normal_placeholder.png`
- `/creatures/goblin/idle_choose_placeholder.png`

## Uploading final GIF files

When replacing placeholders with real assets, keep the same animation names and use `<animation-name>.gif`.
