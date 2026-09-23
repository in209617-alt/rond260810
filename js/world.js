// 맵 생성 + 스프라이트
// 시드 난수를 쓰기 때문에 두 플레이어의 브라우저에서 항상 똑같은 맵이 만들어집니다.

export const T = 16;            // 타일 크기(px)
export const MW = 60, MH = 45;  // 맵 크기(타일)
export const WALK = 62, RUN = 110; // 이동 속도(px/초)
export const MAP_SEED = 20260924;

export const PAL = {
  grass1: "#79b84a", grass2: "#6fae43", blade: "#93cf5c", bladeDark: "#4f8a30",
  path: "#d2ab72", pathDark: "#b98e57", pathLight: "#e3c28c",
  water: "#4aa3c7", waterDeep: "#3a86ad", waterLight: "#9fdcef", shore: "#8a6a3e",
  trunk: "#7a4b2a", trunkDark: "#553219",
  leafDark: "#2d6436", leafMid: "#3f8a45", leafLight: "#5fab52", leafHi: "#8fd064",
  pineDark: "#1f5236", pineMid: "#2f7045", pineLight: "#4b9458",
  rock: "#9aa0a6", rockDark: "#6f757c", rockLight: "#c9cdd1",
  shadow: "rgba(24, 48, 18, 0.28)"
};

// ---------- 유틸 ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.imageSmoothingEnabled = false;
  return [c, x];
}
function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) ctx.fillRect(x, y, 1, 1);
    }
}
// 불투명 픽셀 주변에 1px 외곽선
function outline(canvas, color) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  const a = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  ctx.fillStyle = color;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!a(x, y) && (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1))) ctx.fillRect(x, y, 1, 1);
}

// ---------- 맵 데이터 ----------
export const GRASS = 0, PATH = 1, WATER = 2;
export const ground = new Uint8Array(MW * MH);
export const solid = new Uint8Array(MW * MH);
const occupied = new Uint8Array(MW * MH);
export const idx = (x, y) => y * MW + x;
export const inMap = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
export const SPAWN = { tx: 28, ty: 25 };
export const objects = [];

const rng = mulberry32(MAP_SEED);
const dist2 = (x, y, a, b) => (x - a) * (x - a) + (y - b) * (y - b);

// 연못
const pond = { x: 42, y: 14, rx: 6.5, ry: 4.2 };
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
  const ang = Math.atan2(y - pond.y, x - pond.x);
  const wob = 1 + 0.12 * Math.sin(ang * 3 + 1) + 0.08 * Math.sin(ang * 5);
  const dx = (x - pond.x) / (pond.rx * wob), dy = (y - pond.y) / (pond.ry * wob);
  if (dx * dx + dy * dy < 1) ground[idx(x, y)] = WATER;
}

// 흙길
function carvePath(points) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
      for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) {
        const gx = Math.round(px) + ox, gy = Math.round(py) + oy;
        if (inMap(gx, gy) && ground[idx(gx, gy)] !== WATER) ground[idx(gx, gy)] = PATH;
      }
    }
  }
}
carvePath([[0, 29], [7, 28], [13, 30], [19, 27], [25, 27], [28, 26], [33, 26], [36, 22], [37, 19], [36, 18]]);
carvePath([[28, 27], [29, 32], [27, 37], [30, 44]]);

function place(type, tx, ty, isSolid, extra) {
  objects.push(Object.assign({ type, tx, ty, x: tx * T + T / 2, y: ty * T + T }, extra || {}));
  occupied[idx(tx, ty)] = 1;
  if (isSolid) solid[idx(tx, ty)] = 1;
}
function freeAround(tx, ty, r) {
  for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++)
    if (inMap(x, y) && occupied[idx(x, y)]) return false;
  return true;
}
function near(tx, ty, r, type) {
  for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++)
    if (inMap(x, y) && ground[idx(x, y)] === type) return true;
  return false;
}

place("sign", SPAWN.tx + 3, SPAWN.ty - 2, true);

// 가장자리 숲 + 내부 나무
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
  if (ground[idx(x, y)] !== GRASS || occupied[idx(x, y)]) continue;
  const edge = Math.min(x, y, MW - 1 - x, MH - 1 - y);
  if (dist2(x, y, SPAWN.tx, SPAWN.ty) < 36 || near(x, y, 1, PATH) || near(x, y, 1, WATER)) continue;
  const p = edge < 1 ? 1 : edge < 3 ? 0.62 : edge < 5 ? 0.22 : 0.05;
  if (rng() < p && (edge < 1 || freeAround(x, y, edge < 3 ? 0 : 1))) {
    const pine = rng() < (x > 30 && y > 22 ? 0.55 : 0.25);
    place(pine ? "pine" : "tree", x, y, true, { v: rng() });
  }
}
// 덤불·바위·그루터기
for (let y = 2; y < MH - 2; y++) for (let x = 2; x < MW - 2; x++) {
  if (ground[idx(x, y)] !== GRASS || occupied[idx(x, y)]) continue;
  if (dist2(x, y, SPAWN.tx, SPAWN.ty) < 9 || near(x, y, 0, PATH)) continue;
  const r = rng();
  if (r < 0.022 && freeAround(x, y, 1)) place("bush", x, y, true, { v: rng() });
  else if (r < 0.032 && freeAround(x, y, 1)) place(near(x, y, 2, WATER) ? "rock" : (rng() < 0.5 ? "rock" : "stump"), x, y, true);
}
for (let i = 0; i < MW * MH; i++) if (ground[i] === WATER) solid[i] = 1;

// ---------- 충돌 ----------
export const HITBOX = { w: 10, h: 6 }; // 발밑 충돌 박스
export function blocked(px, py) {
  const x0 = px - HITBOX.w / 2, x1 = px + HITBOX.w / 2 - 0.01, y0 = py - HITBOX.h, y1 = py - 0.01;
  if (x0 < 0 || y0 < 0 || x1 >= MW * T || y1 >= MH * T) return true;
  for (let ty = Math.floor(y0 / T); ty <= Math.floor(y1 / T); ty++)
    for (let tx = Math.floor(x0 / T); tx <= Math.floor(x1 / T); tx++) {
      if (!solid[idx(tx, ty)]) continue;
      if (ground[idx(tx, ty)] === WATER) return true;
      // 나무·바위 등은 타일 아래쪽 좁은 영역만 막음
      const bx0 = tx * T + 3, bx1 = tx * T + T - 3, by0 = ty * T + 6, by1 = ty * T + T;
      if (x1 > bx0 && x0 < bx1 && y1 > by0 && y0 < by1) return true;
    }
  return false;
}

// 플레이어 번호(0, 1)별 시작 위치
export function spawnFor(slot) {
  return { x: (SPAWN.tx + (slot === 1 ? -2 : 0)) * T + T / 2, y: SPAWN.ty * T + T - 2 };
}

// ---------- 바닥 레이어 (한 번만 그림) ----------
export const [groundCanvas, g] = makeCanvas(MW * T, MH * T);
const blobs = Array.from({ length: 26 }, () => ({ x: rng() * MW, y: rng() * MH, r: 2 + rng() * 4 }));
const darkPatch = (x, y) => blobs.some(b => dist2(x, y, b.x, b.y) < b.r * b.r);
const typeAt = (x, y) => inMap(x, y) ? ground[idx(x, y)] : GRASS;

for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
  const px = tx * T, py = ty * T, t = ground[idx(tx, ty)];
  const tr = mulberry32(tx * 928371 + ty * 12345 + 7);
  if (t === GRASS) {
    g.fillStyle = darkPatch(tx, ty) ? PAL.grass2 : PAL.grass1;
    g.fillRect(px, py, T, T);
    for (let i = 0; i < 5; i++) {
      const bx = px + Math.floor(tr() * 15), by = py + Math.floor(tr() * 14);
      g.fillStyle = tr() < 0.6 ? PAL.blade : PAL.bladeDark;
      g.fillRect(bx, by, 1, 2);
      if (tr() < 0.5) g.fillRect(bx + 1, by - 1, 1, 2);
    }
  } else if (t === PATH) {
    g.fillStyle = PAL.path; g.fillRect(px, py, T, T);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = tr() < 0.5 ? PAL.pathDark : PAL.pathLight;
      g.fillRect(px + Math.floor(tr() * 15), py + Math.floor(tr() * 15), tr() < 0.3 ? 2 : 1, 1);
    }
  } else {
    const deep = typeAt(tx, ty - 1) === WATER && typeAt(tx, ty - 2) === WATER && typeAt(tx - 1, ty) === WATER && typeAt(tx + 1, ty) === WATER;
    g.fillStyle = deep ? PAL.waterDeep : PAL.water; g.fillRect(px, py, T, T);
  }
}
for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
  if (ground[idx(tx, ty)] !== PATH) continue;
  const px = tx * T, py = ty * T, tr = mulberry32(tx * 31 + ty * 977);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    if (typeAt(tx + dx, ty + dy) !== GRASS) continue;
    g.fillStyle = PAL.grass1;
    for (let i = 0; i < T; i += 2) {
      const len = 1 + Math.floor(tr() * 3);
      if (dy === -1) g.fillRect(px + i, py, 2, len);
      if (dy === 1) g.fillRect(px + i, py + T - len, 2, len);
      if (dx === -1) g.fillRect(px, py + i, len, 2);
      if (dx === 1) g.fillRect(px + T - len, py + i, len, 2);
    }
  }
}
for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
  if (ground[idx(tx, ty)] !== WATER) continue;
  const px = tx * T, py = ty * T;
  if (typeAt(tx, ty - 1) !== WATER) { g.fillStyle = PAL.shore; g.fillRect(px, py, T, 3); g.fillStyle = PAL.waterLight; g.fillRect(px, py + 3, T, 1); }
  if (typeAt(tx, ty + 1) !== WATER) { g.fillStyle = PAL.waterLight; g.fillRect(px, py + T - 2, T, 2); }
  if (typeAt(tx - 1, ty) !== WATER) { g.fillStyle = PAL.shore; g.fillRect(px, py, 2, T); }
  if (typeAt(tx + 1, ty) !== WATER) { g.fillStyle = PAL.shore; g.fillRect(px + T - 2, py, 2, T); }
}
const flowerColors = [["#fff6f0", "#f3c13a"], ["#f59ab5", "#fff0a0"], ["#b58cf0", "#fff0a0"], ["#ffd84a", "#e0873a"]];
for (let ty = 1; ty < MH - 1; ty++) for (let tx = 1; tx < MW - 1; tx++) {
  if (ground[idx(tx, ty)] !== GRASS || occupied[idx(tx, ty)]) continue;
  const r = rng(), px = tx * T, py = ty * T;
  if (r < 0.07) {
    const [petal, center] = flowerColors[Math.floor(rng() * flowerColors.length)];
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const fx = px + 2 + Math.floor(rng() * 11), fy = py + 2 + Math.floor(rng() * 11);
      g.fillStyle = PAL.bladeDark; g.fillRect(fx + 1, fy + 2, 1, 2);
      g.fillStyle = petal; g.fillRect(fx, fy + 1, 3, 1); g.fillRect(fx + 1, fy, 1, 3);
      g.fillStyle = center; g.fillRect(fx + 1, fy + 1, 1, 1);
    }
  } else if (r < 0.08) {
    const fx = px + 4 + Math.floor(rng() * 7), fy = py + 5 + Math.floor(rng() * 6);
    g.fillStyle = "#f3e7d2"; g.fillRect(fx + 1, fy + 2, 2, 2);
    g.fillStyle = "#c9423a"; g.fillRect(fx, fy, 4, 2); g.fillRect(fx + 1, fy - 1, 2, 1);
    g.fillStyle = "#fff"; g.fillRect(fx + 1, fy, 1, 1);
  }
}

// ---------- 오브젝트 스프라이트 ----------
function makeTree(v) {
  const [c, x] = makeCanvas(34, 48);
  x.fillStyle = PAL.trunk; x.fillRect(14, 30, 6, 16);
  x.fillStyle = PAL.trunkDark; x.fillRect(18, 30, 2, 16); x.fillRect(12, 44, 2, 2); x.fillRect(20, 44, 2, 2);
  x.fillStyle = PAL.trunk; x.fillRect(13, 43, 1, 3); x.fillRect(20, 43, 1, 2);
  disc(x, 17, 20, 15, PAL.leafDark);
  disc(x, 7, 26, 6, PAL.leafDark); disc(x, 27, 26, 6, PAL.leafDark);
  disc(x, 16, 18, 13, v ? "#46914a" : PAL.leafMid);
  disc(x, 8, 24, 4.5, PAL.leafMid); disc(x, 25, 23, 5, PAL.leafMid);
  disc(x, 13, 13, 8, PAL.leafLight);
  disc(x, 11, 10, 3.5, PAL.leafHi);
  x.fillStyle = PAL.leafHi; x.fillRect(20, 14, 2, 1); x.fillRect(7, 20, 1, 1); x.fillRect(23, 21, 1, 1);
  x.fillStyle = PAL.leafDark; x.fillRect(18, 22, 2, 1); x.fillRect(10, 27, 2, 1); x.fillRect(22, 28, 2, 1);
  if (v > 0.7) { // 사과
    x.fillStyle = "#d8453a"; x.fillRect(9, 18, 2, 2); x.fillRect(21, 24, 2, 2); x.fillRect(15, 27, 2, 2);
    x.fillStyle = "#ff9b8a"; x.fillRect(9, 18, 1, 1); x.fillRect(21, 24, 1, 1); x.fillRect(15, 27, 1, 1);
  }
  outline(c, "#1f3b22");
  return c;
}
function makePine() {
  const [c, x] = makeCanvas(30, 50);
  x.fillStyle = PAL.trunk; x.fillRect(13, 38, 5, 10);
  x.fillStyle = PAL.trunkDark; x.fillRect(16, 38, 2, 10);
  for (const [base, half] of [[40, 13], [31, 11], [22, 9], [14, 6]]) {
    for (let r = 0; r < 12; r++) {
      const w = Math.round(half * (r / 11)), y = base - 11 + r;
      x.fillStyle = PAL.pineDark; x.fillRect(15 - w, y, w * 2 + 1, 1);
      if (w > 1) { x.fillStyle = PAL.pineMid; x.fillRect(15 - w + 1, y, w, 1); }
      if (w > 3 && r % 3 === 0) { x.fillStyle = PAL.pineLight; x.fillRect(15 - w + 2, y, 2, 1); }
    }
  }
  outline(c, "#163826");
  return c;
}
function makeBush(berries) {
  const [c, x] = makeCanvas(20, 16);
  disc(x, 10, 9, 7, PAL.leafDark); disc(x, 5, 11, 4.5, PAL.leafDark); disc(x, 15, 11, 4.5, PAL.leafDark);
  disc(x, 9, 8, 5.5, PAL.leafMid); disc(x, 7, 6, 2.5, PAL.leafLight);
  if (berries) { x.fillStyle = "#5b6ee0"; x.fillRect(12, 8, 2, 2); x.fillRect(6, 11, 2, 2); x.fillRect(14, 12, 2, 2); }
  outline(c, "#1f3b22");
  return c;
}
function makeRock() {
  const [c, x] = makeCanvas(16, 12);
  disc(x, 8, 7, 5.5, PAL.rockDark); disc(x, 7, 6, 4.5, PAL.rock); disc(x, 6, 5, 2, PAL.rockLight);
  x.fillStyle = PAL.rockDark; x.fillRect(9, 8, 2, 1);
  outline(c, "#3f4449");
  return c;
}
function makeStump() {
  const [c, x] = makeCanvas(16, 13);
  x.fillStyle = PAL.trunk; x.fillRect(3, 4, 10, 8);
  x.fillStyle = PAL.trunkDark; x.fillRect(10, 4, 3, 8); x.fillRect(2, 10, 2, 2); x.fillRect(12, 10, 2, 2);
  x.fillStyle = "#d9b27a"; x.fillRect(3, 2, 10, 3);
  x.fillStyle = "#b8905a"; x.fillRect(6, 3, 4, 1);
  outline(c, "#3a2414");
  return c;
}
function makeSign() {
  const [c, x] = makeCanvas(16, 18);
  x.fillStyle = PAL.trunkDark; x.fillRect(7, 9, 2, 8);
  x.fillStyle = "#b07a45"; x.fillRect(2, 2, 12, 8);
  x.fillStyle = "#8a5a33"; x.fillRect(2, 9, 12, 1);
  x.fillStyle = "#5a3a20"; x.fillRect(4, 4, 8, 1); x.fillRect(4, 6, 6, 1);
  outline(c, "#3a2414");
  return c;
}
const SPR = {
  tree: [makeTree(0), makeTree(0.5), makeTree(0.9)],
  pine: makePine(),
  bush: [makeBush(false), makeBush(true)],
  rock: makeRock(), stump: makeStump(), sign: makeSign()
};
export function spriteFor(o) {
  switch (o.type) {
    case "tree": return SPR.tree[o.v > 0.85 ? 2 : o.v > 0.5 ? 1 : 0];
    case "pine": return SPR.pine;
    case "bush": return SPR.bush[o.v > 0.7 ? 1 : 0];
    default: return SPR[o.type];
  }
}
export const shadowW = { tree: 13, pine: 10, bush: 8, rock: 6, stump: 6, sign: 5 };

// ---------- 캐릭터 (임시) ----------
// 플레이어 번호별 색상. 1P는 빨간 셔츠, 2P는 파란 셔츠.
export const PLAYER_LOOKS = [
  { label: "#d9674a", skin: "#f1c49a", skinD: "#d99f76", hair: "#7a4526", hairD: "#5a311a",
    shirt: "#d9674a", shirtD: "#b24f37", pants: "#3e5a8a", pantsD: "#2f4670", boot: "#4a3326" },
  { label: "#3f86c4", skin: "#f3cfa8", skinD: "#dba882", hair: "#e0b44a", hairD: "#b8862e",
    shirt: "#4f93c9", shirtD: "#3a74a6", pants: "#5a4a3a", pantsD: "#43372b", boot: "#3a2c22" }
];
const EYE = "#2b1d1a", BLUSH = "#e79a8a";

function drawChar(C, dir, f) {
  const [c, x] = makeCanvas(16, 24);
  const r = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
  const step = f === 1 || f === 3;
  const oy = step ? -1 : 0;

  if (dir === "down" || dir === "up") {
    const liftL = f === 1 ? 1 : 0, liftR = f === 3 ? 1 : 0;
    r(5, 18, 3, 2 - liftL, C.pants); r(5, 20 - liftL, 3, 2, C.boot);
    r(8, 18, 3, 2 - liftR, C.pantsD); r(8, 20 - liftR, 3, 2, C.boot);
    r(4, 12 + oy, 8, 6, C.shirt); r(4, 12 + oy, 1, 6, C.shirtD); r(11, 12 + oy, 1, 6, C.shirtD);
    r(4, 17 + oy, 8, 1, C.pantsD);
    if (dir === "down") r(7, 12 + oy, 2, 2, C.skin);
    const aL = f === 3 ? -1 : 0, aR = f === 1 ? -1 : 0;
    r(3, 12 + oy + aL, 1, 4, C.shirtD); r(3, 16 + oy + aL, 1, 1, C.skin);
    r(12, 12 + oy + aR, 1, 4, C.shirtD); r(12, 16 + oy + aR, 1, 1, C.skin);
    r(5, 5 + oy, 6, 6, C.skin); r(5, 10 + oy, 6, 1, C.skinD);
    r(4, 2 + oy, 8, 4, C.hair); r(4, 6 + oy, 1, 4, C.hair); r(11, 6 + oy, 1, 4, C.hair);
    r(5, 2 + oy, 6, 1, C.hairD);
    if (dir === "down") {
      r(5, 5 + oy, 3, 1, C.hair); r(9, 5 + oy, 1, 1, C.hair);
      r(6, 7 + oy, 1, 2, EYE); r(9, 7 + oy, 1, 2, EYE);
      r(5, 9 + oy, 1, 1, BLUSH); r(10, 9 + oy, 1, 1, BLUSH);
    } else {
      r(5, 5 + oy, 6, 5, C.hair); r(5, 9 + oy, 6, 1, C.hairD);
    }
  } else {
    // 왼쪽을 향한 모습. 오른쪽은 좌우반전으로 만듦
    if (step) {
      r(3, 18, 3, 2, C.pants); r(2, 20, 4, 2, C.boot);
      r(9, 18, 3, 2, C.pantsD); r(9, 20, 3, 2, C.boot);
    } else {
      r(7, 18, 3, 2, C.pantsD); r(7, 20, 3, 2, C.boot);
      r(6, 18, 3, 2, C.pants); r(5, 20, 4, 2, C.boot);
    }
    r(5, 12 + oy, 6, 6, C.shirt); r(10, 12 + oy, 1, 6, C.shirtD); r(5, 17 + oy, 6, 1, C.pantsD);
    const ax = f === 1 ? -1 : f === 3 ? 1 : 0;
    r(7 + ax, 12 + oy, 2, 4, C.shirtD); r(7 + ax, 16 + oy, 2, 1, C.skin);
    r(4, 5 + oy, 6, 6, C.skin); r(4, 10 + oy, 6, 1, C.skinD); r(3, 8 + oy, 1, 1, C.skin);
    r(4, 2 + oy, 7, 4, C.hair); r(8, 5 + oy, 3, 5, C.hair); r(10, 6 + oy, 1, 3, C.hairD);
    r(4, 5 + oy, 2, 1, C.hair);
    r(5, 7 + oy, 1, 2, EYE); r(5, 9 + oy, 1, 1, BLUSH);
  }
  outline(c, "#3b2a24");
  if (dir === "right") {
    const [m, mx] = makeCanvas(16, 24);
    mx.translate(16, 0); mx.scale(-1, 1); mx.drawImage(c, 0, 0);
    return m;
  }
  return c;
}
export const DIRS = ["down", "up", "left", "right"];
// CHAR_FRAMES[slot][dir][frame]  — frame 0~3 (0·2: 서 있음, 1·3: 발 내딛음)
export const CHAR_FRAMES = PLAYER_LOOKS.map(look => {
  const out = {};
  for (const d of DIRS) out[d] = [0, 1, 2, 3].map(f => drawChar(look, d, f));
  return out;
});
