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
