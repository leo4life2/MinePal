import { createRequire } from "module";
const require = createRequire(import.meta.url);
const blockDropMap = require("./blockDropMap.json");

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
export const BLOCK_DROP_MAP = blockDropMap;

export const SILK_TOUCH_REQUIRED = Object.freeze([
  "bee_nest",
  "black_stained_glass",
  "black_stained_glass_pane",
  "blue_ice",
  "blue_stained_glass",
  "blue_stained_glass_pane",
  "brain_coral",
  "brain_coral_fan",
  "brown_stained_glass",
  "brown_stained_glass_pane",
  "bubble_coral",
  "bubble_coral_fan",
  "calibrated_sculk_sensor",
  "chiseled_bookshelf",
  "cyan_stained_glass",
  "cyan_stained_glass_pane",
  "glass",
  "glass_pane",
  "gray_stained_glass",
  "gray_stained_glass_pane",
  "green_stained_glass",
  "green_stained_glass_pane",
  "ice",
  "large_amethyst_bud",
  "light_blue_stained_glass",
  "light_blue_stained_glass_pane",
  "light_gray_stained_glass",
  "light_gray_stained_glass_pane",
  "lime_stained_glass",
  "lime_stained_glass_pane",
  "magenta_stained_glass",
  "magenta_stained_glass_pane",
  "medium_amethyst_bud",
  "orange_stained_glass",
  "orange_stained_glass_pane",
  "packed_ice",
  "pink_stained_glass",
  "pink_stained_glass_pane",
  "purple_stained_glass",
  "purple_stained_glass_pane",
  "red_stained_glass",
  "red_stained_glass_pane",
  "sculk",
  "sculk_catalyst",
  "sculk_sensor",
  "sculk_shrieker",
  "sculk_vein",
  "small_amethyst_bud",
  "tube_coral",
  "tube_coral_fan",
  "turtle_egg",
  "white_stained_glass",
  "white_stained_glass_pane",
  "yellow_stained_glass",
  "yellow_stained_glass_pane"
]);

export const CROP_AGE_MAP = { wheat: 7, beetroot: 3, carrot: 7, potato: 7 };


