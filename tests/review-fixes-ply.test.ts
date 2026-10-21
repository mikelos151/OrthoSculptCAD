import { expect, it } from "vitest";
import { parsePLY } from "../src/io/ply";

function header(format: string, lists: boolean[]) {
  return `ply\nformat ${format} 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\n${["red", "green", "blue"].map((name, i) => `property ${lists[i] ? "list uchar " : ""}uchar ${name}`).join("\n")}\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n`;
}

it("rejects complete ASCII list RGB instead of silently importing black", () => {
  const text = header("ascii", [true, true, true]) +
    "0 0 0 1 255 1 0 1 0\n1 0 0 1 0 1 255 1 0\n0 1 0 1 0 1 0 1 255\n3 0 1 2\n";
  expect(() => parsePLY(new TextEncoder().encode(text))).toThrow(/RGB.*skalar/i);
});

it.each(["ascii", "binary_little_endian", "binary_big_endian"])("rejects list or mixed RGB in the %s header before allocating/reading the body", format => {
  for (const lists of [[true, true, true], [false, true, false]])
    expect(() => parsePLY(new TextEncoder().encode(header(format, lists)))).toThrow(/RGB.*skalar/i);
});

it("preserves valid scalar uchar RGB in ASCII", () => {
  const text = header("ascii", [false, false, false]) + "0 0 0 255 0 0\n1 0 0 0 255 0\n0 1 0 0 0 255\n3 0 1 2\n";
  expect(Array.from(parsePLY(new TextEncoder().encode(text)).colors!)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

it.each(["binary_little_endian", "binary_big_endian"])("preserves valid scalar uchar RGB in %s", format => {
  const prefix = new TextEncoder().encode(header(format, [false, false, false]));
  const bytes = new Uint8Array(prefix.length + 3 * 15 + 13);
  bytes.set(prefix);
  const view = new DataView(bytes.buffer), little = format === "binary_little_endian";
  let offset = prefix.length;
  for (let v = 0; v < 3; v++) {
    for (const value of v === 0 ? [0, 0, 0] : v === 1 ? [1, 0, 0] : [0, 1, 0]) {
      view.setFloat32(offset, value, little); offset += 4;
    }
    for (let channel = 0; channel < 3; channel++) bytes[offset++] = channel === v ? 255 : 0;
  }
  bytes[offset++] = 3;
  for (let v = 0; v < 3; v++) { view.setInt32(offset, v, little); offset += 4; }
  expect(Array.from(parsePLY(bytes).colors!)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
});
