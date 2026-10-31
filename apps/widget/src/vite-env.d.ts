/// <reference types="vite/client" />

declare module '*.css?inline' {
  const content: string;
  export default content;
}

declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.wav?inline' {
  const url: string;
  export default url;
}
