// 아이템 목록 — 이름, 가격, 설명을 여기서 자유롭게 바꿀 수 있어요.
//
// id        : 영어 이름. 그림 파일 이름과 같아야 해요.
//             아이콘   → assets/items/{id}.png        (16 x 16)
//             입은 모습 → assets/equipment/{id}.png    (캐릭터 시트와 같은 크기·배치)
// name      : 게임에 보이는 이름
// kind      : "food"(먹을 수 있음) | "wear"(입을 수 있음)
// slot      : 입는 자리 — "head"(머리) | "acc"(장신구) | "top"(상의) | "bottom"(바지)
// stack     : 한 칸에 겹쳐 담을 수 있는 최대 개수
// buy       : 상점에서 살 때 가격 (없으면 상점 구매 목록에 안 나와요)
// sell      : 상점에 팔 때 가격
// color     : 먹을 때 튀는 부스러기 색
// knockout  : 먹으면 이 시간(ms) 동안 쓰러져서 움직일 수 없어요

export const ITEMS = {
  weed:    { name: "잡초", kind: "food", stack: 99, sell: 1, color: "#6fae43", desc: "어디에나 자라는 풀. 씹으면 풋풋해요." },
  berry:   { name: "베리", kind: "food", stack: 99, sell: 3, color: "#5b6ee0", desc: "덤불에서 딴 새콤달콤한 열매." },
  apple:   { name: "사과", kind: "food", stack: 99, sell: 3, color: "#d8453a", desc: "나무에서 딴 아삭한 사과." },
  mushroom:{ name: "버섯", kind: "food", stack: 99, sell: 2, color: "#c9423a", desc: "숲 바닥에서 주운 빨간 버섯. 먹어도 괜찮을까…?", knockout: 5000 },
  ribbon:  { name: "리본", kind: "wear", slot: "head", stack: 1, buy: 10, sell: 5, desc: "머리에 다는 분홍 리본." },
  glasses: { name: "안경", kind: "wear", slot: "acc", stack: 1, buy: 10, sell: 5, desc: "동그란 뿔테 안경." },
  shirt:   { name: "줄무늬 셔츠", kind: "wear", slot: "top", stack: 1, sell: 2, desc: "핑크색 줄무늬 옷. 검은색 머리를 가진 남자가 입으면 매우 잘 어울린다!" },
  overalls:{ name: "멜빵바지", kind: "wear", slot: "bottom", stack: 1, sell: 2, desc: "튼튼한 청 멜빵바지." }
};

// 입는 자리 (가방 화면에 위에서부터 이 순서로 보여요)
export const EQUIP_SLOTS = [
  { key: "head", label: "머리" },
  { key: "acc", label: "장신구" },
  { key: "top", label: "상의" },
  { key: "bottom", label: "바지" }
];

// 캐릭터 위에 겹쳐 그리는 순서 (뒤에 있을수록 위에 그려져요)
export const DRAW_ORDER = ["top", "bottom", "head", "acc"];

export const INVENTORY_SIZE = 10;

// 처음 시작할 때 받는 것
export const STARTER = {
  coins: 0,
  items: [{ id: "shirt", n: 1 }, { id: "overalls", n: 1 }]
};

// 채집 설정
export const GATHER = {
  reach: 40,            // 이만큼(px) 가까이 있어야 채집·상점 이용 가능 (한 칸 = 16px)
  weedChance: 0.35,     // 덤불에서 잡초가 나올 확률
  bushCooldown: 1200,   // 같은 덤불을 다시 뒤질 수 있을 때까지(ms)
  fruitMax: 3,          // 베리 덤불·사과나무에 열리는 열매 수
  regrowMs: 40000       // 열매 하나가 다시 열리는 시간(ms)
};

// 한국어 조사: 받침이 있으면 을/이, 없으면 를/가
export function josa(word, withBatchim, withoutBatchim) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return word + withoutBatchim;
  return word + ((c - 0xac00) % 28 ? withBatchim : withoutBatchim);
}
