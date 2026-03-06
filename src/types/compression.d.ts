// CompressionStream / DecompressionStream are available in modern browsers
// but not yet in all TypeScript DOM lib versions.
declare class CompressionStream {
  constructor(format: 'gzip' | 'deflate' | 'deflate-raw');
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

declare class DecompressionStream {
  constructor(format: 'gzip' | 'deflate' | 'deflate-raw');
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}
