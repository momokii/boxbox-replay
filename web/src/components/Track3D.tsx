import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Playback } from "../playbackStore";
import { posAt } from "../session";
import type { Corner, DrsZone, ReplayDriver } from "../types";
import type { PitStop } from "../api";
import type { PitPath } from "../pitlane";
import { isOffTrack, type DriverExit } from "../retirements";
import { CAR_LENGTH_WORLD, CAR_WIDTH_WORLD, buildRibbon, buildTrackMesh } from "../track3d";

export interface CarMeta {
  driver: number;
  code: string;
  color: string;
}

type CameraMode = "follow" | "overview" | "free";

interface Props {
  playback: Playback;
  outline: number[][];
  replay: Map<number, ReplayDriver>;
  dots: CarMeta[];
  corners: Corner[];
  zones: DrsZone[];
  highlight: number[];
  angle: number;
  selectedDriver: number | null;
  focusDriver: number | null;
  theme: "night" | "day";
  exits: Map<number, DriverExit>;
  pitStops: PitStop[];
  pitPath: PitPath | null;
  lapText: string;
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
    pit: 0x657284,
    ink: "#E8EDF3",
  },
  day: {
    bg: 0xf1f4f8,
    track: 0x5b6678,
    edge: 0x101826,
    ground: 0xe4e9f0,
    grid: 0xb9c3d2,
    pit: 0x8a96a6,
    ink: "#0E1420",
  },
} as const;

function rotate(x: number, y: number, deg: number): { x: number; y: number } {
  if (!deg) return { x, y };
  const a = (deg * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
}

function asphaltTexture(base: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const hex = `#${base.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 128, 128);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1600; i++) {
    const shade = Math.floor(18 + rnd() * 46);
    ctx.fillStyle = `rgba(${shade},${shade},${shade + 5},${0.05 + rnd() * 0.14})`;
    ctx.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function checkerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 ? "#e8edf3" : "#15181e";
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/**
 * Optional perspective view of the same replay. This is a viewing surface, not
 * an analytical one: 2D owns corners, DRS and hover. The car/track width ratio
 * is real relative scale; OpenF1 does not publish a metric width, so the
 * ribbon width remains a stated visual constant.
 */
function tokenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.beginPath();
  ctx.arc(32, 32, 24, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(11,14,19,0.9)";
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function Track3D(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<CameraMode>("follow");
  const live = useRef(p);
  live.current = p;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const driverKey = p.dots.map((dot) => dot.driver).join(",");
  const pitKey = p.pitPath?.points.length ?? 0;

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
    scene.fog = new THREE.Fog(palette.bg, 180, 520);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1200);
    camera.position.set(72, 78, 98);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 260;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI / 2.02;
    controls.enabled = false;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-label", "3D replay of the circuit, same cars and clock as the 2D map");
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.style.cssText = "display:block;position:absolute;inset:0;width:100%;height:100%;cursor:grab;";
    wrap.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, palette.ground, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(80, 120, 60);
    scene.add(sun);

    const mesh = buildTrackMesh(p.outline);
    const trackMap = asphaltTexture(palette.track);
    trackMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const trackGeo = new THREE.BufferGeometry();
    trackGeo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    trackGeo.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    trackGeo.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
    trackGeo.setIndex(mesh.indices);
    const trackMat = new THREE.MeshStandardMaterial({
      map: trackMap,
      color: 0xffffff,
      emissive: palette.track,
      emissiveIntensity: 0.15,
      roughness: 0.94,
      metalness: 0.03,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(trackGeo, trackMat));

    const kerbGeo = new THREE.BufferGeometry();
    kerbGeo.setAttribute("position", new THREE.BufferAttribute(mesh.kerbs.positions, 3));
    kerbGeo.setAttribute("color", new THREE.BufferAttribute(mesh.kerbs.colors, 3));
    kerbGeo.setIndex(mesh.kerbs.indices);
    const kerbMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(kerbGeo, kerbMat));

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(mesh.edges, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      color: palette.edge,
      transparent: true,
      opacity: p.theme === "night" ? 0.72 : 0.76,
    });
    scene.add(new THREE.LineSegments(edgeGeo, edgeMat));

    const groundGeo = new THREE.PlaneGeometry(500, 500);
    const groundMat = new THREE.MeshStandardMaterial({ color: palette.ground, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    scene.add(ground);

    const grid = new THREE.GridHelper(360, 36, palette.grid, palette.grid);
    grid.position.y = -0.04;
    const gridMat = grid.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.16;
    scene.add(grid);

    // Start/finish: a checkered strip across the true relative track width.
    const [p0, p1] = [p.outline[0], p.outline[1]];
    const tx = p1[0] - p0[0];
    const ty = p1[1] - p0[1];
    const centre = mesh.projection.project(p0[0], p0[1]);
    const checkerMap = checkerTexture();
    const sw = mesh.halfWidth;
    const checkerGeo = new THREE.BufferGeometry();
    checkerGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [-sw, 0.075, -0.035, sw, 0.075, -0.035, sw, 0.075, 0.035, -sw, 0.075, 0.035],
        3,
      ),
    );
    checkerGeo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    checkerGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const checkerMat = new THREE.MeshBasicMaterial({ map: checkerMap, side: THREE.DoubleSide });
    const checker = new THREE.Mesh(checkerGeo, checkerMat);
    checker.position.set(centre.x, 0, centre.z);
    checker.rotation.y = Math.atan2(tx, -ty);
    scene.add(checker);

    // Pit lane: recorded transit if usable, otherwise an explicitly schematic
    // guide. Cars always stay at their recorded positions.
    let pitGeo: THREE.BufferGeometry | null = null;
    let pitMat: THREE.MeshStandardMaterial | null = null;
    if (p.pitPath && p.pitPath.points.length > 1) {
      const world = p.pitPath.points.map(([x, y]) => {
        const q = mesh.projection.project(x, y);
        return [q.x, q.z];
      });
      const ribbon = buildRibbon(world, 0.07, 0.035);
      if (ribbon.indices.length) {
        pitGeo = new THREE.BufferGeometry();
        pitGeo.setAttribute("position", new THREE.BufferAttribute(ribbon.positions, 3));
        pitGeo.setAttribute("normal", new THREE.BufferAttribute(ribbon.normals, 3));
        pitGeo.setAttribute("uv", new THREE.BufferAttribute(ribbon.uvs, 2));
        pitGeo.setIndex(ribbon.indices);
        pitMat = new THREE.MeshStandardMaterial({
          color: palette.pit,
          roughness: 0.9,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        scene.add(new THREE.Mesh(pitGeo, pitMat));
      }
    }

    const cornerGeo = new THREE.ConeGeometry(0.022, 0.06, 6);
    const cornerMat = new THREE.MeshStandardMaterial({
      color: 0xffb224,
      emissive: 0xffb224,
      emissiveIntensity: 0.55,
      roughness: 0.5,
    });
    for (const c of p.corners) {
      const w = mesh.projection.project(c.x, c.y);
      const marker = new THREE.Mesh(cornerGeo, cornerMat);
      marker.position.set(w.x, 0.04, w.z);
      scene.add(marker);
    }

    const zonePositions: number[] = [];
    for (const z of p.zones) {
      const a = mesh.projection.project(z.x0, z.y0);
      const b = mesh.projection.project(z.x1, z.y1);
      zonePositions.push(a.x, 0.07, a.z, b.x, 0.07, b.z);
    }
    const zoneGeo = new THREE.BufferGeometry();
    zoneGeo.setAttribute("position", new THREE.Float32BufferAttribute(zonePositions, 3));
    const zoneMat = new THREE.LineBasicMaterial({ color: 0xffb224, transparent: true, opacity: 0.42 });
    scene.add(new THREE.LineSegments(zoneGeo, zoneMat));

    // True relative car proportions: 5.6 m long, 2 m wide, on a 12 m track.
    const L = CAR_LENGTH_WORLD;
    const W = CAR_WIDTH_WORLD;
    const carGeos = {
      floor: new THREE.BoxGeometry(W * 0.7, 0.008, L * 0.82),
      nose: new THREE.BoxGeometry(W * 0.25, 0.011, L * 0.19),
      frontWing: new THREE.BoxGeometry(W, 0.004, L * 0.11),
      endplate: new THREE.BoxGeometry(0.003, 0.012, L * 0.11),
      rearWing: new THREE.BoxGeometry(W * 0.78, 0.005, L * 0.06),
      rearPlate: new THREE.BoxGeometry(0.003, 0.027, L * 0.05),
      sidepod: new THREE.BoxGeometry(W * 0.17, 0.018, L * 0.25),
      cockpit: new THREE.BoxGeometry(W * 0.24, 0.019, L * 0.12),
      helmet: new THREE.SphereGeometry(0.008, 8, 6),
      wheel: new THREE.CylinderGeometry(0.013, 0.013, 0.012, 10),
      hub: new THREE.CylinderGeometry(0.005, 0.005, 0.014, 8),
      light: new THREE.BoxGeometry(0.008, 0.006, 0.004),
    };
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x12161d, roughness: 0.75, metalness: 0.2 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8edf3, roughness: 0.45, metalness: 0.15 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const ringGeo = new THREE.RingGeometry(0.19, 0.24, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb224,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const cars: {
      driver: number;
      group: THREE.Group;
      mat: THREE.MeshStandardMaterial;
      ring: THREE.Mesh;
    }[] = [];
    const bodies: THREE.Object3D[] = [];

    for (const dot of live.current.dots) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(dot.color),
        emissive: new THREE.Color(dot.color),
        emissiveIntensity: 0.25,
        roughness: 0.38,
        metalness: 0.35,
        transparent: true,
        opacity: 1,
      });
      const part = (
        geo: THREE.BufferGeometry,
        material: THREE.Material,
        x: number,
        y: number,
        z: number,
        rz = 0,
      ) => {
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(x, y, z);
        mesh.rotation.z = rz;
        mesh.userData.driver = dot.driver;
        group.add(mesh);
        return mesh;
      };
      part(carGeos.floor, mat, 0, 0.018, 0);
      part(carGeos.nose, mat, 0, 0.022, L * 0.42);
      part(carGeos.sidepod, mat, W * 0.32, 0.026, -L * 0.03);
      part(carGeos.sidepod, mat, -W * 0.32, 0.026, -L * 0.03);
      part(carGeos.cockpit, mat, 0, 0.034, -L * 0.06);
      part(carGeos.frontWing, darkMat, 0, 0.012, L * 0.62);
      part(carGeos.endplate, whiteMat, W * 0.5, 0.018, L * 0.62);
      part(carGeos.endplate, whiteMat, -W * 0.5, 0.018, L * 0.62);
      part(carGeos.rearWing, darkMat, 0, 0.052, -L * 0.4);
      part(carGeos.rearPlate, whiteMat, W * 0.42, 0.052, -L * 0.4);
      part(carGeos.rearPlate, whiteMat, -W * 0.42, 0.052, -L * 0.4);
      part(carGeos.helmet, whiteMat, 0, 0.046, -L * 0.07);
      part(carGeos.light, lightMat, 0, 0.034, -L * 0.47);
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          part(carGeos.wheel, darkMat, side * W * 0.5, 0.013, end * L * 0.27, Math.PI / 2);
          part(carGeos.hub, mat, side * W * 0.5, 0.013, end * L * 0.27, Math.PI / 2);
        }
      }
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.009;
      ring.visible = false;
      group.add(ring);
      group.visible = false;
      group.userData.driver = dot.driver;
      scene.add(group);
      cars.push({ driver: dot.driver, group, mat, ring });
      bodies.push(group);
    }

    // Overview is a true-scale circuit, so a 5.6 m car is only a few pixels.
    // Draw a marker layer for context; Follow shows the actual 3D car.
    const tokenGeo = new THREE.BufferGeometry();
    tokenGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(cars.length * 3), 3));
    tokenGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(cars.length * 3), 3));
    const tokenMap = tokenTexture();
    const tokenMat = new THREE.PointsMaterial({
      size: 3.0,
      sizeAttenuation: true,
      map: tokenMap,
      alphaTest: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const tokens = new THREE.Points(tokenGeo, tokenMat);
    tokens.renderOrder = 8;
    scene.add(tokens);

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
      const hit = raycaster.intersectObjects(bodies, true)[0];
      if (hit) live.current.onDriver(hit.object.userData.driver as number);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const fitOverview = () => {
      const dir = new THREE.Vector3(0.55, 0.62, 0.75).normalize();
      let lo = 20;
      let hi = 300;
      for (let step = 0; step < 22; step++) {
        const mid = (lo + hi) / 2;
        camera.position.copy(dir).multiplyScalar(mid);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        let extent = 0;
        for (let i = 0; i < mesh.positions.length; i += 3) {
          const projected = new THREE.Vector3(
            mesh.positions[i],
            mesh.positions[i + 1],
            mesh.positions[i + 2],
          ).project(camera);
          extent = Math.max(extent, Math.abs(projected.x), Math.abs(projected.y));
        }
        if (extent > 0.86) lo = mid;
        else hi = mid;
      }
      camera.position.copy(dir).multiplyScalar(hi * 1.02);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.enabled = false;
    };

    let lastMode: CameraMode | null = null;
    let followInit = false;
    let miniFrame = 0;

    const resize = () => {
      const width = Math.max(240, wrap.clientWidth);
      const height = Math.max(320, wrap.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      if (modeRef.current === "overview") {
        fitOverview();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    const drawMini = (t: number) => {
      const canvas = miniRef.current;
      if (!canvas || !p.outline.length) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = canvas.clientWidth || 176;
      const height = canvas.clientHeight || 110;
      if (canvas.width !== Math.round(width * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const xs = p.outline.map((v) => v[0]);
      const ys = p.outline.map((v) => v[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const pad = 8;
      const scale = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY));
      const ox = pad + (width - pad * 2 - (maxX - minX) * scale) / 2 - minX * scale;
      const oy = height - pad - (height - pad * 2 - (maxY - minY) * scale) / 2 + minY * scale;
      const X = (x: number) => ox + x * scale;
      const Y = (y: number) => oy - y * scale;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = p.theme === "night" ? "rgba(232,237,243,0.7)" : "rgba(14,20,32,0.7)";
      ctx.beginPath();
      p.outline.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.closePath();
      ctx.stroke();
      for (const dot of live.current.dots) {
        const d = live.current.replay.get(dot.driver);
        if (!d || isOffTrack(live.current.exits.get(dot.driver), t)) continue;
        const pos = posAt(d, t, maxStep);
        if (!pos) continue;
        const rp = rotate(pos.x, pos.y, -live.current.angle);
        const selected = live.current.selectedDriver === dot.driver;
        ctx.fillStyle = dot.color;
        ctx.beginPath();
        ctx.arc(X(rp.x), Y(rp.y), selected ? 4.5 : 2.8, 0, Math.PI * 2);
        ctx.fill();
        if (selected) {
          ctx.strokeStyle = "#FFB224";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const t = live.current.playback.state.t;
      const camMode = modeRef.current;
      if (lastMode !== camMode) {
        if (camMode === "overview") {
          fitOverview();
          } else if (camMode === "free") {
          controls.enabled = true;
        } else {
          controls.enabled = false;
          followInit = false;
        }
        lastMode = camMode;
      }

      let focusGroup: { group: THREE.Group; driver: number } | null = null;
      for (const car of cars) {
        const driver = live.current.replay.get(car.driver);
        if (!driver || isOffTrack(live.current.exits.get(car.driver), t)) {
          car.group.visible = false;
          continue;
        }
        const pos = posAt(driver, t, maxStep);
        if (!pos) {
          car.group.visible = false;
          continue;
        }
        car.group.visible = true;
        const rp = rotate(pos.x, pos.y, -live.current.angle);
        const world = mesh.projection.project(rp.x, rp.y);
        car.group.position.set(world.x, 0.055, world.z);
        const prev = posAt(driver, t - 0.25, maxStep);
        if (prev) {
          const pw = rotate(prev.x, prev.y, -live.current.angle);
          const prevWorld = mesh.projection.project(pw.x, pw.y);
          const dx = world.x - prevWorld.x;
          const dz = world.z - prevWorld.z;
          if (Math.hypot(dx, dz) > 1e-5) car.group.rotation.y = Math.atan2(dx, dz);
        }
        const isSelected = live.current.selectedDriver === car.driver;
        const isFollowed = live.current.highlight.includes(car.driver) || isSelected;
        const dim = live.current.highlight.length > 0 && !isFollowed;
        car.mat.opacity = dim ? 0.18 : 1;
        car.mat.emissiveIntensity = isSelected ? 0.65 : 0.25;
        car.ring.visible = isSelected;
        if (
          (live.current.selectedDriver == null || !car.group.visible) &&
          car.driver === live.current.focusDriver &&
          car.group.visible
        ) {
          focusGroup = { group: car.group, driver: car.driver };
        }
        if (isSelected) focusGroup = { group: car.group, driver: car.driver };
      }
      const cameraDistance = camera.position.distanceTo(controls.target);
      tokens.visible = camMode === "overview" || (camMode === "free" && cameraDistance > 6);
      if (tokens.visible) {
        const positions = tokenGeo.getAttribute("position") as THREE.BufferAttribute;
        const colors = tokenGeo.getAttribute("color") as THREE.BufferAttribute;
        let count = 0;
        for (const car of cars) {
          if (!car.group.visible) continue;
          const color = new THREE.Color(live.current.dots.find((dot) => dot.driver === car.driver)?.color ?? "#e9eef5");
          positions.setXYZ(count, car.group.position.x, 0.13, car.group.position.z);
          colors.setXYZ(count, color.r, color.g, color.b);
          count += 1;
        }
        tokenGeo.setDrawRange(0, count);
        positions.needsUpdate = true;
        colors.needsUpdate = true;
      }

      if (!focusGroup) {
        const first = cars.find((c) => c.group.visible);
        if (first) focusGroup = { group: first.group, driver: first.driver };
      }

      if (camMode === "follow" && focusGroup) {
        const fw = new THREE.Vector3(0, 0, 1).applyEuler(focusGroup.group.rotation);
        const right = new THREE.Vector3(fw.z, 0, -fw.x);
        const desired = focusGroup.group.position.clone().addScaledVector(fw, -1.15).addScaledVector(right, 0.22);
        desired.y += 0.44;
        if (!followInit || reducedMotion) {
          camera.position.copy(desired);
          followInit = true;
        } else {
          camera.position.lerp(desired, 0.12);
        }
        const target = focusGroup.group.position.clone().addScaledVector(fw, 0.42);
        target.y += 0.03;
        camera.lookAt(target);
        controls.target.copy(target);
      } else if (camMode === "overview") {
        controls.enabled = false;
      } else if (camMode === "free") {
        controls.update();
      }

      const label = labelRef.current;
      if (label) {
        if (focusGroup) {
          const focus = focusGroup.group.position.clone();
          focus.y += 0.085;
          focus.project(camera);
          const width = renderer.domElement.clientWidth;
          const height = renderer.domElement.clientHeight;
          const visible = focus.z > -1 && focus.z < 1;
          label.style.display = visible ? "block" : "none";
          label.style.left = `${Math.round((focus.x * 0.5 + 0.5) * width)}px`;
          label.style.top = `${Math.round((-focus.y * 0.5 + 0.5) * height)}px`;
          const meta = live.current.dots.find((d) => d.driver === focusGroup?.driver);
          label.textContent = meta ? `#${meta.driver} ${meta.code}` : "";
          label.dataset.pit = live.current.pitStops.some(
            (s) => s.driver_number === focusGroup?.driver && t >= s.t && t <= s.t + (s.pit_duration ?? 25),
          )
            ? "true"
            : "false";
        } else {
          label.style.display = "none";
        }
      }

      miniFrame += 1;
      if (miniFrame % 4 === 0) drawMini(t);
      renderer.render(scene, camera);
    };
    let raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      for (const car of cars) {
        car.mat.dispose();
      }
      trackGeo.dispose();
      trackMat.dispose();
      trackMap.dispose();
      kerbGeo.dispose();
      kerbMat.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      grid.geometry.dispose();
      gridMat.dispose();
      checkerGeo.dispose();
      checkerMat.dispose();
      checkerMap.dispose();
      pitGeo?.dispose();
      pitMat?.dispose();
      cornerGeo.dispose();
      cornerMat.dispose();
      zoneGeo.dispose();
      zoneMat.dispose();
      tokenGeo.dispose();
      tokenMat.dispose();
      tokenMap.dispose();
      Object.values(carGeos).forEach((geo) => geo.dispose());
      darkMat.dispose();
      whiteMat.dispose();
      lightMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [p.outline, p.theme, driverKey, pitKey]);

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
      <div className="map3d-hud">
        <span className="map3d-kicker">3D replay · {mode}</span>
        <strong>{p.lapText}</strong>
      </div>
      <div className="map3d-cams" role="group" aria-label="3D camera">
        {(["follow", "overview", "free"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {value === "follow" ? "Follow" : value === "overview" ? "Overview" : "Free"}
          </button>
        ))}
      </div>
      <div ref={labelRef} className="map3d-driver-label" aria-hidden="true" />
      <canvas ref={miniRef} className="map3d-mini" aria-hidden="true" />
      <p className="map3d-note">
        Follow the selected/leading car; Overview/Free use markers at true track scale. Track width is a visual constant;
        pit lane is a labelled schematic.
      </p>
    </div>
  );
}
