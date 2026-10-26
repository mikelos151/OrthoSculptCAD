import { polishDiagnostic } from "./diagnostics";
import type { SliceResult } from "../types";
export const number = (value: number, digits = 1) =>
  Number.isFinite(value)
    ? value.toLocaleString("pl-PL", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      })
    : "—";
export function SectionView({ slice, reference = null }: { slice: SliceResult | null; reference?: SliceResult | null }) {
  const paired = slice && reference && slice.z === reference.z ? reference : null;
  const points = [...(slice?.loops.flatMap(loop => loop.points) ?? []), ...(paired?.loops.flatMap(loop => loop.points) ?? [])];
  const extent = points.reduce(
    (box, point) => ({
      minX: Math.min(box.minX, point[0]),
      minY: Math.min(box.minY, point[1]),
      maxX: Math.max(box.maxX, point[0]),
      maxY: Math.max(box.maxY, point[1]),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const { minX, minY, maxX, maxY } = points.length
    ? extent
    : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const margin = Math.max(maxX - minX, maxY - minY, 1) * 0.15;
  return (
    <div className="section-view">
      <div className="section-view-heading">
        <span>PRZEKRÓJ XY</span>
        <span>{slice ? `Z ${number(slice.z)} mm` : "Brak przekroju"}</span>
      </div>
      <svg
        viewBox={`${minX - margin} ${minY - margin} ${maxX - minX + 2 * margin} ${maxY - minY + 2 * margin}`}
        role="img"
        aria-label="Rzeczywisty przekrój poprzeczny modelu"
      >
        <g transform={`translate(0 ${minY + maxY}) scale(1 -1)`}>
          {paired?.loops.map((loop, i) => loop.closed ? <polygon className="reference-contour" key={`ref-${i}`} points={loop.points.map(point => point.join(',')).join(' ')} /> : <polyline className="reference-contour" key={`ref-${i}`} points={loop.points.map(point => point.join(',')).join(' ')} />)}
          {slice?.loops.map((loop, i) =>
            loop.closed ? (
              <polygon
                key={i}
                points={loop.points.map((p) => p.join(",")).join(" ")}
              />
            ) : (
              <polyline
                key={i}
                points={loop.points.map((p) => p.join(",")).join(" ")}
              />
            ),
          )}
        </g>
      </svg>
      {paired && <div className="comparison-legend"><span>CAD — mięta</span><span>Referencja robocza — bursztyn</span><p>{slice?.valid && paired.valid ? `Δ obwodu: ${number(slice.perimeter - paired.perimeter)} mm · ref ${number(paired.perimeter)} mm` : 'Różnica niedostępna — co najmniej jeden kontur jest nieważny.'}</p></div>}
      {!slice && <p className="muted">Wybierz wysokość na modelu.</p>}
      {slice && !slice.valid && (
        <p className="warning-text">
          Nieważny pomiar:{" "}
          {slice.warnings.map(polishDiagnostic).join(" · ") ||
            "kontur nie jest zamknięty"}
        </p>
      )}
      {slice?.valid && (
        <div className="section-metrics">
          <div>
            <small>Obwód</small>
            <strong>
              {number(slice.perimeter)} <em>mm</em>
            </strong>
          </div>
          <div>
            <small>Pole</small>
            <strong>
              {number(slice.area)} <em>mm²</em>
            </strong>
          </div>
          <div>
            <small>AP</small>
            <strong>
              {number(slice.ap)} <em>mm</em>
            </strong>
          </div>
          <div>
            <small>ML</small>
            <strong>
              {number(slice.ml)} <em>mm</em>
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}
