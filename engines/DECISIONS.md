# Decisions

One line per decision, with the reason.

- Repository was empty, so `/engines` is the first site; the Pages workflow builds every top-level site folder into one output so no site can unpublish another.
- GitHub Pages is served from the `gh-pages` branch (pushing it enabled Pages automatically); the Pages settings API is not reachable from the build environment, and branch publishing needs no settings change.
- The workflow publishes by force-pushing a freshly built `gh-pages` branch: every site is rebuilt from source on each run, so nothing is lost and the branch stays small.
- Commits are authored as the repository owner (`AAADUB`) with neutral conventional-commit messages and no trailers.
- Type system: Stolzl (display), Aktiv Grotesk (text), Source Code Pro (numbers) from one Adobe Fonts web kit; all three cover Cyrillic, and Termina was rejected because it has no Cyrillic.
- The kit stylesheet is loaded asynchronously and the page swaps from metric-matched local fallbacks to the kit faces once they (including Cyrillic glyphs) are loaded, because the kit itself uses `font-display: auto`.
- Engines are built procedurally at runtime with three-bvh-csg (real round ports, water jacket and cut faces) instead of shipping model files.
- One WebGL renderer is moved into whichever stage is most visible; the stage it leaves keeps a frozen frame, so only one scene renders at a time.
- Cutaway views swap each housing for two pre-split CSG halves; the front half slides away and fades, and the cut faces are hatched in the shader by their object-space normal.
- Gas is a GPU particle system in normalised cylinder coordinates mapped into the live gas volume, so particles cannot leave the chamber; ports and pipes use particles constrained to their tube radius.
- Cam lobes are derived from the same lift law the valves follow (flat-tappet support function), so lobe shape and valve motion always agree.
- The pressure model integrates the first law with a Wiebe heat release (double Wiebe for diesel) rather than drawing a canned curve, so every readout and the P–V loop come from the same simulation.
- Slow motion is the default (0.05×): at real speed a car engine turns 13–120 times per second, which a 60 Hz display cannot show.
- Touch devices rotate models only in an explicit “Explore” mode; desktop wheel-zoom is disabled so the page always scrolls.
- The hero shows the engine in cutaway with a slow sway rather than a full turn, so the combustion glow stays visible.
- Poster stills and Open Graph images are rendered from the live scenes with a headless browser (`scripts/stills.mjs`) and used as loading posters and the no-WebGL fallback.
- The 404 page lives at the Pages root (GitHub only uses that one) and redirects to the site and language root of the missing path.
- three-bvh-csg passes a deprecated three-mesh-bvh option; a small build transform renames it so the console stays clean.
- 3D scenes start on the reader's first scroll, pointer move, touch or key (or 6.5 s after load); until then the hero shows a still of the same scene. The WebGL probe also waits for that moment, because creating a GL context can block the main thread for over a second on software renderers.
- Inactive story beats and stroke cards are dimmed by text colour, not opacity, so dimmed text still meets WCAG AA contrast.
