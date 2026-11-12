// In-memory stand-in for the R2 binding: only the calls src/index.ts makes.

export function r2Key(oid) {
  return `${oid.slice(0, 2)}/${oid.slice(2, 4)}/${oid}`;
}

export class FakeR2 {
  constructor() {
    this.objects = new Map();
  }
  putText(oid, text) {
    this.objects.set(r2Key(oid), new TextEncoder().encode(text));
  }
  async head(key) {
    const bytes = this.objects.get(key);
    return bytes ? { size: bytes.byteLength } : null;
  }
  async get(key) {
    const bytes = this.objects.get(key);
    return bytes ? { size: bytes.byteLength, body: bytes } : null;
  }
  async put(key, body) {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    this.objects.set(key, bytes);
    return { size: bytes.byteLength };
  }
}
