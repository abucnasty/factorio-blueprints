// Blueprint string codec, as defined in _tools/docs/conventions.md.
//
//   decode: drop the version byte ("0"), base64, zlib-inflate, UTF-8, JSON
//   encode: compact JSON, zlib-deflate level 9, base64, prefix "0"
//
// Pure: only fflate plus globals that exist in browsers, Electron, Node and
// Cloudflare Workers (atob, btoa, TextEncoder, TextDecoder).

import { unzlibSync, zlibSync } from "fflate";

export const SUPPORTED_VERSION_BYTE = "0";

export type BlueprintStringErrorCode =
  | "empty" // nothing to decode
  | "not-a-blueprint-string" // not shaped like a blueprint string at all
  | "unsupported-version" // looks like one, but the version byte is not 0
  | "corrupt" // right shape, but base64, zlib, UTF-8 or JSON is broken
  | "not-a-blueprint"; // valid data, but not a blueprint, book or planner

export class BlueprintStringError extends Error {
  readonly code: BlueprintStringErrorCode;
  constructor(code: BlueprintStringErrorCode, message: string) {
    super(message);
    this.name = "BlueprintStringError";
    this.code = code;
  }
}

export interface DecodedString {
  /** The parsed JSON value. */
  value: unknown;
  /** The decoded JSON text exactly as it was inside the string. */
  json: string;
}

const SHAPE = /^[0-9][A-Za-z0-9+/]+={0,2}$/;

/** Decode a blueprint string. Whitespace anywhere in the input is ignored. */
export function decodeBlueprintString(input: string): DecodedString {
  const s = input.replace(/\s+/g, "");
  if (s.length === 0) {
    throw new BlueprintStringError("empty", "There is no text to decode.");
  }
  if (!SHAPE.test(s) || s.length < 8) {
    throw new BlueprintStringError(
      "not-a-blueprint-string",
      "The text is not a Factorio blueprint string.",
    );
  }
  if (s[0] !== SUPPORTED_VERSION_BYTE) {
    throw new BlueprintStringError(
      "unsupported-version",
      `Unsupported blueprint string version "${s[0]}" (only "${SUPPORTED_VERSION_BYTE}" is supported).`,
    );
  }

  let compressed: Uint8Array;
  try {
    compressed = base64ToBytes(s.slice(1));
  } catch {
    throw new BlueprintStringError("corrupt", "The blueprint string is not valid base64.");
  }

  let raw: Uint8Array;
  try {
    raw = unzlibSync(compressed);
  } catch (e) {
    throw new BlueprintStringError(
      "corrupt",
      `The blueprint string data is corrupt (zlib: ${errorText(e)}).`,
    );
  }
  if (compressed.length < 6 || readUint32BE(compressed, compressed.length - 4) !== adler32(raw)) {
    throw new BlueprintStringError("corrupt", "The blueprint string data is corrupt (checksum mismatch).");
  }

  let json: string;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new BlueprintStringError("corrupt", "The blueprint string data is not valid UTF-8.");
  }

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (e) {
    throw new BlueprintStringError("corrupt", `The blueprint string data is not valid JSON (${errorText(e)}).`);
  }
  return { value, json };
}

/** Encode a JSON value as a blueprint string. */
export function encodeBlueprintString(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("Value cannot be encoded as JSON.");
  const compressed = zlibSync(new TextEncoder().encode(json), { level: 9 });
  return SUPPORTED_VERSION_BYTE + bytesToBase64(compressed);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(""));
}

function readUint32BE(b: Uint8Array, at: number): number {
  return ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  const NMAX = 5552; // largest n with no 32-bit overflow before the modulo
  for (let i = 0; i < data.length; ) {
    const end = Math.min(i + NMAX, data.length);
    for (; i < end; i++) {
      a += data[i]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
