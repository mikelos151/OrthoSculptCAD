import { describe, expect, it } from "vitest";
import {
  canEnterStep,
  unitScale,
  parsePositive,
  validTape,
  clampBrushStrength,
} from "../src/components/workflow";
it("clamps smoothing strength when switching from deformation brushes", () => {
  expect(clampBrushStrength("smooth", 3)).toBe(1);
  expect(clampBrushStrength("relief", 3)).toBe(3);
  expect(clampBrushStrength("compress", -1)).toBe(0.1);
  expect(clampBrushStrength("smooth", NaN)).toBe(0.1);
});
import type { MeasurementRow } from "../src/types";
const rows: MeasurementRow[] = [
  {
    z: 20,
    circumference: 270,
    ap: 80,
    ml: 90,
    area: 5500,
    segmentVolume: null,
    valid: true,
  },
];
it("accepts numeric tape only at a valid measured section", () => {
  expect(validTape("20", "280", rows)).toEqual({ z: 20, circumference: 280 });
  expect(validTape("21", "280", rows)).toBeNull();
  expect(validTape("20", "0", rows)).toBeNull();
  expect(validTape("20", "280", [{ ...rows[0], valid: false }])).toBeNull();
});
describe("workflow safety gates", () => {
  it("blocks physical operations until units are confirmed", () => {
    expect(canEnterStep(1, true, false)).toBe(false);
    expect(canEnterStep(4, true, false)).toBe(false);
    expect(canEnterStep(0, false, false)).toBe(true);
    expect(canEnterStep(2, true, true)).toBe(true);
    expect(canEnterStep(2, false, true)).toBe(false);
  });
  it("requires explicit units and rejects non-finite physical input", () => {
    expect(unitScale("mm")).toBe(1);
    expect(unitScale("cm")).toBe(10);
    expect(unitScale("m")).toBe(1000);
    expect(parsePositive("")).toBeNull();
    expect(parsePositive("Infinity")).toBeNull();
    expect(parsePositive("-2")).toBeNull();
    expect(parsePositive("27,5")).toBe(27.5);
  });
});
