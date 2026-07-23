declare module '*.css';

declare module '*.rs?raw' {
  const source: string;
  export default source;
}
