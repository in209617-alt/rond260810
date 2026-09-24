// 그래픽 리소스 불러오기
//
// assets/ 폴더의 PNG 파일을 불러와요. 예) "objects/pine" → assets/objects/pine.png
// 파일이 없거나 불러오지 못하면 게임에 들어 있는 기본 그림을 대신 써요.
// 그래서 원하는 파일만 골라서 하나씩 바꿔도 게임이 멈추지 않아요.

import { ASSET_LIST, generateDefaultAssets } from "./world.js?v=12";
import { ITEMS } from "./items.js?v=12";

// 그림을 바꿨는데 예전 그림이 계속 보이면 이 숫자를 1 올려 주세요 (브라우저 캐시 무시용)
export const ASSET_VERSION = 2;

// 아이템·옷·UI 아이콘 (없으면 글자로 대신 표시돼요)
export const EXTRA_ASSETS = [
  ...Object.keys(ITEMS).map(id => "items/" + id),
  ...Object.keys(ITEMS).filter(id => ITEMS[id].kind === "wear").map(id => "equipment/" + id),
  "ui/coin", "ui/bag", "ui/trash"
];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("not found: " + src));
    img.src = src;
  });
}

export async function loadAssets() {
  const defaults = generateDefaultAssets();
  const result = {};
  const missing = [];
  await Promise.all([...ASSET_LIST, ...EXTRA_ASSETS].map(async name => {
    try {
      result[name] = await loadImage(`assets/${name}.png?v=${ASSET_VERSION}`);
    } catch (e) {
      result[name] = defaults[name] || null;
      missing.push(name);
    }
  }));
  if (missing.length) console.info("[forest] 기본 그림을 쓴 리소스:", missing.join(", "));
  else console.info("[forest] 그래픽 리소스를 모두 assets 폴더에서 불러왔어요");
  return result;
}
