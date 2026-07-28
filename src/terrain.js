import * as THREE from 'three';

// ponytail: inline value noise, no noise library; swap for simplex if terrain gets boring
export const SIZE = 140, SEGS = 160;
export const WATER_LEVEL = -0.75;

// areas flattened into the terrain so the house, farm, pond and hives sit naturally
export const SPOTS = {
  house: { x: 0, z: 0, r: 11, h: 0.3 },
  farm: { x: -20, z: 15, r: 10, h: 0.4 },
  pond: { x: -15, z: -20, r: 8, h: -2.2 },
  hives: { x: 18, z: -18, r: 6, h: 0.5 },
};

function noise2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = noise2(xi, yi), b = noise2(xi + 1, yi), c = noise2(xi, yi + 1), d = noise2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a, b, t) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

function baseHeight(x, z) {
  let h = valueNoise(x * 0.025 + 10, z * 0.025 + 10) * 7 + valueNoise(x * 0.09, z * 0.09) * 1.6 - 3.2;
  for (const s of Object.values(SPOTS)) {
    const w = smooth(1, 0.35, Math.hypot(x - s.x, z - s.z) / s.r);
    h = h + (s.h - h) * w;
  }
  return h;
}

export const terrainGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
terrainGeo.rotateX(-Math.PI / 2);
export const pos = terrainGeo.attributes.position;
for (let i = 0; i < pos.count; i++) pos.setY(i, baseHeight(pos.getX(i), pos.getZ(i)));
terrainGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));

const sand = new THREE.Color(0xcfc08b), grassLo = new THREE.Color(0x79a84e),
  grassHi = new THREE.Color(0x5d8f3e), rock = new THREE.Color(0x9b968c);
function recolorTerrain() {
  const col = terrainGeo.attributes.color;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    c.lerpColors(sand, grassLo, smooth(-0.45, 0.25, h));
    c.lerp(grassHi, smooth(1.5, 3.5, h) * 0.8);
    c.lerp(rock, smooth(4.2, 6, h));
    c.offsetHSL(0, 0, (noise2(i, 7) - 0.5) * 0.045);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

export function refreshTerrain() {
  pos.needsUpdate = true;
  terrainGeo.computeVertexNormals();
  recolorTerrain();
}
refreshTerrain();

export const terrain = new THREE.Mesh(
  terrainGeo,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
);
terrain.receiveShadow = true;

export function terrainHeightAt(x, z) {
  // nearest-vertex sample; good enough for characters on gentle terrain
  const gx = Math.round((x / SIZE + 0.5) * SEGS), gz = Math.round((z / SIZE + 0.5) * SEGS);
  const cx = Math.max(0, Math.min(SEGS, gx)), cz = Math.max(0, Math.min(SEGS, gz));
  return pos.getY(cz * (SEGS + 1) + cx);
}

export function sculptAt(point, dir) {
  const radius = 5, strength = 3;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i) - point.x, pos.getZ(i) - point.z);
    if (d < radius) {
      const falloff = Math.cos((d / radius) * Math.PI * 0.5) ** 2;
      pos.setY(i, pos.getY(i) + dir * strength * falloff * 0.05);
    }
  }
  refreshTerrain();
}
