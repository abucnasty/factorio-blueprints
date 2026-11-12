// The only runtime globals the core may use: ones that browsers, Electron,
// Node 18+ and Cloudflare Workers all provide. tsconfig.core.json uses this
// instead of the DOM library, so anything else fails the type check.

declare function atob(data: string): string;
declare function btoa(data: string): string;

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  decode(input?: Uint8Array): string;
}
