# Manual Testing Checklist

Automated assertions live in `test/smoke.mjs` (`node test/smoke.mjs` from the
repo root). Everything below is verified by hand in the browser
(`cd Minecraft && python3 -m http.server 8123`, open http://localhost:8123/).

## Phase 0 — Foundations (SAVE_VERSION 8)

Save migration:
- [ ] Load a world saved before this phase (SAVE_VERSION 7 or older): every
      inventory item is intact and named correctly (item ids moved 100+ → 1000+).
- [ ] Armor stays equipped, with enchantments and durability preserved.
- [ ] Previously filled chests and furnaces (both dimensions) still hold the
      same items; a furnace mid-smelt keeps burning.
- [ ] Dropped items lying on the ground before the upgrade are still there.
- [ ] Old world edits (built/broken blocks) are unchanged in both dimensions.

Core loop:
- [ ] Place and break blocks; reload and confirm the edits persisted.
- [ ] Break a diamond ore with an iron pickaxe → drops a Diamond (not a bogus id).
- [ ] Break a door / a bed → drops the Door / Bed item.
- [ ] Craft planks from wood in the 2x2 grid with the wood in ANY cell.
- [ ] On a crafting table, lay a 2x2 recipe (e.g. wooden pickaxe) offset into a
      corner of the 3x3 grid → still crafts.
- [ ] Craft an axe/hoe/bow with the pattern mirrored left-right → still crafts.
- [ ] Furnace: smelt raw iron with coal; output is an Iron Ingot.
- [ ] All item/block icons render correctly in hotbar, inventory, chest and
      furnace screens (atlas grew to 8x64 tiles).

Dimensions:
- [ ] Light a nether portal, enter the nether, place a torch, return home;
      re-enter and confirm the torch is still there.
- [ ] Drop an item in the overworld, travel to the nether and back: the item
      is still lying where it was left (parked-entity buckets).
- [ ] Furnaces/chests at the same coordinates in different dimensions do not
      share contents.
- [ ] Save in the nether, reload: you wake up in the nether.

Save round-trip:
- [ ] Play a few minutes, reload the tab: position, inventory, XP, time of day,
      weather and achievements all match; the save reports version 8.

## Phase 1 — Game modes + Creative (SAVE_VERSION 9)

Mode switching:
- [ ] Settings (O) shows a Game Mode row; the active mode's button is
      highlighted. Clicking the other button switches immediately.
- [ ] F4 toggles survival ↔ creative from gameplay; a status message confirms.
- [ ] Save/reload preserves the mode (a creative world reloads in creative);
      the save reports version 9 with a `mode` field.
- [ ] A pre-phase save (v8) migrates cleanly and loads in survival.

Creative survival rules:
- [ ] Health/hunger/air stay pinned at max: no hunger drain while sprinting,
      no drowning underwater, no fall damage, no lava/cactus damage.
- [ ] Explosions (TNT/creeper) and arrows do zero damage; death is impossible.
- [ ] Switching back to survival re-enables all damage and hunger drain.

Flight:
- [ ] Double-tap Space (in creative) toggles flying; Space ascends, Shift
      descends, horizontal speed is clearly faster than walking.
- [ ] Descending onto the ground lands and clears flying; single-tap Space on
      the ground still jumps normally.
- [ ] Switching to survival mid-air drops you (flight cleared), without fall
      damage being charged for height gained while creative.

Breaking / placing / items:
- [ ] In creative every block breaks in a single quick hit (stone, obsidian,
      even bedrock) — EXCEPT the purple portal interior (break the frame).
- [ ] Broken blocks drop NOTHING in creative (no items, no XP orbs); chest and
      furnace CONTENTS still spill out so nothing is destroyed.
- [ ] Placing blocks does not shrink the hotbar stack; tools/flint&steel/bow
      lose no durability; arrows/pearls/bone meal/breeding food not consumed.
- [ ] Eating does nothing in creative (hunger is already full).

Item picker:
- [ ] E in creative shows the ALL ITEMS panel (with filter box) instead of the
      crafting grid; backpack + hotbar grids still work normally.
- [ ] Click gives a full stack on the cursor; shift-click sends it straight to
      the inventory; right-click gives a single item.
- [ ] Typing in the filter narrows by name and does NOT trigger hotkeys (E/O).
- [ ] In survival the classic crafting UI is back, exactly as before.
- [ ] Middle-click a block in the world (creative): selects a matching hotbar
      stack, or fills the current slot with a full stack. In survival: no-op.

Mobs:
- [ ] At night in creative, zombies/skeletons/creepers/spiders just wander:
      no chasing, no arrows, no creeper fuse, and the boss never attacks.
- [ ] Wolves can still be tamed (bone not consumed) and animals still breed.
- [ ] Back in survival, hostiles resume targeting you.
