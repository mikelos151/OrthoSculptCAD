import { expect, it } from "vitest";
import { polishDiagnostic } from "../src/components/diagnostics";
it("translates actionable geometry failures without hiding unknown diagnostics", () => {
  expect(polishDiagnostic("Open contour")).toBe("Otwarty kontur przekroju.");
  expect(polishDiagnostic("Open boundary edges")).toBe(
    "Siatka ma otwarte krawędzie brzegowe.",
  );
  expect(
    polishDiagnostic(
      "Incompatible landmark chirality/laterality: right-handed X lateral / Y anterior / Z proximal required; no automatic reflection",
    ),
  ).toContain("prawoskrętnego");
  expect(polishDiagnostic("Unexpected native fault 17")).toBe(
    "Unexpected native fault 17",
  );
});
