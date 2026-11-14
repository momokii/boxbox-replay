import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Playback } from "../playbackStore";
import { posAt } from "../session";
import type { ReplayDriver } from "../types";
import { buildTrackMesh } from "../track3d";

export interface CarMeta {
  driver: number;
  code: string;
  color: string;
}

interface Props {
  playback: Playback;
  outline: number[][];
  replay: Map<number, ReplayDriver>;
  dots: CarMeta[];
  highlight: number[];
  angle: number;
  selectedDriver: number | null;
  theme: "night" | "day";
  onDriver: (driver: number) => void;
  onFallback: () => void;
}

const PALETTE = {
  night: {
    bg: 0x0b0f16,
    track: 0x3c4657,
    edge: 0xe8edf3,
    ground: 0x0d1219,
    grid: 0x2a3342,
    ink: "#E8EDF3",
    chip: "rgba(11,15,22,0.72)",
  },
  day: {
    bg: 0xf1f4f8,
    track: 0x5b6678,
    edge: 0x101826,
    ground: 0xe4e9f0,
    grid: 0xb9c3d2,
    ink: "#0E1420",
    chip: "rgba(255,255,255,0.78)",
  },
} as const;

function rotate(x: number, y: number, deg: number): { x: number; y: number } {
  if (!deg) return { x, y };
  const a = (deg * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
}

function labelTexture(code: string, color: string, ink: string, chip: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = chip;
  ctx.beginPath();
  ctx.roundRect(2, 8, 156, 48, 10);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(2, 8, 7, 48);
  ctx.fillStyle = ink;
  ctx.font = "700 30px 'Barlow Condensed', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(code, 86, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Optional perspective view of the same replay. Intentionally non-analytical:
 * corners, DRS and hover readouts stay on the 2D map.
 */
export default function Track3D(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const live = useRef(p);
  live.current = p;

  const driverKey = p.dots.map((dot) => dot.driver).join(",");

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || p.outline.length < 3) return;
    const palette = PALETTE[p.theme];
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.bg);
    scene.fog = new THREE.Fog(palette.bg, 190, 430);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200);
    camera.position.set(75, 82, 102);
    let fitted = false;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 32;
    controls.maxDistance = 220;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI / 2.02;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-label", "3D replay of the circuit, same cars and clock as the 2D map");
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;cursor:grab;";
    wrap.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, palette.ground, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(80, 120, 60);
    scene.add(sun);

    const mesh = buildTrackMesh(p.outline);
    const trackGeo = new THREE.BufferGeometry();
    trackGeo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    trackGeo.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    trackGeo.setIndex(mesh.indices);
    const trackMat = new THREE.MeshStandardMaterial({
      color: palette.track,
      emissive: palette.track,
      emissiveIntensity: 0.55,
      roughness: 0.9,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(trackGeo, trackMat));

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(mesh.edges, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      color: palette.edge,
      transparent: true,
      opacity: p.theme === "night" ? 0.7 : 0.75,
    });
    scene.add(new THREE.LineSegments(edgeGeo, edgeMat));

    const groundGeo = new THREE.PlaneGeometry(420, 420);
    const groundMat = new THREE.MeshStandardMaterial({ color: palette.ground, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);

    const grid = new THREE.GridHelper(320, 32, palette.grid, palette.grid);
    grid.position.y = -0.02;
    const gridMat = grid.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.22;
    scene.add(grid);

    // Start/finish mark, perpendicular to the first tangent.
    const [p0, p1] = [p.outline[0], p.outline[1]];
    const tx = p1[0] - p0[0];
    const ty = p1[1] - p0[1];
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl;
    const ny = tx / tl;
    const centre = mesh.projection.project(p0[0], p0[1]);
    const startGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(centre.x + nx * mesh.halfWidth, 0.1, centre.z - ny * mesh.halfWidth),
      new THREE.Vector3(centre.x - nx * mesh.halfWidth, 0.1, centre.z + ny * mesh.halfWidth),
    ]);
    const startMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    scene.add(new THREE.Line(startGeo, startMat));

    const bodyGeo = new THREE.BoxGeometry(2.8, 0.7, 1.3);
    const noseGeo = new THREE.BoxGeometry(0.9, 0.28, 0.7);
    const ringGeo = new THREE.RingGeometry(2.1, 2.7, 32);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.2 });
    const cars: {
      driver: number;
      group: THREE.Group;
      body: THREE.Mesh;
      mat: THREE.MeshStandardMaterial;
      label: THREE.Sprite;
      labelMat: THREE.SpriteMaterial;
      ring: THREE.Mesh;
    }[] = [];
    const bodies: THREE.Object3D[] = [];

    for (const dot of live.current.dots) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(dot.color),
        emissive: new THREE.Color(dot.color),
        emissiveIntensity: 0.16,
        roughness: 0.42,
        metalness: 0.3,
        transparent: true,
        opacity: 1,
      });
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.y = 0.42;
      body.userData.driver = dot.driver;
      group.add(body);
      const nose = new THREE.Mesh(noseGeo, noseMat);
      nose.position.set(0, 0.42, 0.98);
      group.add(nose);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffb224,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      ring.visible = false;
      group.add(ring);
      const labelMat = new THREE.SpriteMaterial({
        map: labelTexture(dot.code, dot.color, palette.ink, palette.chip),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const label = new THREE.Sprite(labelMat);
      label.scale.set(3.6, 1.5, 1);
      label.position.y = 1.9;
      label.renderOrder = 10;
      label.userData.driver = dot.driver;
      group.add(label);
      group.visible = false;
      scene.add(group);
      cars.push({ driver: dot.driver, group, body, mat, label, labelMat, ring });
      bodies.push(body, label);
    }

    const maxStep = Math.max(1, mesh.projection.span * 0.05);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number; at: number } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY, at: performance.now() };
      renderer.domElement.style.cursor = "grabbing";
    };
    const onPointerUp = (event: PointerEvent) => {
      renderer.domElement.style.cursor = "grab";
      const start = down;
      down = null;
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      if (performance.now() - start.at > 600) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(bodies, false)[0];
      if (hit) live.current.onDriver(hit.object.userData.driver as number);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const resize = () => {
      const width = Math.max(240, wrap.clientWidth);
      const height = Math.max(320, wrap.clientHeight);
      camera.aspect = width / height;
      if (!fitted) {
        // Fit the 100-unit track for the current aspect; portrait needs more distance.
        const vFov = (camera.fov * Math.PI) / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
        const distance = Math.max(150, 68 / Math.tan(hFov / 2), 58 / Math.tan(vFov / 2));
        camera.position.copy(new THREE.Vector3(0.55, 0.6, 0.75).normalize().multiplyScalar(distance));
        fitted = true;
      }
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      controls.update();
      const t = live.current.playback.state.t;
      const angle = live.current.angle;
      const highlight = live.current.highlight;
      const selected = live.current.selectedDriver;
      for (const car of cars) {
        const driver = live.current.replay.get(car.driver);
        if (!driver) {
          car.group.visible = false;
          continue;
        }
        const pos = posAt(driver, t, maxStep);
        if (!pos) {
          car.group.visible = false;
          continue;
        }
        car.group.visible = true;
        const rp = rotate(pos.x, pos.y, -angle);
        const world = mesh.projection.project(rp.x, rp.y);
        car.group.position.set(world.x, 0, world.z);
        const prev = posAt(driver, t - 0.25, maxStep);
        if (prev) {
          const pw = rotate(prev.x, prev.y, -angle);
          const prevWorld = mesh.projection.project(pw.x, pw.y);
          const dx = world.x - prevWorld.x;
          const dz = world.z - prevWorld.z;
          if (Math.hypot(dx, dz) > 1e-4) car.group.rotation.y = Math.atan2(dx, dz);
        }
        const isSelected = selected === car.driver;
        const isFollowed = highlight.includes(car.driver) || isSelected;
        const dim = highlight.length > 0 && !isFollowed;
        car.mat.opacity = dim ? 0.22 : 1;
        car.labelMat.opacity = dim ? 0.25 : 1;
        car.mat.emissiveIntensity = isSelected ? 0.55 : 0.16;
        car.ring.visible = isSelected;
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      carCleanup(cars);
      trackGeo.dispose();
      trackMat.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      grid.geometry.dispose();
      gridMat.dispose();
      startGeo.dispose();
      startMat.dispose();
      bodyGeo.dispose();
      noseGeo.dispose();
      ringGeo.dispose();
      noseMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [p.outline, p.theme, driverKey]);

  if (failed) {
    return (
      <div className="map3d-fallback">
        <p>The 3D view needs WebGL, which this browser did not provide.</p>
        <button type="button" className="primary" onClick={p.onFallback}>
          Back to 2D
        </button>
      </div>
    );
  }

  return (
    <div className="map3d" ref={wrapRef}>
      <p className="map3d-note">
        3D view · same replay data · drag to orbit · click a car to select. Track
        width is a visual constant, not measured.
      </p>
    </div>
  );
}

function carCleanup(
  cars: {
    group: THREE.Group;
    body: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    label: THREE.Sprite;
    labelMat: THREE.SpriteMaterial;
    ring: THREE.Mesh;
  }[],
) {
  for (const car of cars) {
    car.mat.dispose();
    car.labelMat.map?.dispose();
    car.labelMat.dispose();
    (car.ring.material as THREE.Material).dispose();
  }
}
