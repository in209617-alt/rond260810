import {
  T, MW, MH, WALK, RUN, WATER, ground, idx, objects, mushrooms, groundCanvas, ART, CHAR, DIRS,
  buildWorld, spriteFor, shadowW, blocked, spawnFor, PLAYER_LOOKS
} from "./world.js?v=12";
import { loadAssets } from "./assets.js?v=12";
import { firebaseConfig } from "./firebase-config.js?v=12";
import { connect, RoomFullError, NotInvitedError } from "./net.js?v=12";
import { ITEMS, GATHER, DRAW_ORDER, josa } from "./items.js?v=12";
import { Inventory, parseLook } from "./inventory.js?v=12";
import { createUI } from "./ui.js?v=12";
import { createSocial } from "./social.js?v=12";
import { eatBurst, leafBurst, poof, floatText, updateEffects, drawParticles, drawFloaters, sfx } from "./effects.js?v=12";

const SEND_INTERVAL = 70;   // 이동 중 위치 전송 간격(ms) ≈ 초당 14회
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const VERSION = "v12";

// ---------- 화면 만들기 ----------
// 화면 UI는 여기서 직접 만들어요. index.html이 예전 버전이어도 항상 최신 화면이 나와요.
const UI_HTML = `
<div class="hud">
  <div class="chip" id="status" data-tone="info">숲 입구</div>
  <ul class="chip roster" id="roster" aria-label="접속한 플레이어"></ul>
  <button class="chip invite" id="invite" type="button" hidden>초대 링크 복사</button>
  <button class="chip invite" id="info-btn" type="button" hidden aria-expanded="false">접속 정보</button>
  <div class="chip info" id="info" hidden></div>
</div>
<div class="help chip" id="help" hidden><kbd>WASD</kbd> 이동 · <kbd>Shift</kbd> 달리기 · <kbd>E</kbd> 가방 · <kbd>1</kbd>~<kbd>0</kbd> 선택 · <kbd>Q</kbd> 버리기 · <kbd>Enter</kbd> 채팅 · 친구 클릭 대화/선물</div>

<div class="pad" id="pad">
  <button type="button" data-d="up" aria-label="위로">▲</button>
  <button type="button" data-d="left" aria-label="왼쪽으로">◀</button>
  <button type="button" data-d="right" aria-label="오른쪽으로">▶</button>
  <button type="button" data-d="down" aria-label="아래로">▼</button>
</div>
<button class="run" id="run" type="button">달리기</button>

<div class="lobby" id="lobby">
  <form class="card" id="join-form" autocomplete="off">
    <h1>낑냐마을</h1>
    <p class="sub">친구와 둘이서 같은 숲을 걸어요</p>

    <p class="inapp" id="inapp" hidden>
      카카오톡·인스타그램 같은 앱 안에서는 Google 로그인이 막혀 있어요.
      <a id="inapp-link" href="#">Chrome이나 Safari로 열기</a>
      <span>또는 오른쪽 위 메뉴에서 "다른 브라우저로 열기"를 눌러 주세요.</span>
    </p>

    <div class="auth" id="auth-box" hidden>
      <button type="button" class="google" id="login-btn">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
        Google 계정으로 로그인
      </button>
      <p class="who" id="who" hidden>
        <span id="who-email"></span>
        <button type="button" class="link" id="logout-btn">로그아웃</button>
      </p>
    </div>

    <fieldset class="fields" id="join-fields">
      <label for="name">내 이름</label>
      <input id="name" name="name" maxlength="12" placeholder="예: 여름" required>
      <label for="room">방 이름</label>
      <input id="room" name="room" maxlength="24" pattern="[a-zA-Z0-9\\-]+" title="영문, 숫자, - 만 쓸 수 있어요">
      <p class="hint">친구와 같은 방 이름을 입력하면 같은 숲에서 만나요. 한 방에 최대 2명.</p>
      <button id="join-btn" type="submit">숲으로 들어가기</button>
    </fieldset>
    <p class="msg" id="lobby-msg" role="status"></p>
    <p class="ver">버전 ${VERSION} · Google 로그인</p>
  </form>
</div>
`;
const stage = document.getElementById("stage");
stage.querySelectorAll(":scope > :not(canvas)").forEach(el => el.remove());
if (!document.getElementById("game")) {
  const c = document.createElement("canvas");
  c.id = "game"; c.tabIndex = -1; c.setAttribute("aria-label", "숲 맵 게임 화면");
  stage.prepend(c);
}
stage.insertAdjacentHTML("beforeend", UI_HTML);
// 스타일 파일도 최신 버전으로
document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
  if (/(^|\/)style\.css/.test(l.getAttribute("href") || "")) l.href = "style.css?v=12";
});

// 그래픽 리소스(assets 폴더)를 모두 불러온 뒤 시작
buildWorld(await loadAssets());

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const canvas = $("game"), ctx = canvas.getContext("2d");
const lobby = $("lobby"), joinForm = $("join-form"), nameInput = $("name"), roomInput = $("room");
const joinBtn = $("join-btn"), lobbyMsg = $("lobby-msg"), joinFields = $("join-fields");
const authBox = $("auth-box"), loginBtn = $("login-btn"), whoEl = $("who"), whoEmail = $("who-email"), logoutBtn = $("logout-btn");
const statusEl = $("status"), rosterEl = $("roster"), inviteBtn = $("invite");
const infoBtn = $("info-btn"), infoEl = $("info");

// 예상하지 못한 오류가 나면 화면 왼쪽 위에 표시 (문제 확인용)
function showCrash(msg) {
  console.error("[forest] 오류:", msg);
  if (statusEl) { statusEl.textContent = `오류: ${msg}`; statusEl.dataset.tone = "warn"; }
}
addEventListener("error", e => showCrash(e.message));
addEventListener("unhandledrejection", e => showCrash(e.reason?.message || String(e.reason)));

// ---------- 상태 ----------
const me = {
  name: "", slot: 0, x: 0, y: 0, dir: "down", moving: false, running: false, anim: 0
};
Object.assign(me, spawnFor(0));
const remotes = new Map(); // 자리 번호("0"/"1") -> 원격 플레이어
let net = null, user = null, roomName = "", playing = false, connected = true, seatedUid = null;
me.eatT = 0;
me.koT = 0;          // 쓰러져 있는 남은 시간(초)
me.koSide = "right"; // 쓰러진 방향
const inv = new Inventory();

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
      onLeave: id => { remotes.delete(id); social.remoteLeft(id); renderRoster(); },
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
  inv.load(seatedUid || "local");   // 인벤토리는 이 브라우저에 계정별로 저장돼요
  ui.setVisible(true);
  $("help").hidden = false;
  net?.sendLook(currentLook());
  social.start(seatedUid || "local", Boolean(net && seatedUid));
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
  r.look = parseLook(p.look);
  if (p.uid && r.uid !== p.uid) { r.uid = p.uid; social?.trackRemote(id, p.uid); }
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
  // e.code를 써서 한글 입력 상태에서도 동작
  if (e.key === "Escape") { if (!social.escape() && !social.busy()) ui.closeAll(); return; }
  if (social.busy() || social.anyOpen()) return;     // 1:1 대화 중에는 아무것도 못 해요
  if (e.key === "Enter" && !ui.isOpen()) { e.preventDefault(); social.focusChat(); return; }
  if (e.code === "KeyE" || e.code === "KeyI") { e.preventDefault(); ui.toggleBag(); return; }
  if (ui.isOpen()) return;
  const d = keyDir[e.code];
  if (d) { e.preventDefault(); if (!e.repeat) press(d); }
  if (e.key === "Shift") shift = true;
  const num = /^Digit(\d)$/.exec(e.code);
  if (num) { ui.select((Number(num[1]) + 9) % 10); return; }
  if (e.code === "KeyQ" && !e.repeat) dropSelected();
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
  me.eatT = Math.max(0, me.eatT - dt);
  if (me.koT > 0) {
    me.koT = Math.max(0, me.koT - dt);
    if (me.koT === 0) { ui.toast("정신을 차리고 일어났다!"); syncLook(); }
  }
  const d = playing && !ui.isOpen() && !social.busy() && me.koT === 0 ? held[held.length - 1] : null;
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
  ph: Math.random() * 6.28, img: Math.random() < 0.5 ? "effects/leaf_1" : "effects/leaf_2"
}));

function frameIndex(p) { return p.moving ? Math.floor(p.anim) % 4 : 0; }

// 캐릭터 + 입은 옷 그리기. (x, y) = 발밑 위치
// 옷 그림(assets/equipment/*.png)은 캐릭터 시트와 같은 4×4 배치라서 같은 칸을 잘라 겹쳐 그려요.
function drawCharacter(g, slot, dir, frame, x, y, look) {
  const ch = CHAR[slot], row = DIRS.indexOf(dir);
  g.drawImage(ch.sheet, frame * ch.w, row * ch.h, ch.w, ch.h, Math.round(x - ch.w / 2), Math.round(y - ch.h + 1), ch.w, ch.h);
  for (const key of DRAW_ORDER) {
    const img = look && look[key] ? ART["equipment/" + look[key]] : null;
    if (!img) continue;
    const w = Math.floor(img.width / 4), h = Math.floor(img.height / 4);
    g.drawImage(img, frame * w, row * h, w, h, Math.round(x - w / 2), Math.round(y - h + 1), w, h);
  }
}

// 쓰러진 캐릭터: 정면 그림을 옆으로 90도 눕혀서 그리고, 머리 위에 별이 빙글빙글
function drawKnockedOut(g, p, t) {
  const ch = CHAR[p.slot];
  const right = p.ko === "right";
  g.save();
  g.translate(Math.round(p.x + (right ? -ch.h / 2 : ch.h / 2)), Math.round(p.y - ch.w / 2));
  g.rotate(right ? Math.PI / 2 : -Math.PI / 2);
  drawCharacter(g, p.slot, "down", 0, 0, 0, p.look);
  g.restore();
  // 어지러운 별
  const hx = p.x + (right ? ch.h / 2 - 6 : -ch.h / 2 + 6), hy = p.y - 12;
  g.fillStyle = "#ffe14d";
  for (let i = 0; i < 3; i++) {
    const a = t * 5 + i * (Math.PI * 2 / 3);
    const sx = Math.round(hx + Math.cos(a) * 6), sy = Math.round(hy + Math.sin(a) * 2);
    g.fillRect(sx, sy - 1, 1, 3); g.fillRect(sx - 1, sy, 3, 1);
  }
}

// 가방 화면의 캐릭터 미리보기
function drawPreview(cv, dirIndex) {
  const ch = CHAR[me.slot];
  if (cv.width !== ch.w || cv.height !== ch.h) { cv.width = ch.w; cv.height = ch.h; }
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  drawCharacter(g, me.slot, DIRS[dirIndex], 0, ch.w / 2, ch.h - 1, inv.equip);
}

function render(now) {
  const t = now / 1000;
  const mapW = MW * T, mapH = MH * T;
  let camX = me.x - viewW / 2, camY = me.y - 12 - viewH / 2;
  camX = viewW >= mapW ? (mapW - viewW) / 2 : Math.max(0, Math.min(mapW - viewW, camX));
  camY = viewH >= mapH ? (mapH - viewH) / 2 : Math.max(0, Math.min(mapH - viewH, camY));
  camX = Math.round(camX * scale) / scale; camY = Math.round(camY * scale) / scale;
  cam.x = camX; cam.y = camY;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#2d6436"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(groundCanvas, 0, 0);

  // 물 반짝임
  const vx0 = Math.max(0, Math.floor(camX / T)), vy0 = Math.max(0, Math.floor(camY / T));
  const vx1 = Math.min(MW - 1, Math.ceil((camX + viewW) / T)), vy1 = Math.min(MH - 1, Math.ceil((camY + viewH) / T));
  const sparkle = ART["effects/water_sparkle"];
  for (let ty = vy0; ty <= vy1; ty++) for (let tx = vx0; tx <= vx1; tx++) {
    if (ground[idx(tx, ty)] !== WATER) continue;
    if (Math.sin(t * 1.6 + tx * 1.7 + ty * 2.3) > 0.55)
      ctx.drawImage(sparkle, tx * T + ((tx * 7 + ty * 3) % 9) + 3, ty * T + ((tx * 5 + ty * 11) % 8) + 5);
  }

  // 주울 수 있는 버섯
  const mush = ART["decor/mushroom"];
  for (const s of mushrooms) {
    if (s.picked || s.tx < vx0 - 1 || s.tx > vx1 + 1 || s.ty < vy0 - 1 || s.ty > vy1 + 1) continue;
    ctx.drawImage(mush, s.tx * T, s.ty * T, T, T);
  }

  // 화면 안 오브젝트 + 플레이어들을 y순으로 정렬해 앞뒤 겹침 처리
  const list = objects.filter(o => o.x > camX - 48 && o.x < camX + viewW + 48 && o.y > camY - 8 && o.y < camY + viewH + 60);
  const hop = me.eatT > 0 ? -Math.round(Math.abs(Math.sin(me.eatT * 22))) : 0; // 먹을 때 통통
  const people = [{ key: mySlotKey(), x: me.x, y: me.y, hop, slot: me.slot, dir: me.dir, frame: frameIndex(me), name: me.name, self: true, look: inv.equip, ko: me.koT > 0 ? me.koSide : null }];
  for (const r of remotes.values()) people.push({ key: r.id, x: r.rx, y: r.ry, hop: 0, slot: r.slot, dir: r.dir, frame: frameIndex(r), name: r.name, look: r.look, ko: r.look?.ko || null });

  // 그림자 (effects/shadow.png를 크기에 맞게 늘려서 사용)
  const shadow = ART["effects/shadow"];
  for (const o of list) { const w = shadowW[o.type]; ctx.drawImage(shadow, o.x - w, o.y - 5, w * 2, 6); }
  for (const p of people) {
    if (p.ko) ctx.drawImage(shadow, p.x - 11, p.y - 3, 22, 4);
    else ctx.drawImage(shadow, p.x - 5, p.y - 3, 10, 4);
  }

  const drawables = [...list, ...people.map(p => ({ ...p, type: "player" }))].sort((a, b) => a.y - b.y);
  for (const o of drawables) {
    if (o.type === "player") {
      // 캐릭터 시트에서 (동작 칸, 방향 줄)을 잘라 발밑이 위치에 오도록 그림
      if (o.ko) drawKnockedOut(ctx, o, t);
      else drawCharacter(ctx, o.slot, o.dir, o.frame, o.x, o.y + o.hop, o.look);
    } else {
      const s = spriteFor(o);
      let sway = (o.type === "tree" || o.type === "pine") && !reduceMotion ? Math.round(Math.sin(t * 0.9 + o.tx * 0.7) * 0.6) : 0;
      if (o.shakeT > 0) sway += Math.round(Math.sin(o.shakeT * 50));   // 채집할 때 흔들림
      ctx.drawImage(s, Math.round(o.x - s.width / 2) + sway, Math.round(o.y - s.height + 1));
    }
  }

  drawParticles(ctx);

  // 이름표 (화면 픽셀 좌표로 그려서 글자가 선명하게)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const toScreen = (x, y) => [(x - camX) * scale, (y - camY) * scale];
  // 가까이 가면 표지판 위에 "상점" 표시
  for (const o of list) {
    if (o.type !== "sign" || Math.hypot(me.x - o.x, me.y - o.y) > GATHER.reach * 2) continue;
    const [sx, sy] = toScreen(o.x, o.y - 22);
    ctx.font = `${Math.round(13 * dpr)}px "Do Hyeon", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const w = ctx.measureText("상점").width + 14 * dpr, h = 18 * dpr, bob = Math.sin(t * 3) * 2 * dpr;
    ctx.fillStyle = "#fff8e8"; ctx.strokeStyle = "#8a5a33"; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - h / 2 + bob, w, h, 5 * dpr); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#3b2a1e"; ctx.fillText("상점", sx, sy + bob);
  }
  if (online || remotes.size) {
    ctx.font = `${Math.round(13 * dpr)}px "Do Hyeon", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const p of people) {
      const sx = (p.x - camX) * scale, sy = (p.y - (p.ko ? 18 : CHAR[p.slot].h - 5) - camY) * scale;
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

  // 말풍선 (채팅·대화 내용)
  ctx.font = `${Math.round(14 * dpr)}px "Do Hyeon", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const p of people) {
    const text = social.bubbleFor(p.key);
    if (!text) continue;
    const [sx, headY] = toScreen(p.x, p.y - (p.ko ? 18 : CHAR[p.slot].h - 5));
    const sy = headY - ((online || remotes.size) ? 34 : 14) * dpr;
    const w = ctx.measureText(text).width + 18 * dpr, h = 24 * dpr;
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#3b2a1e"; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - h, w, h, 8 * dpr); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - 6 * dpr, sy - 1); ctx.lineTo(sx, sy + 7 * dpr); ctx.lineTo(sx + 6 * dpr, sy - 1);
    ctx.fill(); ctx.stroke();
    ctx.fillRect(sx - 5 * dpr, sy - 3 * dpr, 10 * dpr, 3 * dpr);
    ctx.fillStyle = "#3b2a1e"; ctx.fillText(text, sx, sy - h / 2);
  }

  drawFloaters(ctx, toScreen, dpr);

  // 떨어지는 나뭇잎
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  for (const l of leaves) {
    l.y += l.s * 0.016; l.x += Math.sin(t + l.ph) * 0.25 + 0.1;
    if (l.y > viewH + 4) { l.y = -4; l.x = Math.random() * viewW; }
    if (l.x > viewW + 4) l.x = -4;
    ctx.drawImage(ART[l.img], Math.round(l.x), Math.round(l.y));
  }
}

// ---------- 인벤토리 · 가방 · 상점 화면 ----------
const cam = { x: 0, y: 0 };
let social = null;
const ui = createUI({
  root: stage,
  inv,
  art: name => ART[name] || null,
  drawPreview,
  onProfile: () => social.pickProfile(),
  onProfileDelete: () => social.clearProfile(),
  onUse: i => useSlot(i),
  onOpenChange: open => {
    if (open) { held = []; shift = false; document.querySelectorAll("#pad button").forEach(b => b.classList.remove("on")); }
  }
});
ui.setVisible(false);

// ---------- 채팅 · 대화 · 선물 ----------
const mySlotKey = () => (net && net.mySlot) || String(me.slot);
function portraitCanvas(slotKey) {
  // 프로필 그림이 없을 때 대화창에 보여 줄 캐릭터 모습
  const self = slotKey === mySlotKey();
  const r = self ? null : remotes.get(slotKey);
  const slot = self ? me.slot : (r ? r.slot : Number(slotKey));
  const ch = CHAR[slot];
  const c = document.createElement("canvas");
  c.width = ch.w; c.height = ch.h;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  drawCharacter(g, slot, "down", 0, ch.w / 2, ch.h - 1, self ? inv.equip : r?.look);
  // 위쪽 빈 공간을 잘라 내서 캐릭터가 대화창을 꽉 채우도록
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) return c;
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
social = createSocial({
  root: stage,
  ui,
  inv,
  me,
  art: name => ART[name] || null,
  getNet: () => net,
  players: () => {
    const out = { [mySlotKey()]: { name: me.name, slot: me.slot } };
    for (const r of remotes.values()) out[r.id] = { name: r.name, slot: r.slot };
    return out;
  },
  portraitCanvas,
  onBusyChange: busy => { if (busy) { held = []; shift = false; document.querySelectorAll("#pad button").forEach(b => b.classList.remove("on")); } },
  onGiftReceived: id => floatText(me.x, me.y - 26, `+1 ${ITEMS[id].name}`, "#fff8e8", "#3b2a1e", ART["items/" + id])
});

// 옷차림(+ 쓰러짐 상태)이 바뀌면 친구에게도 알려 줘요
let sentLook = "";
function currentLook() {
  const look = inv.look();
  return me.koT > 0 ? (look ? look + ";" : "") + "ko=" + me.koSide : look;
}
function syncLook() {
  const look = currentLook();
  if (look !== sentLook && playing) { sentLook = look; net?.sendLook(look); }
}
inv.onChange(syncLook);

// ---------- 아이템 사용 ----------
function useSlot(i) {
  const s = inv.slots[i];
  if (!s) return false;
  const it = ITEMS[s.id];
  if (it.kind === "food") {
    inv.removeAt(i, 1);
    me.eatT = 0.45;
    eatBurst(me.x, me.y, it.color);
    sfx.eat();
    ui.toast(`${josa(it.name, "을", "를")} 먹었다!`);
    if (it.knockout) {
      // 먹으면 옆으로 쓰러져서 잠시 움직일 수 없어요
      me.koT = it.knockout / 1000;
      me.koSide = me.dir === "left" ? "left" : "right";
      held = [];
      setTimeout(() => { sfx.dizzy(); ui.toast("어지러워서 쓰러졌다…", "warn"); }, 350);
      syncLook();
    }
    return true;
  }
  if (it.kind === "wear") return ui.wearFromSlot(i);
  return false;
}

function dropSelected() {
  const i = ui.selected;
  const s = i >= 0 ? inv.slots[i] : null;
  if (!s) { ui.toast("버릴 아이템을 먼저 골라 주세요"); return; }
  inv.removeAt(i, 1);
  poof(me.x, me.y);
  sfx.trash();
  ui.toast(`${josa(ITEMS[s.id].name, "을", "를")} 버렸다`);
}

// ---------- 채집 · 상점 (화면 클릭/탭) ----------
for (const o of objects) if (o.fruitMax) { o.fruitMax = GATHER.fruitMax; o.fruit = GATHER.fruitMax; }
const fruitObjects = objects.filter(o => o.fruitMax);

function isInteractive(o) {
  return o.type === "bush" || o.type === "sign" || (o.type === "tree" && o.fruitMax);
}
// 화면 좌표 → 세계 좌표
function worldPoint(e) {
  const r = canvas.getBoundingClientRect();
  return [cam.x + (e.clientX - r.left) * dpr / scale, cam.y + (e.clientY - r.top) * dpr / scale];
}
// 누른 위치에 있는 채집 가능한 오브젝트 (여럿이면 앞쪽 것)
function objectAt(wx, wy) {
  let best = null;
  for (const o of objects) {
    if (!isInteractive(o)) continue;
    const s = spriteFor(o);
    const x0 = o.x - s.width / 2, y0 = o.y - s.height + 1;
    if (wx >= x0 && wx <= x0 + s.width && wy >= y0 && wy <= o.y + 1 && (!best || o.y > best.y)) best = o;
  }
  return best;
}
function faceTowards(x, y) {
  const dx = x - me.x, dy = y - me.y;
  me.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
}

function giveItem(id, fromX, fromY) {
  if (inv.roomFor(id) < 1) { ui.toast("가방이 가득 찼어요", "warn"); sfx.miss(); return false; }
  inv.add(id, 1);
  sfx.pickup();
  floatText(fromX, fromY, `+1 ${ITEMS[id].name}`, "#fff8e8", "#3b2a1e", ART["items/" + id]);
  ui.toast(`${josa(ITEMS[id].name, "을", "를")} 얻었다!`);
  return true;
}

function interact(o, now) {
  faceTowards(o.x, o.y);
  const top = o.y - spriteFor(o).height + 4;
  if (o.type === "sign") { ui.openShop(); return; }
  o.shakeT = 0.3;
  leafBurst(o.x, o.y - 8);
  if (o.fruitMax) {
    if (o.fruit > 0) {
      const id = o.type === "tree" ? "apple" : "berry";
      if (giveItem(id, o.x, top)) {
        o.fruit--;
        if (!o.regrowAt) o.regrowAt = now + GATHER.regrowMs;
      }
      return;
    }
    if (o.type === "tree") { floatText(o.x, top, "아무것도 없다", "#fff8e8", "#7a5a3e"); sfx.miss(); return; }
  }
  // 열매 없는 덤불: 일정 확률로 잡초
  if (o.searchedAt && now - o.searchedAt < GATHER.bushCooldown) { floatText(o.x, top, "…", "#fff8e8", "#7a5a3e"); return; }
  o.searchedAt = now;
  if (Math.random() < GATHER.weedChance) giveItem("weed", o.x, top);
  else { floatText(o.x, top, "아무것도 없다", "#fff8e8", "#7a5a3e"); sfx.miss(); }
}

// 누른 위치의 친구 캐릭터
function remoteAt(wx, wy) {
  for (const r of remotes.values()) {
    const ch = CHAR[r.slot];
    if (wx >= r.rx - ch.w / 2 && wx <= r.rx + ch.w / 2 && wy >= r.ry - ch.h + 4 && wy <= r.ry + 2) return r;
  }
  return null;
}

// 누른 위치의 버섯 (한 칸 크기로 넉넉하게 판정)
function mushroomAt(wx, wy) {
  return mushrooms.find(s => !s.picked && wx >= s.tx * T && wx < s.tx * T + T && wy >= s.ty * T && wy < s.ty * T + T) || null;
}

canvas.addEventListener("pointerdown", e => {
  if (!playing || ui.isOpen() || social.busy()) return;
  // 친구 캐릭터를 누르면 대화하기/선물하기 메뉴
  const [px, py] = worldPoint(e);
  const friend = remoteAt(px, py);
  if (friend) { social.openPlayerMenu(friend.id, e.clientX, e.clientY); return; }
  if (me.koT > 0) { floatText(me.x, me.y - 26, "어지러워서 움직일 수 없어요", "#fff8e8", "#7a5a3e"); return; }
  const [wx, wy] = worldPoint(e);
  const o = objectAt(wx, wy);
  const now = performance.now();
  const shroom = o ? null : mushroomAt(wx, wy);
  if (shroom) {
    if (Math.hypot(me.x - shroom.x, me.y - shroom.y - 6) > GATHER.reach) {
      floatText(shroom.x, shroom.y - 8, "더 가까이 가 주세요", "#fff8e8", "#7a5a3e");
      return;
    }
    faceTowards(shroom.x, shroom.y);
    if (giveItem("mushroom", shroom.x, shroom.y - 8)) {
      shroom.picked = true;          // 주우면 맵에서 사라져요
      leafBurst(shroom.x, shroom.y);
    }
    return;
  }
  if (o) {
    if (Math.hypot(me.x - o.x, me.y - o.y) > GATHER.reach) {
      floatText(o.x, o.y - spriteFor(o).height + 4, "더 가까이 가 주세요", "#fff8e8", "#7a5a3e");
      return;
    }
    interact(o, now);
    return;
  }
  // 오브젝트가 없는 곳을 누르면: 고른 아이템 사용
  if (ui.selected >= 0 && inv.slots[ui.selected]) useSlot(ui.selected);
});
canvas.addEventListener("pointermove", e => {
  if (!playing || e.pointerType === "touch") return;
  const [wx, wy] = worldPoint(e);
  const o = remoteAt(wx, wy) || objectAt(wx, wy) || mushroomAt(wx, wy);
  canvas.style.cursor = o ? "pointer" : (ui.selected >= 0 && inv.slots[ui.selected] ? "cell" : "default");
});

function updateWorld(dt, now) {
  for (const o of objects) if (o.shakeT > 0) o.shakeT -= dt;
  for (const o of fruitObjects) {
    if (o.regrowAt && now >= o.regrowAt) {
      o.fruit = Math.min(o.fruitMax, o.fruit + 1);
      o.regrowAt = o.fruit < o.fruitMax ? now + GATHER.regrowMs : null;
    }
  }
}

// ---------- 게임 루프 ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateMe(dt, now);
  for (const r of remotes.values()) updateRemote(r, dt, now);
  updateWorld(dt, now);
  updateEffects(dt);
  ui.tickPreview(dt);
  render(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 개발용: 브라우저 콘솔에서 가짜 2P를 띄워 화면을 확인할 수 있어요
// 예) __forest.fakeRemote({ x: 470, y: 414, dir: "left", moving: true })
window.__forest = {
  fakeRemote(p) { upsertRemote("fake", { name: "테스트", slot: 1, dir: "down", moving: false, ...p }, !remotes.has("fake")); },
  me, inv, objects, mushrooms, social: () => social, cam: () => ({ ...cam, scale, dpr })
};
