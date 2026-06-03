# /tests/ — drafts, sketches and design R&D

Scratchpad for things that aren't part of the deployed site. Anything in this folder is for review, exploration or comparison and should not be linked from the production app.

## Convention

- All draft sketches, wireframes and design R&D go under `/tests/sketches/<name>.html` (or `.svg`).
- Standalone exploratory pages (logo concepts, palette tests, type specimens, competitor comparisons) live at the top of `/tests/`.
- Nothing in `/tests/` ships.
- If a sketch becomes a real component, port it to where it belongs in `src/` and delete the draft.

## Tests

`tests/*.test.ts` (and `src/lib/*.test.ts`) are the `node:test` suite, run by `npm test` (`tsx --test`) and gated in CI. Most are pure-logic invariants. `bundle-composer.test.ts` is the exception: a **render** test that mounts a real React component in `happy-dom` (`@happy-dom/global-registrator` + `react-dom/client` + `act`) and asserts behaviour through the mount → fetch → render cycle — added after the inline `BundleComposer` shipped stuck-loading / lost-prefill bugs that pure-logic tests can't catch. Use it as the template for future component render tests; keep such files extension `.ts` and build the tree with `React.createElement` so they match the `tests/*.test.ts` glob.
