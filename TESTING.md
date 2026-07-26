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

## Phase 3 — Liquids, buckets, boats, fishing (SAVE_VERSION 10)

Save migration:
- [ ] A v9 world loads cleanly and reports version 10 (`fluids`/`boats` fields
      added, both empty); worldgen oceans are untouched (they are all sources).

Flowing liquids:
- [ ] Dig a trench next to an ocean/lake: water flows in, thinning with each
      block (lowered tops), and stops after 7 blocks on flat ground.
- [ ] Break the block under a pond: water pours down as a full-height falling
      column, then spreads where it lands.
- [ ] Wall off / remove the supplying source: the flow dries back up to air.
- [ ] Two sources with a 1-block gap: the gap becomes a new source (infinite
      water); lava never duplicates like this.
- [ ] Lava spreads only 3 blocks and visibly slower than water.
- [ ] Water touching a lava SOURCE makes obsidian; touching flowing lava makes
      cobblestone (with a smoke puff + sound).
- [ ] Reload mid-flow: the flow finishes after loading (pending cells persist).
- [ ] Flowing water renders with a sloped, lowered surface; sources and falling
      columns stay full height. (Known approximation: LAVA still renders as a
      full cube regardless of level — it lives in the opaque greedy pass.)

Buckets:
- [ ] 3 iron ingots in a V craft a bucket (stacks to 16).
- [ ] Right-click a water/lava SOURCE with an empty bucket: the cell empties
      and the bucket fills. Flowing (non-source) cells cannot be scooped.
- [ ] Right-click a face with a filled bucket: a source is placed and starts
      flowing; the bucket returns empty. In creative, buckets never change.
- [ ] A lava bucket fuels a furnace for 100 s and leaves an empty bucket in
      the fuel slot.

Boats:
- [ ] 5 planks in a U (oak, birch or spruce) craft a boat.
- [ ] Right-click water with the boat item: the boat floats on the surface.
- [ ] Right-click the boat to board; WASD steers relative to the camera
      (top speed ~5.5 m/s, coasts to a stop); Space hops off.
- [ ] The boat stops against solid blocks and barely moves when beached.
- [ ] Punching the boat pops it back into the item (nothing in creative).
- [ ] Boats park correctly across dimension travel and survive reload.

Fishing:
- [ ] Rod crafts from 3 sticks + 2 string (diagonal); durability 64.
- [ ] Right-click casts a bobber that arcs into water and floats; after 5-15 s
      it dips for ~0.8 s with a sound cue.
- [ ] Reeling (right-click) during the dip lands a Raw Fish that flies toward
      you; outside the window the line comes back empty. Both cost 1 durability
      (none in creative).
- [ ] Raw fish smelts into cooked fish (2 vs 6 hunger); village chests can
      contain raw fish.

## Phase 4 — Mob registry, gravity, 10 new mobs (SAVE_VERSION 11)

Registry refactor (must be behaviour-neutral for the 14 legacy types):
- [ ] All 14 legacy mobs spawn with their old HP (zombie/skeleton/creeper 10,
      spider 14, enderman 40, wolf 20, villager 20, pigman 14, imp 16,
      boss 200, farm animals 8) and behave as before: hostiles chase at night,
      skeletons kite and shoot, creepers fuse, endermen anger on stare,
      pigmen/wolves anger as packs, passives flee when hit.
- [ ] Kills drop the same loot as before (registry tables); sheep still drop
      the white wool BLOCK; XP orb values unchanged (registry `xp`,
      `config.xpFromKill` remains only as a fallback).
- [ ] Breeding foods unchanged (carrot/wheat/wheat/seeds); taming and wolf
      sit/follow flags survive a save/reload.
- [ ] Ambient mob sounds still play (now data-driven from `MOB_DEFS.sound`).
- [ ] `?debug=1` exposes `__game.mobs`, `__game.dayNight`, `__game.survival`,
      `__game.MOB_DEFS` and the horse mount hooks.

Mob gravity (replaces the old per-frame ground snap):
- [ ] Dig a 3-deep pit between yourself and a zombie at night: it walks in,
      falls to the pit floor and cannot jump back out.
- [ ] Push/lure a mob off a 5+ block drop: it falls, lands, and takes fall
      damage (drops/XP appear if the fall kills it).
- [ ] A chasing mob steps up 1-block ledges and hops at 1-block walls
      (jump impulse); spiders still climb up to 3-block steps.
- [ ] Fire imps hover with their bob; the boss flight is unchanged; mobs in
      water sink slowly (buoyancy) instead of plummeting.
- [ ] No floating mobs after chunk edits under them (they now fall).

New mobs:
- [ ] Nether: ghasts drift high and lob fireballs (~4 s within 24), dropping
      gunpowder + occasional ghast tears; wither skeletons melee for 5;
      magma cubes hop and split; fortress spawners now emit BLAZES that hover,
      spin their rods and fire triple bursts (50% blaze rod — fire imps only
      20% now).
- [ ] Overworld nights: rare witches keep 8-10 distance and throw purple
      flasks ("Witch flask" damage); slimes hop in plains and split 3→2→1,
      size 1 dropping slimeballs (xp 4/2/1).
- [ ] Squids swim inside water columns ≥ 2 deep, never leave the water, drop
      1-3 ink sacs; a beached squid flops and suffocates.
- [ ] Ink sac dyeing: ink+white wool → black; ink+bone meal+wool → gray;
      ink+2 bone meal+wool → light gray.
- [ ] Horses (plains, pairs): right-click with a Saddle (dungeon 25% / village
      10% chest loot) to saddle, right-click again to mount. WASD steers at
      ~9 m/s camera-relative, Space jumps (real gravity), SHIFT dismounts
      (Space is the jump, unlike boats/carts). Saddled horses never despawn
      and keep the saddle through save/reload.
- [ ] Iron golem: place 4 iron blocks as a T (2-high column + 2 top arms),
      right-click the TOP block holding an iron ingot → blocks are consumed
      (ingot kept), golem spawns, "Iron Defender" achievement. It attacks
      hostiles within 16 (12 damage + launch), wanders otherwise, never
      follows you and never despawns. Drops 3-5 iron ingots, no XP.
- [ ] Silverfish never spawns naturally but works when spawned via debug
      (`__game.mobs.addMob(pos, 'silverfish')`) — fast erratic 1-damage bites.
- [ ] Achievements: "Squid Squeeze" on picking up an ink sac; "Iron Defender"
      on building a golem; "Into Fire" still triggers from any blaze rod.

Save round-trip:
- [ ] A v10 world loads and reports version 11; mobs saved before the upgrade
      reappear unchanged (new fields vy/size/saddled default).
- [ ] Save with slimes of several sizes + a saddled horse, reload: sizes,
      scales and the saddle persist.

## Phase 6 — Redstone completion (SAVE_VERSION 12)

Save migration:
- [ ] A v11 world loads cleanly and reports version 12 (`dispensers`/`hoppers`
      maps added, both empty; redstone side-table untouched).
- [ ] Redstone torches placed BEFORE this phase still work and now invert
      (adopted from the world edits by the first-tick scan).

Redstone torch inversion (NOT gate):
- [ ] A torch on top of a block stays lit while the block is unpowered.
- [ ] Power the block (lever on/next to it): the torch swaps to its dimmed
      "off" texture within ~0.2 s, stops emitting light, and anything it fed
      (lamp, wire) drops.
- [ ] Remove the power: the torch relights one tick later.
- [ ] A torch never powers the block it stands on (no self-feedback flicker).
- [ ] Three torch NOT-stages wired in a ring oscillate as a clock (a lamp on
      the loop blinks continuously).
- [ ] Breaking an unlit torch drops the normal redstone torch item; the unlit
      variant is not in the creative picker; middle-click picks the lit one.

Sticky piston:
- [ ] Crafts shapeless from piston + slimeball; face has a green slime tint.
- [ ] Extends exactly like a piston (pushes up to 8 cube blocks, meta such as
      a note block's pitch rides along).
- [ ] On retract it pulls the single block in front of the head back one cell;
      non-pushable blocks (containers, obsidian...) are simply left behind.

Observer:
- [ ] Places facing TOWARD you (the eye watches the cell between you and it).
- [ ] Any block id or meta change in the watched cell fires a single ~0.1 s
      pulse out the BACK face (lamp behind it blinks once).
- [ ] Watching a piston head, growing crops or flowing water all trigger it.
- [ ] Two observers watching each other's backs form a fast clock.

Dispenser & dropper:
- [ ] Right-click opens a 9-slot screen (chest screen, retitled).
- [ ] On a rising power edge the DISPENSER fires arrows as real projectiles
      (they damage mobs) and ejects any other item with a push; one item per
      pulse, held power does not repeat-fire.
- [ ] The DROPPER always just drops the item gently out the front.
- [ ] Both face the direction you looked when placing (up/down included).
- [ ] Breaking one spills its contents; explosion does the same.

Hopper:
- [ ] Crafts from 5 iron (W shape) + chest in the middle.
- [ ] Placing against a container's SIDE aims the spout into it; placing on
      top of anything aims down.
- [ ] Item drops landing on the hopper are vacuumed into its 5 slots.
- [ ] Pulls one item per 0.4 s from a chest/dispenser/dropper/hopper above,
      and from a furnace's OUTPUT slot above.
- [ ] Pushes one item per 0.4 s into the container it points at; pointing
      DOWN into a furnace feeds the input slot, SIDEWAYS feeds the fuel slot
      (input only accepts smeltables, fuel only burnables — simplification).
- [ ] A powered hopper is locked (does nothing until power drops).
- [ ] Right-click opens its 5-slot screen; breaking it spills the contents.
- [ ] Drop → hopper → chest chain works unattended (AFK item collection).

Note block:
- [ ] Right-click cycles pitch 0→24→0 with a status message and a preview
      tone (pitch survives save/reload — it lives in block meta).
- [ ] A rising power edge replays the stored pitch; held power plays once.

Comparator:
- [ ] Plate-model block, places horizontally facing away from you; needs
      solid ground; right-click toggles compare/subtract with a message.
- [ ] Compare mode: rear signal passes when rear ≥ strongest side signal.
- [ ] Subtract mode: output = rear − side (wire falloff visible downstream).
- [ ] Rear against a chest/furnace/hopper/dispenser outputs its fill level
      (floor(1 + 14·filledSlots/capacity)) — a lamp lights while the chest
      has items, goes dark when emptied.

Engine/general:
- [ ] Containers/observers/note blocks are NOT piston-pushable (side tables
      key by position); observers included by design — document says so.
- [ ] All new blocks appear in the creative picker (except the unlit torch)
      and craft in survival; recipe list shows them.
- [ ] Serialize/reload mid-clock: torch states, observer pulses, dispenser
      edge-state, comparator mode all resume without a stuck state.
- [ ] `node test/smoke.mjs` green; `?debug=1` exposes `__game.redstone`,
      `hoppers`, `dispensers`, `placeBlock`, `cycleNoteBlock`.

## Phase 7 — Status effects, brewing, enchanting/anvil, shields (SAVE_VERSION 13)

Save migration:
- [ ] A v12 world loads cleanly and reports version 13 (`effects` list and
      `brewingStands` map added, both empty).
- [ ] Save with active effects + a mid-brew stand, reload: HUD chips reappear
      with the remaining seconds; the stand finishes its brew.

Status effects:
- [ ] Drinking a Potion of Swiftness shows a coloured "Speed 90s" chip near
      the survival bars, counts down, and visibly increases walk/sprint speed;
      the chip disappears when it expires.
- [ ] Slowness slows the player; the two stack (speed + slowness partially
      cancel).
- [ ] Poison drains 1 HP per 1.25 s with a red flash but stops at 1 HP.
- [ ] Regeneration heals 1 HP per 2.5 s; golden apples now also grant
      Regeneration II for 10 s on top of the full heal.
- [ ] Fire Resistance: standing in lava deals no damage while the chip lasts.
- [ ] Water Breathing: the air meter never drains underwater.
- [ ] Night Vision: night/caves brighten (scene-light floor lerps in and out —
      baked chunk light untouched).
- [ ] Strength adds +3 melee damage per level; Weakness −2 (min 1).
- [ ] Effects clear on death/respawn.

Brewing:
- [ ] Brewing stand crafts from a blaze rod + 3 cobblestone; renders as a
      cross-sprite stand (documented: no 3D stand model) and right-click
      opens the BREWING STAND screen (3 bottles / ingredient / fuel).
- [ ] 3 glass → 3 glass bottles; right-click water fills one WITHOUT removing
      the water cell.
- [ ] Nether wart: found in fortress chests and growing on the fortress
      soul-sand garden; plants ONLY on soul sand; grows through 3 stages via
      the shared crop ticker (bone meal works); mature drops 3 wart.
- [ ] Water bottle + nether wart + blaze-powder fuel → Awkward Potion after
      20 s (one powder charges 20 brews); "Local Brewery" achievement fires.
- [ ] Awkward + sugar/blaze powder/golden carrot/magma cream/spider eye/ghast
      tear/raw fish → speed/strength/night vision/fire res/poison/regen/water
      breathing potions (raw fish stands in for pufferfish — documented).
- [ ] Fermented spider eye (sugar + spider eye, shapeless) corrupts:
      speed→slowness, strength→weakness, healing→poison (documented subset).
- [ ] Gunpowder turns any effect potion into a SPLASH potion — same icon, a
      "Splash" tooltip prefix (stack flag, not a new id — documented); throwing
      it applies the effect in a 3-block radius to the player and mobs.
- [ ] Drinking returns the glass bottle; splash potions do not.
- [ ] Breaking / blowing up a stand spills bottles, ingredient and fuel
      (splash flags are lost on dropped items — documented).
- [ ] Witches now poison (amp 1, 15 s) via their flask's splash instead of
      dealing flat damage.
- [ ] Splash slowness/weakness visibly slow a mob / reduce its melee damage;
      mob effects survive save/reload.

Enchanting expansion:
- [ ] All enchantments now reach level IV; buying level N costs N+2 XP levels
      (I=3 as before, IV=6) and the screen shows the per-level cost.
- [ ] Bows enchant with Power (+25% arrow damage per level) and Unbreaking.

Anvil:
- [ ] Anvil crafts from 3 iron blocks + 4 iron ingots; renders as a cube with
      an anvil-silhouette texture (documented: no 3D anvil model).
- [ ] Right-click opens the ANVIL screen: two inputs + output, 2-XP-level
      flat cost (shown in red when unaffordable; free in creative).
- [ ] Two damaged same-id tools combine: durabilities add +12% of max
      (capped), enchantments merge taking the max level of each.
- [ ] Tool + its raw material (iron ingot / diamond / gold ingot / cobble /
      planks; shield repairs with planks) restores 25% max per unit, consuming
      only as many units as needed. Armor has no durability → not repairable
      (documented). Renaming is skipped (no item names — documented).

Shield:
- [ ] Shield crafts from 6 planks + 1 iron ingot (Y shape), durability 336.
- [ ] Holding right-click with the shield selected raises it (hand pose) and
      slows movement to 30%.
- [ ] Frontal damage (mob melee, arrows, fireballs, explosions — anything
      with a source position) is reduced 66%; the prevented damage is charged
      to the shield's durability. Falls/lava/poison are never blocked
      (documented: those carry no source position).
- [ ] Attacks from behind bypass the shield entirely.
- [ ] Releasing right-click, switching slots or opening a screen lowers it.

Debug / automation:
- [ ] `node test/smoke.mjs` green; `?debug=1` exposes `__game.effects`,
      `brewing`, `xp`, `anvilResult`, `anvilSlots`/`anvilTake`, `setBlocking`,
      `drinkSelected`, `throwSelectedSplash`, `openBrewScreen`, `openAnvil`.
