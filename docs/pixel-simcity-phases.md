# TRENFASE V2 (Pixel-SimCity) - Roadmap and Progress Tracker

## Phase 1: Foundation & Custom Audio (Complete)
- [x] Hard reset to clean `main` to ensure a stable V1 baseline.
- [x] Migrate Custom Audio Upload (WAV/MP3) to new modular `app.js` and `AudioEngine`.
- [x] Migrate Microphone recording to new modular `app.js`.
- [x] Re-inject Phase 2: Web Worker setup & Canvas Rendering.
- [x] Implement mode selection ('Yamanote' vs 'Creator Mode').
- [x] UI/UX: Auto-open the Creation panel and Station inspector when creating new entities.
- [x] UI/UX: Relocate Master Bar controls to the top Header.

## Phase 2: The Core Ecosystem Engine (Complete)
- [x] Implement `city-engine.worker.js` skeleton (Dedicated Web Worker).
- [x] Set up `postMessage` and `Float32Array` shared memory communication with `color-bg.js`.
- [x] Establish initial Canvas rendering for up to 10,000 pixels at 60FPS.
- [x] Define internal state structures for stations in the Worker.
- [x] Visually verify the rendering pipeline with a pulsating green matrix placeholder.
- [x] Fix Canvas rendering and collision logic for manually placed UI stations in Creator Mode.

## Phase 3: Generative Algorithms (Pending)
- [ ] Implement "Space Colonization" (fractal growth) originating from UI station coordinates.
- [ ] Implement A* pathfinding for pixel-cars/walkers restricted to road pixels.
- [ ] Build the ECS (Entity Component System) loop inside the Worker to handle thousands of walkers/cars efficiently.

## Phase 4: Acoustic Translation & Dynamic Audio (Pending)
- [ ] Map demographic counters from the Worker to `AudioEngine`.
- [ ] Program generative granular synthesis mapped to pedestrian volume (Burbujeo).
- [ ] Program low-pass noise drone mapped to traffic density (Zumbido).
- [ ] Implement audio state modifiers for Expansion, Stagnation, Gridlock, and Ruin (distortions, reverbs, clipping).

## Phase 5: "What-If" Gameplay Mechanics (Drag & Drop) (Pending)
- [ ] Implement logic for "Core Break/Orphaning" when dragging a station away from its city.
- [ ] Implement short-distance drag "Sudden Re-rooting" (Sprawl).
- [ ] Implement automatic exodus/migration over inter-city roads.
- [ ] Implement "Resurrection" of ruins by placing a live station in them.
- [ ] Implement "Induced Overpopulation" (Meltdown) when squishing stations together.
- [ ] Elastic train tracks vs static road breaks parsing logic.
