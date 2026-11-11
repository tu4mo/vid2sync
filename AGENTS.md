# Agent guidelines

## File layout

- `src/` holds only `App.tsx` and the entry files (`main.tsx`, `index.css`). App-level hooks go in `src/hooks/`, non-React code in `src/lib/`, shared components in `src/components/` and panels in `src/panels/`.
- A panel folder holds only its root component (and its test), e.g. `src/panels/Timeline/Timeline.tsx`. Its other components go in `components/`, hooks in `hooks/`, and non-React helpers in `lib/`.

## Code style

- Use descriptive names, not single letters or abbreviations: `timelineTime`, not `t`; `video`, not `el`; `audioContext`, not `ctx`. The exceptions are `e` for an event, `i`/`j` for a loop index, `x`/`y` for coordinates, `prev` in a state updater, and textbook maths notation inside a self-contained numeric routine (the FFT's `re`/`im`/`n`, a correlation's `a`/`b`).
- Destructure component props in the function signature, e.g. `function Toolbar({ playing, onPlay }: Props)`, not `function Toolbar(props: Props)`. oxlint has no rule for this.
- The React Compiler memoizes components, hooks and callbacks, so don't add `memo`, `useCallback` or `useMemo`. For a function an effect calls but shouldn't re-run on, use `useEffectEvent`. The compiler silently skips a component it can't handle (for example `try`/`finally`, a dynamic `import()`, or a conditional computed object key), so keep those out of components.

## Formatting

- Format with `npm run format` (oxfmt, configured in `.oxfmtrc.json`), and check with `npm run format:check`. Never run Prettier: there's no Prettier config, so it falls back to double quotes and semicolons and rewrites every file it touches.
