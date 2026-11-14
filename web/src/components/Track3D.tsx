import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Playback } from "../playbackStore";
import { posAt } from "../session";
import type { Corner, DrsZone, ReplayDriver } from "../types";
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
  corners: Corner[];
  zones: DrsZone[];
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
  ctx.font = "700 44px 'Barlow Condensed', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(code, 86, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
      emissiveIntensity: 0.18,
      roughness: 0.92,
      metalness: 0.04,
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

    // Start/finish: a checkered strip aligned across the first tangent.
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
        [-sw, 0.09, -0.45, sw, 0.09, -0.45, sw, 0.09, 0.45, -sw, 0.09, 0.45],
        3,
      ),
    );
    checkerGeo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    checkerGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const checkerMat = new THREE.MeshBasicMaterial({
      map: checkerMap,
      side: THREE.DoubleSide,
    });
    const checker = new THREE.Mesh(checkerGeo, checkerMat);
    checker.position.set(centre.x, 0, centre.z);
    checker.rotation.y = Math.atan2(tx, -ty);
    scene.add(checker);

    // Corner markers and DRS zones use the same detected geometry as 2D.
    const cornerGeo = new THREE.ConeGeometry(0.2, 0.6, 6);
    const cornerMat = new THREE.MeshStandardMaterial({
      color: 0xffb224,
      emissive: 0xffb224,
      emissiveIntensity: 0.55,
      roughness: 0.5,
    });
    for (const c of p.corners) {
      const w = mesh.projection.project(c.x, c.y);
      const marker = new THREE.Mesh(cornerGeo, cornerMat);
      marker.position.set(w.x, 0.34, w.z);
      scene.add(marker);
    }

    const zonePositions: number[] = [];
    for (const z of p.zones) {
      const a = mesh.projection.project(z.x0, z.y0);
      const b = mesh.projection.project(z.x1, z.y1);
      zonePositions.push(a.x, 0.08, a.z, b.x, 0.08, b.z);
    }
    const zoneGeo = new THREE.BufferGeometry();
    zoneGeo.setAttribute("position", new THREE.Float32BufferAttribute(zonePositions, 3));
    const zoneMat = new THREE.LineBasicMaterial({ color: 0xffb224, transparent: true, opacity: 0.45 });
    scene.add(new THREE.LineSegments(zoneGeo, zoneMat));

    const carGeos = {
      floor: new THREE.BoxGeometry(1.0, 0.16, 2.4),
      nose: new THREE.BoxGeometry(0.4, 0.12, 1.0),
      frontWing: new THREE.BoxGeometry(1.8, 0.05, 0.34),
      endplate: new THREE.BoxGeometry(0.05, 0.18, 0.35),
      rearWing: new THREE.BoxGeometry(1.4, 0.06, 0.28),
      rearPlate: new THREE.BoxGeometry(0.05, 0.3, 0.32),
      sidepod: new THREE.BoxGeometry(0.24, 0.2, 0.85),
      cockpit: new THREE.BoxGeometry(0.4, 0.2, 0.5),
      helmet: new THREE.SphereGeometry(0.14, 10, 8),
      wheel: new THREE.CylinderGeometry(0.25, 0.25, 0.2, 14),
      hub: new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10),
      light: new THREE.BoxGeometry(0.12, 0.08, 0.04),
    };
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x12161d, roughness: 0.75, metalness: 0.2 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8edf3, roughness: 0.45, metalness: 0.15 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const ringGeo = new THREE.RingGeometry(1.7, 2.2, 32);
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
      labelMat: THREE.SpriteMaterial;
      ring: THREE.Mesh;
    }[] = [];
    const bodies: THREE.Object3D[] = [];

    for (const dot of live.current.dots) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(dot.color),
        emissive: new THREE.Color(dot.color),
        emissiveIntensity: 0.22,
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
      part(carGeos.floor, mat, 0, 0.3, 0);
      part(carGeos.nose, mat, 0, 0.31, 1.55);
      part(carGeos.sidepod, mat, 0.58, 0.38, -0.15);
      part(carGeos.sidepod, mat, -0.58, 0.38, -0.15);
      part(carGeos.cockpit, mat, 0, 0.5, -0.05);
      part(carGeos.frontWing, darkMat, 0, 0.24, 2.02);
      part(carGeos.endplate, whiteMat, 0.9, 0.31, 2.02);
      part(carGeos.endplate, whiteMat, -0.9, 0.31, 2.02);
      part(carGeos.rearWing, darkMat, 0, 0.8, -1.22);
      part(carGeos.rearPlate, whiteMat, 0.7, 0.8, -1.22);
      part(carGeos.rearPlate, whiteMat, -0.7, 0.8, -1.22);
      part(carGeos.helmet, whiteMat, 0, 0.64, -0.18);
      part(carGeos.light, lightMat, 0, 0.48, -1.38);
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          part(carGeos.wheel, darkMat, side * 0.68, 0.27, end * 0.8, Math.PI / 2);
          part(carGeos.hub, mat, side * 0.68, 0.27, end * 0.8, Math.PI / 2);
        }
      }
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.11;
      ring.visible = false;
      group.add(ring);
      const labelMat = new THREE.SpriteMaterial({
        map: labelTexture(dot.code, dot.color, palette.ink, palette.chip),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const label = new THREE.Sprite(labelMat);
      label.scale.set(4.4, 1.8, 1);
      label.position.y = 1.9;
      label.renderOrder = 10;
      label.userData.driver = dot.driver;
      group.add(label);
      group.visible = false;
      group.userData.driver = dot.driver;
      scene.add(group);
      cars.push({ driver: dot.driver, group, mat, labelMat, ring });
      bodies.push(group);
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
      const hit = raycaster.intersectObjects(bodies, true)[0];
      if (hit) live.current.onDriver(hit.object.userData.driver as number);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const resize = () => {
      const width = Math.max(240, wrap.clientWidth);
      const height = Math.max(320, wrap.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (!fitted) {
        // Fit every ribbon vertex to ~86% of the viewport. A fixed distance is
        // too far on portrait phones and too close on ultrawide screens.
        const dir = new THREE.Vector3(0.55, 0.6, 0.75).normalize();
        let lo = 40;
        let hi = 500;
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
        car.mat.emissiveIntensity = isSelected ? 0.55 : 0.22;
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
      trackMap.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      grid.geometry.dispose();
      gridMat.dispose();
      checkerGeo.dispose();
      checkerMat.dispose();
      checkerMap.dispose();
      cornerGeo.dispose();
      cornerMat.dispose();
      zoneGeo.dispose();
      zoneMat.dispose();
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
    mat: THREE.MeshStandardMaterial;
    labelMat: THREE.SpriteMaterial;
  }[],
) {
  for (const car of cars) {
    car.mat.dispose();
    car.labelMat.map?.dispose();
    car.labelMat.dispose();
  }
}
