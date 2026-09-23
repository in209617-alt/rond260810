// Firebase Realtime Database 연결 담당
//
// 데이터 구조 (한 방에 자리 2개: "0" = 1P, "1" = 2P)
//   rooms/{방이름}/players/0 = { uid, name, slot, x, y, dir, moving, running, t }
//   rooms/{방이름}/players/1 = { ... }
//
// - 익명 로그인으로 uid를 받아요.
// - 빈 자리에만 앉을 수 있고, 앉은 뒤에는 그 자리의 uid 주인만 수정·삭제할 수 있어요 (database.rules.json).
//   자리가 "0"과 "1" 두 개뿐이라서 세 번째 사람은 규칙에서 자동으로 막혀요.
// - 창을 닫거나 연결이 끊기면 onDisconnect로 서버가 자동으로 내 자리를 비워요.

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const SLOTS = ["0", "1"];

export class RoomFullError extends Error {
  constructor() { super("room_full"); this.name = "RoomFullError"; }
}

const isPermissionError = e => String(e && (e.code || e.message)).toUpperCase().includes("PERMISSION");

export async function connect(firebaseConfig) {
  const [appMod, authMod, dbMod] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-database.js")
  ]);
  const { ref, get, set, update, remove, onValue, onChildAdded, onChildChanged, onChildRemoved, onDisconnect, serverTimestamp } = dbMod;

  const app = appMod.initializeApp(firebaseConfig);
  // 탭마다 다른 익명 계정을 쓰도록 메모리 저장 방식 사용
  // (같은 컴퓨터에서 탭 두 개로 2인 테스트가 가능해져요)
  const auth = authMod.initializeAuth(app, { persistence: authMod.inMemoryPersistence });
  const { user } = await authMod.signInAnonymously(auth);
  const uid = user.uid;
  const db = dbMod.getDatabase(app);

  let meRef = null, mySlot = null;
  let lastState = null;
  const unsubs = [];

  // 자리 하나에 앉아 보기. 이미 누가 있으면 규칙이 거절해서 false
  async function trySit(room, slotKey, profile) {
    const slot = Number(slotKey);
    const start = profile.spawnFor(slot);
    const r = ref(db, `rooms/${room}/players/${slotKey}`);
    const state = { uid, name: profile.name, slot, x: start.x, y: start.y, dir: "down", moving: false, running: false };
    try {
      await set(r, { ...state, t: serverTimestamp() });
    } catch (e) {
      if (isPermissionError(e)) return null;
      throw e;
    }
    await onDisconnect(r).remove();
    return { r, slotKey, slot, start, state };
  }

  async function join(room, profile, handlers) {
    const playersRef = ref(db, `rooms/${room}/players`);
    const current = (await get(playersRef)).val() || {};
    const free = SLOTS.filter(k => !current[k]);
    if (!free.length) throw new RoomFullError();

    let seat = null;
    for (const k of free) {
      seat = await trySit(room, k, profile);
      if (seat) break; // 동시에 들어온 사람이 먼저 앉았으면 다음 자리 시도
    }
    if (!seat) throw new RoomFullError();

    meRef = seat.r; mySlot = seat.slotKey; lastState = seat.state;

    const others = fn => s => { if (s.key !== mySlot) fn(s.key, s.val()); };
    unsubs.push(onChildAdded(playersRef, others(handlers.onJoin)));
    unsubs.push(onChildChanged(playersRef, others(handlers.onMove)));
    unsubs.push(onChildRemoved(playersRef, others(handlers.onLeave)));

    // 연결 상태 표시 + 재연결 시 내 자리 복구
    let wasConnected = true;
    unsubs.push(onValue(ref(db, ".info/connected"), async s => {
      const on = s.val() === true;
      handlers.onConnection?.(on);
      if (on && !wasConnected && meRef) {
        try {
          await set(meRef, { ...lastState, t: serverTimestamp() });
          await onDisconnect(meRef).remove();
        } catch (e) {
          handlers.onKicked?.(); // 끊긴 사이 다른 사람이 자리에 앉음
        }
      }
      wasConnected = on;
    }));

    return { uid, slot: seat.slot, start: seat.start };
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
    update(meRef, patch).catch(() => {});
  }

  function leave() {
    unsubs.forEach(u => u());
    if (meRef) remove(meRef).catch(() => {});
    meRef = null;
  }

  return { uid, join, send, leave };
}
