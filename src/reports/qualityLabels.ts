// Presentation labels only. Geometry/JSON IDs and raw algorithm evidence stay unchanged.
export const qualityLabels: Record<string, readonly [string, string]> = {
  'edge-manifold': ['Rozmaitość krawędzi', 'Najwyżej dwie ściany przy każdej krawędzi.'],
  watertight: ['Domknięcie krawędzi', 'Brak brzegów nie dowodzi braku samoprzecięć.'],
  'vertex-manifold': ['Rozmaitość wierzchołków', 'Jedno spójne otoczenie każdego wierzchołka.'],
  components: ['Spójność powierzchni', 'Jedna część połączona wspólnymi krawędziami.'],
  'degenerate-triangles': ['Niezdegenerowane trójkąty', 'Kontrola ścian o zerowym lub zbyt małym polu.'],
  winding: ['Spójność kolejności wierzchołków', 'Zgodny zwrot sąsiednich ścian.'],
  'self-intersections': ['Samoprzecięcia w 3D', 'Kontrola przecięć w granicach budżetu obliczeń.'],
  outward: ['Orientacja na zewnątrz', 'Rozstrzygnięcie zwrotu wymaga poprawnej zamkniętej powierzchni.'],
  'minimum-thickness': ['Minimalna grubość', 'Nie obliczono; offset normalny nie jest gwarancją grubości.'],
};
