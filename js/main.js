import {
  T, MW, MH, WALK, RUN, PAL, WATER, ground, idx, objects, groundCanvas,
  spriteFor, shadowW, blocked, spawnFor, CHAR_FRAMES, PLAYER_LOOKS
} from "./world.js?v=7";
import { firebaseConfig } from "./firebase-config.js?v=7";
import { connect, RoomFullError, NotInvitedError } from "./net.js?v=7";

const SEND_INTERVAL = 70;   // 이동 중 위치 전송 간격(ms) ≈ 초당 14회
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const canvas = $("game"), ctx = canvas.getContext("2d"), stage = $("stage");
const lobby = $("lobby"), joinForm = $("join-form"), nameInput = $("name"), roomInput = $("room");
const joinBtn = $("join-btn"), lobbyMsg = $("lobby-msg"), joinFields = $("join-fields");
const authBox = $("auth-box"), loginBtn = $("login-btn"), whoEl = $("who"), whoEmail = $("who-email"), logoutBtn = $("logout-btn");
const statusEl = $("status"), rosterEl = $("roster"), inviteBtn = $("invite");
const infoBtn = $("info-btn"), infoEl = $("info");

// ---------- 상태 ----------
const me = {
  name: "", slot: 0, x: 0, y: 0, dir: "down", moving: false, running: false, anim: 0
};
Object.assign(me, spawnFor(0));
const remotes = new Map(); // 자리 번호("0"/"1") -> 원격 플레이어
let net = null, user = null, roomName = "", playing = false, connected = true, seatedUid = null;

// ---------- 로비 ----------
const params = new URLSearchParams(location.search);
roomInput.value = cleanRoom(params.get("room") || "") || "forest";
try { nameInput.value = localStorage.getItem("forest.name") || ""; } catch (e) { /* 저장소 사용 불가 */ }
const online = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);

function cleanRoom(s) {
  return s.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
}
function say(text, tone = "info") {
  lobbyMsg.textContent = text;
  lobbyMsg.dataset.tone = tone;
}

// 카카오톡 등 앱 내부 브라우저에서는 Google이 로그인을 막아요
const ua = navigator.userAgent;
const inApp = /KAKAOTALK|Instagram|FBAN|FBAV|NAVER|Line\/|everytimeApp|DaumApps/i.test(ua);
if (online && inApp) {
  $("inapp").hidden = false;
  const link = $("inapp-link");
  if (/KAKAOTALK/i.test(ua)) {
    link.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
  } else if (/Android/i.test(ua)) {
    link.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
  } else {
    link.hidden = true;
  }
}

const AUTH_ERRORS = {
  "auth/popup-blocked": "로그인 팝업이 차단됐어요. 주소창 옆에서 팝업을 허용하고 다시 눌러 주세요.",
  "auth/unauthorized-domain": "이 사이트 주소가 Firebase에 등록되지 않았어요. Authentication → 설정 → 승인된 도메인에 추가해 주세요.",
  "auth/operation-not-allowed": "Firebase에서 Google 로그인이 꺼져 있어요. Authentication → 로그인 방법에서 Google을 켜 주세요.",
  "auth/network-request-failed": "인터넷 연결을 확인하고 다시 시도해 주세요.",
  "auth/internal-error": "로그인 중 문제가 생겼어요. Chrome이나 Safari에서 다시 시도해 주세요."
};

function renderAuth() {
  authBox.hidden = !online;
  if (!online) { joinFields.disabled = false; return; }
  const signedIn = Boolean(user);
  loginBtn.hidden = signedIn;
  whoEl.hidden = !signedIn;
  joinFields.disabled = !signedIn;
  if (signedIn) whoEmail.textContent = `${user.email} 로 로그인됨`;
}

if (!online) {
  say("Firebase 설정이 비어 있어요. 혼자 테스트 모드로 들어가요.");
  renderAuth();
} else {
  joinFields.disabled = true;
  say("로그인 상태를 확인하는 중…");
  connect(firebaseConfig).then(n => {
    net = n;
    authBox.hidden = false;
    net.onAuth(u => {
      // 게임 중에 로그인 계정이 바뀌거나 로그아웃되면 더 이상 내 캐릭터를 움직일 수 없어요
      if (playing && seatedUid && (!u || u.uid !== seatedUid)) {
        net.leave();
        net = null;
        setStatus("로그인 계정이 바뀌어서 방에서 나왔어요. 새로고침해 주세요.", "warn");
      }
      user = u;
      if (u && !nameInput.value) nameInput.value = (u.displayName || "").trim().slice(0, 12);
      renderAuth();
      if (!playing) say(u ? "" : "초대받은 Google 계정으로 로그인해 주세요.");
    });
  }).catch(err => {
    console.error(err);
    say(`Firebase를 불러오지 못했어요. 인터넷 연결과 firebase-config.js 값을 확인해 주세요. (${err.code || err.message})`, "warn");
  });
}

loginBtn.addEventListener("click", async () => {
  if (!net) return;
  loginBtn.disabled = true;
  try {
    await net.signIn();
  } catch (err) {
    console.error(err);
    if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
      say(AUTH_ERRORS[err.code] || `로그인하지 못했어요. (${err.code || err.message})`, "warn");
    }
  } finally {
    loginBtn.disabled = false;
  }
});
logoutBtn.addEventListener("click", () => net?.signOut());

joinForm.addEventListener("submit", async e => {
  e.preventDefault();
  const name = nameInput.value.trim().slice(0, 12) || "주민";
  const room = cleanRoom(roomInput.value) || "forest";
  roomInput.value = room;
  try { localStorage.setItem("forest.name", name); } catch (err) { /* 무시 */ }
  me.name = name;

  if (!online) { startGame(); setStatus("혼자 테스트 모드", "info"); renderRoster(); return; }
  if (!net || !user) { say("먼저 Google 계정으로 로그인해 주세요.", "warn"); return; }

  joinBtn.disabled = true;
  say("숲에 연결하는 중…");
  try {
    const res = await net.join(room, { name, spawnFor }, {
      onJoin: (id, p) => upsertRemote(id, p, true),
      onMove: (id, p) => upsertRemote(id, p, false),
      onLeave: id => { remotes.delete(id); renderRoster(); },
      onConnection: on => {
        connected = on;
        if (playing) setStatus(on ? `방 ${roomName} · 연결됨` : "연결이 끊겼어요. 다시 연결하는 중…", on ? "ok" : "warn");
      },
      onKicked: () => setStatus("다시 연결했지만 방이 가득 찼어요. 새로고침해 주세요.", "warn")
    });
    roomName = room;
    seatedUid = res.uid;
    me.slot = res.slot;
    Object.assign(me, res.start);
    history.replaceState(null, "", `?room=${encodeURIComponent(room)}`);
    startGame();
    setStatus(`방 ${room} · 연결됨`, "ok");
    inviteBtn.hidden = false;
    infoBtn.hidden = false;
    renderRoster();
  } catch (err) {
    console.error(err);
    if (err instanceof RoomFullError) say("이 방에는 이미 두 명이 있어요. 방금 나갔다면 20초 뒤에 다시 들어와 보세요.", "warn");
    else if (err instanceof NotInvitedError) say(`${user.email} 계정은 초대 목록에 없어요. 게임 주인에게 이 이메일을 등록해 달라고 부탁해 주세요.`, "warn");
    else say("숲에 들어가지 못했어요. 잠시 후 다시 시도해 주세요.", "warn");
  } finally {
    joinBtn.disabled = false;
  }
});

function startGame() {
  playing = true;
  lobby.hidden = true;
  canvas.focus({ preventScroll: true });
}

inviteBtn.addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomName)}`;
  try {
    await navigator.clipboard.writeText(url);
    inviteBtn.textContent = "링크를 복사했어요";
  } catch (e) {
    inviteBtn.textContent = url;
  }
  setTimeout(() => { inviteBtn.textContent = "초대 링크 복사"; }, 2200);
});

addEventListener("pagehide", () => net?.leave());

// ---------- 접속 정보 (문제 확인용) ----------
infoBtn.addEventListener("click", () => {
  infoEl.hidden = !infoEl.hidden;
  infoBtn.setAttribute("aria-expanded", String(!infoEl.hidden));
  renderInfo();
});
function renderInfo() {
  if (infoEl.hidden || !net) return;
  const rows = net.debugInfo().map(d => {
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("span");
    const right = document.createElement("span");
    left.innerHTML = `<b>${Number(d.slot) + 1}P</b> `;
    if (d.empty) {
      left.append("빈자리");
      right.className = "dim";
    } else {
      left.append(`${d.name}${d.mine ? " (나)" : d.sameAccount ? " (내 계정)" : ""}`);
      right.textContent = d.stale ? `신호 끊김 · ${d.age}초 전` : `${d.age}초 전 신호`;
      right.className = d.stale ? "bad" : "dim";
    }
    row.append(left, right);
    return row;
  });
  const foot = document.createElement("div");
  foot.className = "dim";
  foot.textContent = `방 ${roomName} · ${connected ? "서버 연결됨" : "서버 연결 끊김"} · 화면에 보이는 친구 ${remotes.size}명`;
  infoEl.replaceChildren(...rows, foot);
}
setInterval(renderInfo, 1000);

// ---------- 원격 플레이어 ----------
function upsertRemote(id, p, isNew) {
  if (!p || typeof p.x !== "number") return;
  let r = remotes.get(id);
  if (!r || isNew) {
    r = { id, rx: p.x, ry: p.y, anim: 0 };
    remotes.set(id, r);
  }
  r.name = String(p.name || "친구").slice(0, 12);
  r.slot = p.slot === 1 ? 1 : 0;
  r.tx = p.x; r.ty = p.y;         // 서버가 알려준 목표 위치
  r.dir = DIR_VEC[p.dir] ? p.dir : "down";
  r.moving = !!p.moving;
  r.running = !!p.running;
  r.lastPacket = performance.now();
  renderRoster();
}

function updateRemote(r, dt, now) {
  // 다음 패킷이 올 때까지 같은 방향으로 계속 걷는다고 예측 (최대 0.3초)
  if (r.moving && now - r.lastPacket < 300) {
    const [vx, vy] = DIR_VEC[r.dir];
    const sp = r.running ? RUN : WALK;
    const nx = r.tx + vx * sp * dt, ny = r.ty + vy * sp * dt;
    if (!blocked(nx, ny)) { r.tx = nx; r.ty = ny; }
  }
  // 목표 위치로 부드럽게 따라가기, 너무 멀면 순간이동
  const dx = r.tx - r.rx, dy = r.ty - r.ry;
  if (dx * dx + dy * dy > 64 * 64) { r.rx = r.tx; r.ry = r.ty; }
  else { const k = Math.min(1, dt * 14); r.rx += dx * k; r.ry += dy * k; }
  // 애니메이션: 상대가 보낸 이동·달리기 상태로 걷기 동작 재생
  if (r.moving) r.anim += dt * ((r.running ? RUN : WALK) / WALK) * 7;
  else r.anim = 0;
}

// ---------- HUD ----------
function setStatus(text, tone) {
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}
function renderRoster() {
  const list = [{ name: me.name || "나", slot: me.slot, self: true }, ...[...remotes.values()].map(r => ({ name: r.name, slot: r.slot }))];
  rosterEl.replaceChildren(...list.map(p => {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = PLAYER_LOOKS[p.slot].label;
    li.append(dot, document.createTextNode(`${p.slot + 1}P ${p.name}${p.self ? " (나)" : ""}`));
    return li;
  }));
  if (online && playing && remotes.size === 0) {
    const li = document.createElement("li");
    li.className = "waiting";
    li.textContent = "친구를 기다리는 중…";
    rosterEl.append(li);
  }
}

// ---------- 입력 (4방향, 마지막에 누른 방향 우선) ----------
const keyDir = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" };
let held = [], shift = false, touchRun = false;
const press = d => { held = held.filter(h => h !== d); held.push(d); };
const release = d => { held = held.filter(h => h !== d); };
const typing = e => e.target instanceof HTMLInputElement;

addEventListener("keydown", e => {
  if (!playing || typing(e)) return;
  const d = keyDir[e.code]; // e.code라서 한글 입력 상태에서도 동작
  if (d) { e.preventDefault(); if (!e.repeat) press(d); }
  if (e.key === "Shift") shift = true;
});
addEventListener("keyup", e => {
  const d = keyDir[e.code];
  if (d) release(d);
  if (e.key === "Shift") shift = false;
});
addEventListener("blur", () => { held = []; shift = false; });

document.querySelectorAll("#pad button").forEach(b => {
  const d = b.dataset.d;
  b.addEventListener("pointerdown", e => { e.preventDefault(); if (playing) { press(d); b.classList.add("on"); } });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => { release(d); b.classList.remove("on"); });
});
$("run").addEventListener("pointerdown", e => {
  e.preventDefault();
  touchRun = !touchRun;
  e.currentTarget.classList.toggle("on", touchRun);
});

// ---------- 내 캐릭터 이동 ----------
let lastSend = 0;
function updateMe(dt, now) {
  const d = playing ? held[held.length - 1] : null;
  me.moving = !!d;
  me.running = me.moving && (shift || touchRun);
  if (d) {
    me.dir = d;
    const sp = me.running ? RUN : WALK;
    const [vx, vy] = DIR_VEC[d];
    const nx = me.x + vx * sp * dt, ny = me.y + vy * sp * dt;
    if (!blocked(nx, me.y)) me.x = nx;
    else if (vx) for (const n of [-1, 1]) if (!blocked(nx, me.y + n * 3)) { me.y += n * sp * dt * 0.6; break; }
    if (!blocked(me.x, ny)) me.y = ny;
    else if (vy) for (const n of [-1, 1]) if (!blocked(me.x + n * 3, ny)) { me.x += n * sp * dt * 0.6; break; }
    me.anim += dt * (sp / WALK) * 7;
  } else {
    me.anim = 0;
  }

  if (net && playing) {
    const state = { x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, dir: me.dir, moving: me.moving, running: me.running };
    const last = updateMe.sent || {};
    // 방향·이동 여부가 바뀌면 바로, 위치는 일정 간격으로 전송
    const changedState = state.dir !== last.dir || state.moving !== last.moving || state.running !== last.running;
    if (changedState || (me.moving && now - lastSend >= SEND_INTERVAL)) {
      net.send(state);
      updateMe.sent = state;
      lastSend = now;
    }
  }
}

// ---------- 화면 ----------
let scale = 3, viewW = 0, viewH = 0, dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(stage.clientWidth * dpr);
  canvas.height = Math.round(stage.clientHeight * dpr);
  scale = Math.max(2, Math.floor(Math.min(canvas.width / 13, canvas.height / 10) / T));
  viewW = canvas.width / scale; viewH = canvas.height / scale;
}
addEventListener("resize", resize);
resize();

const leaves = Array.from({ length: reduceMotion ? 0 : 14 }, () => ({
  x: Math.random() * 400, y: Math.random() * 300, s: 6 + Math.random() * 10,
  ph: Math.random() * 6.28, c: Math.random() < 0.5 ? PAL.leafHi : "#e0a94a"
}));

function frameIndex(p) { return p.moving ? Math.floor(p.anim) % 4 : 0; }

function render(now) {
  const t = now / 1000;
  const mapW = MW * T, mapH = MH * T;
  let camX = me.x - viewW / 2, camY = me.y - 12 - viewH / 2;
  camX = viewW >= mapW ? (mapW - viewW) / 2 : Math.max(0, Math.min(mapW - viewW, camX));
  camY = viewH >= mapH ? (mapH - viewH) / 2 : Math.max(0, Math.min(mapH - viewH, camY));
  camX = Math.round(camX * scale) / scale; camY = Math.round(camY * scale) / scale;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#2d6436"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(groundCanvas, 0, 0);

  // 물 반짝임
  const vx0 = Math.max(0, Math.floor(camX / T)), vy0 = Math.max(0, Math.floor(camY / T));
  const vx1 = Math.min(MW - 1, Math.ceil((camX + viewW) / T)), vy1 = Math.min(MH - 1, Math.ceil((camY + viewH) / T));
  ctx.fillStyle = PAL.waterLight;
  for (let ty = vy0; ty <= vy1; ty++) for (let tx = vx0; tx <= vx1; tx++) {
    if (ground[idx(tx, ty)] !== WATER) continue;
    if (Math.sin(t * 1.6 + tx * 1.7 + ty * 2.3) > 0.55)
      ctx.fillRect(tx * T + ((tx * 7 + ty * 3) % 9) + 3, ty * T + ((tx * 5 + ty * 11) % 8) + 5, 3, 1);
  }

  // 화면 안 오브젝트 + 플레이어들을 y순으로 정렬해 앞뒤 겹침 처리
  const list = objects.filter(o => o.x > camX - 48 && o.x < camX + viewW + 48 && o.y > camY - 8 && o.y < camY + viewH + 60);
  const people = [{ x: me.x, y: me.y, slot: me.slot, dir: me.dir, frame: frameIndex(me), name: me.name, self: true }];
  for (const r of remotes.values()) people.push({ x: r.rx, y: r.ry, slot: r.slot, dir: r.dir, frame: frameIndex(r), name: r.name });

  ctx.fillStyle = PAL.shadow;
  for (const o of list) { ctx.beginPath(); ctx.ellipse(o.x, o.y - 2, shadowW[o.type], 3, 0, 0, Math.PI * 2); ctx.fill(); }
  for (const p of people) { ctx.beginPath(); ctx.ellipse(p.x, p.y - 1, 5, 2, 0, 0, Math.PI * 2); ctx.fill(); }

  const drawables = [...list, ...people.map(p => ({ ...p, type: "player" }))].sort((a, b) => a.y - b.y);
  for (const o of drawables) {
    if (o.type === "player") {
      ctx.drawImage(CHAR_FRAMES[o.slot][o.dir][o.frame], Math.round(o.x - 8), Math.round(o.y - 23));
    } else {
      const s = spriteFor(o);
      const sway = (o.type === "tree" || o.type === "pine") && !reduceMotion ? Math.round(Math.sin(t * 0.9 + o.tx * 0.7) * 0.6) : 0;
      ctx.drawImage(s, Math.round(o.x - s.width / 2) + sway, Math.round(o.y - s.height + 1));
    }
  }

  // 이름표 (화면 픽셀 좌표로 그려서 글자가 선명하게)
  if (online || remotes.size) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${Math.round(13 * dpr)}px "Do Hyeon", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const p of people) {
      const sx = (p.x - camX) * scale, sy = (p.y - 27 - camY) * scale;
      const label = p.self ? `${p.name} (나)` : p.name;
      const w = ctx.measureText(label).width + 12 * dpr, h = 18 * dpr;
      ctx.fillStyle = "rgba(243, 227, 195, 0.92)";
      ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - h / 2, w, h, 5 * dpr); ctx.fill();
      ctx.fillStyle = PLAYER_LOOKS[p.slot].label;
      ctx.fillRect(sx - w / 2, sy + h / 2 - 2 * dpr, w, 2 * dpr);
      ctx.fillStyle = "#3b2a1e";
      ctx.fillText(label, sx, sy);
    }
  }

  // 떨어지는 나뭇잎
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  for (const l of leaves) {
    l.y += l.s * 0.016; l.x += Math.sin(t + l.ph) * 0.25 + 0.1;
    if (l.y > viewH + 4) { l.y = -4; l.x = Math.random() * viewW; }
    if (l.x > viewW + 4) l.x = -4;
    ctx.fillStyle = l.c;
    ctx.fillRect(Math.round(l.x), Math.round(l.y), 2, 1);
    ctx.fillRect(Math.round(l.x) + (Math.sin(t * 3 + l.ph) > 0 ? 1 : 0), Math.round(l.y) + 1, 1, 1);
  }
}

// ---------- 게임 루프 ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateMe(dt, now);
  for (const r of remotes.values()) updateRemote(r, dt, now);
  render(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 개발용: 브라우저 콘솔에서 가짜 2P를 띄워 화면을 확인할 수 있어요
// 예) __forest.fakeRemote({ x: 470, y: 414, dir: "left", moving: true })
window.__forest = {
  fakeRemote(p) { upsertRemote("fake", { name: "테스트", slot: 1, dir: "down", moving: false, ...p }, !remotes.has("fake")); }
};
