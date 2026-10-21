import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, ReactElement, ChangeEvent } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Axis3D,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Cuboid,
  Download,
  FileUp,
  FolderOpen,
  Hand,
  Layers3,
  LoaderCircle,
  Maximize,
  MousePointer2,
  Move3D,
  RotateCcw,
  Ruler,
  Save,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import type {
  BrushMode,
  MeasurementRow,
  MeshData,
  SliceResult,
  TapePoint,
  Vec3,
} from "./types";
import {
  alignPCA,
  applyBrush,
  calibrateMesh,
  createDemoMesh,
  deformationColors,
  getBounds,
  measureMesh,
  registerLandmarks,
  repairMesh,
  scaleZone,
  validateMesh,
} from "./geometry";
import {
  downloadBlob,
  exportMeasurements,
  importFiles,
  loadProject,
  saveProject,
} from "./io";
import { buildShell, export3MF, exportSTL } from "./manufacturing";
import { createSliceEngine } from "./native";
import { evaluateCalibration } from "./calibrationReport";
import { Viewport } from "./components/Viewport";
import { polishDiagnostic } from "./components/diagnostics";
import { SectionView, number } from "./components/SectionView";
import { cloneMesh, scaledMesh, withMeshSource } from "./components/meshView";
import {
  canEnterStep,
  clampBrushStrength,
  parsePositive,
  projectFileSizeAllowed,
  unitScale,
  validTape,
} from "./components/workflow";
import type { Unit } from "./components/workflow";

const steps = [
  { title: "Import i kontrola", subtitle: "Skan i jednostki", icon: Upload },
  { title: "Orientacja", subtitle: "Układ anatomiczny", icon: Axis3D },
  { title: "Pomiary", subtitle: "Przekroje i kalibracja", icon: Ruler },
  {
    title: "Rektyfikacja",
    subtitle: "Kontrolowana korekta",
    icon: SlidersHorizontal,
  },
  { title: "Eksport", subtitle: "Model i dokumentacja", icon: Box },
];
const descriptions = [
  "Wczytaj powierzchnię i sprawdź jej geometrię.",
  "Ustaw osie modelu przed pomiarem i korektą.",
  "Porównaj przekroje skanu z pomiarem taśmą.",
  "Modyfikuj powierzchnię, zachowując punkt odniesienia.",
  "Przygotuj pliki do niezależnej weryfikacji.",
];
const landmarkNames = [
  "Środek ścięgna rzepki",
  "Głowa strzałki",
  "Dystalny koniec",
];
const landmarkHints = [
  "Przód · wskaż środek ścięgna poniżej rzepki",
  "Bok · wskaż głowę strzałki",
  "Dystalnie · wskaż koniec powierzchni",
];
type Engine = Awaited<ReturnType<typeof createSliceEngine>>;
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {isValidElement(children) &&
      typeof children.type === "string" &&
      ["input", "select", "textarea"].includes(children.type)
        ? cloneElement(children as ReactElement<{ "aria-label"?: string }>, {
            "aria-label":
              (children.props as { "aria-label"?: string })["aria-label"] ??
              label,
          })
        : children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Note({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <div className={`note ${warning ? "note-warning" : ""}`}>
      {warning ? <CircleHelp size={17} /> : <ShieldCheck size={17} />}
      <div>{children}</div>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState(0);
  const [mesh, setMeshState] = useState<MeshData | null>(null);
  const meshRef = useRef<MeshData | null>(null);
  const [baseline, setBaseline] = useState<Float32Array | null>(null);
  const [unitsConfirmed, setUnitsConfirmed] = useState(false);
  const [unit, setUnit] = useState<Unit>("mm");
  const [synthetic, setSynthetic] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [backend, setBackend] = useState("Inicjalizacja grafiki…");
  const [engine, setEngine] = useState<Engine | null>(null);
  const [engineStatus, setEngineStatus] = useState("Nieaktywny");
  const [sliceZ, setSliceZ] = useState(0);
  const [slice, setSlice] = useState<SliceResult | null>(null);
  const [interval, setIntervalValue] = useState(20);
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [tapes, setTapes] = useState<TapePoint[]>([]);
  const [tapeZ, setTapeZ] = useState("");
  const [tapeCircumference, setTapeCircumference] = useState("");
  const [points, setPoints] = useState<Vec3[]>([]);
  const [picking, setPicking] = useState(false);
  const [flexion, setFlexion] = useState(0);
  const [brushMode, setBrushMode] = useState<BrushMode>("relief");
  const [brushActive, setBrushActive] = useState(false);
  const [radius, setRadius] = useState(20);
  const [strength, setStrength] = useState(1);
  const [history, setHistory] = useState<MeshData[]>([]);
  const [heatmap, setHeatmap] = useState(false);
  const [zoneMin, setZoneMin] = useState(0);
  const [zoneMax, setZoneMax] = useState(0);
  const [zonePercent, setZonePercent] = useState(-3);
  const [thickness, setThickness] = useState(4);
  const [flareAngle, setFlareAngle] = useState(15);
  const [flareRadius, setFlareRadius] = useState(15);
  const [acknowledged, setAcknowledged] = useState(false);
  const [shell, setShell] = useState<MeshData | null>(null);
  const [shellWarnings, setShellWarnings] = useState<string[]>([]);
  const [showShell, setShowShell] = useState(false);
  const [fitVersion, setFitVersion] = useState(0);
  const [view, setView] = useState<"iso" | "front" | "side" | "top">("iso");
  const [wireframe, setWireframe] = useState(false);
  const [help, setHelp] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null);
  const queryToken = useRef(0);
  const report = useMemo(() => (mesh ? validateMesh(mesh) : null), [mesh]);
  const bounds = useMemo(() => (mesh ? getBounds(mesh) : null), [mesh]);
  const displayColors = useMemo(
    () =>
      mesh && baseline && heatmap
        ? deformationColors(mesh, baseline)
        : undefined,
    [mesh, baseline, heatmap],
  );
  const validRows = rows.filter((row) => row.valid);
  const pendingTape = validTape(tapeZ, tapeCircumference, rows);

  function notify(text: string, error = false) {
    setNotice({ text: polishDiagnostic(text), error });
  }
  async function run(label: string, action: () => void | Promise<void>) {
    setBusy(label);
    setNotice(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await action();
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setBusy("");
    }
  }
  function updateMesh(next: MeshData, newBaseline = false, fit = false) {
    // Validate the candidate before any state/ref is changed: failure keeps the old model.
    const nextBounds = getBounds(next);
    meshRef.current = next;
    setMeshState(next);
    setRows([]);
    setSlice(null);
    queryToken.current++;
    setShell(null);
    setShellWarnings([]);
    setShowShell(false);
    if (newBaseline) {
      setBaseline(next.positions.slice());
      setHistory([]);
      setTapes([]);
      setPoints([]);
      setPicking(false);
      setSliceZ((nextBounds.min[2] + nextBounds.max[2]) / 2);
      setZoneMin(nextBounds.min[2]);
      setZoneMax(nextBounds.max[2]);
    }
    if (fit) setFitVersion((value) => value + 1);
  }
  function remember() {
    const current = meshRef.current;
    if (!current) return;
    const snapshot = cloneMesh(current);
    setHistory((previous) => {
      // Coordinate snapshots are owned; cap history by both count and memory.
      const result = [...previous, snapshot];
      let bytes = result.reduce(
        (sum, entry) =>
          sum +
          entry.positions.byteLength +
          entry.indices.byteLength +
          (entry.colors?.byteLength ?? 0) +
          (entry.uvs?.byteLength ?? 0),
        0,
      );
      while (
        result.length > 1 &&
        (result.length > 20 || bytes > 128 * 1024 * 1024)
      ) {
        const removed = result.shift()!;
        bytes -=
          removed.positions.byteLength +
          removed.indices.byteLength +
          (removed.colors?.byteLength ?? 0) +
          (removed.uvs?.byteLength ?? 0);
      }
      return result;
    });
  }
  function install(
    next: MeshData,
    demo: boolean,
    confirmed = false,
    original?: Float32Array,
    importedTapes?: TapePoint[],
  ) {
    next = withMeshSource(next, demo);
    updateMesh(next, true, true);
    setSynthetic(next.source === "synthetic");
    setUnitsConfirmed(confirmed);
    setUnit("mm");
    setStep(0);
    setBrushActive(false);
    setHeatmap(false);
    setAcknowledged(false);
    setTapeZ("");
    setTapeCircumference("");
    if (original) setBaseline(original.slice());
    if (importedTapes) setTapes(importedTapes);
  }
  useEffect(() => {
    const url = mesh?.textureUrl;
    return () => {
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [mesh?.textureUrl]);
  useEffect(() => {
    setEngine(null);
    setEngineStatus("Nieaktywny");
    setSlice(null);
    queryToken.current++;
    if (!mesh || !unitsConfirmed || step < 2) return;
    let active = true;
    setEngineStatus("Budowanie indeksu…");
    const timer = setTimeout(() => {
      createSliceEngine(mesh)
        .then((next) => {
          if (active) {
            setEngine(next);
            setEngineStatus(
              next.kind === "rust"
                ? "Rust · lokalny indeks"
                : "TypeScript · lokalny indeks",
            );
          }
        })
        .catch((error) => {
          if (active) {
            setEngineStatus("Błąd indeksu");
            notify(String(error), true);
          }
        });
    }, 100);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mesh, unitsConfirmed, step >= 2]);
  useEffect(() => {
    const token = ++queryToken.current;
    if (!engine || (step !== 2 && step !== 3)) return;
    const timer = setTimeout(() => {
      engine
        .slice(sliceZ)
        .then((result) => {
          if (queryToken.current === token) setSlice(result);
        })
        .catch((error) => {
          if (queryToken.current === token) notify(String(error), true);
        });
    }, 35);
    return () => {
      clearTimeout(timer);
      if (queryToken.current === token) queryToken.current++;
    };
  }, [engine, sliceZ, step]);
  useEffect(() => {
    setBrushActive(false);
    setPicking(false);
  }, [step]);

  function importScan(files: File[]) {
    if (!files.length) return;
    void run("Wczytywanie skanu…", async () => {
      const result = await importFiles(files);
      install(result.mesh, false);
      setDiagnostics(result.warnings);
      notify("Skan wczytany. Potwierdź jednostki źródłowe przed pomiarem.");
    });
  }
  function loadSaved(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!projectFileSizeAllowed(file.size)) {
      notify("Projekt jest pusty lub przekracza limit 128 MiB. Nie odczytano jego zawartości.", true);
      return;
    }
    void run("Odczyt projektu…", async () => {
      const result = loadProject(await file.text());
      install(result.mesh, false, true, result.originalPositions, result.tapes);
      setDiagnostics([]);
      notify(
        "Wczytano lokalny projekt. Jednostki projektu: mm; punkt odniesienia został zachowany.",
      );
    });
  }
  function demo() {
    void run("Tworzenie przykładu…", () => {
      install(createDemoMesh(), true);
      setDiagnostics([
        "Przykład matematyczny. Nie jest skanem pacjenta ani zwalidowaną geometrią kliniczną.",
      ]);
      notify("Dane syntetyczne. Potwierdź jednostki mm, aby przejść dalej.");
    });
  }
  function confirmUnits() {
    if (!mesh) return;
    void run("Przeliczanie jednostek…", () => {
      updateMesh(scaledMesh(mesh, unitScale(unit)), true, true);
      setUnitsConfirmed(true);
      notify(
        `Przeliczono geometrię na mm (×${unitScale(unit)}). To deklaracja operatora, nie automatyczne rozpoznanie jednostek.`,
      );
    });
  }
  function repair() {
    if (!mesh) return;
    void run("Analiza i naprawa…", () => {
      const result = repairMesh(mesh);
      updateMesh(result.mesh, true, true);
      setDiagnostics(result.warnings);
      notify(
        `Naprawa zakończona. Krawędzie otwarte: ${result.report.boundaryEdges}; niemanifoldowe: ${result.report.nonManifoldEdges}. Sprawdź raport — naprawa nie gwarantuje poprawności klinicznej.`,
      );
    });
  }
  function align() {
    if (!mesh) return;
    void run("Wyrównanie PCA…", () => {
      updateMesh(alignPCA(mesh), true, true);
      notify(
        "Wyrównano główne osie geometryczne. Kierunek anatomiczny wymaga potwierdzenia operatora. Nowy punkt odniesienia deformacji.",
      );
    });
  }
  function register() {
    if (!mesh || points.length !== 3) return;
    void run("Rejestracja punktów…", () => {
      updateMesh(
        registerLandmarks(
          mesh,
          { anterior: points[0], lateral: points[1], distal: points[2] },
          flexion,
        ),
        true,
        true,
      );
      notify(
        "Zarejestrowano punkty w układzie X bocznie / Y do przodu / Z proksymalnie. Ustanowiono nowy punkt odniesienia.",
      );
    });
  }
  function measure() {
    if (!mesh) return;
    void run("Obliczanie przekrojów…", () => {
      const result = measureMesh(mesh, interval);
      setRows(result);
      const first = result.find((row) => row.valid);
      if (first) setTapeZ(String(first.z));
      notify(
        `Obliczono ${result.length} przekrojów; prawidłowe: ${result.filter((row) => row.valid).length}. Tabela: obliczenia lokalne TypeScript (niezależnie od silnika interaktywnego).`,
      );
    });
  }
  function addTape() {
    if (!pendingTape) return;
    setTapes((previous) =>
      [
        ...previous.filter(
          (point) => Math.abs(point.z - pendingTape.z) > 0.001,
        ),
        pendingTape,
      ].sort((a, b) => a.z - b.z),
    );
    setTapeCircumference("");
  }
  function calibrate() {
    if (!mesh || !tapes.length) return;
    void run("Kalibracja skali…", () => {
      const controls = tapes.map((tape) => ({ ...tape }));
      const next = calibrateMesh(mesh, controls);
      const residual = evaluateCalibration(next, controls);
      if (!residual.allValid)
        throw new Error(
          "Kalibracja nie dała prawidłowych przekrojów kontrolnych. Zachowano model i pomiary taśmą.",
        );
      updateMesh(next, true, true);
      // Z is unchanged: retain the operator's independent measurement evidence.
      setTapes(controls);
      notify(
        `Skalibrowano model — przybliżona deformacja, maksymalna reszta ${number(residual.maxAbsoluteDeltaMm!, 2)} mm względem taśm. Nowy punkt odniesienia; tabela i historia zostały wyczyszczone, pomiary taśmą zachowano. Zmierz ponownie.`,
      );
    });
  }
  function brush(point: Vec3) {
    const current = meshRef.current;
    if (!current || !unitsConfirmed) return;
    try {
      updateMesh(
        applyBrush(current, {
          center: point,
          mode: brushMode,
          radius,
          strength: clampBrushStrength(brushMode, strength),
        }),
      );
    } catch (error) {
      setBrushActive(false);
      notify(String(error), true);
    }
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    updateMesh(cloneMesh(previous));
    setHistory(history.slice(0, -1));
  }
  function reset() {
    if (!mesh || !baseline) return;
    remember();
    updateMesh({ ...mesh, positions: baseline.slice() });
    notify(
      "Przywrócono powierzchnię do ostatniego punktu odniesienia po orientacji / kalibracji.",
    );
  }
  function changeZone() {
    if (!mesh || !bounds) return;
    if (
      ![zoneMin, zoneMax, zonePercent].every(Number.isFinite) ||
      zoneMin >= zoneMax ||
      zoneMin < bounds.min[2] ||
      zoneMax > bounds.max[2] ||
      zonePercent < -30 ||
      zonePercent > 30
    ) {
      notify(
        "Podaj zakres Z wewnątrz modelu, min < max, i zmianę obwodu od −30% do +30%.",
        true,
      );
      return;
    }
    void run("Korekta strefowa…", () => {
      const next = scaleZone(mesh, zonePercent, zoneMin, zoneMax);
      remember();
      updateMesh(next);
      notify(
        `Zastosowano zmianę obwodu ${zonePercent}% w strefie Z. Pomiary wymagają ponownego przeliczenia.`,
      );
    });
  }
  function generateShell() {
    if (!mesh || !acknowledged) return;
    if (
      !parsePositive(String(thickness)) ||
      !parsePositive(String(flareRadius)) ||
      !Number.isFinite(flareAngle) ||
      flareAngle < 0 ||
      flareAngle > 30
    ) {
      notify(
        "Grubość i promień muszą być dodatnie; kąt wywinięcia: 0–30°.",
        true,
      );
      return;
    }
    void run("Generowanie powłoki…", () => {
      const result = buildShell(mesh, { thickness, flareAngle, flareRadius });
      setShell(result.mesh);
      setShellWarnings(result.warnings);
      setShowShell(true);
      setFitVersion((value) => value + 1);
      notify(
        "Utworzono eksperymentalną powłokę. Wymaga niezależnej kontroli samoprzecięć, grubości i wytrzymałości.",
      );
    });
  }
  function exportFile(kind: "scan" | "stl" | "3mf" | "csv" | "project") {
    if (!mesh || !baseline || !unitsConfirmed) return;
    void run("Przygotowanie pliku…", () => {
      if (kind === "project")
        downloadBlob(
          saveProject(mesh, baseline, tapes),
          "orthosculpt-projekt.oscad.json",
        );
      else if (kind === "csv")
        downloadBlob(
          exportMeasurements(
            rows,
            tapes,
            synthetic
              ? "Dane syntetyczne — przykład demonstracyjny"
              : `Plik lokalny — ${mesh.name}`,
          ),
          synthetic
            ? "orthosculpt-pomiary-syntetyczne.csv"
            : "orthosculpt-pomiary.csv",
        );
      else if (kind === "scan")
        downloadBlob(exportSTL(mesh), "orthosculpt-skan-mm.stl");
      else if (shell && acknowledged)
        downloadBlob(
          kind === "3mf" ? export3MF(shell) : exportSTL(shell),
          `orthosculpt-powloka-eksperymentalna.${kind}`,
        );
      else
        throw new Error("Najpierw wygeneruj powłokę i potwierdź ograniczenia.");
      notify(
        "Plik przygotowany do lokalnego pobrania. Sprawdź folder pobierania przeglądarki.",
      );
    });
  }
  const currentStep = steps[step];
  const CurrentIcon = currentStep.icon;
  const canContinue =
    canEnterStep(step + 1, Boolean(mesh), unitsConfirmed) && !busy;
  const visibleMesh = step === 4 && showShell && shell ? shell : mesh;

  return (
    <div className="app-shell">
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".ply,.stl,.obj,.mtl,.png,.jpg,.jpeg"
        className="visually-hidden"
        aria-label="Wybierz skan i lokalne tekstury"
        onChange={(event) => {
          importScan(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".json,.oscad"
        className="visually-hidden"
        aria-label="Wybierz zapisany projekt"
        onChange={loadSaved}
      />
      <header className="app-header">
        <a
          className="wordmark"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setStep(0);
          }}
          aria-label="OrthoSculpt — import"
        >
          <span className="brand-symbol">
            <Layers3 size={25} strokeWidth={1.7} />
          </span>
          <span>
            Ortho<span className="brand-light">Sculpt</span>
            <sup>CAD</sup>
          </span>
        </a>
        <span className="header-divider" />
        <div className="case-label">
          <span className="eyebrow">PRZESTRZEŃ ROBOCZA</span>
          <strong>
            {mesh
              ? synthetic
                ? "Przykład demonstracyjny"
                : mesh.name
              : "Nowy projekt"}
          </strong>
        </div>
        <div className="header-actions">
          <span className="local-status">
            <i />
            Działa lokalnie <span>· offline</span>
          </span>
          <button
            className="icon-button"
            title="Otwórz projekt"
            aria-label="Otwórz projekt"
            onClick={() => projectInput.current?.click()}
            disabled={Boolean(busy)}
          >
            <FolderOpen size={19} />
          </button>
          <button
            className="header-save"
            disabled={!mesh || !unitsConfirmed || Boolean(busy)}
            onClick={() => exportFile("project")}
          >
            <Save size={17} />
            <span>Zapisz projekt</span>
          </button>
          <button
            className="icon-button"
            title="Pomoc"
            aria-label="Pomoc"
            onClick={() => setHelp(!help)}
          >
            <CircleHelp size={19} />
          </button>
        </div>
      </header>
      <div className="workspace-layout">
        <aside className="workflow-sidebar" aria-label="Etapy projektu">
          <div className="sidebar-caption">PROCES PROJEKTOWANIA</div>
          <nav>
            {steps.map((item, index) => {
              const Icon = item.icon;
              const allowed = canEnterStep(
                index,
                Boolean(mesh),
                unitsConfirmed,
              );
              return (
                <button
                  key={item.title}
                  className={`step-button ${index === step ? "active" : ""}`}
                  onClick={() => setStep(index)}
                  disabled={!allowed || Boolean(busy)}
                  aria-current={step === index ? "step" : undefined}
                >
                  <span className="step-icon">
                    <Icon size={20} />
                  </span>
                  <span className="step-copy">
                    <small>0{index + 1}</small>
                    <strong>{item.title}</strong>
                    <span>{item.subtitle}</span>
                  </span>
                  {index === step && <ChevronRight size={15} />}
                </button>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <div className="research-label">
              <Activity size={16} />
              WERSJA BADAWCZA
            </div>
            <p>
              Narzędzie inżynierskie.
              <br />
              Nie zastępuje oceny klinicznej ani walidacji wytwarzania.
            </p>
            <div className="privacy-line">
              <ShieldCheck size={15} />
              <span>Pliki pozostają na urządzeniu.</span>
            </div>
          </div>
        </aside>
        <main className="workspace-main" id="main">
          <section className="workspace-heading">
            <div>
              <div className="breadcrumb">
                Projekt <ChevronRight size={12} />{" "}
                <span>Krok 0{step + 1} / 05</span>
              </div>
              <h1>{currentStep.title}</h1>
              <p>{descriptions[step]}</p>
            </div>
            <div className="project-badge">
              {synthetic ? (
                <>
                  <span className="dot amber" />
                  Dane syntetyczne
                </>
              ) : mesh ? (
                <>
                  <span className="dot" />
                  Plik lokalny
                </>
              ) : (
                <>
                  <span className="dot neutral" />
                  Bez skanu
                </>
              )}
            </div>
          </section>
          <div className="working-area">
            <div className="visual-column">
              <section className="viewport-panel" aria-label="Widok modelu">
                <div className="viewport-toolbar">
                  <div className="viewport-title">
                    <Cuboid size={16} />
                    <span>
                      {showShell && step === 4 && shell
                        ? "Powłoka eksperymentalna"
                        : "Model powierzchniowy"}
                    </span>
                  </div>
                  <div className="view-controls">
                    <button
                      className={view === "iso" ? "selected" : ""}
                      onClick={() => {
                        setView("iso");
                        setFitVersion((value) => value + 1);
                      }}
                      title="Widok izometryczny"
                      aria-label="Widok izometryczny"
                    >
                      <Box size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setView("front");
                        setFitVersion((value) => value + 1);
                      }}
                      title="Przód"
                      aria-label="Widok z przodu"
                    >
                      PRZ
                    </button>
                    <button
                      onClick={() => {
                        setView("side");
                        setFitVersion((value) => value + 1);
                      }}
                      title="Bok"
                      aria-label="Widok z boku"
                    >
                      BOK
                    </button>
                    <button
                      className={wireframe ? "selected" : ""}
                      onClick={() => setWireframe(!wireframe)}
                      title="Siatka trójkątów"
                      aria-label="Przełącz siatkę trójkątów"
                    >
                      <ScanLine size={16} />
                    </button>
                    <span />
                    <button
                      onClick={() => setFitVersion((value) => value + 1)}
                      title="Dopasuj model"
                      aria-label="Dopasuj model do widoku"
                    >
                      <Maximize size={16} />
                    </button>
                  </div>
                </div>
                <div
                  className="viewport-stage"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!busy) importScan(Array.from(event.dataTransfer.files));
                  }}
                >
                  <Viewport
                    mesh={visibleMesh}
                    colors={visibleMesh === mesh ? displayColors : undefined}
                    markers={step === 1 ? points : []}
                    slice={
                      unitsConfirmed && (step === 2 || step === 3)
                        ? slice
                        : null
                    }
                    brushActive={step === 3 && brushActive && !busy}
                    picking={step === 1 && picking && points.length < 3}
                    fitVersion={fitVersion}
                    view={view}
                    wireframe={wireframe}
                    onBackend={setBackend}
                    onPick={(point) => {
                      if (points.length < 3)
                        setPoints((previous) =>
                          [...previous, point].slice(0, 3),
                        );
                    }}
                    onStrokeStart={remember}
                    onBrush={brush}
                  />
                  {!mesh && (
                    <div className="empty-viewport">
                      <div className="empty-crosshair">
                        <ScanLine size={42} strokeWidth={1} />
                      </div>
                      <span className="eyebrow">ZACZNIJ OD POWIERZCHNI</span>
                      <h2>Twój skan. Twoja geometria.</h2>
                      <p>
                        Upuść pliki skanu w tym obszarze
                        <br />
                        lub wybierz je z urządzenia.
                      </p>
                      <button
                        className="primary"
                        onClick={() => fileInput.current?.click()}
                        disabled={Boolean(busy)}
                      >
                        <FileUp size={18} />
                        Wczytaj skan
                        <ArrowRight size={16} />
                      </button>
                      <span className="file-formats">
                        PLY <i /> STL <i /> OBJ + tekstury
                      </span>
                      <button
                        className="text-button"
                        onClick={demo}
                        disabled={Boolean(busy)}
                      >
                        Otwórz przykład <ArrowRight size={14} />
                      </button>
                      <small>Dane syntetyczne · bez danych pacjenta</small>
                    </div>
                  )}
                  {mesh && (
                    <div className="viewport-label">
                      <span className="dot" />
                      {!unitsConfirmed
                        ? "Jednostki niepotwierdzone"
                        : step === 1 && picking
                          ? `Wskaż punkt ${Math.min(points.length + 1, 3)} z 3`
                          : brushActive && step === 3
                            ? "Pędzel aktywny · przeciągnij po powierzchni"
                            : "Perspektywa · widok 3D"}
                    </div>
                  )}
                  {mesh && heatmap && step === 3 && (
                    <div className="heatmap-legend">
                      <span>Kompresja −10 mm</span>
                      <i />
                      <span>Odciążenie +8 mm</span>
                      <small>
                        Podpisane przemieszczenie względem normalnych
                      </small>
                    </div>
                  )}
                  <div className="axis-triad" aria-label="Osie modelu">
                    <span className="axis-z">Z</span>
                    <span className="axis-y">Y</span>
                    <span className="axis-x">X</span>
                  </div>
                  {busy && (
                    <div className="busy-overlay" role="status">
                      <LoaderCircle className="spinner" size={22} />
                      {busy}
                    </div>
                  )}
                </div>
                <div className="viewport-status">
                  <span>
                    <MousePointer2 size={13} />
                    Obrót: przeciągnij <b>·</b> Zoom: kółko <b>·</b>{" "}
                    Przesunięcie: prawy przycisk
                  </span>
                  <span className="renderer-status">
                    <i />
                    {backend}
                  </span>
                </div>
              </section>
              {step === 2 && (
                <section className="measurement-table-panel">
                  <div className="panel-title">
                    <h2>Tabela przekrojów</h2>
                    <span>
                      {validRows.length} / {rows.length} prawidłowych
                    </span>
                  </div>
                  {rows.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Z · mm</th>
                            <th>Obwód · mm</th>
                            <th>AP · mm</th>
                            <th>ML · mm</th>
                            <th>Pole · mm²</th>
                            <th>Segment · cm³</th>
                            <th>Taśma · mm</th>
                            <th>Różnica</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, index) => {
                            const tape = tapes.find(
                              (point) => Math.abs(point.z - row.z) < 0.001,
                            );
                            return (
                              <tr
                                key={`${row.z}-${index}`}
                                className={!row.valid ? "invalid-row" : ""}
                                onClick={() => {
                                  setSliceZ(row.z);
                                  setTapeZ(String(row.z));
                                }}
                                title="Pokaż przekrój"
                              >
                                <td>{number(row.z)}</td>
                                <td>
                                  {row.valid
                                    ? number(row.circumference)
                                    : "Nieważny"}
                                </td>
                                <td>{row.valid ? number(row.ap) : "—"}</td>
                                <td>{row.valid ? number(row.ml) : "—"}</td>
                                <td>{row.valid ? number(row.area) : "—"}</td>
                                <td>
                                  {row.valid && row.segmentVolume !== null
                                    ? number(row.segmentVolume / 1000, 2)
                                    : "—"}
                                </td>
                                <td>
                                  {tape ? number(tape.circumference) : "—"}
                                </td>
                                <td>
                                  {tape && row.valid
                                    ? `${number((row.circumference / tape.circumference - 1) * 100)}%`
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="table-empty">
                      <Ruler size={20} />
                      Oblicz przekroje co 10 lub 20 mm, aby rozpocząć porównanie
                      z taśmą.
                    </p>
                  )}
                </section>
              )}
              {notice && (
                <div
                  className={`notification ${notice.error ? "error" : ""}`}
                  role={notice.error ? "alert" : "status"}
                >
                  {notice.error ? (
                    <CircleHelp size={18} />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  <span>{notice.text}</span>
                  <button
                    className="icon-button"
                    aria-label="Zamknij komunikat"
                    onClick={() => setNotice(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
            <aside className="inspector" aria-label="Narzędzia bieżącego kroku">
              <div className="inspector-heading">
                <CurrentIcon size={18} />
                <h2>{step === 0 ? "Kontrola wejściowa" : currentStep.title}</h2>
                <span>0{step + 1}</span>
              </div>
              <div className="inspector-content">
                {step === 0 && (
                  <>
                    <section className="inspector-section">
                      <h3>Plik źródłowy</h3>
                      <button
                        className="secondary full"
                        onClick={() => fileInput.current?.click()}
                        disabled={Boolean(busy)}
                      >
                        <Upload size={17} />
                        {mesh ? "Wczytaj inny skan" : "Wybierz pliki skanu"}
                      </button>
                      <p className="muted small">
                        PLY z RGB, STL lub OBJ. Dla OBJ zaznacz razem model, MTL
                        i wszystkie lokalne tekstury.
                      </p>
                      {mesh && (
                        <div className="filename">
                          <FileUp size={17} />
                          <span>{mesh.name}</span>
                          <CheckCircle2 size={15} />
                        </div>
                      )}
                      <button
                        className="text-button"
                        onClick={demo}
                        disabled={Boolean(busy)}
                      >
                        Użyj danych syntetycznych <ChevronRight size={14} />
                      </button>
                    </section>
                    <section className="inspector-section">
                      <div className="section-title">
                        <h3>Jednostki źródłowe</h3>
                        {unitsConfirmed && (
                          <CheckCircle2 size={16} className="mint" />
                        )}
                      </div>
                      <Field
                        label="Jednostka pliku"
                        hint={
                          unitsConfirmed
                            ? "Geometria robocza: milimetry (mm)."
                            : "Format skanu nie potwierdza fizycznej skali."
                        }
                      >
                        <select
                          value={unit}
                          onChange={(event) =>
                            setUnit(event.target.value as Unit)
                          }
                          disabled={unitsConfirmed || !mesh}
                        >
                          <option value="mm">Milimetry (mm)</option>
                          <option value="cm">Centymetry (cm)</option>
                          <option value="m">Metry (m)</option>
                        </select>
                      </Field>
                      <button
                        className={
                          unitsConfirmed ? "confirmed full" : "primary full"
                        }
                        onClick={confirmUnits}
                        disabled={!mesh || unitsConfirmed || Boolean(busy)}
                      >
                        {unitsConfirmed ? (
                          <CheckCircle2 size={17} />
                        ) : (
                          <Ruler size={17} />
                        )}
                        {unitsConfirmed
                          ? "Jednostki potwierdzone"
                          : "Potwierdź i przelicz na mm"}
                      </button>
                    </section>
                    <section className="inspector-section">
                      <h3>Diagnostyka geometrii</h3>
                      {report && bounds ? (
                        <>
                          <dl className="metrics-list">
                            <Metric
                              label="Wierzchołki"
                              value={report.vertices.toLocaleString("pl-PL")}
                            />
                            <Metric
                              label="Trójkąty"
                              value={report.triangles.toLocaleString("pl-PL")}
                            />
                            <Metric
                              label="Krawędzie otwarte"
                              value={report.boundaryEdges}
                            />
                            <Metric
                              label="Niemanifoldowe"
                              value={report.nonManifoldEdges}
                            />
                            <Metric
                              label="Zdegenerowane ściany"
                              value={report.degenerateTriangles}
                            />
                            <Metric
                              label="Niespójne krawędzie"
                              value={report.inconsistentEdges}
                            />
                            <Metric
                              label="Powierzchnia zamknięta"
                              value={report.watertight ? "Tak" : "Nie"}
                            />
                            <Metric
                              label={`Wymiary ${unitsConfirmed ? "· mm" : "· jednostki pliku"}`}
                              value={bounds.size
                                .map((value) => number(value))
                                .join(" × ")}
                            />
                          </dl>
                          <button
                            className="secondary full"
                            onClick={repair}
                            disabled={!unitsConfirmed || Boolean(busy)}
                          >
                            <SlidersHorizontal size={16} />
                            Analizuj i napraw siatkę
                          </button>
                          <div className="diagnostic-list">
                            {[...diagnostics, ...report.warnings].map(
                              (warning, index) => (
                                <p key={index}>{polishDiagnostic(warning)}</p>
                              ),
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="muted small">
                          Wczytaj model, aby sprawdzić topologię i rzeczywiste
                          wymiary.
                        </p>
                      )}
                    </section>
                    <Note>
                      Nie zgadujemy jednostek ani anatomii. Otwarty brzeg może
                      być zamierzony — sprawdź rezultat każdej naprawy.
                    </Note>
                  </>
                )}
                {step === 1 && (
                  <>
                    <section className="inspector-section">
                      <h3>01 / Wyrównanie geometryczne</h3>
                      <p className="muted small">
                        PCA ustawia główne osie kształtu. Nie rozpoznaje strony
                        kończyny ani anatomii.
                      </p>
                      <button
                        className="primary full"
                        onClick={align}
                        disabled={Boolean(busy)}
                      >
                        <Move3D size={17} />
                        Wyrównaj główne osie (PCA)
                      </button>
                    </section>
                    <section className="inspector-section">
                      <h3>02 / Punkty anatomiczne</h3>
                      <p className="muted small">
                        Wskaż kolejno trzy różne punkty na rzeczywistej
                        powierzchni. Obracaj widok prawym przyciskiem.
                      </p>
                      <ol className="landmark-list">
                        {landmarkNames.map((name, index) => (
                          <li
                            key={name}
                            className={
                              points[index]
                                ? "done"
                                : picking && points.length === index
                                  ? "current"
                                  : ""
                            }
                          >
                            <span>
                              {points[index] ? <Check size={14} /> : index + 1}
                            </span>
                            <div>
                              <strong>{name}</strong>
                              <small>
                                {points[index]
                                  ? points[index]
                                      .map((value) => number(value))
                                      .join(" / ") + " mm"
                                  : landmarkHints[index]}
                              </small>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <div className="button-row">
                        <button
                          className={picking ? "primary" : "secondary"}
                          onClick={() => setPicking(!picking)}
                          disabled={points.length === 3}
                        >
                          <MousePointer2 size={16} />
                          {picking ? "Zakończ wskazywanie" : "Wskaż punkty"}
                        </button>
                        <button
                          className="icon-button bordered"
                          aria-label="Wyczyść punkty"
                          title="Wyczyść punkty"
                          onClick={() => {
                            setPoints([]);
                            setPicking(false);
                          }}
                        >
                          <RotateCcw size={17} />
                        </button>
                      </div>
                      <Field label="Zgięcie po rejestracji">
                        <select
                          value={flexion}
                          onChange={(event) =>
                            setFlexion(Number(event.target.value))
                          }
                        >
                          <option value={0}>
                            0° — bez dodatkowego zgięcia
                          </option>
                          <option value={5}>
                            5° — opcjonalny preset operatora
                          </option>
                        </select>
                      </Field>
                      <button
                        className="primary full"
                        onClick={register}
                        disabled={points.length !== 3 || Boolean(busy)}
                      >
                        <Axis3D size={17} />
                        Zastosuj rejestrację 3 punktów
                      </button>
                    </section>
                    <Note>
                      Osie robocze: X — bocznie, Y — do przodu, Z —
                      proksymalnie. Zgięcie 5° nie jest uniwersalną rekomendacją
                      kliniczną. Rejestracja zeruje bazę mapy deformacji.
                    </Note>
                  </>
                )}
                {(step === 2 || step === 3) && (
                  <section className="inspector-section">
                    <div className="section-title">
                      <h3>Przekrój poprzeczny</h3>
                      <span className="unit-tag">mm</span>
                    </div>
                    <Field label={`Wysokość Z · ${number(sliceZ)} mm`}>
                      <input
                        aria-label="Wysokość przekroju Z"
                        type="range"
                        min={bounds?.min[2] ?? 0}
                        max={bounds?.max[2] ?? 1}
                        step="0.1"
                        value={sliceZ}
                        onChange={(event) =>
                          setSliceZ(Number(event.target.value))
                        }
                      />
                    </Field>
                    <div className="range-labels">
                      <span>{number(bounds?.min[2] ?? 0)}</span>
                      <span>{number(bounds?.max[2] ?? 0)}</span>
                    </div>
                    <SectionView slice={slice} />
                    <p className="engine-caption">
                      {engineStatus}
                      {slice
                        ? ` · zapytanie ${number(slice.queryMs, 2)} ms`
                        : ""}
                    </p>
                  </section>
                )}
                {step === 2 && (
                  <>
                    <section className="inspector-section">
                      <h3>Seria pomiarowa</h3>
                      <Field label="Odstęp między przekrojami">
                        <div className="segmented">
                          {[10, 20].map((value) => (
                            <button
                              key={value}
                              className={interval === value ? "active" : ""}
                              onClick={() => {
                                setIntervalValue(value);
                                setRows([]);
                              }}
                            >
                              {value} mm
                            </button>
                          ))}
                        </div>
                      </Field>
                      <button
                        className="primary full"
                        onClick={measure}
                        disabled={Boolean(busy)}
                      >
                        <Ruler size={17} />
                        Oblicz tabelę przekrojów
                      </button>
                      <p className="muted small">
                        Przybliżona objętość segmentu z pól przekrojów w cm³.
                        Otwarte lub niejednoznaczne kontury nie są pomiarem.
                      </p>
                    </section>
                    <section className="inspector-section">
                      <h3>Walidacja taśmą</h3>
                      <Field label="Wysokość pomiaru Z · mm">
                        <select
                          value={tapeZ}
                          onChange={(event) => setTapeZ(event.target.value)}
                        >
                          <option value="">Wybierz prawidłowy przekrój</option>
                          {validRows.map((row, index) => (
                            <option key={index} value={String(row.z)}>
                              {number(row.z)} mm
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Rzeczywisty obwód taśmą · mm">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={tapeCircumference}
                          onChange={(event) =>
                            setTapeCircumference(event.target.value)
                          }
                          placeholder="np. 285,0"
                        />
                      </Field>
                      <button
                        className="secondary full"
                        disabled={!pendingTape}
                        onClick={addTape}
                      >
                        <Check size={17} />
                        Dodaj / zastąp pomiar taśmą
                      </button>
                      {tapes.length > 0 && (
                        <div className="tape-list">
                          {tapes.map((tape) => (
                            <div key={tape.z}>
                              <span>
                                Z {number(tape.z)} →{" "}
                                <strong>{number(tape.circumference)} mm</strong>
                              </span>
                              <button
                                className="icon-button"
                                aria-label={`Usuń taśmę na Z ${tape.z}`}
                                onClick={() =>
                                  setTapes(
                                    tapes.filter((point) => point !== tape),
                                  )
                                }
                              >
                                <X size={15} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        className="primary full"
                        disabled={!tapes.length || Boolean(busy)}
                        onClick={calibrate}
                      >
                        <Maximize size={16} />
                        Kalibruj skalę z taśm
                      </button>
                      <p className="muted small">
                        Kalibracja promieniowa skaluje XY zależnie od wysokości
                        Z (bez zmiany Z) i ustala nową bazę. Wymaga ponownego
                        pomiaru; nie zastępuje kontroli metrologicznej.
                      </p>
                    </section>
                  </>
                )}
                {step === 3 && (
                  <>
                    <section className="inspector-section">
                      <div className="section-title">
                        <h3>Pędzel powierzchniowy</h3>
                        <Hand size={16} />
                      </div>
                      <div className="brush-modes">
                        {(
                          [
                            ["relief", "Odciążenie"],
                            ["compress", "Kompresja"],
                            ["smooth", "Wygładzanie"],
                          ] as const
                        ).map(([mode, label]) => (
                          <button
                            key={mode}
                            className={brushMode === mode ? "active" : ""}
                            onClick={() => {
                              setBrushMode(mode);
                              setStrength((value) =>
                                clampBrushStrength(mode, value),
                              );
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <Field label={`Promień · ${radius} mm`}>
                        <input
                          aria-label="Promień pędzla"
                          type="range"
                          min="5"
                          max="60"
                          value={radius}
                          onChange={(event) =>
                            setRadius(Number(event.target.value))
                          }
                        />
                      </Field>
                      <Field
                        label={`Siła · ${number(strength)} ${brushMode === "smooth" ? "(współczynnik)" : "mm / krok"}`}
                      >
                        <input
                          aria-label="Siła pędzla"
                          type="range"
                          min="0.1"
                          max={brushMode === "smooth" ? "1" : "3"}
                          step="0.1"
                          value={Math.min(
                            strength,
                            brushMode === "smooth" ? 1 : 3,
                          )}
                          onChange={(event) =>
                            setStrength(Number(event.target.value))
                          }
                        />
                      </Field>
                      <button
                        className={
                          brushActive ? "primary full" : "secondary full"
                        }
                        onClick={() => setBrushActive(!brushActive)}
                      >
                        <MousePointer2 size={17} />
                        {brushActive
                          ? "Wyłącz pędzel"
                          : "Włącz pędzel na modelu"}
                      </button>
                      <p className="muted small">
                        Klikaj lub przeciągaj po powierzchni. Obrót jest
                        blokowany tylko podczas pociągnięcia pędzla; prawy
                        przycisk nadal służy do nawigacji.
                      </p>
                      <div className="button-row">
                        <button
                          className="secondary"
                          onClick={undo}
                          disabled={!history.length}
                        >
                          <Undo2 size={16} />
                          Cofnij ({history.length})
                        </button>
                        <button className="secondary" onClick={reset}>
                          <RotateCcw size={16} />
                          Reset bazy
                        </button>
                      </div>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={heatmap}
                          onChange={(event) => setHeatmap(event.target.checked)}
                        />
                        <span>Podpisana mapa deformacji</span>
                      </label>
                    </section>
                    <section className="inspector-section">
                      <h3>Korekta obwodu w strefie</h3>
                      <div className="two-fields">
                        <Field label="Z min · mm">
                          <input
                            type="number"
                            value={zoneMin}
                            onChange={(event) =>
                              setZoneMin(event.target.valueAsNumber)
                            }
                          />
                        </Field>
                        <Field label="Z max · mm">
                          <input
                            type="number"
                            value={zoneMax}
                            onChange={(event) =>
                              setZoneMax(event.target.valueAsNumber)
                            }
                          />
                        </Field>
                      </div>
                      <Field
                        label="Zmiana obwodu · %"
                        hint="− kompresja / + powiększenie promieniowe"
                      >
                        <input
                          type="number"
                          min="-30"
                          max="30"
                          step="0.5"
                          value={zonePercent}
                          onChange={(event) =>
                            setZonePercent(event.target.valueAsNumber)
                          }
                        />
                      </Field>
                      <button
                        className="secondary full"
                        onClick={changeZone}
                        disabled={Boolean(busy)}
                      >
                        <SlidersHorizontal size={17} />
                        Zastosuj korektę strefy
                      </button>
                    </section>
                  </>
                )}
                {step === 4 && (
                  <>
                    <section className="inspector-section">
                      <div className="section-title">
                        <h3>Powłoka leja</h3>
                        <span className="experimental">EKSPERYMENT</span>
                      </div>
                      <Field label="Grubość ścianki · mm">
                        <input
                          type="number"
                          min="0.5"
                          max="20"
                          step="0.5"
                          value={thickness}
                          onChange={(event) => {
                            setThickness(event.target.valueAsNumber);
                            setShell(null);
                          }}
                        />
                      </Field>
                      <div className="two-fields">
                        <Field label="Wywinięcie · °">
                          <input
                            type="number"
                            min="0"
                            max="30"
                            value={flareAngle}
                            onChange={(event) => {
                              setFlareAngle(event.target.valueAsNumber);
                              setShell(null);
                            }}
                          />
                        </Field>
                        <Field label="Promień · mm">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={flareRadius}
                            onChange={(event) => {
                              setFlareRadius(event.target.valueAsNumber);
                              setShell(null);
                            }}
                          />
                        </Field>
                      </div>
                      <Note warning>
                        Powłoka normal-offset. Brak gwarancji stałej grubości,
                        braku kolizji i wytrzymałości. Nie jest zatwierdzona do
                        zastosowania klinicznego.
                      </Note>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={acknowledged}
                          onChange={(event) =>
                            setAcknowledged(event.target.checked)
                          }
                        />
                        <span>
                          Rozumiem ograniczenia i wykonam niezależną walidację
                          modelu.
                        </span>
                      </label>
                      <button
                        className="primary full"
                        onClick={generateShell}
                        disabled={!acknowledged || Boolean(busy)}
                      >
                        <Layers3 size={17} />
                        Generuj powłokę
                      </button>
                      {shellWarnings.map((warning, index) => (
                        <p className="warning-text small" key={index}>
                          {warning}
                        </p>
                      ))}
                      {shell && (
                        <>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={showShell}
                              onChange={(event) => {
                                setShowShell(event.target.checked);
                                setFitVersion((value) => value + 1);
                              }}
                            />
                            <span>Pokaż powłokę zamiast skanu</span>
                          </label>
                          <div className="button-row">
                            <button
                              className="secondary"
                              disabled={!acknowledged}
                              onClick={() => exportFile("stl")}
                            >
                              <Download size={16} />
                              STL leja
                            </button>
                            <button
                              className="secondary"
                              disabled={!acknowledged}
                              onClick={() => exportFile("3mf")}
                            >
                              <Download size={16} />
                              3MF leja
                            </button>
                          </div>
                        </>
                      )}
                    </section>
                    <section className="inspector-section">
                      <h3>Dokumentacja projektu</h3>
                      <button
                        className="export-row"
                        onClick={() => exportFile("scan")}
                      >
                        <Cuboid size={18} />
                        <span>
                          <strong>Skan po korekcie</strong>
                          <small>STL · geometria w mm · bez koloru</small>
                        </span>
                        <ArrowDownToLine size={17} />
                      </button>
                      <button
                        className="export-row"
                        disabled={!rows.length}
                        onClick={() => exportFile("csv")}
                      >
                        <Ruler size={18} />
                        <span>
                          <strong>Tabela pomiarów</strong>
                          <small>CSV · aktualne przekroje i taśmy</small>
                        </span>
                        <ArrowDownToLine size={17} />
                      </button>
                      <button
                        className="export-row"
                        onClick={() => exportFile("project")}
                      >
                        <Save size={18} />
                        <span>
                          <strong>Projekt OrthoSculpt</strong>
                          <small>JSON · wersja, geometria, baza, taśmy</small>
                        </span>
                        <ArrowDownToLine size={17} />
                      </button>
                    </section>
                    <section className="inspector-section">
                      <h3>Wytwarzanie — niedostępne</h3>
                      <div className="blocked-feature">
                        <Box size={17} />
                        <div>
                          <strong>Adapter producenta</strong>
                          <p>
                            Nie zaimplementowano. Wymagana geometria producenta,
                            zgodność interfejsu i walidacja zmęczeniowa.
                          </p>
                        </div>
                      </div>
                      <div className="blocked-feature">
                        <Activity size={17} />
                        <div>
                          <strong>Ścieżki CNC / G-code</strong>
                          <p>
                            Nie zaimplementowano. Wymagany profil maszyny,
                            narzędzia, mocowanie i symulacja kolizji.
                          </p>
                        </div>
                      </div>
                    </section>
                  </>
                )}
              </div>
            </aside>
          </div>
          <footer className="workflow-footer">
            <div className="actual-stats">
              {mesh && report ? (
                <>
                  <span className="dot" />
                  {report.vertices.toLocaleString("pl-PL")} wierzchołków
                  <span className="stat-separator">/</span>
                  {report.triangles.toLocaleString("pl-PL")} trójkątów
                  <span className="stat-separator">/</span>
                  {unitsConfirmed ? "mm" : "jednostki ?"}
                </>
              ) : (
                <>
                  <ShieldCheck size={15} />
                  Bez chmury. Bez automatycznego zapisu.
                </>
              )}
            </div>
            <div className="footer-buttons">
              {step > 0 && (
                <button
                  className="secondary"
                  disabled={Boolean(busy)}
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft size={16} />
                  Wstecz
                </button>
              )}
              {step < 4 && (
                <button
                  className="primary"
                  disabled={!canContinue}
                  onClick={() => setStep(step + 1)}
                >
                  {step === 0 && !unitsConfirmed
                    ? "Najpierw potwierdź jednostki"
                    : `Dalej: ${steps[step + 1].title}`}
                  <ArrowRight size={16} />
                </button>
              )}
              {step === 4 && (
                <span className="final-caption">
                  <CheckCircle2 size={16} />
                  Zapis i eksport wyłącznie lokalny
                </span>
              )}
            </div>
          </footer>
        </main>
      </div>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-title">
              <h2 id="help-title">Pracownia lokalna</h2>
              <button
                className="icon-button"
                aria-label="Zamknij pomoc"
                onClick={() => setHelp(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p>
              Wczytaj plik PLY / STL lub zestaw OBJ + MTL + tekstury. Zawsze
              potwierdź fizyczne jednostki źródła.
            </p>
            <p>
              Zmiana orientacji i kalibracja ustanawiają nowy punkt odniesienia
              mapy deformacji. Pędzel i korekta strefy zachowują bazę oraz
              historię cofania. Każda zmiana geometrii unieważnia pomiary i
              powłokę.
            </p>
            <p>
              Pliki nie są wysyłane na serwer. Projekt zapisujesz i otwierasz
              ręcznie. Zapis JSON zawiera geometrię, RGB i lokalne tekstury
              obsługiwane przez format projektu.
            </p>
            <Note warning>
              Wersja badawcza. Pomiary, naprawy i eksport wymagają niezależnej
              weryfikacji. Brak deklaracji zgodności regulacyjnej lub gotowości
              klinicznej.
            </Note>
            <button className="primary full" onClick={() => setHelp(false)}>
              Rozumiem
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
