import * as THREE from 'three';
import { SPOTS, terrainHeightAt } from './terrain.js';

// ponytail: no wall collision — add AABB if walking through walls hurts
export function houseSurfaceAt(x, z) {
  const hx = x - SPOTS.house.x, hz = z - SPOTS.house.z;
  if (Math.abs(hx) <= 5.3 && hz >= -5.8 && hz <= 5.8) return SPOTS.house.h + 0.4; // interior
  if (Math.abs(hx) <= 3.8 && hz > 5.8 && hz <= 8.2) return SPOTS.house.h + 0.15;  // sitout
  return -Infinity;
}

export const groundAt = (x, z) => Math.max(terrainHeightAt(x, z), houseSurfaceAt(x, z));

// Kerala traditional duplex house (tharavadu style) — cream walls, terracotta hip roofs,
// central Nadumuttam courtyard, sitout verandah, duplex upper floor with balcony
export function createHouse() {
  const g = new THREE.Group();

  const wallMat  = new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.8 });
  const roofMat  = new THREE.MeshStandardMaterial({ color: 0xb5441a, roughness: 0.95, side: THREE.DoubleSide });
  const woodMat  = new THREE.MeshStandardMaterial({ color: 0x3d2008, roughness: 0.85 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xc8bfad, roughness: 1 });
  const courtMat = new THREE.MeshStandardMaterial({ color: 0xddd5c5, roughness: 0.9 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fc4d8, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.4,
  });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.4, metalness: 0.6 });

  const box = (mat, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m); return m;
  };

  // window helper: glass panel + 4-strip dark teak frame
  // axis='x' → window is on a wall facing X; axis='z' → facing Z
  const addWindow = (cx, cy, cz, axis) => {
    const [gw, gd] = axis === 'x' ? [0.08, 1.2] : [1.2, 0.08];
    const [fw, fd] = axis === 'x' ? [0.11, 1.42] : [1.42, 0.11];
    box(glassMat, gw, 0.85, gd, cx, cy, cz);
    box(woodMat, fw, 0.1, fd, cx, cy + 0.48, cz); // top rail
    box(woodMat, fw, 0.1, fd, cx, cy - 0.48, cz); // bottom rail
    if (axis === 'x') {
      box(woodMat, 0.11, 1.0, 0.1, cx, cy, cz - 0.65);
      box(woodMat, 0.11, 1.0, 0.1, cx, cy, cz + 0.65);
    } else {
      box(woodMat, 0.1, 1.0, 0.11, cx - 0.65, cy, cz);
      box(woodMat, 0.1, 1.0, 0.11, cx + 0.65, cy, cz);
    }
  };

  // custom quad roof face (for hip roof panels)
  const addRoofFace = (a, b, c, d) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]), 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, roofMat);
    m.castShadow = true; g.add(m);
  };

  // ─── Plinth (raised stone base) ──────────────────────────────────
  box(stoneMat, 11.8, 0.4, 12.8, 0, -0.1, 0);

  // ─── Perimeter Walls (h=2.8, t=0.35) ────────────────────────────
  box(wallMat, 11, 2.8, 0.35, 0, 1.4, -6);        // back (N)
  box(wallMat, 0.35, 2.8, 12, -5.5, 1.4, 0);       // left (W)
  box(wallMat, 0.35, 2.8, 12, 5.5, 1.4, 0);        // right (E)
  box(wallMat, 4.25, 2.8, 0.35, -3.0, 1.4, 6);     // front-left
  box(wallMat, 4.25, 2.8, 0.35,  3.0, 1.4, 6);     // front-right

  // Entrance door frame + two panels (traditional carved teak look)
  box(woodMat, 2.1, 2.6, 0.16, 0, 1.3, 6);         // door surround
  box(woodMat, 0.85, 2.2, 0.08, -0.48, 1.1, 6.05); // left panel
  box(woodMat, 0.85, 2.2, 0.08,  0.48, 1.1, 6.05); // right panel
  // decorative header above door
  box(woodMat, 2.2, 0.22, 0.18, 0, 2.72, 6);

  // ─── Nadumuttam (central open courtyard) ─────────────────────────
  box(courtMat, 3.4, 0.06, 3.4, 0, 0.03, 0);       // lime-plaster floor
  // 4 low inner walls framing the open sky
  box(wallMat, 4.0, 1.1, 0.2, 0, 0.55, 1.85);
  box(wallMat, 4.0, 1.1, 0.2, 0, 0.55, -1.85);
  box(wallMat, 0.2, 1.1, 4.0, -1.85, 0.55, 0);
  box(wallMat, 0.2, 1.1, 4.0,  1.85, 0.55, 0);
  // Tulsi (holy basil) plant in center of courtyard
  const tulsi = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x3d7a28, roughness: 0.9 }));
  tulsi.scale.set(1, 1.4, 1); tulsi.position.set(0, 0.4, 0); g.add(tulsi);

  // ─── Interior partitions (for visual depth) ──────────────────────
  box(wallMat, 0.2, 2.6, 5.2, 2.5, 1.3, -1.8);    // kitchen partition (right side)
  box(wallMat, 3.5, 2.6, 0.2, 3.75, 1.3, 2.8);    // puja room front wall

  // ─── Windows ────────────────────────────────────────────────────
  addWindow(-5.5, 1.8, -3.5, 'x');  // left wall, back
  addWindow(-5.5, 1.8,  2.0, 'x');  // left wall, front
  addWindow( 5.5, 1.8, -3.5, 'x');  // right wall, back
  addWindow( 5.5, 1.8,  2.0, 'x');  // right wall, front
  addWindow(   0, 1.8,   -6, 'z');  // back wall

  // ─── Kitchen counter (right-back quadrant) ───────────────────────
  box(woodMat, 3.2, 0.85, 0.65, 3.8, 0.85, -4.5);
  box(stoneMat, 3.3, 0.07, 0.7, 3.8, 1.31, -4.5); // granite top

  // ─── Puja corner (right-front: lamp stand + brass bowl) ──────────
  const lampStand = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.6, 8), brassMat);
  lampStand.position.set(-3.8, 0.6, 2.8); g.add(lampStand);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.1, 12), brassMat);
  bowl.position.set(-3.8, 0.95, 2.8); g.add(bowl);
  // tiny flame
  const pujaFlame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 6),
    new THREE.MeshStandardMaterial({ color: 0xff8c2e, emissive: 0xff4400, emissiveIntensity: 2 }));
  pujaFlame.position.set(-3.8, 1.12, 2.8); g.add(pujaFlame);

  // ─── Sitout / Front Verandah ─────────────────────────────────────
  box(stoneMat, 7.4, 0.14, 2.2, 0, 0.07, 7.2);    // floor
  // 6 tapered teak pillars
  for (const px of [-3.0, -1.5, 0, 1.5, 3.0]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 2.75, 8), woodMat);
    col.position.set(px, 1.375, 7.5); col.castShadow = true; g.add(col);
    // pillar capital (carved top)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.32), woodMat);
    cap.position.set(px, 2.82, 7.5); g.add(cap);
  }
  // lintel connecting pillar tops
  box(woodMat, 7.2, 0.16, 0.16, 0, 2.84, 7.5);
  // Sitout steps (2 risers)
  box(stoneMat, 3.4, 0.16, 0.7, 0, 0.08, 8.35);
  box(stoneMat, 3.0, 0.16, 0.7, 0, -0.08, 9.05);

  // ─── Ground Floor Hip Roof ────────────────────────────────────────
  // 4 custom trapezoidal faces — terracotta tiles
  // Eave at y=2.8 with 0.8 overhang all around (except south extends to cover sitout lintel)
  // Ridge at y=4.5, runs 5 units along X axis
  const ey = 2.8, ry = 4.5;
  const sw = [-6.3, ey, 6.8], se = [6.3, ey, 6.8];
  const nw = [-6.3, ey, -6.8], ne = [6.3, ey, -6.8];
  const rs1 = [-2.5, ry, 2.8], rs2 = [2.5, ry, 2.8]; // south ridge ends
  const rn1 = [-2.5, ry, -2.8], rn2 = [2.5, ry, -2.8]; // north ridge ends

  addRoofFace(sw, se, rs2, rs1); // south slope
  addRoofFace(ne, nw, rn1, rn2); // north slope
  addRoofFace(nw, sw, rs1, rn1); // west hip
  addRoofFace(se, ne, rn2, rs2); // east hip

  // Ridge beam + ornamental finial
  box(woodMat, 5.4, 0.28, 0.42, 0, ry + 0.14, 0);  // ridge cap beam
  const fn1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 0.7, 8), woodMat);
  fn1.position.set(0, ry + 0.63, 0); g.add(fn1);
  const fn2 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), brassMat);
  fn2.position.set(0, ry + 1.06, 0); g.add(fn2);

  // ─── Upper Floor (duplex) ─────────────────────────────────────────
  const uf = 2.8; // upper floor base Y
  // Floor slab
  box(stoneMat, 7.6, 0.22, 9.6, 0, uf + 0.11, 0);
  // Perimeter walls (h=1.8)
  box(wallMat, 7.2, 1.8, 0.3, 0, uf + 0.9, -4.65);  // N
  box(wallMat, 0.3, 1.8, 9.6, -3.65, uf + 0.9, 0);   // W
  box(wallMat, 0.3, 1.8, 9.6,  3.65, uf + 0.9, 0);   // E
  // Front wall of upper floor: two halves with door gap for balcony access
  box(wallMat, 2.5, 1.8, 0.3, -2.35, uf + 0.9, 4.65);
  box(wallMat, 2.5, 1.8, 0.3,  2.35, uf + 0.9, 4.65);
  // Upper floor windows
  addWindow(-3.65, uf + 1.0, -2.5, 'x');
  addWindow(-3.65, uf + 1.0,  1.5, 'x');
  addWindow( 3.65, uf + 1.0, -2.5, 'x');
  addWindow( 3.65, uf + 1.0,  1.5, 'x');
  addWindow(0, uf + 1.0, -4.65, 'z'); // back

  // Front balcony
  box(stoneMat, 5.4, 0.16, 1.4, 0, uf + 0.18, 5.35);
  for (const bx of [-2.1, -0.7, 0.7, 2.1]) {
    const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.05, 6), woodMat);
    bp.position.set(bx, uf + 0.74, 5.95); g.add(bp);
  }
  box(woodMat, 5.6, 0.09, 0.09, 0, uf + 1.3, 6.02); // balcony railing

  // ─── Upper Floor Hip Roof ─────────────────────────────────────────
  const uey = uf + 1.8, ury = uey + 1.45; // upper eave, upper ridge heights
  const usw = [-4.25, uey, 5.25], use2 = [4.25, uey, 5.25];
  const unw = [-4.25, uey, -5.25], une = [4.25, uey, -5.25];
  const urs1 = [-1.8, ury, 2.2], urs2 = [1.8, ury, 2.2];
  const urn1 = [-1.8, ury, -2.2], urn2 = [1.8, ury, -2.2];

  addRoofFace(usw, use2, urs2, urs1);
  addRoofFace(une, unw, urn1, urn2);
  addRoofFace(unw, usw, urs1, urn1);
  addRoofFace(use2, une, urn2, urs2);

  box(woodMat, 3.8, 0.22, 0.34, 0, ury + 0.11, 0); // upper ridge beam
  const ufn1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.1, 0.5, 8), woodMat);
  ufn1.position.set(0, ury + 0.44, 0); g.add(ufn1);
  const ufn2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), brassMat);
  ufn2.position.set(0, ury + 0.74, 0); g.add(ufn2);

  // ─── Interior lighting (Nadumuttam courtyard lamp) ────────────────
  const shadeMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.3, 0.35, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe6b8, emissive: 0xffc98a, emissiveIntensity: 0.15 }));
  shadeMesh.position.set(0, 2.2, 0); g.add(shadeMesh);
  const light = new THREE.PointLight(0xffc98a, 0, 18, 1.6);
  light.position.set(0, 2.3, 0);
  g.add(light);
  g.userData.lampShade = shadeMesh;
  g.userData.light = light;

  g.position.set(SPOTS.house.x, SPOTS.house.h, SPOTS.house.z);
  return g;
}
