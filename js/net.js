// Firebase 연결 담당 (Google 로그인 + Realtime Database)
//
// 데이터 구조 (한 방에 자리 2개: "0" = 1P, "1" = 2P)
//   rooms/{방이름}/players/0 = { uid, name, slot, x, y, dir, moving, running, t }
//   rooms/{방이름}/players/1 = { ... }
//
// - Google 계정으로 로그인해요.
// - 누가 들어올 수 있는지는 Firebase 콘솔의 보안 규칙에 적은 이메일 목록이 정해요.
//   목록에 없는 계정은 방을 읽지도, 자리에 앉지도 못해요.
// - 빈 자리에만 앉을 수 있고, 앉은 뒤에는 그 자리 주인만 수정·삭제할 수 있어요.
// - 창을 닫거나 연결이 끊기면 onDisconnect로 서버가 자동으로 내 자리를 비워요.

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const SLOTS = ["0", "1"];

export class RoomFullError extends Error {
  constructor() { super("room_full"); this.name = "RoomFullError"; }
}
export class NotInvitedError extends Error {
  constructor() { super("not_invited"); this.name = "NotInvitedError"; }
}

const isPermissionError = e => String(e && (e.code || e.message)).toUpperCase().includes("PERMISSION");

export async function connect(firebaseConfig) {
  const [appMod, authMod, dbMod] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-database.js")
  ]);
  const { ref, set, update, remove, onValue, onDisconnect, serverTimestamp } = dbMod;

  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app); // 로그인 상태는 브라우저에 기억돼요
  const db = dbMod.getDatabase(app);

  let meRef = null, mySlot = null, lastState = null;
  const unsubs = [];

  function onAuth(fn) { return authMod.onAuthStateChanged(auth, fn); }

  function signIn() {
    const provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return authMod.signInWithPopup(auth, provider);
  }

  function signOut() { return authMod.signOut(auth); }

  // 자리 하나에 앉아 보기. 이미 누가 있으면 규칙이 거절해서 null
  async function trySit(room, slotKey, profile, uid) {
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
    const user = auth.currentUser;
    if (!user) throw new NotInvitedError();
    const playersRef = ref(db, `rooms/${room}/players`);

    // 방 전체(자리 2개)를 계속 지켜보는 리스너 하나만 사용해요.
    // 입장 전 확인과 입장 후 동기화를 같은 리스너로 처리해서, 나중에 들어온 사람을 놓치지 않아요.
    let latest = {};
    const seen = new Map(); // 자리 번호 -> 마지막으로 받은 데이터(JSON)
    let resolveFirst, rejectFirst;
    const firstSnapshot = new Promise((res, rej) => { resolveFirst = res; rejectFirst = rej; });

    function dispatch(all) {
      for (const k of SLOTS) {
        if (k === mySlot) continue;
        const p = all[k];
        if (p) {
          const json = JSON.stringify(p);
          if (!seen.has(k)) { seen.set(k, json); console.info("[forest] 친구 입장", k, p.name); handlers.onJoin(k, p); }
          else if (seen.get(k) !== json) { seen.set(k, json); handlers.onMove(k, p); }
        } else if (seen.has(k)) {
          seen.delete(k); console.info("[forest] 친구 퇴장", k); handlers.onLeave(k);
        }
      }
    }

    const stopListening = onValue(playersRef, snap => {
      latest = snap.val() || {};
      resolveFirst(latest);
      if (mySlot !== null) dispatch(latest);
    }, err => {
      rejectFirst(err);
      console.error("[forest] 방 데이터를 읽지 못했어요", err);
    });

    let current;
    try {
      current = await firstSnapshot;
    } catch (e) {
      stopListening();
      // 초대 목록에 없는 계정은 읽기부터 거절돼요
      if (isPermissionError(e)) throw new NotInvitedError();
      throw e;
    }
    const free = SLOTS.filter(k => !current[k]);
    if (!free.length) { stopListening(); throw new RoomFullError(); }

    let seat = null;
    for (const k of free) {
      seat = await trySit(room, k, profile, user.uid);
      if (seat) break; // 동시에 들어온 사람이 먼저 앉았으면 다음 자리 시도
    }
    if (!seat) { stopListening(); throw new RoomFullError(); }

    meRef = seat.r; mySlot = seat.slotKey; lastState = seat.state;
    console.info("[forest] 입장 완료", room, "자리", mySlot);
    unsubs.push(stopListening);
    dispatch(latest); // 앉는 동안 받은 최신 상태 반영

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
          handlers.onKicked?.();
        }
      }
      wasConnected = on;
    }));

    return { slot: seat.slot, start: seat.start };
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

  return { onAuth, signIn, signOut, join, send, leave };
}
