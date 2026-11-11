# Agent guidelines

## File layout

- `src/` holds only `App.tsx` and the entry files (`main.tsx`, `index.css`). App-level hooks go in `src/hooks/`, non-React code in `src/lib/`, shared components in `src/components/` and panels in `src/panels/`.
- A panel folder holds only its root component (and its test), e.g. `src/panels/Timeline/Timeline.tsx`. Its other components go in `components/`, hooks in `hooks/`, and non-React helpers in `lib/`.

## Code style

- Use descriptive names, not single letters or abbreviations: `timelineTime`, not `t`; `video`, not `el`.
- Destructure component props in the function signature, e.g. `function Toolbar({ playing, onPlay }: Props)`, not `function Toolbar(props: Props)`. oxlint has no rule for this.
- The React Compiler memoizes components, hooks and callbacks, so don't add `memo`, `useCallback` or `useMemo`. For a function an effect calls but shouldn't re-run on, use `useEffectEvent`. The compiler silently skips a component it can't handle (for example `try`/`finally`, a dynamic `import()`, or a conditional computed object key), so keep those out of components.
