// oxlint-disable-next-line import/no-unassigned-import -- makes this a module, so the declaration below adds to React's types instead of replacing them
import 'react'

declare module 'react' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- module augmentation needs an interface
  interface CSSProperties {
    [property: `--${string}`]: string | number
  }
}
