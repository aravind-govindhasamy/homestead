import * as THREE from 'three';

// ponytail: inline value noise, no noise library; swap for simplex if terrain gets boring
export const SIZE = 100, SEGS = 128;

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
function baseHeight(x, z) {
  return valueNoise(x * 0.03 + 10, z * 0.03 + 10) * 6 + valueNoise(x * 0.1, z * 0.1) * 1.5 - 3;
}

export const terrainGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
terrainGeo.rotateX(-Math.PI / 2);
export const pos = terrainGeo.attributes.position;
for (let i = 0; i < pos.count; i++) pos.setY(i, baseHeight(pos.getX(i), pos.getZ(i)));
terrainGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));

const grass = new THREE.Color(0x5c8a3a), dirt = new THREE.Color(0x8a6d4a), rock = new THREE.Color(0x888888);
function recolorTerrain() {
  const col = terrainGeo.attributes.color;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    if (h < 0.5) c.copy(dirt);
    else if (h > 4) c.copy(rock);
    else c.copy(grass);
    c.offsetHSL(0, 0, (noise2(i, 7) - 0.5) * 0.05);
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

export const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
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
