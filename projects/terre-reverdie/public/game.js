// Terre Reverdie : jeu de restauration écologique (city builder inversé).
// Dépolluer, irriguer, faire pousser, puis recycler toutes les machines.
// Rendu Three.js en axonométrie 2:1, rendu basse résolution puis agrandi sans lissage (pixel art).
import * as THREE from 'three';

const W = 64, H = 40;
const PIXEL = 2; // taille d'un pixel du rendu en pixels physiques ; plus petit = plus fin
const DEAD = 0, TOXIC = 1, SOIL = 2, GRASS = 3, WATER = 4, FOREST = 5, ROCK = 6;
const COLORS = {
  [DEAD]: 0x8a7a64, [TOXIC]: 0x7d7a3e, [SOIL]: 0x7a5636,
  [GRASS]: 0x6fa548, [WATER]: 0x3d7fb8, [FOREST]: 0x4a8a3c, [ROCK]: 0x9a958c,
};
const HEIGHT = { [DEAD]: 0.5, [TOXIC]: 0.45, [SOIL]: 0.5, [GRASS]: 0.55, [WATER]: 0.3, [FOREST]: 0.55, [ROCK]: 1.1 };
const GOALS = { green: 0.55, water: 0.08, forest: 0.15 };

// Chaque machine : coût, rayon d'action, terrains où on peut la poser, effet sur une case du rayon.
const TOOLS = {
  turbine: { name: 'Éolienne', key: '1', cost: 10, r: 4.5, on: [DEAD, SOIL, ROCK, GRASS], hint: 'alimente les machines' },
  cleaner: { name: 'Dépollueur', key: '2', cost: 8, r: 2.5, on: [DEAD, TOXIC, SOIL], hint: 'sol mort/toxique → terre',
    act: t => (t === DEAD || t === TOXIC ? SOIL : t) },
  sprinkler: { name: 'Arroseur', key: '3', cost: 12, r: 3.5, on: [SOIL, GRASS], hint: 'terre → prairie (+1 graine)',
    act: t => (t === SOIL ? GRASS : t) },
  pump: { name: 'Pompe', key: '4', cost: 15, r: 1.5, on: [SOIL, GRASS], hint: 'creuse un étang' },
  nursery: { name: 'Pépinière', key: '5', cost: 20, r: 3.5, on: [GRASS], hint: 'prairie près de l\'eau → forêt (+2)',
    act: (t, x, y) => (t === GRASS && near(x, y, 2.5, WATER) ? FOREST : t) },
  recycle: { name: 'Recycler', key: '6', hint: 'retire une machine (rend 50 %) · clic droit' },
};

let tiles, shade, base, occ, machines, seeds, tool = 'turbine', hover = null, won = false, dirty = true;

const idx = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const top = i => base[i] + HEIGHT[tiles[i]];
const wx = x => x - W / 2 + 0.5, wz = y => y - H / 2 + 0.5;

function* around(x, y, r) {
  for (let j = Math.floor(y - r); j <= y + r; j++)
    for (let i = Math.floor(x - r); i <= x + r; i++)
      if (inside(i, j) && (i - x) ** 2 + (j - y) ** 2 <= r * r) yield [i, j];
}
function near(x, y, r, type) {
  for (const [i, j] of around(x, y, r)) if (tiles[idx(i, j)] === type) return true;
  return false;
}

// Bruit de valeur lissé, suffisant pour le relief, la pollution et les affleurements rocheux.
function noise(scale) {
  const gw = Math.ceil(W / scale) + 2, gh = Math.ceil(H / scale) + 2;
  const g = Array.from({ length: gw * gh }, Math.random);
  const s = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = s(fx - ix), ty = s(fy - iy), v = (a, b) => g[(iy + b) * gw + ix + a];
    return (v(0, 0) * (1 - tx) + v(1, 0) * tx) * (1 - ty) + (v(0, 1) * (1 - tx) + v(1, 1) * tx) * ty;
  };
}

// --- Scène ---
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1712);
scene.add(new THREE.HemisphereLight(0xfff2dd, 0x3a3020, 1.4));
const sun = new THREE.DirectionalLight(0xffe8c0, 2.2);
sun.position.set(-30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45 }).updateProjectionMatrix();
scene.add(sun);

// Axonométrie 2:1 du pixel art : caméra à 30° d'élévation, 45° d'azimut.
const camera = new THREE.OrthographicCamera();
const target = new THREE.Vector3();
const VIEW = 30;
function placeCamera() {
  camera.position.copy(target).add(new THREE.Vector3(50, 50 * Math.tan(Math.PI / 6) * Math.SQRT2, 50));
  camera.lookAt(target);
}
function resize() {
  const a = innerWidth / innerHeight;
  Object.assign(camera, { left: -VIEW * a, right: VIEW * a, top: VIEW, bottom: -VIEW, near: 1, far: 300 });
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(devicePixelRatio / PIXEL);
  renderer.setSize(innerWidth, innerHeight, false);
}
addEventListener('resize', resize);
resize(); placeCamera();
camera.zoom = 1.5; camera.updateProjectionMatrix();

const lambert = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const ground = new THREE.InstancedMesh(boxGeo, lambert(0xffffff), W * H);
ground.castShadow = ground.receiveShadow = true;
scene.add(ground);
const treeGeo = new THREE.ConeGeometry(0.32, 0.9, 6).translate(0, 0.55, 0);
const trees = new THREE.InstancedMesh(treeGeo, lambert(0x2c5e2e), W * H);
trees.castShadow = true;
scene.add(trees);
const blob = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.08, 0.18), lambert(0xc9d24a), W * H);
scene.add(blob); // flaques toxiques

const m4 = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion();
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function refreshTiles(time) {
  let nt = 0, nb = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y), t = tiles[i];
    let h = top(i);
    if (t === WATER) h += Math.sin(time / 700 + x * 0.7 + y * 0.4) * 0.03;
    ground.setMatrixAt(i, m4.compose(v3(wx(x), 0, wz(y)), q, v3(1, h, 1)));
    if (!dirty) continue;
    ground.setColorAt(i, col.set(COLORS[t]).multiplyScalar(1 + shade[i]));
    const jx = shade[i] * 2, jz = shade[(i * 7) % shade.length] * 2;
    if (t === FOREST) trees.setMatrixAt(nt++, m4.compose(v3(wx(x) + jx, h, wz(y) + jz), q, v3(1, 1 + shade[i] * 3, 1)));
    if (t === TOXIC) blob.setMatrixAt(nb++, m4.makeTranslation(wx(x) + jx, h, wz(y) - jz));
  }
  ground.instanceMatrix.needsUpdate = true;
  if (!dirty) return;
  ground.instanceColor.needsUpdate = trees.instanceMatrix.needsUpdate = blob.instanceMatrix.needsUpdate = true;
  trees.count = nt; blob.count = nb;
  dirty = false;
}

// Anneau pointillé de rayon 1, mis à l'échelle du rayon voulu.
function ring(color) {
  const pts = Array.from({ length: 65 }, (_, k) => v3(Math.cos(k / 32 * Math.PI), 0, Math.sin(k / 32 * Math.PI)));
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.8 }));
  l.computeLineDistances();
  l.visible = false;
  return l;
}
const hoverRing = ring(0xffffff);
const cursor = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 0.1, 1.02)), new THREE.LineBasicMaterial({ color: 0xffffff }));
cursor.visible = false;
scene.add(hoverRing, cursor);

function mesh(geo, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, color instanceof THREE.Material ? color : lambert(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function buildMachine(m) {
  const g = new THREE.Group();
  if (m.type === 'turbine') {
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.8, 6), 0xe8e4dc, 0, 0.9, 0));
    m.spinner = new THREE.Group();
    m.spinner.position.set(0.12, 1.8, 0.12);
    m.spinner.rotation.y = Math.PI / 4;
    for (let k = 0; k < 3; k++) {
      const b = mesh(new THREE.BoxGeometry(0.06, 0.75, 0.03).translate(0, 0.37, 0), 0xf4f1ea);
      b.rotation.z = k * Math.PI * 2 / 3;
      m.spinner.add(b);
    }
    g.add(m.spinner);
    m.range = ring(0xffe680);
    m.range.scale.setScalar(TOOLS.turbine.r);
    g.add(m.range);
  } else if (m.type === 'cleaner') {
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), 0x8a8f96, 0, 0.25, 0));
    m.light = new THREE.MeshLambertMaterial({ color: 0x96f078, emissive: 0x3cb030 });
    g.add(mesh(new THREE.SphereGeometry(0.16, 6, 4), m.light, 0, 0.58, 0));
  } else if (m.type === 'sprinkler') {
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.3, 8), 0x4a7fb0, 0, 0.15, 0));
    m.spinner = mesh(new THREE.BoxGeometry(0.9, 0.05, 0.06), 0xb4dcff, 0, 0.35, 0);
    g.add(m.spinner);
  } else if (m.type === 'pump') {
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), 0x2d4f70, 0, 0.2, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 6), 0x9cc8ee, 0, 0.6, 0));
  } else if (m.type === 'nursery') {
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), 0x7a5a3a, 0, 0.1, 0));
    g.add(mesh(new THREE.ConeGeometry(0.28, 0.7, 6), 0x3f9a4a, 0, 0.55, 0));
  }
  if (TOOLS[m.type].act) {
    m.off = mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xff5040 }), 0, 1.1, 0);
    g.add(m.off);
  }
  g.position.set(wx(m.x), top(idx(m.x, m.y)), wz(m.y));
  scene.add(g);
  m.obj = g;
}

// --- Jeu ---
function newGame() {
  const tox = noise(7), rock = noise(9), relief = noise(12);
  tiles = new Uint8Array(W * H); shade = new Float32Array(W * H); base = new Float32Array(W * H); occ = new Int16Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    tiles[i] = rock(x, y) > 0.72 ? ROCK : tox(x, y) > 0.55 ? TOXIC : DEAD;
    base[i] = Math.floor(relief(x, y) * 4) * 0.25;
    shade[i] = Math.random() * 0.12 - 0.06;
  }
  machines?.forEach(m => scene.remove(m.obj));
  machines = []; seeds = 50; won = false; dirty = true;
  ground.boundingSphere = null;
  say('Pose des éoliennes, puis des dépollueurs et des arroseurs dans leur rayon.');
}

function powered(m) {
  return m.type === 'turbine' || machines.some(o => o.type === 'turbine' && (o.x - m.x) ** 2 + (o.y - m.y) ** 2 <= TOOLS.turbine.r ** 2);
}

function canPlace(type, x, y) {
  if (!inside(x, y)) return false;
  const i = idx(x, y);
  if (type === 'recycle') return occ[i] >= 0;
  return occ[i] < 0 && TOOLS[type].on.includes(tiles[i]) && seeds >= TOOLS[type].cost;
}

function click(x, y, as = tool) {
  if (won || !canPlace(as, x, y)) return;
  const i = idx(x, y);
  dirty = true;
  if (as === 'recycle') {
    const m = machines[occ[i]];
    seeds += Math.floor(TOOLS[m.type].cost / 2);
    scene.remove(m.obj);
    machines.splice(occ[i], 1);
    occ.fill(-1); machines.forEach((m, k) => (occ[idx(m.x, m.y)] = k));
    if (tiles[i] !== WATER && tiles[i] !== ROCK) tiles[i] = near(x, y, 1.5, FOREST) ? FOREST : near(x, y, 1.5, GRASS) ? GRASS : SOIL;
  } else {
    seeds -= TOOLS[as].cost;
    if (as === 'pump') for (const [a, b] of around(x, y, TOOLS.pump.r)) {
      const j = idx(a, b);
      if (j !== i && occ[j] < 0 && tiles[j] !== ROCK) tiles[j] = WATER;
    }
    const m = { type: as, x, y };
    occ[i] = machines.push(m) - 1;
    buildMachine(m);
  }
}

function stats() {
  let land = 0, green = 0, water = 0, forest = 0;
  for (const t of tiles) {
    if (t === ROCK) continue;
    land++;
    if (t === GRASS || t === FOREST) green++;
    if (t === WATER) water++;
    if (t === FOREST) forest++;
  }
  return { green: green / land, water: water / land, forest: forest / land };
}

// Une case transformée par machine alimentée et par tick.
function tick() {
  if (won) return;
  for (const m of machines) {
    const def = TOOLS[m.type];
    if (!def.act || !powered(m)) continue;
    const cells = [...around(m.x, m.y, def.r)].filter(([a, b]) => occ[idx(a, b)] < 0);
    for (let tries = 0; tries < 4 && cells.length; tries++) {
      const [a, b] = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
      const j = idx(a, b), before = tiles[j], after = def.act(before, a, b);
      if (after === before) continue;
      tiles[j] = after; dirty = true;
      seeds += after === GRASS ? 1 : after === FOREST ? 2 : 0;
      break;
    }
  }
  const s = stats(), done = s.green >= GOALS.green && s.water >= GOALS.water && s.forest >= GOALS.forest;
  for (const k in GOALS) {
    const el = document.getElementById('g-' + k);
    el.querySelector('i').style.width = Math.min(100, (s[k] / GOALS[k]) * 100) + '%';
    el.classList.toggle('ok', s[k] >= GOALS[k]);
  }
  if (done && !machines.length) {
    won = true;
    say('La terre respire de nouveau, sans une seule machine. Victoire ! (R pour une nouvelle carte)');
  } else if (done) say('Objectifs atteints : recycle toutes les machines pour rendre la terre à elle-même.');
  else if (!machines.length && seeds < TOOLS.cleaner.cost) say('Plus assez de graines… R pour recommencer.');
}

function say(t) { document.getElementById('msg').textContent = t; }

function frame(time) {
  refreshTiles(time);
  for (const m of machines) {
    const on = powered(m);
    if (m.spinner && on) m.spinner.rotation[m.type === 'turbine' ? 'z' : 'y'] = time / 250;
    if (m.light) m.light.emissiveIntensity = on ? 0.6 + Math.sin(time / 200) * 0.4 : 0;
    if (m.off) m.off.visible = !on;
    if (m.range) m.range.visible = !!hover && tool !== 'turbine' && tool !== 'recycle';
  }
  cursor.visible = hoverRing.visible = !!hover;
  if (hover) {
    const ok = canPlace(tool, hover.x, hover.y), h = top(idx(hover.x, hover.y)) + 0.05;
    cursor.position.set(wx(hover.x), h, wz(hover.y));
    cursor.material.color.set(ok ? 0xffffff : 0xff5a46);
    hoverRing.visible = tool !== 'recycle';
    hoverRing.position.set(wx(hover.x), h, wz(hover.y));
    hoverRing.scale.setScalar(TOOLS[tool].r || 1);
    hoverRing.material.color.set(ok ? 0xffffff : 0xff5a46);
  }
  document.getElementById('seeds').textContent = seeds;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// --- Interface ---
const bar = document.getElementById('tools');
for (const [id, d] of Object.entries(TOOLS)) {
  const b = document.createElement('button');
  b.dataset.tool = id;
  b.innerHTML = `${d.key}. ${d.name}${d.cost ? ` — ${d.cost}` : ''}<small>${d.hint}</small>`;
  b.onclick = () => select(id);
  bar.append(b);
}
function select(id) {
  tool = id;
  for (const b of bar.children) b.classList.toggle('on', b.dataset.tool === id);
}

const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function cell(e) {
  ptr.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObject(ground)[0];
  return hit ? { x: hit.instanceId % W, y: Math.floor(hit.instanceId / W) } : null;
}
const canvas = renderer.domElement;
canvas.onmousemove = e => (hover = cell(e));
canvas.onmouseleave = () => (hover = null);
canvas.onclick = e => { const c = cell(e); if (c) click(c.x, c.y); };
canvas.oncontextmenu = e => { e.preventDefault(); const c = cell(e); if (c) click(c.x, c.y, 'recycle'); };
canvas.onwheel = e => {
  camera.zoom = Math.min(5, Math.max(0.8, camera.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
  camera.updateProjectionMatrix();
};
const PAN = { ArrowUp: [-1, -1], ArrowDown: [1, 1], ArrowLeft: [-1, 1], ArrowRight: [1, -1] };
addEventListener('keydown', e => {
  const t = Object.keys(TOOLS).find(k => TOOLS[k].key === e.key);
  if (t) select(t);
  if (e.key === 'r' || e.key === 'R') newGame();
  if (PAN[e.key]) { target.x += PAN[e.key][0] * 2 / camera.zoom; target.z += PAN[e.key][1] * 2 / camera.zoom; placeCamera(); }
});

newGame();
select('turbine');
setInterval(tick, 200);
requestAnimationFrame(frame);
