import { useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MeshData, SliceResult, Vec3 } from "../types";
import { buildDisplayGeometry } from "./meshView";

type Renderer = THREE.WebGPURenderer | WebGLRenderer;
export interface ViewportProps {
  mesh: MeshData | null;
  reference?: MeshData | null;
  slice: SliceResult | null;
  colors?: Float32Array;
  markers: Vec3[];
  brushActive: boolean;
  picking?: boolean;
  fitVersion: number;
  view: "iso" | "front" | "side" | "top";
  wireframe: boolean;
  onBackend: (label: string) => void;
  onPick: (point: Vec3) => void;
  onStrokeStart: () => boolean | void;
  onStrokeEnd?: () => void;
  onStrokeCancel?: () => void;
  onBrush: (point: Vec3) => void;
}
interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: Renderer;
  controls: OrbitControls;
  object: THREE.Mesh | null;
  overlay: THREE.Group;
  grid: THREE.GridHelper;
  cancelStroke?: () => void;
}
function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const renderable = child as THREE.Mesh;
    renderable.geometry?.dispose();
    const materials = renderable.material
      ? Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material]
      : [];
    materials.forEach((material) => {
      (material as THREE.MeshStandardMaterial).map?.dispose();
      material.dispose();
    });
  });
}
export function Viewport(props: ViewportProps) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const container = host.current!;
    let disposed = false,
      renderer: Renderer | undefined,
      observer: ResizeObserver | undefined;
    let removeEvents = () => {};
    (async () => {
      let backend = "";
      try {
        const gpu = new THREE.WebGPURenderer({ antialias: true, alpha: false });
        renderer = gpu;
        await gpu.init();
        backend = (gpu.backend as unknown as { isWebGPUBackend?: boolean })
          .isWebGPUBackend
          ? "WebGPU"
          : "WebGL2";
      } catch (failure) {
        try {
          renderer?.dispose();
        } catch {
          /* a failed backend may not be initialized */
        }
        if (disposed) return;
        try {
          renderer = new WebGLRenderer({ antialias: true, alpha: false });
          backend = "WebGL2 · tryb zgodności";
        } catch {
          if (!disposed) {
            setError(
              "Nie można uruchomić grafiki 3D. Włącz akcelerację sprzętową i WebGL2.",
            );
            latest.current.onBackend("Grafika niedostępna");
          }
          return;
        }
      }
      if (disposed) {
        renderer.dispose();
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x101923);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100000);
      camera.up.set(0, 0, 1);
      camera.position.set(460, -650, 360);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.set(0, 0, 140);
      scene.add(new THREE.HemisphereLight(0xe5f2ff, 0x566579, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 3);
      key.position.set(200, -300, 600);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x98e3d1, 1.1);
      fill.position.set(-200, 100, 100);
      scene.add(fill);
      const grid = new THREE.GridHelper(600, 30, 0x34444e, 0x24313c);
      grid.rotateX(Math.PI / 2);
      scene.add(grid);
      const overlay = new THREE.Group();
      scene.add(overlay);
      stage.current = {
        scene,
        camera,
        controls,
        renderer,
        object: null,
        overlay,
        grid,
      };
      const canvas = renderer.domElement;
      canvas.setAttribute(
        "aria-label",
        "Interaktywny model 3D — obrót, zoom i narzędzia powierzchniowe",
      );
      canvas.tabIndex = 0;
      container.appendChild(canvas);
      const resize = () => {
        if (!stage.current) return;
        const { width, height } = container.getBoundingClientRect();
        if (!width || !height) return;
        renderer!.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let sculpting = false, pointerId: number | null = null, lastBrush = 0;
      const hit = (event: PointerEvent): Vec3 | null => {
        const object = stage.current?.object;
        if (!object) return null;
        const rect = canvas.getBoundingClientRect();
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const intersection = raycaster.intersectObject(object)[0];
        return intersection ? (intersection.point.toArray() as Vec3) : null;
      };
      const down = (event: PointerEvent) => {
        if (
          sculpting ||
          event.button !== 0 ||
          (!latest.current.brushActive && !latest.current.picking)
        )
          return;
        const point = hit(event);
        if (!point) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (latest.current.brushActive) {
          if (latest.current.onStrokeStart() === false) return;
          sculpting = true;
          pointerId = event.pointerId;
          controls.enabled = false;
          canvas.setPointerCapture(event.pointerId);
          latest.current.onBrush(point);
          lastBrush = performance.now();
        } else latest.current.onPick(point);
      };
      const move = (event: PointerEvent) => {
        if (!sculpting || event.pointerId !== pointerId) return;
        event.stopImmediatePropagation();
        if (performance.now() - lastBrush < 35) return;
        const point = hit(event);
        if (point) {
          latest.current.onBrush(point);
          lastBrush = performance.now();
        }
      };
      const up = (event: PointerEvent) => {
        if (!sculpting || event.pointerId !== pointerId) return;
        sculpting = false;
        pointerId = null;
        controls.enabled = true;
        if (canvas.hasPointerCapture(event.pointerId))
          canvas.releasePointerCapture(event.pointerId);
        latest.current.onStrokeEnd?.();
      };
      const cancelStroke = () => {
        if (!sculpting) return;
        const captured = pointerId;
        sculpting = false;
        pointerId = null;
        controls.enabled = true;
        // Invalidate App's transaction before releasing native capture.
        latest.current.onStrokeCancel?.();
        if (captured !== null && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
      };
      const cancel = (event: PointerEvent) => { if (event.pointerId === pointerId) cancelStroke(); };
      stage.current.cancelStroke = cancelStroke;
      canvas.addEventListener("pointerdown", down, true);
      canvas.addEventListener("pointermove", move, true);
      canvas.addEventListener("pointerup", up, true);
      canvas.addEventListener("pointercancel", cancel, true);
      canvas.addEventListener("lostpointercapture", cancel, true);
      window.addEventListener("blur", cancelStroke);
      removeEvents = () => {
        cancelStroke();
        canvas.removeEventListener("pointerdown", down, true);
        canvas.removeEventListener("pointermove", move, true);
        canvas.removeEventListener("pointerup", up, true);
        canvas.removeEventListener("pointercancel", cancel, true);
        canvas.removeEventListener("lostpointercapture", cancel, true);
        window.removeEventListener("blur", cancelStroke);
      };
      renderer.setAnimationLoop(() => {
        if (disposed) return;
        controls.update();
        renderer!.render(scene, camera);
      });
      latest.current.onBackend(backend);
      setReady((value) => value + 1);
    })().catch((err) => {
      if (!disposed) {
        setError(String(err));
        latest.current.onBackend("Błąd grafiki");
      }
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      removeEvents();
      const current = stage.current;
      if (current) {
        current.renderer.setAnimationLoop(null);
        current.controls.dispose();
        disposeObject(current.scene);
        current.renderer.dispose();
        current.renderer.domElement.remove();
        stage.current = null;
      }
    };
  }, []);
  useEffect(() => {
    stage.current?.cancelStroke?.();
  }, [props.mesh, props.brushActive]);
  useEffect(() => {
    const current = stage.current;
    if (current)
      current.controls.mouseButtons.RIGHT = props.picking
        ? THREE.MOUSE.ROTATE
        : THREE.MOUSE.PAN;
  }, [props.picking, ready]);
  useEffect(() => {
    const current = stage.current;
    if (!current) return;
    if (current.object) {
      current.scene.remove(current.object);
      disposeObject(current.object);
      current.object = null;
    }
    if (!props.mesh) return;
    const geometry = buildDisplayGeometry(props.mesh, props.colors);
    const material = new THREE.MeshStandardMaterial({
      color:
        props.mesh.colors || props.colors || props.mesh.textureUrl
          ? 0xffffff
          : 0xc7d3d5,
      roughness: 0.74,
      metalness: 0.05,
      side: THREE.DoubleSide,
      vertexColors: Boolean(props.colors || props.mesh.colors),
      wireframe: props.wireframe,
    });
    const object = new THREE.Mesh(geometry, material);
    current.object = object;
    current.scene.add(object);
    const bounds = new THREE.Box3().setFromBufferAttribute(
      geometry.getAttribute("position") as THREE.BufferAttribute,
    );
    current.grid.position.z =
      bounds.min.z -
      Math.max(1, bounds.getSize(new THREE.Vector3()).length() * 0.015);
    let active = true;
    if (props.mesh.textureUrl && !props.colors)
      new THREE.TextureLoader().load(
        props.mesh.textureUrl,
        (texture) => {
          if (!active) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          material.map = texture;
          material.needsUpdate = true;
        },
        undefined,
        () => {
          if (active)
            setError(
              "Nie udało się odczytać lokalnej tekstury. Wyświetlana jest geometria / RGB.",
            );
        },
      );
    return () => {
      active = false;
    };
  }, [props.mesh, props.colors, props.wireframe, ready]);
  useEffect(() => {
    const current = stage.current;
    if (!current || !props.reference) return;
    const geometry = buildDisplayGeometry(props.reference);
    // Reference is a display-only overlay, never the raycast/sculpting target.
    geometry.deleteAttribute('color');
    const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0xe9bf7e, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    object.renderOrder = 2;
    current.scene.add(object);
    return () => { current.scene.remove(object); disposeObject(object); };
  }, [props.reference, ready]);
  useEffect(() => {
    const current = stage.current;
    if (!current?.object) return;
    const box = new THREE.Box3().setFromObject(current.object),
      center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length(), 1) * 1.6;
    const direction =
      props.view === "front"
        ? new THREE.Vector3(0, -1, 0.03)
        : props.view === "side"
          ? new THREE.Vector3(1, 0, 0.03)
          : props.view === "top"
            ? new THREE.Vector3(0, 0.001, 1)
            : new THREE.Vector3(1, -1.6, 0.65);
    current.camera.position
      .copy(center)
      .add(direction.normalize().multiplyScalar(radius));
    current.camera.near = Math.max(radius / 1000, 0.01);
    current.camera.far = radius * 100;
    current.camera.updateProjectionMatrix();
    current.controls.target.copy(center);
    current.controls.update();
  }, [props.fitVersion, props.view, ready]);
  useEffect(() => {
    const current = stage.current;
    if (!current) return;
    disposeObject(current.overlay);
    current.overlay.clear();
    if (props.slice && props.mesh) {
      const box = new THREE.Box3().setFromArray(props.mesh.positions),
        size = box.getSize(new THREE.Vector3());
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(
          Math.max(size.x * 1.35, 1),
          Math.max(size.y * 1.35, 1),
        ),
        new THREE.MeshBasicMaterial({
          color: 0x6de4c0,
          transparent: true,
          opacity: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      plane.position.set(
        (box.min.x + box.max.x) / 2,
        (box.min.y + box.max.y) / 2,
        props.slice.z,
      );
      current.overlay.add(plane);
      props.slice.loops.forEach((loop) => {
        const points = loop.points.map(
          (p) => new THREE.Vector3(p[0], p[1], props.slice!.z),
        );
        if (loop.closed && points.length) points.push(points[0].clone());
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: loop.closed ? 0x70f5ca : 0xffb66b,
            depthTest: false,
          }),
        );
        line.renderOrder = 4;
        current.overlay.add(line);
      });
    }
    const radius = props.mesh
      ? Math.max(
          new THREE.Box3()
            .setFromArray(props.mesh.positions)
            .getSize(new THREE.Vector3())
            .length() * 0.018,
          1,
        )
      : 4;
    props.markers.forEach((point, index) => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.4, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffc777, depthTest: false }),
      );
      marker.position.fromArray(point);
      marker.renderOrder = 8;
      current.overlay.add(marker);
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#eac58b";
      ctx.beginPath();
      ctx.arc(48, 48, 37, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#111923";
      ctx.fillText(String(index + 1), 48, 51);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas),
          depthTest: false,
        }),
      );
      sprite.position
        .fromArray(point)
        .add(new THREE.Vector3(radius, 0, radius));
      sprite.scale.setScalar(radius * 2);
      sprite.renderOrder = 9;
      current.overlay.add(sprite);
    });
  }, [props.slice, props.markers, props.mesh, ready]);
  return (
    <div
      className={`three-viewport ${props.brushActive || props.picking ? "tool-active" : ""}`}
      ref={host}
      role="region"
      aria-label="Obszar roboczy 3D"
    >
      {error && (
        <div className="viewport-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
