/**
 * Ambient module declaration — lets TypeScript resolve static image
 * imports (e.g. `import logo from './assets/logo.png'`) to the same
 * `StaticImageData` shape that Next.js produces at build time.
 *
 * Without this declaration, @fmksa/brand's theme files cannot type-check
 * in a tsc --noEmit pass because the image loader lives in Next.js'
 * webpack/turbopack config, not in TypeScript's module resolution.
 */
declare module '*.png' {
  const value: import('next/image').StaticImageData;
  export default value;
}

declare module '*.jpg' {
  const value: import('next/image').StaticImageData;
  export default value;
}

declare module '*.jpeg' {
  const value: import('next/image').StaticImageData;
  export default value;
}

declare module '*.webp' {
  const value: import('next/image').StaticImageData;
  export default value;
}

declare module '*.avif' {
  const value: import('next/image').StaticImageData;
  export default value;
}
