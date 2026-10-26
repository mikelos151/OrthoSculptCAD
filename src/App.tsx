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
  createDemoMesh,
  getBounds,
} from "./geometry";
import {
  downloadBlob,
  exportMeasurements,
  importFiles,
  loadProject,
  saveProject,
} from "./io";
import { export3MF, exportSTL } from "./manufacturing";
import { createSliceEngine } from "./native";
import { isTauri } from "@tauri-apps/api/core";
import { runGeometryTask, createWorkerSliceEngine } from "./compute";
import type { MeshAudit } from "./geometry/auditTypes";
import type { TopologyReport } from "./types";
import { createWorkspace, appendWorkspaceEvent } from "./workspace";
import type { WorkspaceState, NewWorkspaceEvent, CaseDetails } from "./workspace/types";
import { protectProject, unprotectProject, isProtectedProject } from "./io/protectedProject";
import { buildReviewReport } from "./reports";
import { createTaskGate, createStrokeFence, workProtection, normalsUsable, changedCoordinates, strokeEvent, makeUndoSnapshot, pushUndoHistory, qualitySummary } from "./hooks/workbenchState";
import type { TaskTicket, StrokeTicket, UndoSnapshot } from "./hooks/workbenchState";
import { runDisplayTask } from "./hooks/runDisplayTask";
import { MAX_STROKE_DABS } from "./hooks/displayTask";
import { QualityPanel, WorkspacePanel } from "./components/WorkspacePanel";
import { FileProtectionDialog, ConfirmDiscardDialog, Modal } from "./components/ProjectDialogs";
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
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => createWorkspace());
  const workspaceRef = useRef(workspace);
  const [edited, setEdited] = useState(false);
  const editedRef = useRef(false);
  const [generatedRevision, setGeneratedRevision] = useState<number | null>(null);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const [fileDialog, setFileDialog] = useState<'save' | 'open' | null>(null);
  const pendingProtected = useRef<string | null>(null);
  const [fileError, setFileError] = useState('');
  const gate = useRef(createTaskGate());
  const backgroundControllers = useRef(new Set<AbortController>());
  const interactiveEngine = useRef<Engine | null>(null);
  const [checking, setChecking] = useState(false);
  const [audit, setAudit] = useState<MeshAudit | null>(null);
  const [auditedMesh, setAuditedMesh] = useState<MeshData | null>(null);
  const [report, setReport] = useState<TopologyReport | null>(null);
  const [compare, setCompare] = useState(false);
  const [referenceSlice, setReferenceSlice] = useState<SliceResult | null>(null);
  const [referenceRows, setReferenceRows] = useState<MeasurementRow[]>([]);
  const [measurementRevision, setMeasurementRevision] = useState<number | null>(null);
  const stroke = useRef<{ ticket: StrokeTicket; before: MeshData; mode: BrushMode; radius: number; strength: number; points: Vec3[] } | null>(null);
  const strokeFence = useRef(createStrokeFence());
  const projectEpoch = useRef(0);
  const protection = workProtection(edited, workspace.revision, generatedRevision);
  const normalToolsAllowed = normalsUsable(audit);
  const [step, setStep] = useState(0);
  const [mesh, setMeshState] = useState<MeshData | null>(null);
  const meshRef = useRef<MeshData | null>(null);
  // Completion belongs to this exact geometry, not a previous render's busy flag.
  const auditReady = mesh !== null && auditedMesh === mesh;
  const [baseline, setBaseline] = useState<Float32Array | null>(null);
  const [unitsConfirmed, setUnitsConfirmed] = useState(false);
  const [unit, setUnit] = useState<Unit>("mm");
  const physicalSource = useRef({ unit, unitsConfirmed });
  physicalSource.current = { unit, unitsConfirmed };
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
  const [history, setHistory] = useState<UndoSnapshot[]>([]);
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
  const bounds = useMemo(() => (mesh ? getBounds(mesh) : null), [mesh]);
  const referenceMesh = useMemo(() => mesh && baseline ? { ...mesh, positions: baseline } : null, [mesh, baseline]);
  const [displayColors, setDisplayColors] = useState<Float32Array | undefined>();
  const validRows = rows.filter((row) => row.valid);
  const pendingTape = validTape(tapeZ, tapeCircumference, rows);

  function notify(text: string, error = false) {
    setNotice({ text: polishDiagnostic(text), error });
  }
  function strokeSource() {
    return { projectEpoch: projectEpoch.current, revision: workspaceRef.current.revision, mesh: meshRef.current, ...physicalSource.current };
  }
  function abortStroke() {
    const recording = Boolean(stroke.current);
    stroke.current = null;
    strokeFence.current.cancel();
    if (recording) {
      setBrushActive(false);
      notify('Anulowano niezakończone pociągnięcie. Geometria i historia gestu nie zostały zmienione.');
    }
  }
  function publishWorkspace(next: WorkspaceState, dirty = true) {
    abortStroke();
    workspaceRef.current = next;
    setWorkspace(next);
    editedRef.current = dirty;
    setEdited(dirty);
  }
  function journal(event: NewWorkspaceEvent) {
    const previousRevision = workspaceRef.current.revision;
    const next = appendWorkspaceEvent(workspaceRef.current, event);
    publishWorkspace(next);
    // Metadata and tape evidence do not change the measured geometry.
    setMeasurementRevision(current => current === previousRevision ? next.revision : null);
  }
  function guardReplacement(action: () => void) {
    if (gate.current.busy) return;
    abortStroke();
    if (editedRef.current) setDiscardAction(() => action);
    else action();
  }
  function cancelTask() {
    abortStroke();
    gate.current.cancel();
    setBusy('');
    notify('Anulowano. Spóźniony wynik nie zmieni projektu.');
  }
  async function run(label: string, action: (ticket: TaskTicket) => (() => void) | Promise<() => void>, sourceStroke?: StrokeTicket) {
    if (gate.current.busy) return;
    if (sourceStroke) {
      if (!strokeFence.current.current(sourceStroke, strokeSource())) return;
    } else abortStroke();
    const ticket = gate.current.begin();
    if (!ticket) return;
    backgroundControllers.current.forEach(controller => controller.abort());
    interactiveEngine.current?.dispose?.();
    setBusy(label);
    setNotice(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!gate.current.current(ticket)) return;
      const commit = await action(ticket);
      if (gate.current.current(ticket)) commit();
    } catch (error) {
      if (gate.current.current(ticket)) notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      if (sourceStroke) strokeFence.current.finish(sourceStroke);
      if (gate.current.current(ticket)) {
        gate.current.finish(ticket);
        setBusy('');
      }
    }
  }
  function updateMesh(next: MeshData, newBaseline = false, fit = false) {
    // Validate the candidate before any state/ref is changed: failure keeps the old model.
    const nextBounds = getBounds(next);
    abortStroke();
    meshRef.current = next;
    setMeshState(next);
    setRows([]);
    setReferenceRows([]);
    setMeasurementRevision(null);
    setAuditedMesh(null);
    setAudit(null);
    setReport(null);
    setHeatmap(false);
    setDisplayColors(undefined);
    setReferenceSlice(null);
    setSlice(null);
    queryToken.current++;
    setShell(null);
    setShellWarnings([]);
    setShowShell(false);
    if (newBaseline) {
      setBaseline(next.positions.slice());
      setTapes([]);
      setPoints([]);
      setPicking(false);
      setSliceZ((nextBounds.min[2] + nextBounds.max[2]) / 2);
      setZoneMin(nextBounds.min[2]);
      setZoneMax(nextBounds.max[2]);
    }
    if (fit) setFitVersion((value) => value + 1);
  }
  function remember(current = meshRef.current) {
    if (!current) return;
    const snapshot = makeUndoSnapshot({ mesh: current, baseline, tapes, unit, unitsConfirmed });
    setHistory(previous => pushUndoHistory(previous, snapshot));
  }
  function editMesh(next: MeshData, event: NewWorkspaceEvent, newBaseline = false, fit = false) {
    getBounds(next);
    const nextWorkspace = appendWorkspaceEvent(workspaceRef.current, event);
    remember();
    updateMesh(next, newBaseline, fit);
    publishWorkspace(nextWorkspace);
  }
  function install(
    next: MeshData,
    demo: boolean,
    confirmed = false,
    original?: Float32Array,
    importedTapes?: TapePoint[],
    importedWorkspace?: WorkspaceState,
  ) {
    next = withMeshSource(next, demo);
    getBounds(next);
    abortStroke();
    projectEpoch.current++;
    const nextWorkspace = importedWorkspace ?? appendWorkspaceEvent(createWorkspace(), { kind: confirmed ? 'migration' : 'import', label: confirmed ? 'Import v1 — wcześniejsza historia nieznana' : demo ? 'Import danych syntetycznych' : 'Import skanu', parameters: { source: next.source ?? 'imported' }, registration: null });
    updateMesh(next, true, true);
    publishWorkspace(nextWorkspace, !confirmed);
    setGeneratedRevision(null);
    setHistory([]);
    stroke.current = null;
    setCompare(false);
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
    const onUnload = (event: BeforeUnloadEvent) => {
      if (editedRef.current || gate.current.busy || stroke.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [protection.guard]);
  useEffect(() => () => gate.current.cancel(), []);
  useEffect(() => {
    if (!mesh || stroke.current || busy) { setChecking(false); return; }
    // A download suspends engines, not the completed audit of unchanged geometry.
    if (auditReady) { setChecking(false); return; }
    const controller = new AbortController();
    backgroundControllers.current.add(controller);
    setChecking(true);
    const timer = setTimeout(() => {
      void (async () => {
        const topology = await runGeometryTask('topology', { mesh }, { signal: controller.signal });
        const quality = await runGeometryTask('analyze', { mesh }, { signal: controller.signal });
        if (!controller.signal.aborted) { setReport(topology); setAudit(quality); setAuditedMesh(mesh); };
      })().catch(error => { if (!controller.signal.aborted) notify(String(error), true); }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    }, 80);
    return () => { clearTimeout(timer); controller.abort(); backgroundControllers.current.delete(controller); };
  }, [mesh, busy, auditReady]);
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
    if (!mesh || !unitsConfirmed || step < 2 || stroke.current || busy || checking || !auditReady) return;
    const controller = new AbortController();
    backgroundControllers.current.add(controller);
    let active = true;
    let owned: Engine | null = null;
    setEngineStatus("Budowanie indeksu…");
    const timer = setTimeout(() => {
      (isTauri() ? createSliceEngine(mesh) : createWorkerSliceEngine(mesh, { signal: controller.signal }))
        .then((next) => {
          owned = next;
          interactiveEngine.current = next;
          if (!active) { next.dispose?.(); return; }
          if (active) {
            setEngine(next);
            setEngineStatus(
              next.kind === "rust"
                ? "Rust · lokalny indeks"
                : next.kind === 'worker' ? 'Web Worker · lokalny indeks' : "TypeScript · tryb testowy",
            );
          }
        })
        .catch((error) => {
          if (active && !controller.signal.aborted) {
            setEngineStatus("Błąd indeksu");
            notify(String(error), true);
          }
        });
    }, 100);
    return () => {
      active = false;
      owned?.dispose?.();
      controller.abort();
      backgroundControllers.current.delete(controller);
      clearTimeout(timer);
    };
  }, [mesh, unitsConfirmed, step >= 2, busy, checking, auditReady]);
  useEffect(() => {
    setReferenceSlice(null);
    if (!referenceMesh || !compare || (step !== 2 && step !== 3) || stroke.current || busy || checking || !auditReady) return;
    const controller = new AbortController();
    backgroundControllers.current.add(controller);
    let active = true;
    let owned: Awaited<ReturnType<typeof createWorkerSliceEngine>> | null = null;
    void createWorkerSliceEngine(referenceMesh, { signal: controller.signal }).then(async next => {
      owned = next;
      if (!active) { next.dispose?.(); return; }
      const result = await next.slice(sliceZ);
      if (active) setReferenceSlice(result);
    }).catch(error => { if (active) notify(String(error), true); });
    return () => { active = false; controller.abort(); owned?.dispose(); backgroundControllers.current.delete(controller); };
  }, [referenceMesh, compare, sliceZ, step, busy, checking, auditReady]);
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
          if (queryToken.current === token && !gate.current.busy) notify(String(error), true);
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
    abortStroke();
  }, [step]);

  function importScan(files: File[]) {
    if (!files.length) return;
    guardReplacement(() => void run('Wczytywanie skanu…', async () => {
      const result = await importFiles(files);
      return () => { install(result.mesh, false); setDiagnostics(result.warnings); notify('Skan wczytany. Potwierdź jednostki źródłowe przed pomiarem.'); };
    }));
  }
  function installProject(result: ReturnType<typeof loadProject>) {
    install(result.mesh, false, true, result.originalPositions, result.tapes, result.workspace);
    setDiagnostics([]);
    notify(result.workspace ? 'Wczytano projekt i dziennik. Cofanie wcześniejszej sesji nie jest dostępne.' : 'Wczytano v1. Historia wcześniejsza jest nieznana; orientacja niepotwierdzona.');
  }
  function loadSaved(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!projectFileSizeAllowed(file.size)) {
      notify('Projekt jest pusty lub przekracza limit odczytu. Nie odczytano zawartości.', true);
      return;
    }
    guardReplacement(() => void run('Odczyt projektu…', async () => {
      const text = await file.text();
      if (isProtectedProject(text)) return () => { pendingProtected.current = text; setFileError(''); setFileDialog('open'); };
      // Fully validate before the publication closure is allowed to run.
      const result = loadProject(text);
      return () => installProject(result);
    }));
  }
  function demo() {
    guardReplacement(() => void run('Tworzenie przykładu…', () => {
      const next = createDemoMesh();
      return () => { install(next, true); setDiagnostics(['Przykład matematyczny. Nie jest skanem pacjenta ani zwalidowaną geometrią kliniczną.']); notify('Dane syntetyczne. Potwierdź jednostki mm, aby przejść dalej.'); };
    }));
  }
  function newProject() {
    guardReplacement(() => {
      abortStroke();
      projectEpoch.current++;
      gate.current.cancel(); meshRef.current = null; setMeshState(null); setAuditedMesh(null); setBaseline(null); setHistory([]); setTapes([]); setRows([]); setReferenceRows([]); setAudit(null); setReport(null); setSlice(null); setReferenceSlice(null); setUnitsConfirmed(false); setStep(0); setShell(null); setHeatmap(false); setBrushActive(false); setPoints([]); setPicking(false); setCompare(false); setSynthetic(false); setGeneratedRevision(null); publishWorkspace(createWorkspace(), false); setNotice(null); setDiagnostics([]); setTapeZ(''); setTapeCircumference(''); setMeasurementRevision(null); setShellWarnings([]); setShowShell(false); setAcknowledged(false);
    });
  }
  function changeCase(details: CaseDetails) {
    if (gate.current.busy) return;
    try {
      journal({ kind: 'case-update', label: 'Dane techniczne przypadku', caseDetails: details });
      if (details.side !== workspace.caseDetails.side) { setPoints([]); setPicking(false); notify('Zmieniono stronę. Rejestracja unieważniona; geometria nie została odbita.'); }
    } catch (error) { notify(String(error), true); }
  }
  function confirmUnits() {
    if (!mesh) return;
    void run("Przeliczanie jednostek…", () => {
      const next = scaledMesh(mesh, unitScale(unit));
      return () => {
        editMesh(next, { kind: 'units', label: 'Potwierdzenie jednostek', parameters: { sourceUnit: unit, scale: unitScale(unit) }, registration: null }, true, true);
        setUnitsConfirmed(true);
        notify(`Przeliczono geometrię na mm (×${unitScale(unit)}). Deklaracja operatora, nie automatyczne rozpoznanie.`);
      };
    });
  }
  function repair() {
    if (!mesh) return;
    void run('Analiza i naprawa…', async ticket => {
      const result = await runGeometryTask('repair', { mesh }, ticket);
      return () => { editMesh(result.mesh, { kind: 'repair', label: 'Naprawa siatki', registration: null }, true, true); setReport(result.report); setDiagnostics(result.report.warnings); notify('Naprawa zakończona. Sprawdź aktualny audyt; nie jest to potwierdzenie przydatności klinicznej.'); };
    });
  }
  function analyze() {
    if (!mesh) return;
    void run('Kontrola jakości…', async ticket => {
      const result = await runGeometryTask('analyze', { mesh }, ticket);
      return () => { setAudit(result); notify('Audyt bieżącej geometrii zakończony. UNKNOWN nie oznacza PASS.'); };
    });
  }
  function orient() {
    if (!mesh) return;
    void run('Porządkowanie normalnych…', async ticket => {
      const result = await runGeometryTask('orient', { mesh }, ticket);
      return () => {
        if (result.changed) editMesh(result.mesh, { kind: 'orientation', label: 'Orientacja normalnych', registration: null }, true, false);
        setDiagnostics(result.warnings); notify(result.changed ? 'Zmieniono orientację ścian. Wymagany nowy audyt.' : 'Nie zmieniono geometrii. Sprawdź wynik audytu i ostrzeżenia.');
      };
    });
  }
  function align() {
    if (!mesh) return;
    void run('Wyrównanie PCA…', async ticket => {
      const next = await runGeometryTask('pca', { mesh }, ticket);
      return () => { editMesh(next, { kind: 'align-pca', label: 'Wyrównanie PCA', registration: null }, true, true); notify('Wyrównano osie geometryczne, nie anatomię. Nowa referencja robocza.'); };
    });
  }
  function register() {
    const side = workspace.caseDetails.side;
    if (!mesh || points.length !== 3 || side === 'unspecified') return;
    const landmarks: [Vec3, Vec3, Vec3] = [points[0], points[1], points[2]];
    void run('Rejestracja punktów…', async ticket => {
      const result = await runGeometryTask('register', { mesh, landmarks, flexionDegrees: flexion, side }, ticket);
      return () => {
        editMesh(result.mesh, { kind: 'register', label: 'Rejestracja anatomiczna', parameters: { side, flexionDegrees: flexion }, registration: { side, landmarks, matrix: result.matrix, flexionDegrees: flexion, sourceRevision: workspaceRef.current.revision } }, true, true);
        notify('Zarejestrowano: X ku prawej stronie pacjenta, Y do przodu, Z proksymalnie. Bez odbicia siatki. Nowa referencja robocza.');
      };
    });
  }
  function measure() {
    if (!mesh || !referenceMesh) return;
    const revision = workspaceRef.current.revision;
    void run('Obliczanie przekrojów…', async ticket => {
      const result = await runGeometryTask('measure', { mesh, interval }, ticket);
      const reference = await runGeometryTask('measureAt', { mesh: referenceMesh, heights: result.map(row => row.z) }, ticket);
      return () => {
        setRows(result); setReferenceRows(reference); setMeasurementRevision(revision);
        const first = result.find(row => row.valid); if (first) setTapeZ(String(first.z));
        notify(`Obliczono ${result.length} przekrojów; prawidłowe: ${result.filter(row => row.valid).length}. Referencja zmierzona na tych samych wysokościach Z.`);
      };
    });
  }
  function addTape() {
    if (!pendingTape || gate.current.busy) return;
    journal({ kind: 'tape-update', label: 'Dodano / zastąpiono taśmę', parameters: { zMm: pendingTape.z, circumferenceMm: pendingTape.circumference } });
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
    void run('Kalibracja skali…', async ticket => {
      const controls = tapes.map(tape => ({ ...tape }));
      const next = await runGeometryTask('calibrate', { mesh, tapes: controls }, ticket);
      const measured = await runGeometryTask('measureAt', { mesh: next, heights: controls.map(tape => tape.z) }, ticket);
      if (measured.some(row => !row.valid)) throw new Error('Kalibracja dała nieprawidłowe przekroje kontrolne. Zachowano poprzedni model.');
      const maxResidual = Math.max(...measured.map((row, i) => Math.abs(row.circumference - controls[i].circumference)));
      return () => {
        editMesh(next, { kind: 'calibrate', label: 'Kalibracja promieniowa', parameters: { tapeCount: controls.length, maxResidualMm: maxResidual } }, true, true);
        setTapes(controls);
        notify(`Skalibrowano przybliżenie. Maksymalna reszta na poziomach taśm: ${number(maxResidual, 2)} mm. Taśmy zachowano. Nowa referencja robocza; zmierz tabelę ponownie.`);
      };
    });
  }
  function beginStroke() {
    const current = meshRef.current;
    if (!current || !normalToolsAllowed || gate.current.busy || !brushActive || step !== 3) return false;
    getBounds(current);
    const ticket = strokeFence.current.begin(strokeSource());
    if (!ticket) return false;
    stroke.current = { ticket, before: cloneMesh(current), mode: brushMode, radius, strength: clampBrushStrength(brushMode, strength), points: [] };
    setHeatmap(false); setDisplayColors(undefined);
    return true;
  }
  function endStroke() {
    const active = stroke.current;
    stroke.current = null;
    if (!active) return;
    if (!active.points.length || !strokeFence.current.current(active.ticket, strokeSource())) {
      strokeFence.current.finish(active.ticket);
      return;
    }
    void run('Obliczanie całego pociągnięcia…', async ticket => {
      // Check again after run's asynchronous scheduling boundary, before dispatch.
      if (!strokeFence.current.current(active.ticket, strokeSource())) return () => {};
      getBounds(active.before);
      const result = await runDisplayTask({ kind: 'stroke', mesh: active.before, points: active.points, mode: active.mode, radius: active.radius, strength: active.strength }, ticket);
      if (result.kind !== 'stroke') throw new Error('Nieprawidłowy wynik pędzla.');
      return () => {
        // A task ticket alone does not identify the source project/mesh.
        if (!strokeFence.current.current(active.ticket, strokeSource())) return;
        if (!changedCoordinates(active.before.positions, result.mesh.positions)) { notify('Pociągnięcie nie zmieniło współrzędnych. Historia i rewizja pozostały bez zmian.'); return; }
        const event = strokeEvent(active.mode, active.radius, active.strength, result.dabCount)!;
        editMesh(result.mesh, event);
        notify(`Zastosowano pociągnięcie: ${result.dabCount} punktów. Jedna rewizja i jedna pozycja cofania.`);
      };
    }, active.ticket);
  }
  function brush(point: Vec3) {
    const active = stroke.current;
    if (!active || gate.current.busy) return;
    if (!strokeFence.current.current(active.ticket, strokeSource())) { abortStroke(); return; }

    if (active.points.length >= MAX_STROKE_DABS) {
      if (active.points.length === MAX_STROKE_DABS) notify('Osiągnięto 128 punktów. Puść przycisk, aby obliczyć tę korektę, następnie rozpocznij kolejne pociągnięcie.');
      return;
    }
    // Pointer path only records coordinates. No geometry audit or deformation here.
    active.points.push([...point]);
  }
  function toggleHeatmap(enabled: boolean) {
    if (!enabled) { setHeatmap(false); setDisplayColors(undefined); return; }
    if (!mesh || !baseline || !normalToolsAllowed || gate.current.busy) return;
    void run('Obliczanie podpisanej mapy…', async ticket => {
      const result = await runDisplayTask({ kind: 'heatmap', mesh, baseline }, ticket);
      if (result.kind !== 'heatmap') throw new Error('Nieprawidłowy wynik mapy.');
      return () => { setDisplayColors(result.colors); setHeatmap(true); };
    });
  }
  function undo() {
    if (gate.current.busy) return;
    abortStroke();
    const previous = history.at(-1);
    if (!previous || gate.current.busy) return;
    const nextWorkspace = appendWorkspaceEvent(workspaceRef.current, { kind: 'undo', label: 'Cofnięcie geometrii i referencji', registration: null });
    updateMesh(cloneMesh(previous.mesh));
    setBaseline(previous.baseline?.slice() ?? null);
    setUnitsConfirmed(previous.unitsConfirmed);
    setUnit(previous.unit);
    if (!previous.unitsConfirmed) setStep(0);
    setTapes(previous.tapes.map(tape => ({ ...tape })));
    setHistory(history.slice(0, -1));
    setPoints([]); setPicking(false);
    publishWorkspace(nextWorkspace);
  }
  function reset() {
    if (gate.current.busy) return;
    abortStroke();
    if (!mesh || !baseline || gate.current.busy) return;
    if (!changedCoordinates(mesh.positions, baseline)) { notify('Powierzchnia jest już równa referencji. Nic nie zmieniono.'); return; }
    editMesh({ ...mesh, positions: baseline.slice() }, { kind: 'reset', label: 'Przywrócenie referencji roboczej' });
    notify('Przywrócono powierzchnię do referencji po orientacji / kalibracji.');
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
    void run('Korekta strefowa…', async ticket => {
      const next = await runGeometryTask('zone', { mesh, percent: zonePercent, minZ: zoneMin, maxZ: zoneMax }, ticket);
      return () => {
        editMesh(next, { kind: 'scale-zone', label: 'Korekta obwodu w strefie', parameters: { percent: zonePercent, minZMm: zoneMin, maxZMm: zoneMax } });
        notify(`Zmieniono obwód ${zonePercent}% w strefie Z. Nie jest to procent objętości ani zalecenie kliniczne.`);
      };
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
    void run('Generowanie powłoki…', async ticket => {
      const result = await runGeometryTask('shell', { mesh, options: { thickness, flareAngle, flareRadius } }, ticket);
      return () => {
        setShell(result.mesh); setShellWarnings(result.warnings); setShowShell(true); setFitVersion(value => value + 1);
        notify('Utworzono eksperymentalną powłokę. Minimalna grubość pozostaje UNKNOWN; wymagana niezależna kontrola.');
      };
    });
  }
  function closeFileDialog() {
    if (gate.current.busy) cancelTask();
    pendingProtected.current = null; setFileDialog(null); setFileError('');
  }
  function submitFile(password: string, encrypted: boolean) {
    if (gate.current.busy) return;
    setFileError('');
    if (fileDialog === 'open') {
      const text = pendingProtected.current;
      if (!text) return;
      void run('Odszyfrowywanie projektu…', async () => {
        try {
          const plain = await unprotectProject(text, password);
          const result = loadProject(plain);
          return () => { install(result.mesh, false, true, result.originalPositions, result.tapes, result.workspace); pendingProtected.current = null; setFileDialog(null); setFileError(''); notify('Odszyfrowano projekt lokalnie. Hasło nie jest przechowywane.'); };
        } catch { return () => setFileError('Nieprawidłowe hasło lub uszkodzony plik. Poprzedni projekt pozostał bez zmian.'); }
      });
      return;
    }
    if (!mesh || !baseline) return;
    const snapshot = structuredClone(workspaceRef.current);
    void run('Przygotowanie kopii projektu…', async () => {
      try {
        const blob = saveProject(mesh, baseline, tapes, snapshot);
        const output = encrypted ? await protectProject(blob, password) : blob;
        return () => {
          downloadBlob(output, `${snapshot.caseDetails.caseCode}-r${snapshot.revision}${encrypted ? '.protected' : ''}.oscad.json`);
          setGeneratedRevision(snapshot.revision); setFileDialog(null); setFileError('');
          notify(`Pobrano kopię rewizji r${snapshot.revision}. Sprawdź plik w folderze pobierania; przeglądarka nie potwierdza trwałego zapisu na dysku.`);
        };
      } catch { return () => setFileError('Nie udało się przygotować kopii. Sprawdź długość hasła i rozmiar projektu.'); }
    });
  }
  function exportReview() {
    if (!mesh || !referenceMesh || !unitsConfirmed || gate.current.busy) return;
    if (!window.confirm('Raport HTML jest nieszyfrowany i może zawierać dane zdrowotne mimo pseudonimu. Przechowuj i przekazuj go bezpiecznie. Nie stanowi zatwierdzenia klinicznego. Pobrać?')) return;
    const snapshot = { mesh: cloneMesh(mesh), workspace: structuredClone(workspaceRef.current), tapes: tapes.map(tape => ({ ...tape })) };
    const ref = cloneMesh(referenceMesh);
    void run('Przygotowanie raportu rewizji…', async ticket => {
      const measured = await runGeometryTask('measure', { mesh: snapshot.mesh, interval }, ticket);
      const measuredReference = await runGeometryTask('measureAt', { mesh: ref, heights: measured.map(row => row.z) }, ticket);
      const quality = await runGeometryTask('analyze', { mesh: snapshot.mesh }, ticket);
      const html = await buildReviewReport({ ...snapshot, rows: measured, referenceRows: measuredReference, audit: quality, auditRevision: snapshot.workspace.revision, measurementRevision: snapshot.workspace.revision });
      return () => {
        downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${snapshot.workspace.caseDetails.caseCode}-r${snapshot.workspace.revision}-raport.html`);
        setRows(measured); setReferenceRows(measuredReference); setMeasurementRevision(snapshot.workspace.revision); setAudit(quality);
        notify(`Pobrano raport aktualnej rewizji r${snapshot.workspace.revision}. HTML do druku / PDF; nie jest certyfikatem klinicznym.`);
      };
    });
  }
  function exportFile(kind: 'scan' | 'positive3mf' | 'stl' | '3mf' | 'csv' | 'project') {
    if (!mesh || !baseline || !unitsConfirmed || gate.current.busy || stroke.current) return;
    if (kind === 'project') { setFileError(''); setFileDialog('save'); return; }
    void run('Przygotowanie pliku…', () => {
      const prefix = `${workspace.caseDetails.caseCode}-r${workspace.revision}`;
      let blob: Blob, name: string;
      if (kind === 'csv') {
        if (measurementRevision !== workspace.revision) throw new Error('Tabela nie odpowiada bieżącej rewizji. Oblicz ją ponownie.');
        blob = exportMeasurements(rows, tapes, synthetic ? 'Dane syntetyczne — przykład demonstracyjny' : `Plik lokalny — ${mesh.name}`); name = `${prefix}-pomiary.csv`;
      } else if (kind === 'scan' || kind === 'positive3mf') { blob = kind === 'scan' ? exportSTL(mesh) : export3MF(mesh); name = `${prefix}-pozytyw-powierzchniowy.${kind === 'scan' ? 'stl' : '3mf'}`; }
      else if (shell && acknowledged) { blob = kind === '3mf' ? export3MF(shell) : exportSTL(shell); name = `${prefix}-powloka-eksperymentalna.${kind}`; }
      else throw new Error('Najpierw wygeneruj powłokę i potwierdź ograniczenia.');
      return () => { downloadBlob(blob, name); notify('Plik przygotowany do lokalnego pobrania. Sprawdź folder pobierania przeglądarki.'); };
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
            {workspace.caseDetails.caseCode} · r{workspace.revision} · {mesh ? synthetic ? 'Dane syntetyczne' : 'Skan lokalny' : 'Nowy projekt'}
          </strong>
          {edited && <span className="working-status">{protection.copyCurrent ? "Kopia rewizji pobrana — sprawdź dysk" : "Zmiany bez kopii bieżącej rewizji"}</span>}
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
            aria-label="Zapisz projekt"
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
                    if (!gate.current.busy) importScan(Array.from(event.dataTransfer.files));
                  }}
                >
                  <Viewport
                    mesh={visibleMesh}
                    reference={compare && visibleMesh === mesh ? referenceMesh : null}
                    colors={visibleMesh === mesh && heatmap && normalToolsAllowed ? displayColors : undefined}
                    markers={step === 1 ? points : []}
                    slice={
                      unitsConfirmed && (step === 2 || step === 3)
                        ? slice
                        : null
                    }
                    brushActive={step === 3 && brushActive && !busy && (normalToolsAllowed || Boolean(stroke.current))}
                    picking={step === 1 && picking && points.length < 3 && workspace.caseDetails.side !== 'unspecified'}
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
                    onStrokeStart={beginStroke}
                    onStrokeEnd={endStroke}
                    onStrokeCancel={abortStroke}
                    onBrush={brush}
                  />
                  {!mesh && (
                    <div className="empty-viewport">
                      <div className="empty-crosshair">
                        <ScanLine size={42} strokeWidth={1} />
                      </div>
                      <span className="eyebrow">ZACZNIJ OD POWIERZCHNI</span>
                      <h2>Wczytaj powierzchnię TT</h2>
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
                      <button className="secondary" onClick={cancelTask}>Anuluj zadanie</button>
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
                            <th>Obwód CAD · mm</th>
                            <th>Ref · mm</th>
                            <th>CAD − ref · mm</th>
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
                            const ref = referenceRows.find(reference => reference.z === row.z);
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
                                <td>{ref?.valid ? number(ref.circumference) : "—"}</td>
                                <td>{ref?.valid && row.valid ? number(row.circumference - ref.circumference) : "—"}</td>
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
              <fieldset className="inspector-content" disabled={Boolean(busy)}>
                <details className="workspace-summary" open={step === 0}><summary>{workspace.caseDetails.caseCode} · {workspace.caseDetails.side === 'left' ? 'lewa' : workspace.caseDetails.side === 'right' ? 'prawa' : 'strona ?'} · r{workspace.revision}</summary><WorkspacePanel workspace={workspace} busy={Boolean(busy)} dirty={edited} copyCurrent={protection.copyCurrent} onApply={changeCase} onNew={newProject} /></details>
                {mesh && <details className="quality-summary" open={step === 0 || step === 4}><summary>Jakość · {qualitySummary(audit).toUpperCase()}</summary><QualityPanel audit={audit} busy={Boolean(busy)} onAnalyze={analyze} onOrient={orient} /></details>}
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
                      <p className={workspace.registration ? 'mint small' : 'warning-text small'}>{workspace.registration ? `Rejestracja potwierdzona dla strony: ${workspace.registration.side === 'left' ? 'lewa' : 'prawa'}.` : 'Rejestracja niepotwierdzona. Wybierz stronę w danych przypadku przed wskazaniem punktów.'}</p>
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
                          disabled={points.length === 3 || workspace.caseDetails.side === 'unspecified' || Boolean(busy)}
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
                        disabled={points.length !== 3 || workspace.caseDetails.side === 'unspecified' || Boolean(busy)}
                      >
                        <Axis3D size={17} />
                        Zastosuj rejestrację 3 punktów
                      </button>
                    </section>
                    <Note>
                      Osie robocze: X — ku prawej stronie pacjenta, Y — do przodu, Z —
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
                    <label className="checkbox-label"><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} /><span>Porównaj z referencją roboczą 3D / 2D</span></label>
                    <p className="muted small">Referencja po ostatniej orientacji / kalibracji, nie surowy skan. Oba kontury na tym samym Z.</p>
                    <SectionView slice={slice} reference={compare ? referenceSlice : null} />
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
                        disabled={!pendingTape || Boolean(busy)}
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
                                onClick={() => { if (gate.current.busy) return; journal({ kind: 'tape-update', label: 'Usunięto taśmę', parameters: { zMm: tape.z } }); setTapes(tapes.filter(point => point !== tape)); }}
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
                        onClick={() => { abortStroke(); setBrushActive(!brushActive); }}
                        disabled={!normalToolsAllowed || Boolean(busy)}
                      >
                        <MousePointer2 size={17} />
                        {brushActive
                          ? "Wyłącz pędzel"
                          : "Włącz pędzel na modelu"}
                      </button>
                      {!normalToolsAllowed && <p className="warning-text small">Pędzel i mapa wymagają audytu: normalne na zewnątrz + PASS. UNKNOWN blokuje te narzędzia.</p>}
                      <p className="muted small">
                        Zaznacz pociągnięcie na powierzchni. Po puszczeniu
                        przycisku Worker obliczy i opublikuje całą korektę naraz.
                        Do 128 punktów w pociągnięciu; możesz anulować obliczenie.
                        Podgląd geometrii nie zmienia się w trakcie gestu.
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
                          checked={heatmap || busy === 'Obliczanie podpisanej mapy…'}
                          disabled={!normalToolsAllowed || Boolean(busy)}
                          onChange={(event) => toggleHeatmap(event.target.checked)}
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
                      <Field label="Parametr offsetu · mm" hint="Nie jest pomiarem minimalnej grubości ścianki.">
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
                      <h3>Dokumentacja projektu · r{workspace.revision}</h3>
                      <button className="export-row" disabled={Boolean(busy)} onClick={exportReview}><ShieldCheck size={18} /><span><strong>Raport do oceny technicznej</strong><small>HTML / druk do PDF · aktualne pomiary, hash, jakość, dziennik</small></span><ArrowDownToLine size={17} /></button>
                      <p className="warning-text small">Raport jest nieszyfrowany i może zawierać dane zdrowotne. Nie jest certyfikatem ani zwolnieniem klinicznym.</p>
                      <button
                        className="export-row"
                        onClick={() => exportFile("scan")}
                      >
                        <Cuboid size={18} />
                        <span>
                          <strong>Skan po korekcie</strong>
                          <small>Pozytyw STL · powierzchnia w mm · bez koloru</small>
                        </span>
                        <ArrowDownToLine size={17} />
                      </button>
                      <button className="export-row" onClick={() => exportFile('positive3mf')}><Cuboid size={18} /><span><strong>Pozytyw powierzchniowy 3MF</strong><small>Geometria robocza w mm · nie powłoka leja</small></span><ArrowDownToLine size={17} /></button>
                      <button
                        className="export-row"
                        disabled={!rows.length || measurementRevision !== workspace.revision || Boolean(busy)}
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
                    <Note>Zakres przekazania: pliki STL / 3MF do niezależnej oceny technicznej i dalszego CAM. Raport dotyczy powierzchni roboczej, nie zwalidowanej powłoki produkcyjnej.</Note>
                  </>
                )}
              </fieldset>
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
      {fileDialog && <FileProtectionDialog mode={fileDialog} busy={Boolean(busy)} error={fileError} onCancel={closeFileDialog} onSubmit={submitFile} />}
      {discardAction && <ConfirmDiscardDialog onCancel={() => setDiscardAction(null)} onDiscard={() => { const action = discardAction; setDiscardAction(null); action(); }} />}
      {help && (
        <Modal title="Pracownia lokalna" onCancel={() => setHelp(false)}>
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
        </Modal>
      )}
    </div>
  );
}
