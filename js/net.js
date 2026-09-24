// Firebase 연결 담당 (Google 로그인 + Realtime Database)
//
// 데이터 구조 (한 방에 자리 2개: "0" = 1P, "1" = 2P)
//   rooms/{방이름}/players/0 = { uid, name, slot, x, y, dir, moving, running, t }
//   rooms/{방이름}/players/1 = { ... }
//
// - Google 계정으로 로그인해요. 로그인은 "탭마다 따로" 유지돼요.
//   (한 탭에서 다른 계정으로 로그인해도 다른 탭의 플레이어가 끊기지 않아요)
// - 누가 들어올 수 있는지는 Firebase 콘솔의 보안 규칙에 적은 이메일 목록이 정해요.
// - 접속 중인 플레이어는 5초마다 t(마지막 신호 시각)를 갱신해요.
//   20초 넘게 신호가 없는 자리는 "빈자리"로 보고, 새로 들어오는 사람이 앉을 수 있어요.
//   그래서 창을 강제로 닫아 자리가 남아도 방이 계속 막히지 않아요.

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const SLOTS = ["0", "1"];
export const HEARTBEAT_MS = 5000;
export const STALE_MS = 20000;

export class RoomFullError extends Error {
  constructor() { super("room_full"); this.name = "RoomFullError"; }
}
export class NotInvitedError extends Error {
  constructor() { super("not_invited"); this.name = "NotInvitedError"; }
}

const isPermissionError = e => String(e && (e.code || e.message)).toUpperCase().includes("PERMISSION");
const log = (...a) => console.info("[forest]", ...a);

export async function connect(firebaseConfig) {
  const [appMod, authMod, dbMod] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-database.js")
  ]);
  const { ref, set, update, remove, onValue, onDisconnect, serverTimestamp } = dbMod;

  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  // 탭마다 따로 로그인 유지 (새로고침해도 그 탭에서는 로그인 유지)
  await authMod.setPersistence(auth, authMod.browserSessionPersistence).catch(() => {});
  const db = dbMod.getDatabase(app);

  // 서버 시계와 내 컴퓨터 시계의 차이
  let serverOffset = 0;
  onValue(ref(db, ".info/serverTimeOffset"), s => { serverOffset = s.val() || 0; });
  const serverNow = () => Date.now() + serverOffset;
  const isStale = p => !p || typeof p.t !== "number" || serverNow() - p.t > STALE_MS;

  let meRef = null, mySlot = null, myUid = null, lastState = null;
  let latest = {};
  let heartbeat = null, recheck = null;
  const unsubs = [];

  function onAuth(fn) { return authMod.onAuthStateChanged(auth, fn); }

  function signIn() {
    const provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return authMod.signInWithPopup(auth, provider);
  }

  function signOut() { return authMod.signOut(auth); }

  // 자리 하나에 앉아 보기. 규칙이 거절하면 null
  async function trySit(room, slotKey, profile, uid) {
    const slot = Number(slotKey);
    const start = profile.spawnFor(slot);
    const r = ref(db, `rooms/${room}/players/${slotKey}`);
    const state = { uid, name: profile.name, slot, x: start.x, y: start.y, dir: "down", moving: false, running: false };
    try {
      await set(r, { ...state, t: serverTimestamp() });
    } catch (e) {
      if (isPermissionError(e)) { log("자리", slotKey, "에 앉지 못함 (규칙 거절)"); return null; }
      throw e;
    }
    await onDisconnect(r).remove();
    return { r, slotKey, slot, start, state };
  }

  async function join(room, profile, handlers) {
    const user = auth.currentUser;
    if (!user) throw new NotInvitedError();
    myUid = user.uid;
    const playersRef = ref(db, `rooms/${room}/players`);

    // 방 전체(자리 2개)를 지켜보는 리스너 하나로 입장 확인과 동기화를 모두 처리해요.
    const seen = new Map(); // 자리 번호 -> 마지막으로 받은 데이터(JSON)
    let resolveFirst, rejectFirst;
    const firstSnapshot = new Promise((res, rej) => { resolveFirst = res; rejectFirst = rej; });

    function dispatch() {
      for (const k of SLOTS) {
        if (k === mySlot) continue;
        const p = latest[k];
        if (p && !isStale(p)) {
          const json = JSON.stringify(p);
          if (!seen.has(k)) { seen.set(k, json); log("친구 입장: 자리", k, p.name); handlers.onJoin(k, p); }
          else if (seen.get(k) !== json) { seen.set(k, json); handlers.onMove(k, p); }
        } else if (seen.has(k)) {
          seen.delete(k); log("친구 퇴장: 자리", k, p ? "(신호 끊김)" : "");
          handlers.onLeave(k);
        }
      }
    }

    const stopListening = onValue(playersRef, snap => {
      latest = snap.val() || {};
      resolveFirst(latest);
      if (mySlot !== null) dispatch();
    }, err => {
      rejectFirst(err);
      console.error("[forest] 방 데이터를 읽지 못했어요", err);
      handlers.onConnection?.(false);
    });

    try {
      await firstSnapshot;
    } catch (e) {
      stopListening();
      if (isPermissionError(e)) throw new NotInvitedError();
      throw e;
    }

    // 비어 있거나 20초 넘게 신호가 없는 자리가 빈자리
    const free = SLOTS.filter(k => isStale(latest[k]));
    log("입장 시도: 방", room, "빈자리", free.join(",") || "없음");
    if (!free.length) { stopListening(); throw new RoomFullError(); }

    let seat = null;
    for (const k of free) {
      seat = await trySit(room, k, profile, user.uid);
      if (seat) break;
    }
    if (!seat) { stopListening(); throw new RoomFullError(); }

    meRef = seat.r; mySlot = seat.slotKey; lastState = seat.state;
    log("입장 완료: 방", room, "자리", mySlot);
    unsubs.push(stopListening);
    dispatch();

    // 5초마다 살아 있다는 신호 보내기
    heartbeat = setInterval(() => {
      if (meRef) update(meRef, { t: serverTimestamp() }).catch(e => log("신호 전송 실패", e.code || e.message));
    }, HEARTBEAT_MS);
    // 신호가 끊긴 친구를 화면에서 치우기 위해 1초마다 다시 확인
    recheck = setInterval(dispatch, 1000);

    // 연결 상태 표시 + 재연결 시 내 자리 복구
    let wasConnected = true;
    unsubs.push(onValue(ref(db, ".info/connected"), async s => {
      const on = s.val() === true;
      handlers.onConnection?.(on);
      if (on && !wasConnected && meRef) {
        try {
          await set(meRef, { ...lastState, t: serverTimestamp() });
          await onDisconnect(meRef).remove();
          log("재연결 후 자리 복구");
        } catch (e) {
          handlers.onKicked?.();
        }
      }
      wasConnected = on;
    }));

    return { slot: seat.slot, start: seat.start, uid: user.uid };
  }

  // 내 상태 보내기 (바뀐 필드만)
  function send(state) {
    if (!meRef) return;
    const patch = {};
    for (const k of ["x", "y", "dir", "moving", "running"]) {
      if (state[k] !== lastState[k]) patch[k] = state[k];
    }
    if (!Object.keys(patch).length) return;
    Object.assign(lastState, patch);
    patch.t = serverTimestamp();
    update(meRef, patch).catch(e => log("위치 전송 실패", e.code || e.message));
  }

  function leave() {
    clearInterval(heartbeat); clearInterval(recheck);
    unsubs.forEach(u => u());
    if (meRef) remove(meRef).catch(() => {});
    meRef = null;
  }

  // 화면의 "접속 정보"에 보여 줄 현재 상태
  function debugInfo() {
    return SLOTS.map(k => {
      const p = latest[k];
      if (!p) return { slot: k, empty: true };
      return {
        slot: k, name: p.name, mine: k === mySlot, sameAccount: p.uid === myUid,
        age: typeof p.t === "number" ? Math.max(0, Math.round((serverNow() - p.t) / 1000)) : null,
        stale: isStale(p)
      };
    });
  }

  return { onAuth, signIn, signOut, join, send, leave, debugInfo, get uid() { return auth.currentUser?.uid || null; } };
}
