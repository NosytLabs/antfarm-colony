# Asset production record

Generated with the built-in image generation tool on 2026-10-03. Source originals are preserved separately in the recovery export. The project ships copies with measured alpha bounds in web/assets/atlas.json; runtime extraction retains the largest connected component and aligns role animation frames to a shared bottom-center anchor.

## Colony growth sheet

Output: web/assets/colony-growth.png. Original: generated_images/exec-cb781c3a-2fe1-4071-95ed-6b30fce254c9.png. Eight connected components confirmed, with transparent gutters. Used in the live renderer and tied to completed-task milestones.

Exact generation prompt:

Use case: stylized-concept. Asset type: production transparent pixel-art game object sprite sheet for Antfarm Colony, a side-view underground ant colony management game. Create exactly EIGHT distinct isolated colony objects in a perfectly regular 4-column by 2-row grid on transparent alpha, square canvas. Every cell has one complete object centered, generous empty gutters, each object contained within its cell and roughly equal apparent visual scale. Row 1 left to right: (1) tiny glowing amber fungus garden growing on rich soil, (2) leaf-lined brood cradle with three pale ant cocoons and green moss, (3) hollow acorn granary overflowing with tiny golden seeds, (4) rolled and open leaf map pinned by pebbles with small natural trail markings but NO lettering. Row 2 left to right: (5) curved twig arch reinforced with moss, (6) dewdrop water cistern formed from a curled leaf and pebble basin, (7) neat pile of cut green leaf fragments on bark for worker ants, (8) small amber crystal archive cluster nested in a carved root nook. Style: crisp 16-bit pixel art, visible pixel clusters, dark brown outlines, moss-green, copper, cream, warm amber palette, softly lit from upper left, simple side-on slightly top-visible 2D props readable at 48-80 pixels in game. Natural materials only, no office furniture, no ants or people, no text, no labels, no visible grid, no backdrop, no ground plane connecting objects, no drop shadow outside object. Real alpha transparency. All eight props must be clearly separated, no fragments in gutters.

## Earlier sheets

The visual briefs and frame inventory for ants.png, ants-work.png, props.png and colony.png are in web/assets/README.md. The recovery archive preserves earlier source originals and available generation context. Earlier exact prompts are not all available in project files; the briefs are summaries, not claimed verbatim prompts.


## 0.2.0 ant atlas — built-in image generation

Reference: original ants.png. Production game sprite atlas for Antfarm Colony. Four specialists: russet scout with green backpack/leaf, amber builder with tiny yellow hardhat, brown verifier with teal goggles/scroll, larger dark queen/planner with gold crown. Crisp readable SNES pixel-art sprites, less glossy/painterly, strong contour and warm russet/moss palette. Exact four columns by eight rows: walking scout, builder, verifier, planner, then working scout, builder, verifier, planner. Four frames per animation; every ant faces right. Transparent background; generous gutters; bottom-center feet anchors; consistent full creature proportions and costumes. Walk uses alternating tripod leg gait with six jointed legs. Work poses: examine leaf, work pebble, study scroll, antennae gestures. Distinct head, thorax, narrow waist and abdomen. No scenery, labels, grid lines, shadows or text.

Output was 887×1774 rather than the requested 1024×2048. Transparent row boundaries were detected and validated as eight rows; cell alpha bounds were segmented and all eight poses per role normalized at one scale into 256×256 cells. Runtime files: web/assets/ants.png and ants-work.png, each 1024×1024 RGBA. Atlas metadata was updated and all frames verified in the browser.

## 0.2.0 habitat — built-in image generation edit

Reference/edit target: original colony.png. Preserve exact 1536×1024 composition: six excavated chambers in three columns/two rows, seven connecting tunnel centerlines, same walkable floor coordinates, forest surface and mound. Centers: (245,425), (770,425), (1285,425), (250,795), (770,795), (1290,795). Keep wide empty foreground floors for animated workers. Improve furnishings: leaf fragments and seed stores upper-left, moss/resin planning table and amber glow upper-center, pebble/twig building bench upper-right, fungus inspection garden lower-left, acorn seed archive lower-middle, pale brood larvae/eggs on leaf beds lower-right. Delicate root arches, soil strata, blue-green fungi lighting, dew drops, tactile clay walls. Replace human mining tools with ant-scale twigs and leaves. Warm amber chambers against cool moonlit forest; clear silhouettes, restrained texture, crisp detailed pixel art. No ants, people, interface, labels or watermarks; do not block floors or change routes.

Selected output is web/assets/colony.png. Geometry and room labels were inspected in the rendered scene. The source-generated alternatives are retained outside the repository; no external office assets are redistributed.
