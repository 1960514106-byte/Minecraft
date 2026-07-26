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

## Phase 2 — Building blocks breadth (no save-shape change, still v9)

Slabs & stairs (meta-based geometry):
- [ ] Place a slab on the ground (click the top of a block) → bottom half-slab.
      Click the UNDERSIDE of a block → top half-slab. Click the upper half of a
      side face → top half-slab; lower half → bottom.
- [ ] Place stairs while facing each of the four compass directions → the step
      rises away from you each time. Place them on a ceiling underside → the
      stairs are upside-down.
- [ ] Slab/stair side textures are not vertically stretched (half-tile V).
- [ ] Reload the page: every slab/stair keeps its half/facing (meta persists
      through the edit encoding).
- [ ] Breaking any slab/stair variant drops the base item regardless of meta.
- [ ] Walking on slabs behaves like a full block (known approximation:
      collision is a full box, player.js only knows isSolid).
- [ ] Pistons treat slabs/stairs/fences as unpushable (non-cube models block
      pushes — unchanged generic path; UNPUSHABLE list untouched).

Wood variants & sandstone:
- [ ] Forest biomes contain ~25% birch trees (pale bark, light leaves); snow
      biomes grow conical spruces; jungle unchanged. Canopies still cross chunk
      borders without clipping.
- [ ] Birch/spruce wood → 4 planks; planks → sticks; fences/slabs/stairs craft
      from the matching planks; all burn as furnace fuel.
- [ ] 4 sand (2x2) → sandstone; sandstone slab/stairs craft from it.
- [ ] Desert cactus smelts into green dye.

Wool & dyes:
- [ ] Creative picker filter "wool" lists 16 colours; all place and break fine.
- [ ] Sheep drop the white wool BLOCK; an old save's legacy Wool ITEM still
      places white wool and converts 1:1 in the crafting grid.
- [ ] Red/yellow flowers → dyes; red+yellow → orange, green+bone meal → lime,
      red+bone meal → pink; each dye + white wool → coloured wool (6 colours
      craftable in survival; the other 9 are creative-only until later dye
      sources arrive).
- [ ] Bed crafts from planks + white wool blocks AND from legacy wool items.

Gold gear & food:
- [ ] Golden tools craft from gold ingots (iron shapes), mine at stone-tier
      capability but visibly faster than diamond on the right block, and break
      after ~32 uses.
- [ ] Golden armor equips in all four slots (2/5/3/1 points).
- [ ] Golden carrot (1 gold ingot + carrot) restores 6 hunger.

Sugar cane:
- [ ] Shorelines at sea level occasionally carry 2-3 tall cane stacks.
- [ ] Cane only places on sand/dirt/grass with water beside the support block
      (a status message explains a refused placement); stacks cap at 3.
- [ ] Player-planted cane slowly grows to 3 tall (~2%/s per segment).
- [ ] Breaking a cane segment (or its support) pops every segment above; each
      drops a cane item. 1 cane → 1 sugar.

Recipe list UI:
- [ ] The RECIPES panel in the survival inventory is generated from the real
      recipe tables (icons + ingredient summaries), grouped 2x2 vs 3x3, and
      scrolls within the panel. No hand-written entries remain in index.html.

Debug handle:
- [ ] Loading with `?debug=1` exposes `window.__game` (world getter, player,
      inventory, BLOCK/ITEM, setBlock) for automated browser checks; without
      the param it is undefined.
