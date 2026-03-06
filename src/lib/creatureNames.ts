import type { CreatureId } from "./creatures.ts";

const GENERIC_ADJECTIVES = [
  "Stinky",
  "Smoky",
  "Gassy",
  "Mucky",
  "Soggy",
  "Crooked",
  "Grumpy",
  "Sneaky",
  "Wobbly",
  "Funky",
  "Whiffy",
  "Pungent",
] as const;

const GENERIC_PLACES = ["Sewer", "Bog", "Swamp", "Marsh", "Alley", "Dungeon", "Pit", "Cavern", "Grotto", "Volcano"] as const;

const BY_CREATURE: Record<CreatureId, { descriptors: readonly string[]; adjectives: readonly string[]; nouns: readonly string[]; suffixes: readonly string[]; places: readonly string[] }> = {
  goblin: {
    descriptors: ["Scrap", "Rust", "Snicker", "Sneak", "Cackle", "Grime"],
    adjectives: ["Mischief", "Greasy", "Nimble", "Ragged", "Snorty"],
    nouns: ["Goblin", "Sneak", "Scamp", "Rascal"],
    suffixes: ["Sprinter", "Sniffer", "Hustler", "Tinkerer"],
    places: ["Back Alley", "Junkyard", "Drain"],
  },
  dragon: {
    descriptors: ["Ember", "Scorch", "Ash", "Blaze", "Fume", "Cinder"],
    adjectives: ["Molten", "Sulfur", "Smoldering", "Fiery", "Sooty"],
    nouns: ["Dragon", "Wyrm", "Drake"],
    suffixes: ["Belcher", "Roarer", "Inferno", "Wing"],
    places: ["Volcano", "Lava Pit", "Ash Peak"],
  },
  skunk: {
    descriptors: ["Whiff", "Spray", "Mist", "Cloud", "Puff", "Haze"],
    adjectives: ["Perfumed", "Musky", "Sneaky", "Smelly", "Striped"],
    nouns: ["Skunk", "Stinker", "Sprayer"],
    suffixes: ["Cloud", "Trail", "Prowler", "Whisper"],
    places: ["Moonlit Woods", "Moss Grove", "Stink Hollow"],
  },
  troll: {
    descriptors: ["Bog", "Mire", "Muck", "Sludge", "Swamp", "Toad"],
    adjectives: ["Warty", "Lumpy", "Dank", "Muddy", "Groaning"],
    nouns: ["Troll", "Brute", "Guardian"],
    suffixes: ["Stomper", "Wall", "Rumbler", "Lurker"],
    places: ["Bog", "Mire", "Stone Bridge"],
  },
  fairy: {
    descriptors: ["Twinkle", "Glimmer", "Breeze", "Pollen", "Moon", "Sparkle"],
    adjectives: ["Bubbly", "Shimmering", "Cheery", "Misty", "Glowy"],
    nouns: ["Fairy", "Sprite", "Pixie"],
    suffixes: ["Dancer", "Flutter", "Bloom", "Whirl"],
    places: ["Mushroom Ring", "Star Meadow", "Petal Glen"],
  },
  demon: {
    descriptors: ["Brimstone", "Infernal", "Sulfur", "Cinder", "Hellfire", "Scorch"],
    adjectives: ["Sinister", "Fiendish", "Smoky", "Rumbling", "Crackling"],
    nouns: ["Demon", "Devil", "Fiend"],
    suffixes: ["Howler", "Rift", "Sizzler", "Gaze"],
    places: ["Brimstone Pit", "Infernal Gate", "Ash Abyss"],
  },
};

function pick(list: readonly string[]): string {
  return list[Math.floor(Math.random() * list.length)] ?? "Merry";
}

export function generateCreatureNickname(creatureId: CreatureId): string {
  const pool = BY_CREATURE[creatureId];
  const roll = Math.random();
  if (roll < 0.45) {
    return `${pick([...GENERIC_ADJECTIVES, ...pool.adjectives])} ${pick(pool.nouns)}`;
  }
  if (roll < 0.8) {
    return `${pick([...pool.descriptors, ...GENERIC_ADJECTIVES])} ${pick(pool.nouns)} ${pick(pool.suffixes)}`;
  }
  return `${pick(pool.descriptors)} of ${pick([...GENERIC_PLACES, ...pool.places])}`;
}
