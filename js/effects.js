// 이펙트: 튀는 파티클, 떠오르는 글자, 짧은 효과음
// 모두 게임 세계 좌표(px)로 다뤄요.

const particles = [];
const floaters = [];

// 먹을 때: 부스러기 + 하트 + "냠!"
export function eatBurst(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 40;
    particles.push({ x, y: y - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 160, life: 0.6 + Math.random() * 0.3, t: 0, size: 1 + (Math.random() < 0.4 ? 1 : 0), color });
  }
  for (let i = 0; i < 3; i++) {
    particles.push({ x: x - 6 + i * 6, y: y - 18, vx: (i - 1) * 6, vy: -26 - i * 4, g: 0, life: 1.1, t: -i * 0.12, heart: true });
  }
  floatText(x, y - 26, "냠!", "#ffffff", "#d9674a");
}

// 채집할 때: 잎사귀가 튐
export function leafBurst(x, y) {
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 25 + Math.random() * 35;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 120, life: 0.5 + Math.random() * 0.3, t: 0, size: 1, color: Math.random() < 0.5 ? "#5fab52" : "#8fd064" });
  }
}

// 버릴 때: 연기
export function poof(x, y) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    particles.push({ x, y: y - 8, vx: Math.cos(a) * 18, vy: Math.sin(a) * 12 - 10, g: -10, life: 0.5, t: 0, size: 2, color: "#e8e2d4" });
  }
}

// 떠오르는 글자 (예: "+1 베리")
export function floatText(x, y, text, color = "#fff8e8", stroke = "#3b2a1e", icon = null) {
  floaters.push({ x, y, text, color, stroke, icon, t: 0, life: 1.2 });
}

export function updateEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t < 0) continue;
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t > p.life) particles.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    if (f.t > f.life) floaters.splice(i, 1);
  }
}

// 세계 좌표 변환이 적용된 상태에서 호출
export function drawParticles(ctx) {
  for (const p of particles) {
    if (p.t < 0) continue;
    const alpha = Math.max(0, 1 - p.t / p.life);
    ctx.globalAlpha = alpha;
    if (p.heart) {
      ctx.fillStyle = "#ff6f91";
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.fillRect(x - 2, y, 2, 1); ctx.fillRect(x + 1, y, 2, 1);
      ctx.fillRect(x - 2, y + 1, 5, 1); ctx.fillRect(x - 1, y + 2, 3, 1); ctx.fillRect(x, y + 3, 1, 1);
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

// 화면 픽셀 좌표로 호출 (글자가 선명하도록). toScreen(x, y) → [sx, sy]
export function drawFloaters(ctx, toScreen, dpr) {
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${Math.round(15 * dpr)}px "Do Hyeon", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  for (const f of floaters) {
    const k = f.t / f.life;
    const [sx, sy] = toScreen(f.x, f.y - k * 14);
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const pop = f.t < 0.12 ? 0.6 + f.t / 0.12 * 0.4 : 1;
    ctx.save();
    ctx.translate(sx, sy); ctx.scale(pop, pop);
    let offset = 0;
    if (f.icon) {
      const s = 16 * dpr;
      const w = ctx.measureText(f.text).width;
      offset = s / 2 + 2 * dpr;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(f.icon, -w / 2 - offset - s / 2 + 2 * dpr, -s / 2, s, s);
    }
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = f.stroke; ctx.lineJoin = "round";
    ctx.strokeText(f.text, offset / 2, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, offset / 2, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------- 효과음 (Web Audio로 간단히 합성) ----------
let audio = null;
function ac() {
  if (!audio) {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
  }
  if (audio && audio.state === "suspended") audio.resume().catch(() => {});
  return audio;
}
function tone(freq, start, dur, type = "square", vol = 0.05, slide = 0) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function crunch(start) {
  const a = ac(); if (!a) return;
  const len = Math.floor(a.sampleRate * 0.06);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = "bandpass"; f.frequency.value = 1800;
  g.gain.value = 0.12;
  s.buffer = buf; s.connect(f).connect(g).connect(a.destination);
  s.start(a.currentTime + start);
}
export const sfx = {
  pickup() { tone(660, 0, 0.08); tone(990, 0.07, 0.1); },
  eat() { crunch(0); crunch(0.13); tone(520, 0.26, 0.12, "triangle", 0.06, 200); },
  coin() { tone(988, 0, 0.07, "square", 0.04); tone(1319, 0.06, 0.14, "square", 0.04); },
  trash() { tone(220, 0, 0.15, "triangle", 0.06, -120); },
  wear() { tone(523, 0, 0.07, "triangle"); tone(784, 0.06, 0.1, "triangle"); },
  miss() { tone(330, 0, 0.08, "triangle", 0.04, -60); },
  click() { tone(880, 0, 0.03, "square", 0.02); }
};
