# Colony artwork
Original project-bound assets generated for NosytLabs on 2026-10-03 using the built-in image generation tool.

- ants.png: four walking frames each for scout, builder, verifier, queen/planner (16 frames).
- ants-work.png: four working frames for each role (16 additional frames), normalized to the same role anchors as walking.
- props.png: 16 isolated props and small insects: seed leaf, grain bowl, glowing fungi, nursery eggs, amber crystal, dew leaf, pebbles, strawberry, leaf scroll, pinecone, twigs, flower, aphid, ladybug, larva, cocoon.
- colony.png: six-chamber forest ant-farm cutaway with connecting tunnels, roots, seeds and moss.
- colony-growth.png: eight additional structures: fungus garden, brood cradle, acorn granary, leaf map, twig arch, dew cistern, leaf harvest, amber archive. Structures appear at 1, 3, 10 and 25 completed steps; the arch and leaf harvest are present from the start.
- atlas.json: ants use normalized 256×256 cells; props retain measured component bounds. The raw 4×8 generated ant sheet was segmented using transparent row gutters, then all eight poses of each role shared one scale and bottom-center anchor.

The renderer extracts the largest connected alpha component in each frame, shares scale across each role, and aligns to bottom-center. This prevents neighbouring antennae leaking across generated atlas boundaries. It animates from real task state; demo state is separate.

Generation briefs: 16-bit pixel clusters, earthy copper/moss/amber palette, side-facing six-legged ants, consistent four-frame role rows, transparent sprite backgrounds; wide 3:2 environment with chambers at upper left/center/right and lower left/center/right, open floors and wide tunnels. Props use the same materials and lighting.

No third-party pixel art is copied from the reference office projects. The Geist Pixel font has its own license in web/fonts/OFL.txt.


## 0.2.0 refresh

The built-in image generation tool created a new 32-frame atlas from the original role reference and edited the habitat while preserving its six chamber floors and seven tunnel centerlines. New decor includes leaf shelving, a resin planning table, twig construction tools, fungus inspection beds, seed archives and brood beds. Frames are normalized to two 1024×1024 RGBA atlases. Generated source images remain outside the repository; selected runtime assets live here. Full briefs are recorded in `docs/asset-prompts.md`.
