// Blueprint string codec, as defined in the repo's conventions: version byte "0" + base64 + zlib.
import zlib from "node:zlib";

/**
 * Decode a blueprint string to its JSON value. Whitespace (line breaks from copy and paste) is ignored.
 * @param {string} text
 * @returns {any}
 */
export function decodeBlueprintString(text) {
    const compact = text.replace(/\s+/g, "");
    if (!compact) throw new Error("The blueprint string is empty");
    if (compact[0] !== "0") throw new Error(`Unsupported blueprint string version byte "${compact[0]}" (expected "0")`);
    const body = compact.slice(1);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body)) throw new Error("The blueprint string is not valid base64");
    let json;
    try {
        json = zlib.inflateSync(Buffer.from(body, "base64")).toString("utf8");
    } catch (error) {
        throw new Error(`The blueprint string does not inflate: ${error.message}`);
    }
    return JSON.parse(json);
}

/**
 * Encode a JSON value as a blueprint string: compact JSON, zlib level 9, base64, prefix "0".
 * @param {any} value
 * @returns {string}
 */
export function encodeBlueprintString(value) {
    return "0" + zlib.deflateSync(Buffer.from(JSON.stringify(value), "utf8"), { level: 9 }).toString("base64");
}
