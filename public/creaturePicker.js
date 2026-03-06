import { CREATURES } from "/app.js";

export function renderCreaturePickerGrid({
  container,
  selectedId,
  onSelect,
}) {
  if (!container) return;
  container.innerHTML = "";

  for (const creature of CREATURES) {
    const tile = document.createElement("article");
    tile.className = `creature-select-tile${selectedId === creature.id ? " selected" : ""}`;
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
    tile.setAttribute("aria-label", `Select ${creature.name}`);

    const imageWrap = document.createElement("div");
    imageWrap.className = "creature-select-image";

    const img = document.createElement("img");
    img.src = creature.idleSrc;
    img.alt = `${creature.name} idle`;
    img.loading = "lazy";
    img.width = 132;
    img.height = 132;
    img.onerror = () => {
      const fallback = document.createElement("div");
      fallback.className = "creature-fallback";
      fallback.style.width = "132px";
      fallback.style.height = "132px";
      fallback.textContent = "Missing GIF";
      imageWrap.replaceChildren(fallback);
    };
    imageWrap.appendChild(img);

    const name = document.createElement("h3");
    name.textContent = creature.name;

    const blurb = document.createElement("p");
    blurb.className = "small";
    blurb.textContent = creature.blurb;

    const overlay = document.createElement("div");
    overlay.className = "creature-select-overlay";
    overlay.innerHTML = `<strong>Special: ${creature.specialAbilityName}</strong><p>${creature.specialAbilityDescription}</p>`;

    const badge = document.createElement("span");
    badge.className = "status-badge status-badge--highlight status-badge--sm selected-badge";
    badge.textContent = "Selected";
    badge.hidden = selectedId !== creature.id;

    const select = () => onSelect(creature.id);
    tile.onclick = select;
    tile.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    };

    tile.append(imageWrap, name, blurb, overlay, badge);
    container.appendChild(tile);
  }
}
