# Agent guidelines

## Code style

- Destructure component props in the function signature, e.g. `function Toolbar({ playing, onPlay }: Props)`, not `function Toolbar(props: Props)`. oxlint has no rule for this.
