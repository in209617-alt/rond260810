// 인벤토리 상태 (칸 10개 + 입은 옷 + 코인)
// 화면과 상관없는 "데이터"만 다뤄요. 바뀔 때마다 이 브라우저에 자동 저장돼요.

import { ITEMS, EQUIP_SLOTS, INVENTORY_SIZE, STARTER } from "./items.js?v=11";

const SAVE_PREFIX = "forest.save.";

export class Inventory {
  constructor() {
    this.slots = new Array(INVENTORY_SIZE).fill(null); // { id, n } | null
    this.equip = Object.fromEntries(EQUIP_SLOTS.map(s => [s.key, null])); // 자리 -> 아이템 id
    this.coins = 0;
    this.key = null;
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }
  changed() {
    this.save();
    this.listeners.forEach(fn => fn(this));
  }

  // ----- 저장/불러오기 (브라우저 localStorage, 계정별로 따로) -----
  load(owner) {
    this.key = SAVE_PREFIX + owner;
    let data = null;
    try { data = JSON.parse(localStorage.getItem(this.key) || "null"); } catch (e) { data = null; }
    if (data && Array.isArray(data.slots)) {
      this.slots = new Array(INVENTORY_SIZE).fill(null).map((_, i) => {
        const s = data.slots[i];
        return s && ITEMS[s.id] && s.n > 0 ? { id: s.id, n: Math.min(s.n, ITEMS[s.id].stack) } : null;
      });
      for (const { key } of EQUIP_SLOTS) {
        const id = data.equip?.[key];
        this.equip[key] = id && ITEMS[id]?.slot === key ? id : null;
      }
      this.coins = Math.max(0, Math.floor(data.coins || 0));
    } else {
      this.coins = STARTER.coins;
      STARTER.items.forEach(it => this.add(it.id, it.n, true));
    }
    this.changed();
  }
  save() {
    if (!this.key) return;
    try { localStorage.setItem(this.key, JSON.stringify({ slots: this.slots, equip: this.equip, coins: this.coins })); } catch (e) { /* 저장 불가 */ }
  }

  // ----- 조회 -----
  count(id) { return this.slots.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0); }
  roomFor(id) {
    const max = ITEMS[id].stack;
    return this.slots.reduce((a, s) => a + (!s ? max : s.id === id ? max - s.n : 0), 0);
  }

  // ----- 넣기/빼기 -----
  // n개를 넣고, 실제로 넣은 개수를 돌려줘요
  add(id, n = 1, silent = false) {
    const max = ITEMS[id].stack;
    let left = n;
    for (const s of this.slots) if (left && s && s.id === id && s.n < max) { const k = Math.min(left, max - s.n); s.n += k; left -= k; }
    for (let i = 0; i < this.slots.length && left; i++) if (!this.slots[i]) { const k = Math.min(left, max); this.slots[i] = { id, n: k }; left -= k; }
    if (!silent) this.changed();
    return n - left;
  }
  removeAt(i, n = 1) {
    const s = this.slots[i];
    if (!s) return null;
    const k = Math.min(n, s.n);
    s.n -= k;
    if (s.n <= 0) this.slots[i] = null;
    this.changed();
    return { id: s.id, n: k };
  }
  // 칸의 아이템 전체를 꺼냄 (손에 들기)
  take(i) {
    const s = this.slots[i];
    this.slots[i] = null;
    this.changed();
    return s;
  }
  // 손에 든 것을 칸에 놓기. 같은 아이템이면 합치고, 다르면 서로 바꿔서 원래 칸 것을 돌려줘요
  put(i, stack) {
    const s = this.slots[i];
    let back = null;
    if (!s) this.slots[i] = stack;
    else if (s.id === stack.id && s.n < ITEMS[s.id].stack) {
      const k = Math.min(stack.n, ITEMS[s.id].stack - s.n);
      s.n += k;
      back = stack.n - k > 0 ? { id: stack.id, n: stack.n - k } : null;
    } else { this.slots[i] = stack; back = s; }
    this.changed();
    return back;
  }
  firstEmpty() { return this.slots.findIndex(s => !s); }
  // 칸 i의 아이템을 칸 j로 옮김 (같은 아이템이면 합치고, 다르면 자리 바꿈)
  move(i, j) {
    if (i === j || !this.slots[i]) return;
    const a = this.slots[i], b = this.slots[j];
    if (b && b.id === a.id && b.n < ITEMS[a.id].stack) {
      const k = Math.min(a.n, ITEMS[a.id].stack - b.n);
      b.n += k; a.n -= k;
      if (a.n <= 0) this.slots[i] = null;
    } else {
      this.slots[j] = a; this.slots[i] = b;
    }
    this.changed();
  }
  // 특정 아이템을 n개 빼기 (뒤쪽 칸부터). 실제로 뺀 개수를 돌려줘요
  removeId(id, n) {
    let left = n;
    for (let i = this.slots.length - 1; i >= 0 && left; i--) {
      const s = this.slots[i];
      if (s && s.id === id) { const k = Math.min(left, s.n); s.n -= k; left -= k; if (!s.n) this.slots[i] = null; }
    }
    this.changed();
    return n - left;
  }

  // ----- 옷 -----
  // 옷을 입고, 원래 입고 있던 옷 id를 돌려줘요
  wear(id) {
    const slot = ITEMS[id]?.slot;
    if (!slot) return null;
    const prev = this.equip[slot];
    this.equip[slot] = id;
    this.changed();
    return prev;
  }
  unwear(slot) {
    const prev = this.equip[slot];
    this.equip[slot] = null;
    this.changed();
    return prev;
  }
  // 다른 플레이어에게 보낼 옷차림 문자열 예) "head=ribbon;acc=glasses"
  look() {
    return EQUIP_SLOTS.map(s => this.equip[s.key] ? `${s.key}=${this.equip[s.key]}` : "").filter(Boolean).join(";");
  }

  // ----- 코인 -----
  addCoins(n) { this.coins = Math.max(0, this.coins + n); this.changed(); }
}

// 다른 플레이어의 옷차림 문자열 해석
// "ko=left|right"는 쓰러져 있다는 표시예요
export function parseLook(str) {
  const out = {};
  String(str || "").split(";").forEach(pair => {
    const [slot, id] = pair.split("=");
    if (ITEMS[id]?.slot === slot) out[slot] = id;
    if (slot === "ko" && (id === "left" || id === "right")) out.ko = id;
  });
  return out;
}
