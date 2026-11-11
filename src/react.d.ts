// oxlint-disable-next-line import/no-unassigned-import -- makes this a module, so the declaration below adds to React's types instead of replacing them
import 'react'

declare module 'react' {
  /** Lets `style` set CSS custom properties, such as `{ '--fill': '50%' }`, without a cast. */
  // oxlint-disable-next-line typescript/consistent-type-definitions -- module augmentation needs an interface
  interface CSSProperties {
    [property: `--${string}`]: string | number
  }
}
