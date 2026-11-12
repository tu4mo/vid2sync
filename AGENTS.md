# Agent guidelines

## File layout

- `src/` holds only `App.tsx`, the entry files and global type declarations (`*.d.ts`). App-level hooks go in `src/hooks/`, non-React code in `src/lib/`, shared components in `src/components/` and panels in `src/panels/`, and helpers shared by unit tests in `src/test/`.
- A panel folder holds only its root component (and its test). Its other components go in `components/`, hooks in `hooks/`, and non-React helpers in `lib/`.

## Code style

- Use descriptive names, not single letters or abbreviations. Short names are fine where they're the convention: event handlers' `e`, loop indexes, coordinates, and textbook maths notation inside a numeric routine.
- Prefer `const` and building new values over `let` and mutation. Mutating a local value is fine in a hot loop, as long as nothing outside the function sees it. Never mutate arguments.
- Export only what app code imports. Tests go through the public functions, so never export a helper, constant or type just for a test. `npm run lint` checks this with `knip --production`.
- Destructure component props in the function signature. oxlint has no rule for this.
- Make reusable JSX its own component in its own file, not a function inside another component.
- Write Tailwind classes out in full (`'bg-accent'`, not `` `bg-${color}` ``) so Tailwind finds them in the source. To vary a class, pick between whole class strings, as `Button`'s variants do.
- Combine classes with `clsx`, not template literals: `clsx('base', active && 'ring', className)`.
- The React Compiler memoizes for you, so don't add `memo`, `useCallback` or `useMemo`. Use `useEffectEvent` for a function an effect calls but shouldn't re-run on. It silently skips components it can't compile (such as ones with `try`/`finally` or a dynamic `import()`), so keep those out of components.

## Formatting

- Format with `npm run format` (oxfmt) and check with `npm run format:check`. Never run Prettier: without a config of its own, it rewrites every file in a different style.

## Commits

- Keep commit messages short.
