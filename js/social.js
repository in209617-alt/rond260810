// 채팅 · 말풍선 · 캐릭터 메뉴(대화하기/선물하기) · 1:1 대화창 · 선물 · 프로필 그림
// PC와 모바일에서 똑같이 동작해요. 모든 조작은 누르기(클릭/탭)와 입력창으로 돼요.

import { ITEMS, josa } from "./items.js?v=12";
import { sfx } from "./effects.js?v=12";

export const BUBBLE_MAX = 18;         // 말풍선에 들어가는 최대 글자 수
const BUBBLE_MS = 5000;               // 말풍선이 떠 있는 시간
const REQUEST_TIMEOUT = 20000;        // 요청에 답이 없으면 자동 취소
const PROFILE_MAX_SIDE = 320;         // 프로필 그림을 이 크기(px) 안으로 줄여서 저장

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const chars = s => Array.from(s);
export const bubbleText = s => chars(s).length > BUBBLE_MAX ? chars(s).slice(0, BUBBLE_MAX).join("") + "..." : s;
const SLOT_COLOR = ["#d9674a", "#3f86c4"];

export function createSocial({ root, ui, inv, getNet, me, players, portraitCanvas, art, onBusyChange, onGiftReceived }) {
  // players() → { "0": { name, slot }, "1": {...} } 지금 방에 있는 사람들 (나 포함)
  const bubbles = {};      // 자리 → { text, until }
  const profiles = {};     // 자리 → 프로필 그림 dataURL
  let talk = null;         // { partner, lastSpeaker }
  let pending = null;      // 내가 보낸 요청 { type, to, timer }
  let incoming = null;     // 받은 요청 { type, from, timer }
  let online = false;
  const tracked = {};      // 자리 → uid (프로필 그림을 지켜볼 상대)
  const watching = {};     // 자리 → { uid, stop }

  const mySlot = () => (online && getNet()?.mySlot) || String(me.slot);
  const nameOf = key => players()[key]?.name || "친구";

  // ======================= 채팅창 (왼쪽 아래) =======================
  const chat = el("div", "chat");
  chat.hidden = true;
  const chatLog = el("ul", "chat-log");
  chatLog.setAttribute("aria-live", "polite");
  const chatForm = el("form", "chat-form");
  const chatInput = el("input");
  chatInput.id = "chat-input";
  chatInput.maxLength = 60;
  chatInput.placeholder = "채팅 입력 (Enter)";
  chatInput.autocomplete = "off";
  const chatSend = el("button", "act", "보내기"); chatSend.type = "submit";
  chatForm.append(chatInput, chatSend);
  chat.append(chatLog, chatForm);
  const chatToggle = el("button", "chat-toggle", "채팅");
  chatToggle.type = "button";
  chatToggle.hidden = true;
  chatToggle.setAttribute("aria-label", "채팅 쓰기");

  function addChat(msg) {
    const li = el("li");
    const who = el("b", null, msg.name);
    who.style.color = SLOT_COLOR[msg.slot === 1 ? 1 : 0];
    li.append(who, document.createTextNode(" " + msg.text));
    chatLog.append(li);
    setTimeout(() => li.classList.add("old"), 10000);   // 모바일에서는 10초 뒤 흐려지며 사라져요
    while (chatLog.children.length > 40) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
    const now = online ? getNet().serverNow() : Date.now();
    if (typeof msg.t === "number" && now - msg.t < 8000) say(String(msg.slot), msg.text);
  }

  chatForm.addEventListener("submit", e => {
    e.preventDefault();
    const text = chatInput.value.trim().slice(0, 60);
    if (!text || talk) return;
    chatInput.value = "";
    const info = players()[mySlot()] || { name: me.name, slot: me.slot };
    if (online) getNet().sendChat(info.name || me.name, me.slot, text);
    else addChat({ name: me.name, slot: me.slot, text, t: Date.now() });
    sfx.click();
    chatInput.blur();
    chat.classList.remove("open");
  });
  chatInput.addEventListener("keydown", e => { if (e.key === "Escape") { chatInput.blur(); chat.classList.remove("open"); } });
  chatToggle.addEventListener("click", () => {
    chat.classList.toggle("open");
    if (chat.classList.contains("open")) chatInput.focus();
  });

  // ======================= 말풍선 =======================
  function say(slotKey, text) {
    bubbles[slotKey] = { text: bubbleText(text), until: performance.now() + BUBBLE_MS };
  }
  function bubbleFor(slotKey) {
    const b = bubbles[slotKey];
    return b && performance.now() < b.until ? b.text : null;
  }

  // ======================= 캐릭터 메뉴 =======================
  const menu = el("div", "pmenu");
  menu.hidden = true;
  const menuName = el("p", "pmenu-name");
  const talkBtn = el("button", "act", "대화하기"); talkBtn.type = "button";
  const giftBtn = el("button", "act alt", "선물하기"); giftBtn.type = "button";
  menu.append(menuName, talkBtn, giftBtn);
  let menuTarget = null;

  function openPlayerMenu(slotKey, clientX, clientY) {
    if (talk) return;
    menuTarget = slotKey;
    menuName.textContent = nameOf(slotKey);
    const r = root.getBoundingClientRect();
    menu.hidden = false;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    const x = Math.min(Math.max(8, clientX - r.left - w / 2), r.width - w - 8);
    const y = Math.max(8, clientY - r.top - h - 12);
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    sfx.click();
  }
  function closeMenu() { menu.hidden = true; menuTarget = null; }
  addEventListener("pointerdown", e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);

  function needOnline() {
    if (online) return true;
    ui.toast("친구와 온라인으로 접속해야 쓸 수 있어요", "warn");
    return false;
  }
  function request(type) {
    const to = menuTarget;
    closeMenu();
    if (!to || !needOnline()) return;
    if (pending) { ui.toast("이미 대답을 기다리는 중이에요"); return; }
    getNet().sendEvent(to, type === "talk" ? "talk_req" : "gift_req");
    pending = { type, to, timer: setTimeout(() => { pending = null; ui.toast(`${nameOf(to)}님이 대답하지 않았어요`); }, REQUEST_TIMEOUT) };
    ui.toast(type === "talk" ? `${nameOf(to)}님에게 대화를 걸었어요` : `${nameOf(to)}님에게 선물하고 싶다고 알렸어요`);
  }
  talkBtn.addEventListener("click", () => request("talk"));
  giftBtn.addEventListener("click", () => request("gift"));
  function clearPending() { if (pending) clearTimeout(pending.timer); pending = null; }

  // ======================= 받은 요청 (수락/거절) =======================
  const reqModal = el("div", "modal req-modal");
  reqModal.hidden = true;
  const reqPanel = el("div", "panel req-panel");
  reqPanel.setAttribute("role", "alertdialog");
  const reqText = el("p", "req-text");
  const reqBtns = el("div", "req-btns");
  const acceptBtn = el("button", "act", "수락"); acceptBtn.type = "button";
  const declineBtn = el("button", "act alt", "거절"); declineBtn.type = "button";
  reqBtns.append(acceptBtn, declineBtn);
  reqPanel.append(reqText, reqBtns);
  reqModal.append(reqPanel);

  function showRequest(type, from) {
    incoming = { type, from, timer: setTimeout(() => answer(false), REQUEST_TIMEOUT) };
    reqText.textContent = type === "talk" ? `${nameOf(from)}님이 대화를 걸어왔어요.` : `${nameOf(from)}님이 선물을 주고 싶어해요.`;
    reqModal.hidden = false;
    sfx.pickup();
  }
  function answer(ok) {
    if (!incoming) return;
    clearTimeout(incoming.timer);
    const { type, from } = incoming;
    incoming = null;
    reqModal.hidden = true;
    getNet()?.sendEvent(from, `${type}_${ok ? "accept" : "decline"}`);
    if (ok && type === "talk") startTalk(from);
    if (ok && type === "gift") ui.toast(`${nameOf(from)}님이 선물을 고르고 있어요`);
  }
  acceptBtn.addEventListener("click", () => answer(true));
  declineBtn.addEventListener("click", () => answer(false));

  // ======================= 1:1 대화창 =======================
  const talkModal = el("div", "modal talk-modal");
  talkModal.hidden = true;
  const talkPanel = el("div", "panel talk-panel");
  talkPanel.setAttribute("role", "dialog");
  talkPanel.setAttribute("aria-label", "대화");
  const talkHead = el("header", "panel-head");
  const talkTitle = el("h2", null, "대화");
  const talkX = el("button", "x", "✕"); talkX.type = "button"; talkX.setAttribute("aria-label", "대화 끝내기");
  talkHead.append(talkTitle, talkX);
  const scene = el("div", "talk-scene");
  const sides = { 0: el("div", "portrait left"), 1: el("div", "portrait right") };
  scene.append(sides[0], sides[1]);
  const box = el("div", "talk-box");
  const boxName = el("div", "talk-name");
  const boxText = el("p", "talk-text", "대화를 시작해 보세요.");
  box.append(boxName, boxText);
  scene.append(box);
  const talkLog = el("ul", "talk-log");
  const talkForm = el("form", "talk-form");
  const talkInput = el("input");
  talkInput.id = "talk-input";
  talkInput.maxLength = 100;
  talkInput.placeholder = "할 말을 입력하세요";
  talkInput.autocomplete = "off";
  const talkSend = el("button", "act", "보내기"); talkSend.type = "submit";
  talkForm.append(talkInput, talkSend);
  talkPanel.append(talkHead, scene, talkLog, talkForm);
  talkModal.append(talkPanel);

  function portraitNode(slotKey) {
    const url = profiles[slotKey];
    if (url) {
      const img = el("img");
      img.src = url;
      img.alt = nameOf(slotKey);
      img.draggable = false;
      return img;
    }
    // 프로필 그림이 없으면 캐릭터 모습을 크게 보여 줘요
    const c = portraitCanvas(slotKey);
    c.className = "pixel";
    return c;
  }
  function renderPortraits() {
    if (!talk) return;
    for (const key of ["0", "1"]) {
      const side = sides[key];
      side.replaceChildren();
      if (!players()[key]) continue;
      side.append(portraitNode(key));
      side.classList.toggle("speaking", talk.lastSpeaker === key);
      side.classList.toggle("dim", talk.lastSpeaker != null && talk.lastSpeaker !== key);
    }
  }
  function addLine(slotKey, text) {
    talk.lastSpeaker = slotKey;
    boxName.textContent = nameOf(slotKey);
    boxName.style.background = SLOT_COLOR[Number(slotKey)];
    boxText.textContent = text;
    const li = el("li");
    const who = el("b", null, nameOf(slotKey));
    who.style.color = SLOT_COLOR[Number(slotKey)];
    li.append(who, document.createTextNode(" " + text));
    talkLog.append(li);
    talkLog.scrollTop = talkLog.scrollHeight;
    say(slotKey, text);   // 대화 내용은 채팅창에는 안 남고, 말풍선으로만 보여요
    renderPortraits();
  }

  function startTalk(partner) {
    clearPending();
    ui.closeAll();
    closeMenu();
    talk = { partner, lastSpeaker: null };
    talkTitle.textContent = `${nameOf(partner)}님과 대화`;
    talkLog.replaceChildren();
    boxName.textContent = "";
    boxName.style.background = "";
    boxText.textContent = "대화를 시작해 보세요.";
    talkModal.hidden = false;
    chatForm.querySelectorAll("input, button").forEach(x => { x.disabled = true; });
    renderPortraits();
    onBusyChange(true);
    sfx.wear();
    setTimeout(() => talkInput.focus(), 50);
  }
  function endTalk(message) {
    if (!talk) return;
    talk = null;
    talkModal.hidden = true;
    chatForm.querySelectorAll("input, button").forEach(x => { x.disabled = false; });
    onBusyChange(false);
    if (message) ui.toast(message);
  }
  talkForm.addEventListener("submit", e => {
    e.preventDefault();
    const text = talkInput.value.trim().slice(0, 100);
    if (!text || !talk) return;
    talkInput.value = "";
    getNet()?.sendEvent(talk.partner, "talk_msg", { text });
    addLine(mySlot(), text);
    sfx.click();
  });
  talkX.addEventListener("click", () => {
    if (!talk) return;
    getNet()?.sendEvent(talk.partner, "talk_end");
    endTalk("대화를 끝냈어요");
  });

  // ======================= 선물 고르기 =======================
  const giftModal = el("div", "modal gift-modal");
  giftModal.hidden = true;
  const giftPanel = el("div", "panel gift-panel");
  giftPanel.setAttribute("role", "dialog");
  const giftHead = el("header", "panel-head");
  const giftTitle = el("h2", null, "선물 고르기");
  const giftX = el("button", "x", "✕"); giftX.type = "button"; giftX.setAttribute("aria-label", "선물 그만두기");
  giftHead.append(giftTitle, giftX);
  const giftHint = el("p", "dim", "줄 아이템을 하나 골라 주세요. 한 번에 1개씩 선물해요.");
  const giftGrid = el("div", "gift-grid");
  giftPanel.append(giftHead, giftHint, giftGrid);
  giftModal.append(giftPanel);
  let giftTo = null;

  function iconOf(id) {
    const img = art("items/" + id);
    if (img) { const i = el("img", "icon"); i.src = img.src || img.toDataURL(); i.alt = ""; return i; }
    return el("span", "icon-text", ITEMS[id].name.slice(0, 2));
  }
  function openGiftPicker(to) {
    giftTo = to;
    giftTitle.textContent = `${nameOf(to)}님에게 줄 선물`;
    const cells = inv.slots.map((s, i) => {
      if (!s) return null;
      const b = el("button", "slot gift-item");
      b.type = "button";
      b.append(iconOf(s.id));
      if (s.n > 1) b.append(el("span", "n", String(s.n)));
      b.append(el("span", "gift-name", ITEMS[s.id].name));
      b.addEventListener("click", () => sendGift(i));
      return b;
    }).filter(Boolean);
    giftGrid.replaceChildren(...(cells.length ? cells : [el("p", "dim empty", "가방이 비어 있어요.")]));
    giftModal.hidden = false;
  }
  function sendGift(i) {
    const s = inv.slots[i];
    if (!s || !giftTo) return;
    const id = s.id;
    inv.removeAt(i, 1);
    getNet()?.sendEvent(giftTo, "gift_send", { item: id });
    ui.toast(`${nameOf(giftTo)}님에게 ${josa(ITEMS[id].name, "을", "를")} 선물했다!`);
    sfx.coin();
    giftTo = null;
    giftModal.hidden = true;
  }
  giftX.addEventListener("click", () => {
    if (giftTo) getNet()?.sendEvent(giftTo, "gift_cancel");
    giftTo = null;
    giftModal.hidden = true;
  });

  // ======================= 신호 처리 =======================
  function handleEvent(ev) {
    const from = ev.from;
    switch (ev.type) {
      case "talk_req":
      case "gift_req": {
        const type = ev.type === "talk_req" ? "talk" : "gift";
        if (talk || incoming) { getNet().sendEvent(from, `${type}_busy`); return; }
        showRequest(type, from);
        break;
      }
      case "talk_accept":
        if (pending?.type === "talk" && pending.to === from) startTalk(from);
        break;
      case "gift_accept":
        if (pending?.type === "gift" && pending.to === from) { clearPending(); ui.closeAll(); openGiftPicker(from); }
        break;
      case "talk_decline":
      case "gift_decline":
        if (pending?.to === from) { clearPending(); ui.toast(`${nameOf(from)}님이 거절했어요`); sfx.miss(); }
        break;
      case "talk_busy":
      case "gift_busy":
        if (pending?.to === from) { clearPending(); ui.toast(`${nameOf(from)}님은 지금 바빠요`); }
        break;
      case "talk_msg":
        if (talk?.partner === from && typeof ev.text === "string") addLine(from, ev.text.slice(0, 100));
        else if (typeof ev.text === "string") say(from, ev.text);
        break;
      case "talk_end":
        if (talk?.partner === from) endTalk(`${nameOf(from)}님이 대화를 끝냈어요`);
        break;
      case "gift_send": {
        const id = ev.item;
        if (!ITEMS[id]) return;
        if (inv.roomFor(id) < 1) {
          getNet().sendEvent(from, "gift_return", { item: id });
          ui.toast("가방이 가득 차서 선물을 받지 못했어요", "warn");
          return;
        }
        inv.add(id, 1);
        sfx.pickup();
        ui.toast(`${nameOf(from)}님에게 ${josa(ITEMS[id].name, "을", "를")} 선물 받았다!`);
        onGiftReceived?.(id);
        break;
      }
      case "gift_return": {
        const id = ev.item;
        if (!ITEMS[id]) return;
        inv.add(id, 1);
        ui.toast(`${nameOf(from)}님의 가방이 가득 차서 선물이 돌아왔어요`);
        break;
      }
      case "gift_cancel":
        ui.toast(`${nameOf(from)}님이 선물을 그만뒀어요`);
        break;
    }
  }

  // ======================= 프로필 그림 =======================
  const fileInput = el("input");
  fileInput.type = "file";
  fileInput.accept = "image/png";
  fileInput.hidden = true;
  let profileKey = null;

  function shrinkToPng(img) {
    for (const side of [PROFILE_MAX_SIDE, 240, 180, 128]) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/png");
      if (url.length <= 380000) return url;
    }
    return null;
  }
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!f) return;
    if (f.type && f.type !== "image/png") { ui.toast("PNG 파일만 넣을 수 있어요", "warn"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const url = shrinkToPng(img);
        if (!url) { ui.toast("그림이 너무 커요. 더 작은 그림으로 해 주세요", "warn"); return; }
        applyMyProfile(url, true);
        ui.toast("프로필 그림을 적용했어요!");
        sfx.wear();
      };
      img.onerror = () => ui.toast("그림을 읽지 못했어요", "warn");
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  });
  function applyMyProfile(url, save) {
    profiles[mySlot()] = url;
    ui.setProfileThumb?.(url);
    if (save && profileKey) { try { localStorage.setItem(profileKey, url); } catch (e) { /* 저장 공간 부족 */ } }
    if (online) getNet().setProfile(url);
    renderPortraits();
  }

  root.append(chat, chatToggle, menu, reqModal, talkModal, giftModal, fileInput);

  function watchRemote(slotKey) {
    const uid = tracked[slotKey];
    if (!online || !uid || watching[slotKey]?.uid === uid) return;
    watching[slotKey]?.stop?.();
    const stop = getNet().watchProfile(uid, url => {
      if (tracked[slotKey] !== uid) return;
      if (url) profiles[slotKey] = url; else delete profiles[slotKey];
      renderPortraits();
    });
    watching[slotKey] = { uid, stop };
  }

  // ======================= 바깥에서 쓰는 기능 =======================
  return {
    busy: () => !!talk,
    anyOpen: () => !!talk || !reqModal.hidden || !giftModal.hidden,
    bubbleFor,
    openPlayerMenu,
    closeMenu,
    pickProfile: () => fileInput.click(),
    focusChat() { if (!talk) { chat.classList.add("open"); chatInput.focus(); } },
    // 게임에 들어갈 때 한 번 호출
    start(owner, isOnline) {
      online = isOnline;
      chat.hidden = false;
      chatToggle.hidden = false;
      profileKey = "forest.profile." + owner;
      let saved = null;
      try { saved = localStorage.getItem(profileKey); } catch (e) { saved = null; }
      if (saved) applyMyProfile(saved, false);
      if (online) {
        getNet().onChat(addChat);
        getNet().onEvent(handleEvent);
        Object.keys(tracked).forEach(watchRemote);   // 먼저 들어와 있던 친구의 프로필
      }
    },
    // 상대가 들어오면 그 사람의 프로필 그림을 지켜봐요
    trackRemote(slotKey, uid) {
      if (!uid) return;
      tracked[slotKey] = uid;
      watchRemote(slotKey);
    },
    remoteLeft(slotKey) {
      delete bubbles[slotKey];
      delete profiles[slotKey];
      delete tracked[slotKey];
      watching[slotKey]?.stop?.();
      delete watching[slotKey];
      if (talk?.partner === slotKey) endTalk("상대가 숲을 떠나서 대화가 끝났어요");
      if (incoming?.from === slotKey) { clearTimeout(incoming.timer); incoming = null; reqModal.hidden = true; }
      if (pending?.to === slotKey) clearPending();
      if (giftTo === slotKey) { giftTo = null; giftModal.hidden = true; }
    },
    escape() {
      if (!menu.hidden) { closeMenu(); return true; }
      if (!giftModal.hidden) { giftX.click(); return true; }
      if (!reqModal.hidden) { answer(false); return true; }
      return false;
    }
  };
}
