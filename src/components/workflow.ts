import type { BrushMode, MeasurementRow, TapePoint } from "../types";
export function clampBrushStrength(mode: BrushMode, value: number): number {
  return Number.isFinite(value)
    ? Math.max(0.1, Math.min(mode === "smooth" ? 1 : 3, value))
    : 0.1;
}
export function validTape(
  zInput: string,
  circumferenceInput: string,
  rows: MeasurementRow[],
): TapePoint | null {
  if (!zInput.trim()) return null;
  const z = Number(zInput.replace(",", "."));
  const circumference = parsePositive(circumferenceInput);
  return Number.isFinite(z) &&
    circumference !== null &&
    rows.some((row) => row.valid && Math.abs(row.z - z) < 0.001)
    ? { z, circumference }
    : null;
}
export function projectFileSizeAllowed(bytes: number): boolean {
  return Number.isSafeInteger(bytes) && bytes > 0 && bytes <= 128 * 1024 * 1024;
}
export type Unit = "mm" | "cm" | "m";
export function unitScale(unit: Unit): number {
  return { mm: 1, cm: 10, m: 1000 }[unit];
}
export function canEnterStep(
  step: number,
  hasMesh: boolean,
  unitsConfirmed: boolean,
): boolean {
  return (
    step === 0 ||
    (Number.isInteger(step) &&
      step > 0 &&
      step < 5 &&
      hasMesh &&
      unitsConfirmed)
  );
}
export function parsePositive(input: string): number | null {
  const value = Number(input.trim().replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}
