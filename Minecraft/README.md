# Minecraft

A simplified Minecraft-style voxel game built from scratch with **Three.js**. It is
a working browser prototype, not a full clone. There is no build step and no
bundler: plain ES modules are loaded through an import map, and Three.js is
vendored locally under `js/vendor/`.

## Features

### World
- Infinite, chunk-based procedural world with Perlin-noise terrain and rivers
- Seven biomes — plains, forest, desert, snow, jungle, mushroom and flower
  forest — chosen from low-frequency temperature and moisture noise
- Trees, jungle trees, giant mushrooms, cactus, flowers and small surface ruins
- Underground caves carved with deterministic 3D noise
- Coal, iron, gold, redstone and diamond ore veins in the stone layers
- **Villages**: multi-building settlements with houses, farm plots, wells,
  lamp posts, gravel paths and a loot chest
- **Dungeons**: buried cobblestone rooms holding a working mob spawner and
  loot chests
- **Abandoned mineshafts**: corridor networks with support frames, plank
  bridges, rails, torches and loot chests
- Greedy meshing for opaque terrain, translucent animated water in its own pass
- Chunk streaming around the player with frustum culling

### Lighting
- Real voxel lighting: BFS-flooded **sky light** and **block light** fields per
  chunk (0–15), baked into mesh vertices
- Torches, glowstone, lava, lit furnaces, redstone lamps and portals actually
  illuminate their surroundings — caves are dark, torch-lit tunnels glow at
  night
- Per-vertex ambient occlusion with smooth-corner triangulation
- Day/night affects skylight through the scene lights only — **no chunk
  rebuilds at dusk/dawn**

### The Nether & endgame
- Build an obsidian frame (interior 2×3 up to 4×5), light it with flint and
  steel, and step through to the **nether**: a roofed netherrack cavern world
  with a lava sea, glowstone clusters, soul sand bogs and nether-brick
  fortresses (1:4 coordinate scale, automatic return portals)
- Nether mobs: neutral zombie pigmen (anger the whole pack at your peril),
  fire imps that lob real fireballs, **ghasts** drifting overhead with
  long-range fireballs (gunpowder + ghast tears), melee **wither skeletons**,
  bouncing **magma cubes** (split on death → magma cream) and fortress
  **blazes** — the reliable blaze-rod source (imps only drop rods rarely now)
- Craft an **Overlord Sigil** (blaze rods + obsidian + diamond) and use it on
  nether bricks to summon the **Nether Overlord** — a flying boss with a
  health bar, fireball volleys, minion summons and a melee slam. Defeat it for
  a Nether Star trophy
- Golden apples (full heal) help you survive the fight

### Mobs
- Night hostiles: zombies, skeletons (real dodgeable arrows), creepers
  (explosions through the shared explosion system) and **spiders** that climb
  terrain and turn neutral in daylight
- **Endermen**: rare, neutral until you stare at them — then they teleport
  around you and hit hard; drop ender pearls you can throw to teleport
- Passive pigs, cows, sheep and chickens wander by day, flee when hit and drop
  food, leather, wool or feathers
- **Breeding**: feed two animals their food (carrot/wheat/seeds) and a baby
  animal appears, growing up over time
- **Wolves** roam forests: tame them with bones — tamed wolves follow you,
  fight whatever you fight, and sit/stand on command
- Villagers spawn in the world and offer a trade menu
- **Witches** appear rarely at night, keeping their distance and lobbing
  damaging flasks; drop redstone/glowstone dust
- **Slimes** hop through plains nights and split into smaller slimes when
  killed — only the smallest drop slimeballs
- **Squids** swim in deep water and drop ink sacs (the black dye: ink + white
  wool → black wool; add 1 or 2 bone meal for gray / light gray)
- **Horses** graze plains in pairs: saddle one (dungeon/village chest loot),
  then right-click to ride — WASD steers, Space jumps, Shift dismounts
- **Iron golems**: build a T of 4 iron blocks (2-high column + 2 arms on the
  top block) and right-click the top block with an iron ingot. The blocks
  become a 100 HP guardian that batters any hostile within 16 blocks
- **Silverfish** exist for spawner use (strongholds later) — fast, erratic
  and bitey
- All mobs now have real gravity: they fall into pits (taking fall damage),
  hop up 1-block ledges and jump at walls; flyers (imps, ghasts, blazes)
  hover instead
- Dungeon/fortress spawner blocks keep producing their mob while you're close

### Redstone
- Tick-based simulation (10 Hz) with wire power falloff
- Components: lever, redstone torch, redstone block, **button** (timed pulse),
  **pressure plate** (player/mob/minecart weight), **repeater** with
  right-click-adjustable 1–4 tick delay, **redstone lamp**, and **pistons**
  that push up to 8 blocks
- **Redstone torches invert** (NOT gate): powering the block a torch stands on
  turns it off, one tick later — build NOT gates and torch-ring clocks. The
  inversion is tick-settled and double-buffered, so feedback loops oscillate
  instead of recursing
- **Sticky pistons** (piston + slimeball) pull the block in front of the head
  back when they retract
- **Observers** watch the cell their face points at and fire a one-tick pulse
  out their back whenever the watched block (or its metadata) changes; they
  face toward you when placed
- **Dispensers** (9 slots) shoot arrows as real projectiles and eject other
  items on a rising power edge; **droppers** (9 slots) always just drop the
  item out the front
- **Hoppers** (5 slots, iron + chest) vacuum item drops off their top, pull
  from the container above (a furnace's output slot included) and push into
  the container their spout points at — place against a chest's side to feed
  it sideways, or on top of anything to feed downward (down feeds a furnace's
  input, sideways its fuel). A powered hopper is locked
- **Note blocks**: right-click cycles the pitch (0–24, stored per-block); a
  rising power edge plays the stored note
- **Comparators**: analog output = rear signal (compare mode passes it when
  rear ≥ strongest side; right-click for subtract mode: rear − side). Point
  the rear at a chest/furnace/hopper/dispenser to read its fill level
  (1–15 by filled slots)
- Doors, TNT, lamps and powered rails all react to power changes anywhere in
  the connected wire network

### Minecarts & rails
- Rails and powered rails (straight, curves, slopes) crafted from iron/gold
- Rideable minecarts: right-click to hop in, WASD to nudge, Space to hop out
- Powered rails boost carts to full speed when energised; unpowered ones brake
- Fast carts knock mobs around; carts persist in the save

### Survival
- Health, hunger and air with fall damage, drowning, starvation, cactus
  pricks, lava burns and natural regeneration
- Full armor set slots (head/chest/legs/feet) with damage reduction
- 36-slot inventory, stack merging, durability bars, item tooltips
- 2×2 inventory crafting plus a 3×3 crafting-table grid for tools, swords,
  armor, redstone components, rails and more
- Furnaces smelt in the background, even after their UI closes
- Chests (27 slots), enchanting table (Sharpness / Efficiency / Protection /
  Unbreaking, powered by XP levels), XP orbs that drift toward you
- Farming: hoe grass into farmland, plant wheat/carrots, bone meal, bake bread
- Beds set your respawn and skip the night
- Bow with charge-up draw, TNT with fuses and chained explosions
- **28 achievements** with toasts and a progress page (press `J`)

### Presentation
- Procedurally painted texture atlas (no image assets at all)
- First-person held-item view with swing, walk-bob and bow-draw animations
- Day/night cycle with sun, moon, drifting clouds and color-graded sky; the
  nether has its own oppressive red atmosphere
- Rain and snow by biome, block-break particles, torch flames, heart/teleport
  effects, synthesized Web Audio sounds and ambient music
- Minimap (toggle `M`), debug HUD, settings panel, mobile touch controls
- IndexedDB auto-save of both dimensions: edits, player, time, inventory,
  drops, mobs (including tamed wolves and babies), furnaces, chests, redstone
  component state, minecarts, XP, weather and achievements

## Run it

ES modules and Pointer Lock do not work reliably from a `file://` URL, so serve
the folder over HTTP. From this directory (`Minecraft/`):

```bash
# Python 3
python -m http.server 8000
```

Then open <http://localhost:8000> and click to play.

Any static server works equally well, for example:

```bash
npx serve .
php -S localhost:8000
```

Three.js r160 is vendored locally under `js/vendor/`, so the game runs fully
offline - no internet connection or CDN is required. See the import map in
`index.html`.

## Controls

| Action | Input |
|---|---|
| Move | `W` `A` `S` `D` |
| Jump | `Space` |
| Swim up / down | hold `Space` / `Shift` in water |
| Sprint | hold `Shift` on land |
| Look | Mouse |
| Attack mob / mine block | Left click / hold left click |
| Place block / use block | Right click |
| Draw / fire bow | Hold right click with a bow, release to shoot |
| Ignite TNT | Right click TNT with a torch or flint & steel |
| Light a nether portal | Right click inside an obsidian frame with flint & steel |
| Throw ender pearl | Right click with an ender pearl (teleports you) |
| Open / close door | Right click the door |
| Press button / cycle repeater delay | Right click it |
| Toggle comparator mode / cycle note-block pitch | Right click it |
| Open dispenser / dropper / hopper | Right click it |
| Ride a minecart | Right click a cart; `W`/`S` push, `Space` hops off |
| Saddle a horse | Right click a horse while holding a Saddle |
| Ride a horse | Right click a saddled horse; `WASD` steers, `Space` jumps, `Shift` dismounts |
| Build an iron golem | Right click the top of a 4-block iron T with an iron ingot |
| Feed / breed an animal | Right click it with carrot (pig), wheat (cow/sheep) or seeds (chicken) |
| Tame a wolf | Right click it with a bone |
| Wolf sit / follow | Right click a tamed wolf with an empty hand |
| Summon the boss | Right click nether bricks with an Overlord Sigil (in the nether) |
| Sleep / set respawn | Right click a bed |
| Till soil / plant seeds | Right click with a hoe / with seeds |
| Eat food | Right click while holding food |
| Select hotbar slot | `1`-`9` or mouse wheel |
| Inventory / craft | `E` |
| Achievements page | `J` |
| Minimap | `M` |
| Skip time forward | `T` |
| Pause / resume time | `P` |
| Open settings | `O` |
| Reset world and wipe save | `K` |
| Release the mouse | `Esc` |
| Toggle survival / creative mode | `F4` (also in Settings) |
| Toggle flight (creative) | double-tap `Space`; `Space` up, `Shift` down |
| Pick block (creative) | Middle click a block |

## Project layout

```text
index.html        # UI shell + import map
js/
  config.js       # constants, block/item defs, atlas UVs, recipes tables, helpers
  noise.js        # seeded 2D Perlin noise + fbm
  textures.js     # procedurally paints the texture atlas to a canvas
  lighting.js     # BFS sky/block light fields per chunk
  chunk.js        # chunk storage + greedy mesher + block models + lit materials
  world.js        # biomes, terrain, caves, ores, trees, streaming, edits, raycast
  nether.js       # the nether dimension (roofed cavern world, lava sea)
  structures.js   # villages, dungeons, mineshafts, fortresses + loot tables
  portal.js       # obsidian frame validation, portal lighting/collapse/arrival
  player.js       # pointer-lock camera, movement, water physics, AABB collision
  sky.js          # day/night cycle, sun/moon, clouds, nether sky mode
  storage.js      # IndexedDB save/load wrapper
  survival.js     # health, hunger, air, armor, damage, respawn rules
  mobs.js         # all mobs: AI, spawning, breeding, taming, spawners, the boss
  minecart.js     # rideable minecart entities with rail physics
  projectiles.js  # arrows and fireballs
  redstone.js     # tick-based redstone: wire, button, plate, repeater, piston...
  furnace.js      # persistent background smelting
  chest.js        # per-block chest storage
  dispensers.js   # per-block 9-slot storage for dispensers AND droppers
  hoppers.js      # per-block hopper storage (5 slots + spout direction)
  inventory.js    # finite stack-slot inventory (hotbar + backpack)
  crafting.js     # shapeless, 2x2 and 3x3 recipes
  drops.js        # dropped item entities
  xp.js           # XP orbs, levels, enchanting
  achievements.js # 28 achievements + toasts
  minimap.js      # top-down terrain minimap
  weather.js      # rain/snow particles
  feedback.js     # synthesized audio + particle effects
  main.js         # renderer, UI wiring, interactions, dimensions, save, loop
```

## Architecture notes

- `config.js` is the contract. Shared constants, block definitions, atlas UV
  math and cube faces live there. Block IDs stay ≤ 99 (chunk data is a
  `Uint8Array`); item IDs start at 100.
- Chunks are `16 x 64 x 16`. Block data is a flat `Uint8Array` indexed as
  `x + 16 * (z + 16 * y)`.
- Blocks carry no metadata: orientation/state for pistons, repeaters, levers
  and buttons lives in side tables inside `redstone.js`, serialized with the
  save.
- Lighting is two BFS-flooded `Uint8Array` fields per chunk (sky + block
  light). Each chunk computes them from its 3×3 neighbourhood, so borders
  agree without global ordering. Vertex colors carry (block, sky, AO); the
  shader combines them, adding block light as emissive so torches glow at
  night without scene-light help.
- Structures are pure functions of the world seed: every chunk independently
  computes which structure voxels fall inside it, so buildings cross chunk
  borders without generation-order problems.
- The nether is a second `World` instance with its own generator and edits
  diff. Portal travel swaps chunk meshes, rebinds subsystems and parks loose
  entities (drops/minecarts) per dimension.
- Saves store diffs against the procedural seed for BOTH dimensions, plus all
  entity/system state (SAVE_VERSION 7; older saves load with safe defaults).
- Known scope cut: the boss despawns on save/load (summon it again with a new
  sigil).

## Crafting quick reference

```text
Wood -> 4 planks;  2 planks -> 4 sticks;  4 planks -> crafting table
Tools/swords/armor: classic MC shapes (wood/stone/iron/diamond tiers)
Furnace: 8 stone ring        Chest: 8 planks ring       Bed: planks + wool
TNT: gunpowder/sand checker  Bow: sticks + string       Arrows: gravel/stick/feather
Button: 1 stone              Pressure plate: 2 stone side by side
Repeater: 2 redstone torches + redstone over 3 stone
Comparator: 3 redstone torches + redstone over 3 stone
Piston: 3 planks / cobble + iron + redstone
Sticky piston: piston + slimeball (shapeless)
Observer: 6 cobble + 2 redstone + glass (middle row: redstone, redstone, glass)
Dispenser: 7 cobble + bow (center) + redstone (bottom middle)
Dropper: 7 cobble + redstone (bottom middle, no bow)
Hopper: 5 iron in a W + chest (center)
Note block: 8 planks + redstone (center)
Redstone lamp: 4 redstone + glowstone     Glowstone: 4 glowstone dust
Rails x16: 6 iron + stick    Powered rails x6: 6 gold + stick + redstone
Minecart: 5 iron (U shape)   Flint & steel: iron + gravel
Golden apple: 8 gold + apple
Overlord Sigil: 4 blaze rods + 4 obsidian + 1 diamond
```

## Possible extensions

- Web Worker chunk pipeline (generation + lighting + meshing off the main thread)
- Flowing water/lava dynamics
- Splitting `main.js` into focused UI/interaction modules
- More nether biomes, potions/brewing
- Multiplayer
