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
  stone: ["stone", "cobblestone"],
  coal_ore: ["coal_ore", "coal", "deepslate_coal_ore"],
  iron_ore: ["iron_ore", "raw_iron", "deepslate_iron_ore"],
  gold_ore: ["gold_ore", "raw_gold", "deepslate_gold_ore"],
  diamond_ore: ["diamond_ore", "diamond", "deepslate_diamond_ore"],
  redstone_ore: ["redstone_ore", "redstone", "deepslate_redstone_ore"],
  lapis_ore: ["lapis_ore", "lapis_lazuli", "deepslate_lapis_ore"],
  emerald_ore: ["emerald_ore", "emerald", "deepslate_emerald_ore"],
  nether_quartz_ore: ["nether_quartz_ore", "quartz"],
  grass_block: ["grass_block", "dirt"],
  gravel: ["gravel", "flint"],
  snow: ["snow", "snowball"],
  clay: ["clay_block", "clay_ball", "clay"],
  glowstone: ["glowstone_block", "glowstone_dust"],
  nether_gold_ore: ["nether_gold_ore", "gold_nugget"],
  ancient_debris: ["ancient_debris", "netherite_scrap"],
  melon: ["melon", "melon_slice"],
};

export const CROP_AGE_MAP = { wheat: 7, beetroot: 3, carrot: 7, potato: 7 };


