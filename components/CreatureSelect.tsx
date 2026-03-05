import { useMemo, useState } from "react";
import CreatureIdle from "./CreatureIdle";
import type { Creature } from "../src/lib/creatures";

type CreatureSelectProps = {
  creatures: Creature[];
  initialSelectedId?: Creature["id"] | null;
  onContinue: (creatureId: Creature["id"]) => void;
};

export default function CreatureSelect({ creatures, initialSelectedId = null, onContinue }: CreatureSelectProps) {
  const [selected, setSelected] = useState<Creature["id"] | null>(initialSelectedId);
  const selectedCreature = useMemo(() => creatures.find((creature) => creature.id === selected) ?? null, [creatures, selected]);

  return (
    <section className="card">
      <h2>Creature Select</h2>
      <div className="creature-select-grid" role="list">
        {creatures.map((creature) => {
          const isSelected = selected === creature.id;
          return (
            <article
              key={creature.id}
              className={`creature-select-tile${isSelected ? " selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`Select ${creature.name}`}
              onClick={() => setSelected(creature.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(creature.id);
                }
              }}
            >
              <CreatureIdle classKey={creature.id} size={220} alt={`${creature.name} idle`} />
              <h3>{creature.name}</h3>
              <p>{creature.blurb}</p>
              <div className="creature-overlay">
                <strong>Special: {creature.specialAbilityName}</strong>
                <p>{creature.specialAbilityDescription}</p>
              </div>
              {isSelected ? <span className="selected-badge">Selected</span> : null}
            </article>
          );
        })}
      </div>
      <button disabled={!selectedCreature} onClick={() => selectedCreature && onContinue(selectedCreature.id)}>Continue</button>
    </section>
  );
}
