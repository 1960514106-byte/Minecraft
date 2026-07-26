// =============================================================================
// achievements.js — Tracks player milestones and shows toast notifications.
// Events arrive via trigger(ev); ev.type is one of:
//   mine   { block }          craft  { item }          pickup { item }
//   kill   { hostile, mob }   smelt  { item }          bed    {}
//   breed  { animal }         tame   {}                ride   {}
//   portal {}                 boss   {}                summon {}
//   enchant {}                trade  {}                level  { level }
//   structure { kind }        redstone { block }   brew {}
//   end {}                    dragon {}                beacon {}
// =============================================================================

import { BLOCK, ITEM } from './config.js';

const ACHIEVEMENTS = [
  // --- getting started ---
  { id: 'wood', name: 'Getting Wood', desc: 'Chop your first tree', check: (ev) => ev.type === 'mine' && ev.block === BLOCK.WOOD },
  { id: 'craft_table', name: 'Benchmarking', desc: 'Craft a crafting table', check: (ev) => ev.type === 'craft' && ev.item === BLOCK.CRAFTING_TABLE },
  { id: 'stone_pick', name: 'Stone Age', desc: 'Craft a stone pickaxe', check: (ev) => ev.type === 'craft' && ev.item === ITEM.STONE_PICKAXE },
  { id: 'furnace', name: 'Hot Topic', desc: 'Craft a furnace', check: (ev) => ev.type === 'craft' && ev.item === BLOCK.FURNACE },
  { id: 'iron', name: 'Acquire Hardware', desc: 'Smelt an iron ingot', check: (ev) => ev.type === 'smelt' && ev.item === ITEM.IRON_INGOT },
  { id: 'iron_pick', name: 'Iron Man', desc: 'Craft an iron pickaxe', check: (ev) => ev.type === 'craft' && ev.item === ITEM.IRON_PICKAXE },
  { id: 'diamond', name: 'Diamonds!', desc: 'Obtain a diamond', check: (ev) => ev.type === 'pickup' && ev.item === ITEM.DIAMOND },
  { id: 'diamond_pick', name: 'Obsidian Tier', desc: 'Craft a diamond pickaxe', check: (ev) => ev.type === 'craft' && ev.item === ITEM.DIAMOND_PICKAXE },
  // --- survival ---
  { id: 'monster', name: 'Monster Hunter', desc: 'Kill a hostile mob', check: (ev) => ev.type === 'kill' && ev.hostile },
  { id: 'cook', name: 'Baker', desc: 'Smelt food', check: (ev) => ev.type === 'smelt' && (ev.item === ITEM.COOKED_PORK || ev.item === ITEM.COOKED_BEEF || ev.item === ITEM.COOKED_CHICKEN) },
  { id: 'bed', name: 'Home Sweet Home', desc: 'Set a bed respawn', check: (ev) => ev.type === 'bed' },
  { id: 'bread', name: 'Grain of Truth', desc: 'Bake bread', check: (ev) => ev.type === 'craft' && ev.item === ITEM.BREAD },
  { id: 'golden_apple', name: 'Gilded Snack', desc: 'Craft a golden apple', check: (ev) => ev.type === 'craft' && ev.item === ITEM.GOLDEN_APPLE },
  { id: 'enchanter', name: 'Enchanter', desc: 'Enchant an item', check: (ev) => ev.type === 'enchant' },
  { id: 'brew', name: 'Local Brewery', desc: 'Brew a potion', check: (ev) => ev.type === 'brew' },
  { id: 'shield', name: 'Cover Me', desc: 'Craft a shield', check: (ev) => ev.type === 'craft' && ev.item === ITEM.SHIELD },
  { id: 'level10', name: 'Seasoned', desc: 'Reach XP level 10', check: (ev) => ev.type === 'level' && ev.level >= 10 },
  { id: 'trade', name: 'Fair Deal', desc: 'Trade with a villager', check: (ev) => ev.type === 'trade' },
  // --- animals ---
  { id: 'breed', name: 'The Parrots and the Bats', desc: 'Breed two animals', check: (ev) => ev.type === 'breed' },
  { id: 'tame', name: 'Best Friends Forever', desc: 'Tame a wolf', check: (ev) => ev.type === 'tame' },
  { id: 'ink', name: 'Squid Squeeze', desc: 'Collect an ink sac', check: (ev) => ev.type === 'pickup' && ev.item === ITEM.INK_SAC },
  { id: 'golem', name: 'Iron Defender', desc: 'Construct an iron golem', check: (ev) => ev.type === 'golem' },
  // --- redstone & rails ---
  { id: 'repeater', name: 'Circuit Designer', desc: 'Craft a repeater', check: (ev) => ev.type === 'craft' && ev.item === BLOCK.REPEATER },
  { id: 'piston', name: 'Heavy Machinery', desc: 'Craft a piston', check: (ev) => ev.type === 'craft' && ev.item === BLOCK.PISTON },
  { id: 'rail', name: 'On Rails', desc: 'Craft rails', check: (ev) => ev.type === 'craft' && (ev.item === BLOCK.RAIL || ev.item === BLOCK.POWERED_RAIL) },
  { id: 'ride', name: 'Full Steam Ahead', desc: 'Ride a minecart', check: (ev) => ev.type === 'ride' },
  // --- exploration ---
  { id: 'dungeon', name: 'Grave Robber', desc: 'Loot a dungeon chest', check: (ev) => ev.type === 'structure' && ev.kind === 'dungeon' },
  { id: 'mineshaft', name: 'Down the Mine', desc: 'Loot a mineshaft chest', check: (ev) => ev.type === 'structure' && ev.kind === 'mineshaft' },
  { id: 'ender', name: 'Got Your Back', desc: 'Kill an enderman', check: (ev) => ev.type === 'kill' && ev.mob === 'enderman' },
  // --- the nether ---
  { id: 'portal', name: 'We Need to Go Deeper', desc: 'Enter the nether', check: (ev) => ev.type === 'portal' },
  { id: 'blaze', name: 'Into Fire', desc: 'Obtain a blaze rod', check: (ev) => ev.type === 'pickup' && ev.item === ITEM.BLAZE_ROD },
  { id: 'summon', name: 'Uninvited Guest', desc: 'Summon the Nether Overlord', check: (ev) => ev.type === 'summon' },
  { id: 'boss', name: 'Overlord Overthrown', desc: 'Defeat the Nether Overlord', check: (ev) => ev.type === 'boss' },
  // --- the End (Phase 9) ---
  { id: 'end', name: 'The End?', desc: 'Enter the End', check: (ev) => ev.type === 'end' },
  { id: 'dragon', name: 'Free the End', desc: 'Defeat the Ender Dragon', check: (ev) => ev.type === 'dragon' },
  { id: 'beacon', name: 'Beaconator', desc: 'Place a working beacon', check: (ev) => ev.type === 'beacon' },
];

export class AchievementManager {
  constructor(state = null) {
    this.unlocked = new Set(Array.isArray(state) ? state : []);
    this.toasts = [];
  }

  trigger(event) {
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked.has(a.id)) continue;
      if (a.check(event)) {
        this.unlocked.add(a.id);
        this.toasts.push({ name: a.name, desc: a.desc, timer: 4 });
      }
    }
  }

  update(dt) {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].timer -= dt;
      if (this.toasts[i].timer <= 0) this.toasts.splice(i, 1);
    }
  }

  render(container) {
    container.innerHTML = '';
    for (const t of this.toasts) {
      const div = document.createElement('div');
      div.className = 'achievement-toast';
      div.textContent = `🏆 ${t.name}`;
      container.appendChild(div);
    }
  }

  getAll() {
    return ACHIEVEMENTS.map(a => ({ ...a, unlocked: this.unlocked.has(a.id) }));
  }

  serialize() {
    return [...this.unlocked];
  }
}
