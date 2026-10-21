import { strToU8, zipSync } from 'fflate';
import type { MeshData } from '../types';
import { validateMesh } from '../geometry';
import { assertMesh, LIMITS, requireCondition as check } from '../io/validation';
import { assertVertexFans } from './manifold';

const xml = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
const prefix = '<?xml version="1.0" encoding="UTF-8"?>';
/** 3MF Core/OPC geometry export; appearance is explicitly excluded in metadata. */
export function export3MF(mesh: MeshData): Blob {
  assertMesh(mesh);
  const report = validateMesh(mesh);
  check(report.degenerateTriangles === 0, '3MF: zdegenerowany trójkąt.');
  check(report.watertight && report.signedVolume > 0 && report.triangles >= 4, '3MF model wymaga zamkniętej siatki manifold z dodatnią objętością; napraw geometrię lub wygeneruj powłokę.');
  assertVertexFans(mesh.indices, mesh.positions.length / 3);
  // Bound worst-case XML before building large string arrays/compression buffers.
  check(mesh.positions.length / 3 * 160 + mesh.indices.length / 3 * 96 < LIMITS.bytes, '3MF: limit rozmiaru dokumentu XML.');
  const vertices: string[] = []; const triangles: string[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) vertices.push(`<vertex x="${mesh.positions[i]}" y="${mesh.positions[i + 1]}" z="${mesh.positions[i + 2]}"/>`);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    triangles.push(`<triangle v1="${mesh.indices[i]}" v2="${mesh.indices[i + 1]}" v3="${mesh.indices[i + 2]}"/>`);
  }
  const model = `${prefix}<model unit="millimeter" xml:lang="pl-PL" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${xml(mesh.name)}</metadata><metadata name="Application">OrthoSculpt CAD</metadata>${mesh.source === 'synthetic' ? '<metadata name="Designer">SYNTHETIC — dane syntetyczne, nie skan pacjenta</metadata>' : ''}<metadata name="Description">Research only / model badawczy. Geometry only: source RGB, UV and textures are retained in the project, not this manufacturing export. Units must be confirmed by operator. No collision, strength, fatigue or clinical validation.</metadata><resources><object id="1" type="model"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  const bytes = strToU8(model); check(bytes.length <= LIMITS.bytes, '3MF: limit XML.');
  const zip = zipSync({
    '[Content_Types].xml': strToU8(`${prefix}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`),
    '_rels/.rels': strToU8(`${prefix}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/></Relationships>`),
    '3D/3dmodel.model': bytes,
  }, { level: 6 });
  return new Blob([zip.buffer as ArrayBuffer], { type: 'model/3mf' });
}
export const manufacturingAvailability = Object.freeze({
  adapter: Object.freeze({ available: false, reason: 'Brak geometrii producenta adaptera piramidowego, danych kompatybilności i walidacji wytrzymałości/zmęczenia. Wytwarzanie zablokowane.' }),
  cnc: Object.freeze({ available: false, reason: 'Brak profilu maszyny, narzędzia, mocowania i zweryfikowanego postprocesora. Nie generujemy kodu G gotowego do obróbki.' }),
});
