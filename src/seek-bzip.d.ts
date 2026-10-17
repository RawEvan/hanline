declare module 'seek-bzip' {
  const bunzip: { decode(input: Uint8Array): Uint8Array | null }
  export default bunzip
}
