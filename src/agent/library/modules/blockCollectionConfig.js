// Block collection configuration and constants

export const NEAR_DISTANCE = 4.5;
export const FAR_DISTANCE = 32;
export const VERY_FAR_DISTANCE = 128;

// Candidate and drops processing
export const DETOUR_BUDGET = 10; // blocks of extra distance allowed by default
export const URGENT_AGE_MS = 4 * 60 * 1000; // 4 minutes
export const DESPAWN_MS = 5 * 60 * 1000; // 5 minutes
export const ABOUT_TO_DESPAWN_MS = DESPAWN_MS - 20 * 1000; // 20s margin
export const PRUNE_UNSEEN_MS = 15 * 1000; // if unseen for this long, consider gone
export const DROP_NEAR_RADIUS = 1.0;
export const DEBT_DROP_COUNT = 15;
export const MAX_SWEEP_ON_DEBT = 10;

// Scanning cadence and pool sizing
export const EMPTY_TICKS_BEFORE_EXIT = 60; // ~3s at 20Hz
export const SCAN_EVERY_TICKS = 5; // throttle producer scans (~6-7Hz)
export const PRUNE_EVERY_TICKS = 10; // prune cadence (~2Hz)
export const MAX_CANDIDATES = 200; // cap pool to avoid O(n) bloat

// Static maps
export const BLOCK_DROP_MAP = {
  // Base stone/deepslate
  stone: ["stone", "cobblestone"],
  deepslate: ["deepslate", "cobbled_deepslate"],
  cobblestone: ["cobblestone"],
  cobbled_deepslate: ["cobbled_deepslate"],

  // Overworld ores (stone + deepslate)
  coal_ore: ["coal_ore", "coal"],
  deepslate_coal_ore: ["deepslate_coal_ore", "coal"],

  iron_ore: ["iron_ore", "raw_iron"],
  deepslate_iron_ore: ["deepslate_iron_ore", "raw_iron"],

  copper_ore: ["copper_ore", "raw_copper"],
  deepslate_copper_ore: ["deepslate_copper_ore", "raw_copper"],

  gold_ore: ["gold_ore", "raw_gold"],
  deepslate_gold_ore: ["deepslate_gold_ore", "raw_gold"],

  redstone_ore: ["redstone_ore", "redstone"],
  deepslate_redstone_ore: ["deepslate_redstone_ore", "redstone"],

  lapis_ore: ["lapis_ore", "lapis_lazuli"],
  deepslate_lapis_ore: ["deepslate_lapis_ore", "lapis_lazuli"],

  diamond_ore: ["diamond_ore", "diamond"],
  deepslate_diamond_ore: ["deepslate_diamond_ore", "diamond"],

  emerald_ore: ["emerald_ore", "emerald"],
  deepslate_emerald_ore: ["deepslate_emerald_ore", "emerald"],

  // Nether ores & specials
  nether_quartz_ore: ["nether_quartz_ore", "quartz"],
  nether_gold_ore: ["nether_gold_ore", "gold_nugget"],
  ancient_debris: ["ancient_debris"],
  obsidian: ["obsidian"],

  // Building / utility
  bookshelf: ["bookshelf", "book"],
  glass: ["glass"], // (no-drop without Silk Touch)
  glowstone: ["glowstone", "glowstone_dust"],

  // Ground blocks
  grass_block: ["grass_block", "dirt"],
  mycelium: ["mycelium", "dirt"],
  podzol: ["podzol", "dirt"],
  dirt: ["dirt"],
  coarse_dirt: ["coarse_dirt"],
  sand: ["sand"],
  red_sand: ["red_sand"],
  gravel: ["gravel", "flint"],
  clay: ["clay", "clay_ball"],

  // Logs & leaves (generic)
  // If you enumerate species, map e.g. oak_log → ["oak_log"], etc.
  logs_any: ["self"], // placeholder meaning “drops itself”
  leaves_any: ["leaves", "sapling", "stick", "apple"],

  // Misc nether/overworld blocks
  netherrack: ["netherrack"],
  basalt: ["basalt"],
  blackstone: ["blackstone"],
  soul_sand: ["soul_sand"],
  soul_soil: ["soul_soil"],
  magma_block: ["magma_block"],
  shroomlight: ["shroomlight"],
};

export const CROP_AGE_MAP = { wheat: 7, beetroot: 3, carrot: 7, potato: 7 };


