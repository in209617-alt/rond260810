// 인벤토리(아래 칸 10개) · 가방 화면 · 상점 · 알림 메시지
// PC(마우스·키보드)와 모바일(터치)에서 똑같이 동작해요. 모든 조작은 "누르기(클릭/탭)"로 돼요.

import { ITEMS, EQUIP_SLOTS, INVENTORY_SIZE, josa } from "./items.js?v=10";
import { sfx } from "./effects.js?v=10";

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function createUI({ root, inv, art, drawPreview, onUse, onOpenChange }) {
  // ---------- 아이콘 ----------
  function iconEl(id) {
    const img = art("items/" + id);
    if (img) {
      const i = el("img", "icon");
      i.src = img.src || img.toDataURL();
      i.alt = ITEMS[id].name;
      i.draggable = false;
      return i;
    }
    return el("span", "icon-text", ITEMS[id].name.slice(0, 2));
  }
  function uiIcon(name, alt) {
    const img = art("ui/" + name);
    if (img) { const i = el("img", "icon"); i.src = img.src || img.toDataURL(); i.alt = alt; i.draggable = false; return i; }
    return el("span", "icon-text", alt.slice(0, 2));
  }
  function coinChip() {
    const c = el("div", "coins");
    c.append(uiIcon("coin", "코인"), el("span", "coin-n", "0"));
    c.title = "보유 코인";
    return c;
  }

  // ---------- 화면 요소 만들기 ----------
  const toasts = el("div", "toasts");
  toasts.setAttribute("role", "status");

  // 아래 인벤토리 바
  const hotbar = el("div", "hotbar");
  const hbCoins = coinChip();
  const hbSlots = el("div", "hb-slots");
  const hbButtons = [];
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const b = el("button", "slot");
    b.type = "button";
    b.dataset.i = i;
    b.append(el("span", "key", String((i + 1) % 10)));
    hbButtons.push(b);
    hbSlots.append(b);
  }
  const bagBtn = el("button", "bag-btn");
  bagBtn.type = "button";
  bagBtn.setAttribute("aria-label", "가방 열기");
  bagBtn.title = "가방 (E)";
  bagBtn.append(uiIcon("bag", "가방"));
  hotbar.append(hbCoins, hbSlots, bagBtn);
  const hint = el("div", "hb-hint");
  hint.hidden = true;

  // 가방 화면
  const bag = el("div", "modal");
  bag.hidden = true;
  const bagPanel = el("div", "panel bag-panel");
  bagPanel.setAttribute("role", "dialog");
  bagPanel.setAttribute("aria-label", "가방");
  const bagHead = el("header", "panel-head");
  const bagCoins = coinChip();
  const bagX = el("button", "x", "✕"); bagX.type = "button"; bagX.setAttribute("aria-label", "가방 닫기");
  bagHead.append(el("h2", null, "가방"), bagCoins, bagX);

  const bagTop = el("div", "bag-top");
  const equipCol = el("div", "equip-col");
  const equipButtons = {};
  for (const s of EQUIP_SLOTS) {
    const wrap = el("div", "equip-row");
    const b = el("button", "slot equip");
    b.type = "button";
    b.dataset.slot = s.key;
    b.setAttribute("aria-label", s.label);
    wrap.append(b, el("span", "equip-label", s.label));
    equipButtons[s.key] = b;
    equipCol.append(wrap);
  }
  const previewBox = el("div", "preview");
  const preview = el("canvas");
  previewBox.append(preview);
  const info = el("div", "hand-info");
  bagTop.append(equipCol, previewBox, info);

  const bagGrid = el("div", "bag-grid");
  const gridButtons = [];
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const b = el("button", "slot");
    b.type = "button";
    b.dataset.i = i;
    gridButtons.push(b);
    bagGrid.append(b);
  }
  const bagFoot = el("div", "bag-foot");
  const actions = el("div", "actions");
  const eatBtn = el("button", "act", "먹기"); eatBtn.type = "button";
  const wearBtn = el("button", "act", "입기"); wearBtn.type = "button";
  const offBtn = el("button", "act", "벗기"); offBtn.type = "button";
  actions.append(eatBtn, wearBtn, offBtn);
  const trashBtn = el("button", "slot trash");
  trashBtn.type = "button";
  trashBtn.setAttribute("aria-label", "쓰레기통");
  trashBtn.title = "쓰레기통: 들고 있는 아이템을 버려요";
  trashBtn.append(uiIcon("trash", "쓰레기통"));
  bagFoot.append(actions, trashBtn);
  bagPanel.append(bagHead, bagTop, bagGrid, bagFoot);
  bag.append(bagPanel);

  // 손에 든 아이템 (커서를 따라다님)
  const ghost = el("div", "ghost");
  ghost.hidden = true;

  // 상점
  const shop = el("div", "modal");
  shop.hidden = true;
  const shopPanel = el("div", "panel shop-panel");
  shopPanel.setAttribute("role", "dialog");
  shopPanel.setAttribute("aria-label", "상점");
  const shopHead = el("header", "panel-head");
  const shopCoins = coinChip();
  const shopX = el("button", "x", "✕"); shopX.type = "button"; shopX.setAttribute("aria-label", "상점 닫기");
  shopHead.append(el("h2", null, "상점"), shopCoins, shopX);
  const tabs = el("div", "tabs");
  tabs.setAttribute("role", "tablist");
  const buyTab = el("button", "tab", "구매"); buyTab.type = "button"; buyTab.setAttribute("role", "tab");
  const sellTab = el("button", "tab", "판매"); sellTab.type = "button"; sellTab.setAttribute("role", "tab");
  tabs.append(buyTab, sellTab);
  const shopList = el("div", "shop-list");
  shopPanel.append(shopHead, tabs, shopList);
  shop.append(shopPanel);

  root.append(toasts, hint, hotbar, bag, shop, ghost);

  // ---------- 상태 ----------
  let selected = -1;             // 아래 바에서 고른 칸
  let hand = null;               // 가방 화면에서 집은 것 { kind: "inv", i } | { kind: "equip", slot }
  let shopMode = "buy";

  const handItem = () => !hand ? null
    : hand.kind === "inv" ? inv.slots[hand.i]
    : inv.equip[hand.slot] ? { id: inv.equip[hand.slot], n: 1 } : null;

  // ---------- 알림 ----------
  function toast(text, tone = "") {
    const t = el("div", "toast " + tone, text);
    toasts.append(t);
    const max = !bag.hidden || !shop.hidden ? 2 : 3;
    while (toasts.children.length > max) toasts.firstChild.remove();
    setTimeout(() => t.classList.add("out"), 1800);
    setTimeout(() => t.remove(), 2200);
  }

  // ---------- 그리기 ----------
  function fillSlot(b, stack) {
    b.querySelectorAll(".icon, .icon-text, .n").forEach(e => e.remove());
    b.classList.toggle("filled", !!stack);
    if (stack) {
      b.append(iconEl(stack.id));
      if (stack.n > 1) b.append(el("span", "n", String(stack.n)));
      b.title = ITEMS[stack.id].name;
      b.setAttribute("aria-label", `${ITEMS[stack.id].name}${stack.n > 1 ? ` ${stack.n}개` : ""}`);
    } else {
      b.title = "";
      b.setAttribute("aria-label", "빈 칸");
    }
  }

  function render() {
    toasts.classList.toggle("low", !bag.hidden || !shop.hidden);   // 창이 열려 있으면 알림은 아래쪽에
    for (const c of [hbCoins, bagCoins, shopCoins]) c.querySelector(".coin-n").textContent = inv.coins;
    inv.slots.forEach((s, i) => {
      fillSlot(hbButtons[i], s);
      hbButtons[i].classList.toggle("sel", i === selected);
      fillSlot(gridButtons[i], s);
      gridButtons[i].classList.toggle("lifted", hand?.kind === "inv" && hand.i === i);
    });
    for (const s of EQUIP_SLOTS) {
      const id = inv.equip[s.key];
      fillSlot(equipButtons[s.key], id ? { id, n: 1 } : null);
      equipButtons[s.key].classList.toggle("lifted", hand?.kind === "equip" && hand.slot === s.key);
    }
    renderHint();
    renderHand();
    if (!shop.hidden) renderShop();
  }

  function renderHint() {
    const s = selected >= 0 ? inv.slots[selected] : null;
    if (!s || !bag.hidden || !shop.hidden) { hint.hidden = true; return; }
    const it = ITEMS[s.id];
    const touch = matchMedia("(pointer: coarse)").matches;
    hint.textContent = `${it.name} · ${touch ? "화면을 누르면" : "화면을 클릭하면"} ${it.kind === "food" ? "먹어요" : "입어요"}${touch ? "" : " · Q 버리기"}`;
    hint.hidden = false;
  }

  function renderHand() {
    const item = handItem();
    if (!item) {
      hand = null;
      ghost.hidden = true;
      info.replaceChildren(el("p", "dim", "아이템을 눌러서 집고, 다른 칸을 눌러 옮겨요. 옷은 왼쪽 칸에 놓으면 입어요."));
      eatBtn.hidden = wearBtn.hidden = offBtn.hidden = true;
      trashBtn.classList.remove("ready");
      return;
    }
    const it = ITEMS[item.id];
    const title = el("p", "hand-name", it.name + (item.n > 1 ? ` × ${item.n}` : ""));
    info.replaceChildren(title, el("p", "dim", it.desc), el("p", "dim small", `판매가 ${it.sell}코인`));
    eatBtn.hidden = it.kind !== "food";
    wearBtn.hidden = !(it.kind === "wear" && hand.kind === "inv");
    offBtn.hidden = hand.kind !== "equip";
    trashBtn.classList.add("ready");
    ghost.replaceChildren(iconEl(item.id));
    if (item.n > 1) ghost.append(el("span", "n", String(item.n)));
    ghost.hidden = false;
  }

  // ---------- 아래 바 ----------
  function select(i) {
    selected = selected === i ? -1 : i;
    sfx.click();
    render();
  }
  hbButtons.forEach((b, i) => b.addEventListener("click", () => select(i)));
  bagBtn.addEventListener("click", () => bag.hidden ? openBag() : closeBag());

  // ---------- 가방 ----------
  function openBag() {
    closeShop(true);
    bag.hidden = false;
    hand = null;
    onOpenChange(true);
    sfx.click();
    render();
  }
  function closeBag() {
    if (bag.hidden) return;
    hand = null;
    bag.hidden = true;
    onOpenChange(!shop.hidden);
    render();
  }
  bagX.addEventListener("click", closeBag);
  bag.addEventListener("pointerdown", e => { if (e.target === bag) closeBag(); });

  function clickGrid(j) {
    const target = inv.slots[j];
    if (!hand) {
      if (target) { hand = { kind: "inv", i: j }; sfx.click(); }
      render();
      return;
    }
    if (hand.kind === "inv") {
      if (hand.i !== j) inv.move(hand.i, j);
      hand = null;
    } else {
      // 입고 있던 옷을 가방 칸에 놓기 = 벗기
      const id = inv.equip[hand.slot];
      if (!target) { inv.unwear(hand.slot); inv.slots[j] = { id, n: 1 }; inv.changed(); hand = null; sfx.wear(); }
      else if (ITEMS[target.id].slot === hand.slot) { inv.slots[j] = { id, n: 1 }; inv.wear(target.id); hand = null; sfx.wear(); }
      else { toast("빈 칸에 놓아 주세요"); }
    }
    render();
  }
  gridButtons.forEach((b, j) => b.addEventListener("click", () => clickGrid(j)));

  function wearFromSlot(i) {
    const s = inv.slots[i];
    if (!s || ITEMS[s.id].kind !== "wear") return false;
    const prev = inv.equip[ITEMS[s.id].slot];
    inv.slots[i] = prev ? { id: prev, n: 1 } : null;
    inv.wear(s.id);
    sfx.wear();
    toast(`${josa(ITEMS[s.id].name, "을", "를")} 입었다!`);
    return true;
  }

  function clickEquip(slot) {
    const current = inv.equip[slot];
    if (!hand) {
      if (current) { hand = { kind: "equip", slot }; sfx.click(); }
      render();
      return;
    }
    if (hand.kind === "equip") { hand = null; render(); return; }
    const s = inv.slots[hand.i];
    if (ITEMS[s.id].slot !== slot) {
      toast(`${ITEMS[s.id].name}${ITEMS[s.id].kind === "food" ? "은 입을 수 없어요" : `은 ${EQUIP_SLOTS.find(e => e.key === ITEMS[s.id].slot).label} 칸에 입어요`}`);
      return;
    }
    wearFromSlot(hand.i);
    hand = null;
    render();
  }
  for (const s of EQUIP_SLOTS) equipButtons[s.key].addEventListener("click", () => clickEquip(s.key));

  function trashHand() {
    const item = handItem();
    if (!item) { toast("버릴 아이템을 먼저 집어 주세요"); return; }
    if (hand.kind === "inv") inv.take(hand.i); else inv.unwear(hand.slot);
    sfx.trash();
    toast(`${josa(ITEMS[item.id].name, "을", "를")} 버렸다`);
    hand = null;
    render();
  }
  trashBtn.addEventListener("click", trashHand);

  eatBtn.addEventListener("click", () => {
    if (hand?.kind !== "inv") return;
    const i = hand.i;
    onUse(i);
    hand = inv.slots[i] ? { kind: "inv", i } : null;   // 다 먹으면 손이 비어요
    render();
  });
  wearBtn.addEventListener("click", () => {
    if (hand?.kind === "inv") { wearFromSlot(hand.i); hand = null; render(); }
  });
  offBtn.addEventListener("click", () => {
    if (hand?.kind !== "equip") return;
    const j = inv.firstEmpty();
    if (j < 0) { toast("가방이 가득 찼어요"); return; }
    const id = inv.unwear(hand.slot);
    inv.slots[j] = { id, n: 1 }; inv.changed();
    sfx.wear();
    hand = null;
    render();
  });

  // 손에 든 아이템이 커서를 따라다니게
  addEventListener("pointermove", e => {
    if (ghost.hidden) return;
    ghost.style.transform = `translate(${e.clientX + 8}px, ${e.clientY + 8}px)`;
  });
  addEventListener("pointerdown", e => {
    if (!ghost.hidden) ghost.style.transform = `translate(${e.clientX + 8}px, ${e.clientY + 8}px)`;
  }, true);

  // 캐릭터 미리보기: 천천히 돌면서 보여줌
  let previewDir = 0, previewT = 0;
  function tickPreview(dt) {
    if (bag.hidden) return;
    previewT += dt;
    if (previewT > 1.2) { previewT = 0; previewDir = (previewDir + 1) % 4; }
    drawPreview(preview, [0, 2, 1, 3][previewDir]);
  }

  // ---------- 상점 ----------
  function openShop() {
    closeBag();
    shop.hidden = false;
    shopMode = "buy";
    onOpenChange(true);
    sfx.click();
    render();
  }
  function closeShop(silent) {
    if (shop.hidden) return;
    shop.hidden = true;
    if (!silent) onOpenChange(!bag.hidden);
    render();
  }
  shopX.addEventListener("click", () => closeShop());
  shop.addEventListener("pointerdown", e => { if (e.target === shop) closeShop(); });
  buyTab.addEventListener("click", () => { shopMode = "buy"; sfx.click(); renderShop(); });
  sellTab.addEventListener("click", () => { shopMode = "sell"; sfx.click(); renderShop(); });

  function priceTag(n) {
    const p = el("span", "price");
    p.append(uiIcon("coin", "코인"), el("span", null, String(n)));
    return p;
  }

  function renderShop() {
    buyTab.classList.toggle("on", shopMode === "buy");
    sellTab.classList.toggle("on", shopMode === "sell");
    buyTab.setAttribute("aria-selected", String(shopMode === "buy"));
    sellTab.setAttribute("aria-selected", String(shopMode === "sell"));
    const rows = [];
    if (shopMode === "buy") {
      for (const [id, it] of Object.entries(ITEMS)) {
        if (it.buy == null) continue;
        const row = el("div", "shop-row");
        const text = el("div", "shop-text");
        text.append(el("b", null, it.name), el("span", "dim", it.desc));
        const btn = el("button", "act", "구매"); btn.type = "button";
        btn.disabled = inv.coins < it.buy;
        btn.addEventListener("click", () => buy(id));
        row.append(iconEl(id), text, priceTag(it.buy), btn);
        rows.push(row);
      }
    } else {
      const ids = [...new Set(inv.slots.filter(Boolean).map(s => s.id))];
      for (const id of ids) {
        const it = ITEMS[id], n = inv.count(id);
        const row = el("div", "shop-row");
        const text = el("div", "shop-text");
        text.append(el("b", null, `${it.name} × ${n}`), el("span", "dim", "개당"));
        const one = el("button", "act", "1개 판매"); one.type = "button";
        one.addEventListener("click", () => sell(id, 1));
        const all = el("button", "act alt", "모두 판매"); all.type = "button";
        all.addEventListener("click", () => sell(id, n));
        const btns = el("div", "btns");
        btns.append(one, all);
        row.append(iconEl(id), text, priceTag(it.sell), btns);
        rows.push(row);
      }
      if (!rows.length) rows.push(el("p", "dim empty", "팔 수 있는 아이템이 없어요. 덤불과 나무에서 열매를 모아 보세요."));
      if (Object.values(inv.equip).some(Boolean)) rows.push(el("p", "dim small", "입고 있는 옷은 가방에서 벗은 뒤에 팔 수 있어요."));
    }
    shopList.replaceChildren(...rows);
  }

  function buy(id) {
    const it = ITEMS[id];
    if (inv.coins < it.buy) { toast("코인이 부족해요", "warn"); sfx.miss(); return; }
    if (inv.roomFor(id) < 1) { toast("가방이 가득 찼어요", "warn"); sfx.miss(); return; }
    inv.coins -= it.buy;
    inv.add(id, 1);
    sfx.coin();
    toast(`${josa(it.name, "을", "를")} 샀다!`);
  }
  function sell(id, n) {
    const it = ITEMS[id];
    const k = inv.removeId(id, n);
    if (!k) return;
    inv.addCoins(k * it.sell);
    sfx.coin();
    toast(`${it.name} ${k}개를 팔아서 ${k * it.sell}코인을 받았다!`);
  }

  // ---------- 바깥에서 쓰는 기능 ----------
  inv.onChange(render);
  render();

  return {
    get selected() { return selected; },
    isOpen: () => !bag.hidden || !shop.hidden,
    bagOpen: () => !bag.hidden,
    select,
    openBag, closeBag, openShop, closeShop: () => closeShop(),
    closeAll() { closeBag(); closeShop(); },
    toggleBag() { bag.hidden ? openBag() : closeBag(); },
    wearFromSlot,
    toast,
    tickPreview,
    setVisible(v) { hotbar.hidden = !v; if (!v) hint.hidden = true; else renderHint(); }
  };
}
