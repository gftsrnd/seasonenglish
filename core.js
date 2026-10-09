'use strict';
/* =====================================================================
   Season English – GFT  (single-file app)
   Sections: utils · store · domain helpers · router/shell · screens
   ===================================================================== */

// ---------- utils ----------
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = (p='id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const pad = n => String(n).padStart(2, '0');
const dateStr = d => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`; };
const todayStr = () => dateStr(new Date());
const addDays = (ds, n) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return dateStr(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const fmtDate = ds => { if (!ds) return '—'; const d = new Date(ds.length > 10 ? ds : ds + 'T00:00:00'); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}`; };
const fmtDateTime = iso => { if (!iso) return '—'; const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mondayOf = ds => { const d = new Date(ds + 'T00:00:00'); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return dateStr(d); };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const avg = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
const sum = arr => arr.reduce((s, x) => s + x, 0);
const initials = name => (name || '?').trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const copyText = async (text) => { try { await navigator.clipboard.writeText(text); toast('Đã copy vào clipboard', 'ok'); } catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Đã copy', 'ok'); } };
const download = (name, text, type='application/json') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

// ---------- Season the sun (mascot of the "Season English" design system: the sun logo, given a face) ----------
const SUN_RAYS = (rot = 0) => `<g transform="rotate(${rot} 60 56)" stroke="#F28C28" stroke-width="6" stroke-linecap="round"><path d="M60 8v10M60 94v10M12 56h10M98 56h10M26 22l7 7M87 83l7 7M26 90l7-7M87 29l7-7"/></g>`;
const SUN_BODY = `<circle cx="60" cy="56" r="30" fill="#FBB829"/>`;
const SUN_FACES = {
  hello: `<circle cx="50" cy="52" r="3.2" fill="#1E1E1E"/><circle cx="70" cy="52" r="3.2" fill="#1E1E1E"/><path d="M50 64 Q60 72 70 64" fill="none" stroke="#1E1E1E" stroke-width="3" stroke-linecap="round"/>`,
  think: `<circle cx="50" cy="52" r="3.2" fill="#1E1E1E"/><circle cx="70" cy="52" r="3.2" fill="#1E1E1E"/><path d="M52 66 H68" fill="none" stroke="#1E1E1E" stroke-width="3" stroke-linecap="round"/><circle cx="96" cy="26" r="3" fill="#FFFFFF"/><circle cx="105" cy="17" r="4.5" fill="#FFFFFF"/><circle cx="116" cy="7" r="6" fill="#FFFFFF"/>`,
  praise: `<path d="M45 52 Q50 46 55 52" fill="none" stroke="#1E1E1E" stroke-width="3" stroke-linecap="round"/><path d="M65 52 Q70 46 75 52" fill="none" stroke="#1E1E1E" stroke-width="3" stroke-linecap="round"/><path d="M48 63 Q60 76 72 63" fill="#1E1E1E"/><path d="M106 6 L108 13 L115 15 L108 17 L106 24 L104 17 L97 15 L104 13 Z" fill="#FFFFFF"/><path d="M12 72 L13.5 77 L18.5 78.5 L13.5 80 L12 85 L10.5 80 L5.5 78.5 L10.5 77 Z" fill="#FFFFFF"/>`,
  happy: `<path d="M45 52 Q50 46 55 52" fill="none" stroke="#1E1E1E" stroke-width="3" stroke-linecap="round"/><path d="M65 52 Q70 46 75 52" fill="none" stroke="#1E1E1E" stroke-width="3" stroke-linecap="round"/><path d="M50 64 Q60 72 70 64" fill="none" stroke="#1E1E1E" stroke-width="3" stroke-linecap="round"/>`,
  oops: `<circle cx="50" cy="52" r="3.2" fill="#1E1E1E"/><circle cx="70" cy="52" r="3.2" fill="#1E1E1E"/><path d="M51 67 Q55 62 60 67 Q65 72 69 67" fill="none" stroke="#1E1E1E" stroke-width="3" stroke-linecap="round"/><path d="M84 38 C84 32 88 28 88 28 C88 28 92 32 92 38 A4 4 0 0 1 84 38 Z" fill="#E3DCFB"/>`
};
/** Season mascot SVG. state: hello|think|praise|happy|oops; flip kept for call sites (the sun is symmetrical). */
// ---- seasonal themes: only the colour palette (style.css, <html data-theme>) and the main icon change; everything else stays ----
// Marks are drawn in a 32×32 box with the theme colours (var(--accent) strokes, var(--primary) fills) so one SVG fits every palette.
const THEME_MARKS = {
  sun: '<g stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"><path d="M16 2.5v3.5M16 26v3.5M2.5 16H6M26 16h3.5M6.5 6.5l2.4 2.4M23.1 23.1l2.4 2.4M6.5 25.5l2.4-2.4M23.1 8.9l2.4-2.4"/></g><circle cx="16" cy="16" r="7.5" fill="var(--accent)"/>',
  blossom: '<g fill="var(--accent)"><circle cx="16" cy="7.5" r="4.6"/><circle cx="24.1" cy="13.4" r="4.6"/><circle cx="21" cy="22.9" r="4.6"/><circle cx="11" cy="22.9" r="4.6"/><circle cx="7.9" cy="13.4" r="4.6"/></g><circle cx="16" cy="16" r="3.6" fill="var(--primary)"/>',
  leaf: '<path d="M6 26C6 13 14 6 27 6c0 13-7 21-21 20z" fill="var(--primary)"/><path d="M6 26c4-7 9-12 15-16" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/>',
  snow: '<g fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round"><path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13"/><path d="M16 3l-3 3M16 3l3 3M16 29l-3-3M16 29l3-3M4.7 9.5l4 1M4.7 9.5l1-4M27.3 22.5l-4-1M27.3 22.5l-1 4M4.7 22.5l1 4M4.7 22.5l4-1M27.3 9.5l-1-4M27.3 9.5l-4 1"/></g>',
  mai: '<g fill="var(--primary)" stroke="var(--accent)" stroke-width="1.2"><path d="M16 4.5c2.6 0 4.2 2.4 3.4 5.2 2.9-.3 4.9 1.8 4.1 4.3 2.5 1.4 2.5 4.4 0 5.8.8 2.5-1.2 4.6-4.1 4.3.8 2.8-.8 5.2-3.4 5.2s-4.2-2.4-3.4-5.2c-2.9.3-4.9-1.8-4.1-4.3-2.5-1.4-2.5-4.4 0-5.8-.8-2.5 1.2-4.6 4.1-4.3-.8-2.8.8-5.2 3.4-5.2z"/></g><circle cx="16" cy="16" r="3.2" fill="var(--accent)"/>',
  lantern: '<path d="M16 3v3" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/><rect x="11" y="6" width="10" height="3" rx="1.5" fill="var(--accent)"/><path d="M8 11c0-1.7 3.6-2.5 8-2.5s8 .8 8 2.5v9c0 1.7-3.6 2.5-8 2.5s-8-.8-8-2.5z" fill="var(--primary)"/><path d="M12.5 9v13.5M19.5 9v13.5" stroke="var(--accent)" stroke-width="1.4" opacity=".6"/><rect x="11" y="22" width="10" height="3" rx="1.5" fill="var(--accent)"/><path d="M14 25v4M18 25v4" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round"/>',
  star: '<path d="M16 3l3.6 7.6 8.3 1-6.1 5.7 1.6 8.2L16 21.4l-7.4 4.1 1.6-8.2-6.1-5.7 8.3-1z" fill="var(--primary)" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/>'
};
const THEMES = {
  summer: {name: 'Mùa hạ', mark: 'sun'}, spring: {name: 'Mùa xuân', mark: 'blossom'}, autumn: {name: 'Mùa thu', mark: 'leaf'}, winter: {name: 'Mùa đông', mark: 'snow'},
  tet: {name: 'Tết Nguyên đán', mark: 'mai'}, midautumn: {name: 'Trung thu', mark: 'lantern'}, christmas: {name: 'Giáng sinh – Năm mới', mark: 'star'}
};
// Lunar festival dates (Gregorian) for the years in reach; add a year here when needed. Tết window: 7 days before → 10 days after; Trung thu: ±5 days; Christmas/New Year: 15/12 → 2/1.
const TET_DATES = {2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03'};
const MIDAUTUMN_DATES = {2026: '2026-09-25', 2027: '2027-09-15', 2028: '2028-10-03', 2029: '2029-09-22', 2030: '2030-09-12'};
function autoTheme(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate(); const t = d.getTime(); const near = (iso, before, after) => { if (!iso) return false; const c = new Date(iso + 'T00:00:00').getTime(); return t >= c - before * 864e5 && t <= c + after * 864e5; };
  if (near(TET_DATES[y], 7, 10) || near(TET_DATES[y + 1], 7, 10)) return 'tet';
  if (near(MIDAUTUMN_DATES[y], 5, 5)) return 'midautumn';
  if ((m === 12 && day >= 15) || (m === 1 && day <= 2)) return 'christmas';
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
}
const currentTheme = () => { const k = typeof S !== 'undefined' && S?.settings?.theme; return k && k !== 'auto' && THEMES[k] ? k : autoTheme(); };
function applyTheme() { const k = currentTheme(); if (document.documentElement.dataset.theme !== k) document.documentElement.dataset.theme = k; }
/** The theme's main icon. */
const themeMark = (size = 24, key = null) => `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" class="bao" style="flex-shrink:0">${THEME_MARKS[(THEMES[key || currentTheme()] || THEMES.summer).mark]}</svg>`;
function bao(state='hello', size=96, flip=false) { return themeMark(Math.round(size * .6)); } // the UI mark has no face (adult audience); SUN_FACES stay for the game sprites
/** Theme mark in a tinted circle (chat avatar, brand mark). */
function baoAvatar(size=44) {
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:var(--primary-soft);display:inline-grid;place-items:center;flex-shrink:0">${themeMark(Math.round(size * .66))}</span>`;
}
/** Rolling hills from the design system's greeting card; sits at the bottom of the welcome card. */
const landscapeSvg = (w = 260, h = 64) => `<svg viewBox="0 0 260 120" width="${w}" height="${h}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" style="display:block"><g fill="#FFFFFF" opacity="0.9"><rect x="18" y="20" width="34" height="9" rx="4.5"/><rect x="28" y="14" width="18" height="10" rx="5"/><rect x="196" y="30" width="40" height="9" rx="4.5"/><rect x="208" y="23" width="20" height="11" rx="5.5"/></g><g fill="none" stroke="#5B4636" stroke-width="1.4" stroke-linecap="round"><path d="M70 34 q3 -3 6 0 q3 -3 6 0"/><path d="M182 50 q2.5 -2.5 5 0 q2.5 -2.5 5 0"/></g><path d="M0 86 C40 66 80 70 120 82 C160 94 210 70 260 78 V120 H0 Z" fill="#A8BF55"/><path d="M0 100 C50 84 110 88 150 100 C190 110 230 96 260 92 V120 H0 Z" fill="#7E9A35"/><g fill="#3F6B2E"><path d="M14 104 l9 -34 l9 34 Z"/><path d="M30 106 l7 -24 l7 24 Z"/><path d="M226 100 l8 -30 l8 30 Z"/><path d="M242 104 l6 -20 l6 20 Z"/></g><path d="M0 112 C70 104 150 106 260 110 V120 H0 Z" fill="#5E7F2A"/></svg>`;
// ---- per-account avatars: a season emblem (leaf, sun, flower…) in the user's colour on a coloured disc ----
const AVATAR_COLORS = [['ink', '#1E1E1E', 'Mực'], ['brown', '#6E3B32', 'Nâu'], ['olive', '#4B6120', 'Ô liu'], ['taupe', '#7A7064', 'Xám nâu'], ['orange', '#F28C28', 'Cam'], ['rose', '#B4374B', 'Đỏ hồng']];
const AVATAR_ACC = [['none', 'Chữ cái đầu'], ['leaf', 'Lá'], ['sun', 'Nắng'], ['flower', 'Hoa'], ['cloud', 'Mây'], ['star', 'Sao'], ['drop', 'Giọt mưa'], ['snow', 'Tuyết']];
const AVATAR_BG = ['#FBB829', '#F6D3CB', '#E3DCFB', '#DCE8C8', '#FFF4D9', '#D6CCBF'];
function gooseHeadSvg({color = '#1E1E1E', acc = 'leaf', size = 44} = {}) {
  const d = {
    leaf: '<path d="M5 19C5 10 11 5 20 5c0 9-5 15-15 14z"/><path d="M5 19c3-5 7-8 11-10"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    flower: '<circle cx="12" cy="12" r="2.5"/><path d="M12 3.5a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM12 14.5a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM3.5 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0zM14.5 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0z"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z"/>',
    star: '<path d="M12 3.5l2.4 5.2 5.6.6-4.2 3.9 1.2 5.6L12 16l-5 2.8 1.2-5.6L4 9.3l5.6-.6z"/>',
    drop: '<path d="M12 3.5c3.5 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 2.5-6.5 6-11z"/>',
    snow: '<path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/><path d="M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2M3 12l2-2M3 12l2 2M21 12l-2-2M21 12l-2 2"/>'
  }[acc] || '';
  return `<svg viewBox="0 0 24 24" width="${Math.round(size * .6)}" height="${Math.round(size * .6)}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
/** Account avatar: emblem in the user's colour on their disc colour; initials when no emblem (or nothing chosen). */
function userAvatar(u, size = 30) {
  const a = u && u.avatar; if (!a) return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.max(10, Math.round(size * .36))}px">${esc(initials(u ? u.name : '?'))}</span>`;
  const color = (AVATAR_COLORS.find(c => c[0] === a.color) || AVATAR_COLORS[0])[1]; const bg = AVATAR_BG[(+a.bg || 0) % AVATAR_BG.length] || AVATAR_BG[0]; const emblem = AVATAR_ACC.some(x => x[0] === a.acc) && a.acc !== 'none' ? a.acc : 'none';
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:${bg};color:${color};display:inline-grid;place-items:center;font-size:${Math.max(10, Math.round(size * .36))}px">${emblem === 'none' ? esc(initials(u ? u.name : '?')) : gooseHeadSvg({color, acc: emblem, size})}</span>`;
}
function avatarPick(t) { // registered as actions['avatar-pick'] once `actions` exists (see router section)
  const u = t.dataset.id ? userById(t.dataset.id) : me(); if (!u) return; if (u.id !== me()?.id && !canManage(me(), u)) { toast('Bạn không đổi được avatar của tài khoản này', 'err'); return; } const a = Object.assign({color: 'ink', acc: 'leaf', bg: 0}, u.avatar || {}); if (!AVATAR_COLORS.some(c => c[0] === a.color)) a.color = 'ink'; if (!AVATAR_ACC.some(x => x[0] === a.acc)) a.acc = 'leaf'; // work on a copy so "Huỷ" changes nothing; old goose values fall back to the new defaults
  const draw = () => `<div class="row" style="align-items:center;gap:14px;margin-bottom:12px"><span id="av-preview">${userAvatar({...u, avatar: a}, 84)}</span><div><b>${esc(u.name)}</b><div class="small muted">Chọn biểu tượng mùa, màu nét và màu nền.</div></div></div>
    <div class="eyebrow" style="margin-bottom:6px">Biểu tượng</div><div class="row" style="gap:8px;margin-bottom:12px">${AVATAR_ACC.map(([k, lbl]) => `<button class="btn-sm ${a.acc === k ? 'btn-primary' : ''}" data-action="avatar-set" data-k="acc" data-v="${k}">${k === 'none' ? '' : gooseHeadSvg({color: 'currentColor', acc: k, size: 30})} ${lbl}</button>`).join('')}</div>
    <div class="eyebrow" style="margin-bottom:6px">Màu nét</div><div class="row" style="gap:8px;margin-bottom:12px">${AVATAR_COLORS.map(([k, hex, lbl]) => `<button class="btn-sm ${a.color === k ? 'btn-primary' : ''}" data-action="avatar-set" data-k="color" data-v="${k}" title="${lbl}"><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${hex}"></span> ${lbl}</button>`).join('')}</div>
    <div class="eyebrow" style="margin-bottom:6px">Màu nền</div><div class="row" style="gap:8px;margin-bottom:12px">${AVATAR_BG.map((hex, i) => `<button class="btn-sm ${a.bg === i ? 'btn-primary' : ''}" data-action="avatar-set" data-k="bg" data-v="${i}"><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${hex};box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)"></span></button>`).join('')}</div>`;
  openModal(`<h3>Avatar của bạn</h3><div id="av-body">${draw()}</div><div class="row" style="justify-content:flex-end"><button data-action="modal-close">Huỷ</button><button class="btn-primary" data-action="avatar-save" data-id="${u.id}">Lưu avatar</button></div>`);
  actions['avatar-set'] = b => { const k = b.dataset.k; a[k] = k === 'bg' ? +b.dataset.v : b.dataset.v; $('#av-body').innerHTML = draw(); };
  actions['avatar-save'] = () => { u.avatar = {color: a.color, acc: a.acc, bg: a.bg}; save(true); closeModal(); toast('Đã lưu avatar', 'ok'); render(); };
}
const ICONS = {
  check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  chat: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>',
  pen: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/></svg>',
  home: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
  bars: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 4L4 11l7 2 2 7z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  user: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  book: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 7h8M8 11h8"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>',
  cog: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  cal: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  doc: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/></svg>',
  headphones: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4.5" height="7" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="7" rx="1.5"/></svg>',
  flame: '<svg viewBox="0 0 24 24" width="30" height="30" fill="#FBB829" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  sound: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h3l4 4V6L7 10z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/></svg>',
  game: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v4M5 13h4M15 12h.01M18 14h.01"/></svg>'
};
const lvlChip = l => l ? `<span class="badge lvl lvl-${l}">${l}</span>` : '<span class="badge">—</span>';

function toast(msg, type='') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  $('#toast').appendChild(t); setTimeout(() => t.remove(), 3200);
}
function openModal(html, {wide=false} = {}) {
  $('#modal').innerHTML = `<div class="dialog ${wide ? 'wide' : ''}">${html}</div>`;
}
function closeModal() { $('#modal').innerHTML = ''; }
/** countdown (default for danger): after OK, a 5-second countdown with a Stop button runs before the action is carried out – for everything that cannot be undone. */
function confirmDlg(msg, {okLabel='Đồng ý', danger=false, countdown=danger} = {}) {
  return new Promise(res => {
    openModal(`<p>${nl2br(msg)}</p><div class="row" style="justify-content:flex-end;margin-top:12px">
      <button data-action="modal-cancel">Huỷ</button>
      <button class="${danger ? 'btn-danger' : 'btn-primary'}" data-action="modal-ok">${esc(okLabel)}</button></div>`);
    actions['modal-cancel'] = () => { closeModal(); res(false); };
    actions['modal-ok'] = () => {
      if (!countdown) { closeModal(); res(true); return; }
      let n = 5, iv = null;
      const draw = () => openModal(`<h3>${esc(okLabel)} sau ${n} giây…</h3><p class="small">Thao tác này không hoàn tác được. Bấm <b>Dừng lại</b> nếu bạn đổi ý.</p><div class="countdown" aria-live="assertive">${n}</div><div class="row" style="justify-content:center"><button data-action="modal-cancel">Dừng lại</button></div>`);
      actions['modal-cancel'] = () => { clearInterval(iv); closeModal(); res(false); };
      actions['modal-ok'] = () => {};
      draw(); iv = setInterval(() => { n--; if (n > 0) draw(); else { clearInterval(iv); closeModal(); res(true); } }, 1000);
    };
  });
}
function promptDlg(title, {label='', value='', okLabel='Lưu', type='text', multiline=false} = {}) {
  return new Promise(res => {
    openModal(`<h3>${esc(title)}</h3>
      <label class="field"><span>${esc(label)}</span>${multiline ? `<textarea id="pd-val">${esc(value)}</textarea>` : `<input id="pd-val" type="${type}" value="${esc(value)}">`}</label>
      <div class="row" style="justify-content:flex-end"><button data-action="modal-cancel">Huỷ</button><button class="btn-primary" data-action="modal-ok">${esc(okLabel)}</button></div>`);
    setTimeout(() => $('#pd-val')?.focus(), 30);
    actions['modal-ok'] = () => { const v = $('#pd-val').value; closeModal(); res(v); };
    actions['modal-cancel'] = () => { closeModal(); res(null); };
  });
}

// ---------- store ----------
// ?sandbox=1 keeps everything in a separate store, so trying things out never touches the real data of this browser
const SANDBOX = new URLSearchParams(location.search).has('sandbox');
const KEY = SANDBOX ? 'aec:v1:sandbox' : 'aec:v1';
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const LEVEL_NAMES = {A1: 'A1 – Mới bắt đầu', A2: 'A2 – Sơ cấp', B1: 'B1 – Trung cấp', B2: 'B2 – Trung cao', C1: 'C1 – Cao cấp'};
const ROLE_NAMES = {learner: 'Người học', operator: 'Người vận hành', manager: 'Quản lý'};
const SECTIONS = ['listening', 'reading', 'writing', 'speaking'];
const SECTION_NAMES = {listening: 'Nghe', reading: 'Đọc', writing: 'Viết', speaking: 'Nói'};
// CEFR thresholds from the GFT placement test (local cut scores, not official CEFR)
// CEFR mapping of the placement test (refined version): total /100 → 0–24 A1 · 25–44 A2 · 45–64 B1 · 65–84 B2 · 85–100 C1. Skills use the same bands on their percentage.
const pctCefr = pct => pct >= 85 ? 'C1' : pct >= 65 ? 'B2' : pct >= 45 ? 'B1' : pct >= 25 ? 'A2' : 'A1';
const skillCefr = (pts, max = 25) => pctCefr(max ? pts / max * 100 : 0);
const totalCefr = total => pctCefr(total);
const isLow = lvl => lvl === 'A1' || lvl === 'A2';
const LESSONS_PER_WEEK = 5; // one micro-lesson per working day, Mon→Fri
const DAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function defaultWeeks() {
  return [1, 2, 3, 4].map(n => ({n, topic: '', description: '', objectives: '', keyVocabHint: ''}));
}
/** Thresholds for the level-up / level-down signals (S.settings.levelUp, editable in Cài đặt). Percentages unless noted. */
const LEVELUP_DEFAULTS = {lessons: 90, firstTry: 75, submission: 80, coach: 4, coachTurns: 6, wrong: 30, minParts: 4, days: 14};
function defaultState() {
  return {
    version: 1,
    settings: {
      provider: 'claude', apiKey: '', model: 'claude-opus-5-5', geminiKey: '', geminiModel: 'gemini-3.8-flash', oaiBase: 'https://api.groq.com/openai/v1', oaiKey: '', oaiModel: 'llama-3.3-70b-versatile', webhookUrl: '', webhookTemplate: '{"base_content":"{message}"}',
      minMinutesPerDay: 15, pinOperator: '', pinManager: '', pilotStartDate: mondayOf(todayStr()), pilotWeeks: 2,
      weekOverride: 0, orgName: 'GFT', prompts: {},
      testTimed: true, testTimes: {listening: 15, reading: 20, writing: 20, speaking: 15}, testWarnLimit: 3, levelUp: {...LEVELUP_DEFAULTS}
    },
    users: [], weeks: defaultWeeks(), lessonSets: [], microLessons: [], practiceResults: {}, progress: [], activity: [], coachSessions: [],
    submissions: [], tests: [], surveys: [], reminders: [], levelForms: [], levelRequests: [], gameSets: [], gameResults: [], topicReports: [], duels: [], session: {userId: null}
  };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const s = Object.assign(defaultState(), JSON.parse(raw));
    s.settings = Object.assign(defaultState().settings, s.settings || {});
    if (s.settings.geminiModel === 'gemini-2.5-flash') s.settings.geminiModel = 'gemini-3.8-flash'; // one-time default upgrade
    // mascot renamed Bao → Chippi → Sunny → Season: patch old stored chat text
    const renameCoach = x => String(x || '').replace(/\b(Bao|Chippi|Sunny)\b/g, 'Season');
    (s.coachSessions || []).forEach(c => { (c.messages || []).forEach(m => { if (m.role === 'assistant') m.content = renameCoach(m.content); }); (c.turns || []).forEach(t => { if (t.reply) t.reply = renameCoach(t.reply); }); });
    if (!s.weeks || s.weeks.length < 4) s.weeks = defaultWeeks().map((w, i) => Object.assign(w, (s.weeks || [])[i] || {}));
    if (!Array.isArray(s.microLessons)) s.microLessons = [];
    if (!s.practiceResults || typeof s.practiceResults !== 'object') s.practiceResults = {};
    return s;
  } catch (e) {
    console.error('load failed', e);
    // never lose the user's data because of a code bug: keep the raw copy aside before anything overwrites aec:v1
    try { const raw = localStorage.getItem(KEY); if (raw) localStorage.setItem(KEY + ':backup-' + Date.now(), raw); } catch {}
    setTimeout(() => toast('Không đọc được dữ liệu đã lưu – đã giữ bản sao trong localStorage (aec:v1:backup-…). Báo người vận hành.', 'err'), 500);
    return defaultState();
  }
}
let S = load();
let saveTimer = null;
let savedTimer = null;
/** Write to storage, then flash the small "Đã lưu" note (or say so when the browser refuses the write). */
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Không lưu được dữ liệu (bộ nhớ trình duyệt đầy hoặc bị chặn)', 'err'); return; }
  const el = document.getElementById('saved'); if (!el || performance.now() < 1500) return;
  el.classList.add('on'); clearTimeout(savedTimer); savedTimer = setTimeout(() => el.classList.remove('on'), 1600);
}
function save(immediate=false) {
  clearTimeout(saveTimer);
  if (immediate) { persist(); return; }
  saveTimer = setTimeout(persist, 150);
}
/** Short vibration on phones for rewards (ignored where the browser has no vibration). */
function buzz() { try { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; navigator.vibrate?.([100, 50, 100]); } catch {} } /* browsers ignore vibrate before the first tap and log an error */
function exportJSON() { download(`aec-backup-${todayStr()}.json`, JSON.stringify(S, null, 2)); }
function importJSON(file) {
  const r = new FileReader();
  r.onload = () => { try { const obj = JSON.parse(r.result); if (!obj.users || !obj.settings) throw new Error('Thiếu trường'); S = Object.assign(defaultState(), obj); S.session = {userId: null}; save(true); toast('Đã nhập dữ liệu', 'ok'); go('#/'); } catch (e) { toast('File không hợp lệ: ' + e.message, 'err'); } };
  r.readAsText(file);
}

// ---------- domain helpers ----------
const me = () => S.users.find(u => u.id === S.session.userId) || null;
const userById = id => S.users.find(u => u.id === id);
const learners = () => S.users.filter(u => u.role === 'learner');
const activeLearners = () => learners().filter(u => u.cefrApproved);
function currentWeek() {
  if (S.settings.weekOverride > 0) return clamp(S.settings.weekOverride, 1, S.settings.pilotWeeks);
  const d = daysBetween(S.settings.pilotStartDate, todayStr());
  return clamp(Math.floor(d / 7) + 1, 1, S.settings.pilotWeeks);
}
const weekInfo = n => S.weeks.find(w => w.n === n) || {n, topic: '', description: ''};
const weekStart = n => addDays(S.settings.pilotStartDate, (n - 1) * 7);
const isLastWeek = () => currentWeek() >= S.settings.pilotWeeks;
const lessonSet = (week, cefr) => S.lessonSets.find(l => l.week === week && l.cefr === cefr);
const approvedLessons = (week, cefr) => { const ls = lessonSet(week, cefr); return ls && ls.status === 'approved' ? ls.lessons : []; };
const lessonById = id => { for (const ls of S.lessonSets) { const l = ls.lessons.find(x => x.id === id); if (l) return {lesson: l, set: ls}; } return null; };
const userProgress = (uid, lessonId) => S.progress.find(p => p.userId === uid && p.lessonId === lessonId);
const userTest = (uid, kind) => S.tests.filter(t => t.userId === uid && t.kind === kind).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
function logActivity(userId, type, minutes=5) {
  S.activity.push({userId, date: todayStr(), type, minutes, at: new Date().toISOString()});
  // activity today clears pending reminders for that user
  S.reminders.forEach(r => { if (r.userId === userId && r.status === 'pending') r.status = 'resolved'; });
  save();
}
const activeDays = (uid, from, to) => { const set = new Set(); S.activity.forEach(a => { if (a.userId === uid && a.date >= from && a.date <= to) set.add(a.date); }); return set; };
const lastActiveDate = uid => S.activity.filter(a => a.userId === uid).map(a => a.date).sort().pop() || null;
function missedDays(uid) {
  // consecutive days without activity, counting backwards from yesterday
  const t = todayStr(); if (activeDays(uid, t, t).size) return 0;
  const last = lastActiveDate(uid); const u = userById(uid);
  const since = last || (u && u.approvedAt ? dateStr(u.approvedAt) : (u ? dateStr(u.createdAt) : t));
  return Math.max(0, daysBetween(since, t) - (last ? 0 : 0));
}
function sessionsThisWeek(uid, week=currentWeek()) { const s = weekStart(week); return activeDays(uid, s, addDays(s, 6)).size; }
function reminderMessage(u) {
  const w = weekInfo(currentWeek()); const miss = missedDays(u.id);
  return `Chào ${u.name}, bạn đã ${miss} ngày chưa vào học tiếng Anh. Chủ đề tuần ${currentWeek()}${w.topic ? ': ' + w.topic : ''}. Chỉ cần ${S.settings.minMinutesPerDay} phút hôm nay thôi – vào học 1 bài ngắn hoặc luyện 1 lượt với AI coach nhé! 💪`;
}
// ---- CEFR level history: u.cefrHistory = [{from, to, at, by, reason, evidence}], one entry per change that took effect ----
const nextMonday = ds => { const dow = new Date(ds + 'T00:00:00').getDay(); return addDays(ds, dow === 0 ? 1 : 8 - dow); };
/** Change a learner's level. The first approval applies at once; a later change waits in u.pendingCefr until next Monday so the running week keeps its lessons. */
function setLevel(u, to, by, reason = '', evidence = '') {
  const from = u.cefr || null; if (from === to) { u.pendingCefr = null; return 'same'; }
  const entry = {from, to, by, reason, evidence};
  if (!u.cefrApproved || !from) { u.cefr = to; u.pendingCefr = null; u.cefrHistory = [...(u.cefrHistory || []), {...entry, at: todayStr()}]; return 'now'; }
  u.pendingCefr = {...entry, effective: nextMonday(todayStr())}; return 'pending';
}
/** Apply deferred level changes whose Monday has come (boot and computeReminders). Returns how many were applied. */
function applyPendingLevels() {
  let n = 0; const t = todayStr();
  S.users.forEach(u => { const p = u.pendingCefr; if (p && p.effective <= t) { u.cefrHistory = [...(u.cefrHistory || []), {from: u.cefr, to: p.to, at: p.effective, by: p.by, reason: p.reason, evidence: p.evidence}]; u.cefr = p.to; u.pendingCefr = null; n++; } });
  return n;
}
/** The level the learner had during pilot week `week`, from the history (changes take effect on Mondays, so a week has one level). */
function cefrAt(u, week) {
  const h = u.cefrHistory || []; if (!h.length) return u.cefr;
  const end = addDays(weekStart(week), 6); let lv = h[0].from || h[0].to;
  h.forEach(e => { if (e.at <= end) lv = e.to; }); return lv;
}
const pendingLevelBadge = u => u.pendingCefr ? `<span class="badge warn" title="${esc(u.pendingCefr.reason || '')}">→ ${esc(u.pendingCefr.to)} từ ${fmtDate(u.pendingCefr.effective)}</span>` : '';
function computeReminders() {
  applyPendingLevels();
  const today = todayStr();
  activeLearners().forEach(u => {
    const miss = missedDays(u.id);
    const existing = S.reminders.find(r => r.userId === u.id && r.date === today);
    if (miss >= 2 && !existing) S.reminders.push({id: uid('rem'), userId: u.id, date: today, missedDays: miss, status: 'pending'});
  });
  save();
}
async function sendWebhook(message, u) {
  const url = S.settings.webhookUrl; if (!url) throw new Error('Chưa cấu hình webhook URL trong Cài đặt');
  let body = S.settings.webhookTemplate || '{"base_content":"{message}"}';
  body = body.replace('{message}', JSON.stringify(message).slice(1, -1)).replace('{name}', esc(u ? u.name : ''));
  await fetch(url, {method: 'POST', mode: 'no-cors', headers: {'Content-Type': 'application/json'}, body});
}

// ---------- learner profile (onboarding form) ----------
const PROFILE_OPTS = {
  goals: [['customer', 'Nói chuyện với khách hàng / đối tác'], ['email', 'Viết email, tin nhắn công việc'], ['meeting', 'Họp và trình bày'], ['docs', 'Đọc tài liệu, spec kỹ thuật'], ['career', 'Thăng tiến / phỏng vấn'], ['confidence', 'Tự tin hơn khi nói']],
  styles: [['reading', 'Đọc và ghi chú'], ['listening', 'Nghe và nhắc lại'], ['speaking', 'Nói / hội thoại'], ['quiz', 'Trắc nghiệm, điền từ'], ['writing', 'Viết câu, viết email'], ['examples', 'Ví dụ sát việc đang làm'], ['games', 'Thử thách ngắn, có điểm']],
  timeOfDay: [['morning', 'Sáng sớm'], ['noon', 'Giờ nghỉ trưa'], ['afternoon', 'Chiều'], ['evening', 'Tối']],
  duration: [['5', '5 phút'], ['10', '10 phút'], ['15', '15 phút'], ['20', '20+ phút']],
  device: [['phone', 'Điện thoại'], ['laptop', 'Máy tính'], ['both', 'Cả hai']],
  selfLevel: [['unknown', 'Không rõ'], ['A1', 'Mới bắt đầu (A1)'], ['A2', 'Sơ cấp (A2)'], ['B1', 'Trung cấp (B1)'], ['B2', 'Khá (B2)'], ['C1', 'Tốt (C1)']],
  envUse: [['daily', 'Hằng ngày'], ['weekly', 'Vài lần mỗi tuần'], ['monthly', 'Thỉnh thoảng (vài lần/tháng)'], ['rarely', 'Hiếm khi / chưa dùng']],
  familyUse: [['daily', 'Hằng ngày (người thân nói tiếng Anh)'], ['weekly', 'Vài lần mỗi tuần'], ['monthly', 'Thỉnh thoảng'], ['never', 'Không dùng']],
  habits: [['movies', 'Xem phim / video tiếng Anh'], ['music', 'Nghe nhạc / podcast'], ['reading', 'Đọc tin tức, tài liệu'], ['social', 'Mạng xã hội, chat tiếng Anh'], ['speak', 'Nói chuyện với người nước ngoài'], ['app', 'Học qua app / khoá học'], ['none', 'Chưa có thói quen nào']],
  explain: [['vi', 'Tiếng Việt'], ['en', 'Tiếng Anh'], ['auto', 'Theo trình độ (mặc định)']],
  certs: [['ielts', 'IELTS', 'band, VD 5.5'], ['toeic', 'TOEIC', 'điểm, VD 650'], ['toefl', 'TOEFL iBT', 'điểm, VD 72'], ['cambridge', 'Cambridge (KET/PET/FCE/CAE)', 'VD PET – Pass'], ['vstep', 'VSTEP', 'bậc, VD 3/6'], ['other', 'Khác', 'tên + kết quả']]
};
const certLabel = c => `${optLabel('certs', c.type)}${c.score ? ' ' + c.score : ''}${c.year ? ' (' + c.year + ')' : ''}`;
const optLabel = (group, key) => (PROFILE_OPTS[group].find(o => o[0] === key) || [])[1] || key;
const optLabels = (group, keys) => (keys || []).map(k => optLabel(group, k)).join(', ');
/** English summary of a learner's profile for AI prompts. */
function profileSummary(u) {
  const p = u.profile; if (!p) return '(no profile)';
  const en = {customer: 'talking to customers/partners', email: 'work emails and messages', meeting: 'meetings and presentations', docs: 'reading technical documents', career: 'career growth / interviews', confidence: 'speaking confidence',
    reading: 'reading and note-taking', listening: 'listening and repeating', speaking: 'speaking / dialogue', quiz: 'quizzes and gap-fills', writing: 'writing sentences and emails', examples: 'examples from their real work', games: 'short challenges with scores'};
  const envEn = {daily: 'every day', weekly: 'a few times a week', monthly: 'a few times a month', rarely: 'rarely or never'}; const habEn = {movies: 'films/videos', music: 'music/podcasts', reading: 'news/documents', social: 'social media/chat', speak: 'talking with foreigners', app: 'apps/courses', none: 'no habit yet'};
  return `Job: ${p.position || '?'} in ${p.department || '?'}. Uses English for: ${(p.goals || []).map(g => en[g] || g).join(', ') || 'not stated'}. English use at work: ${envEn[p.envUse] || 'not stated'}. English use at home / with family: ${({daily: 'every day', weekly: 'a few times a week', monthly: 'occasionally', never: 'never'})[p.familyUse] || 'not stated'}. English habits outside work: ${(p.habits || []).map(h => habEn[h] || h).join(', ') || 'not stated'}. Typical situations: ${p.situations || 'not stated'}. Preferred learning styles: ${(p.styles || []).map(s => en[s] || s).join(', ') || 'not stated'}. Session length: ${p.duration || '?'} min, ${p.sessionsPerWeek || '?'} sessions/week, device: ${p.device || '?'}. Self-assessed level: ${p.selfLevel || 'unknown'}. Certificates: ${(p.certs || []).length ? p.certs.map(c => `${optLabel('certs', c.type)} ${c.score || ''}${c.year ? ' (' + c.year + ')' : ''}`.trim()).join(', ') : 'none'}. Past learning: ${p.experience || 'not stated'}. Worries / wishes: ${p.concerns || 'none'}.`;
}
/** Aggregate profile hints for all learners at one level (used when generating a level's lesson set). */
function levelProfileSummary(cefr) {
  const L = activeLearners().filter(x => x.cefr === cefr && x.profile); if (!L.length) return '(no learner profiles yet)';
  const count = (group, key) => L.filter(x => (x.profile[group] || []).includes(key)).length;
  const top = group => PROFILE_OPTS[group].map(([k]) => [k, count(group, k)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`).join(', ');
  return `${L.length} learners. Jobs: ${[...new Set(L.map(x => x.profile.position).filter(Boolean))].join(', ') || '?'}. Top goals: ${top('goals') || '?'}. Top learning styles: ${top('styles') || '?'}. Typical situations: ${L.map(x => x.profile.situations).filter(Boolean).slice(0, 3).join(' | ') || '?'}.`;
}

// ---------- router / shell ----------
const isStaff = u => !!u && u.role !== 'learner'; // operator screens: the operator works, the manager may look
/** A manager inside operator screens (#/op…) is read-only: only these actions run. */
const MGR_VIEW_ACTIONS = new Set(['rv-tab', 'go-appeals', 'say-sound', 'delreq-decide', 'trash-restore', 'trash-purge', 'del-quick', 'op-view-profile', 'op-view-test', 'lf-view', 'lr-chat', 'modal-close', 'modal-cancel', 'modal-ok', 'audio-play', 'audio-toggle', 'say', 'say-en', 'logout', 'avatar-pick', 'avatar-set', 'avatar-save', 'ls-copy-sample', 'wk-sug-close', 'wk-sug-reopen']);
const mgrViewing = () => me()?.role === 'manager' && (location.hash || '').startsWith('#/op');
const actions = {};   // data-action handlers
const routes = [];    // {re, fn}
function route(pattern, fn) { routes.push({re: new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$'), fn}); }
const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };

const NAV = {
  learner: [['#/home', ICONS.home, 'Trang chủ'], ['#/coach', ICONS.chat, 'Luyện với Season'], ['#/practice', ICONS.pen, 'Bài tuần'], ['#/games', ICONS.game, 'Mini game'], ['#/profile', ICONS.user, 'Tiến độ & hồ sơ']],
  operator: [['#/op', ICONS.check, 'Duyệt mức'], ['#/op/weeks', ICONS.cal, 'Chủ đề'], ['#/op/lessons', ICONS.book, 'Bài học'], ['#/op/review', ICONS.search, 'Đọc mẫu'], ['#/settings', ICONS.cog, 'Cài đặt']],
  manager: [['#/mgr', ICONS.bars, 'Tiến độ'], ['#/mgr/ops', ICONS.check, 'Vận hành'], ['#/mgr/reminders', ICONS.bell, 'Nhắc học'], ['#/mgr/report', ICONS.doc, 'Báo cáo'], ['#/settings', ICONS.cog, 'Cài đặt']]
};
function shell(content, {title=''} = {}) {
  const u = me(); const nav = u ? NAV[u.role] : [];
  const cur = location.hash || '#/';
  const isActive = h => h === '#/home' ? (cur === '#/home' || cur.startsWith('#/lesson') || cur.startsWith('#/test')) : (h === '#/op' || h === '#/mgr' ? cur === h : h === '#/mgr/ops' ? (cur.startsWith(h) || cur.startsWith('#/op')) : cur.startsWith(h));
  const opLinks = [['#/op', 'Duyệt mức'], ['#/op/weeks', 'Chủ đề tuần'], ['#/op/lessons', 'Bài học'], ['#/op/review', 'Đọc mẫu'], ['#/op/prompts', 'Prompt'], ['#/op/levelforms', 'Đề lên mức']];
  if (u?.role === 'manager' && cur.startsWith('#/op')) content = `<div class="banner info" style="margin-bottom:12px"><div class="body small"><b>Chế độ xem của Quản lý</b> – bạn thấy đúng màn hình của Người vận hành nhưng không thao tác được. <span class="row" style="gap:6px;margin-top:6px"><a class="btn btn-sm" href="#/mgr/ops">← Hiệu suất vận hành</a>${opLinks.map(([h, l]) => `<a class="btn btn-sm ${(h === '#/op' ? cur === h : cur.startsWith(h)) ? 'btn-primary' : ''}" href="${h}">${l}</a>`).join('')}</span></div></div>` + content;
  const links = cls => nav.map(([h, ico, lbl]) => `<a href="${h}" class="${isActive(h) ? 'active' : ''}">${cls === 'bottom' ? `<span class="ico">${ico}</span>` : ''}${esc(lbl)}</a>`).join('');
  document.title = (title ? title + ' · ' : '') + 'Season English';
  $('#app').innerHTML = `
    <header class="topbar">
      <a href="#/" class="brand" style="color:inherit;text-decoration:none">${baoAvatar(34)}<span>Season English <span class="muted" style="font-weight:400;font-size:.85rem">· ${esc(S.settings.orgName)}</span></span></a>
      <nav>${links('top')}</nav>
      ${u ? `<div class="userchip">${audioControls()}<button class="btn-ghost" data-action="avatar-pick" title="Đổi avatar" style="padding:0;border:0;background:transparent">${userAvatar(u, 32)}</button><span class="small"><b>${esc(u.name)}</b> <span class="muted">· ${ROLE_NAMES[u.role]}</span></span><button class="btn-sm btn-ghost" data-action="logout" title="Đăng xuất khỏi tài khoản này">Đăng xuất</button></div>` : `<div class="userchip">${audioControls()}</div>`}
    </header>
    <main>${content}</main>
    ${u ? `<nav class="bottomnav">${links('bottom')}</nav>` : ''}`;
}
function render() {
  applyTheme(); document.getElementById('print-landscape')?.remove();
  const hash = location.hash || '#/';
  const u = me();
  if (!u && hash !== '#/' ) { location.hash = '#/'; return; }
  for (const r of routes) {
    const m = hash.match(r.re);
    if (m) { try { r.fn(...m.slice(1).map(decodeURIComponent)); } catch (e) { console.error(e); shell(`<div class="card"><h2>Lỗi hiển thị</h2><pre>${esc(e.stack || e)}</pre></div>`); } window.scrollTo(0, 0); try { hydrateVocabImages(); } catch {} try { hydrateTranslations(); } catch {} return; }
  }
  shell(`<div class="empty"><div class="big">🤷</div><p>Không tìm thấy trang.</p><a class="btn" href="#/">Về trang chủ</a></div>`);
}
window.addEventListener('hashchange', render);
document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]'); if (!t) return;
  if (mgrViewing() && !MGR_VIEW_ACTIONS.has(t.dataset.action)) { e.preventDefault(); toast('Quản lý đang ở chế độ xem. Thao tác này do Người vận hành thực hiện.', ''); return; }
  const fn = actions[t.dataset.action]; if (fn) { e.preventDefault(); fn(t, e); }
});
document.addEventListener('change', e => {
  const t = e.target.closest('[data-change]'); if (!t) return;
  if (mgrViewing()) { toast('Quản lý đang ở chế độ xem. Thay đổi không được lưu.', ''); return; }
  const fn = actions[t.dataset.change]; if (fn) fn(t, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').innerHTML && !pendingAuto) { if ($('#modal [data-action="modal-cancel"]')) actions['modal-cancel'](); else closeModal(); } }); // Escape = cancel, so a pending confirmation or countdown never runs
// Enter inside a dialog input (PIN prompt, register, forgot-PIN…) presses the dialog's primary button, like a form submit; textareas keep Enter for new lines
document.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.isComposing) return; const inp = e.target; if (!inp.matches || !inp.matches('#modal input')) return; const btn = $('#modal [data-action="modal-ok"]') || $('#modal button.btn-primary[data-action]'); if (btn && !btn.disabled) { e.preventDefault(); btn.click(); } });
/** The only place the logged-in user changes. Everything kept in memory for the previous user (open lesson answers, running test, countdowns, recording, chat lock) is dropped, so nothing carries over to the next user. */
function setSessionUser(id) {
  S.session.userId = id;
  LS = null; T = null; clearInterval(T_tick); if (pendingAuto) { clearInterval(pendingAuto); pendingAuto = null; }
  coachBusy = false; pickerGrace = false; speech.stop(); if (recorder.mr) { try { recorder.mr.stop(); } catch {} }
  Object.keys(weekSug).forEach(k => delete weekSug[k]); closeModal();
}
actions.logout = () => { setSessionUser(null); entryRole = null; save(true); go('#/'); };
actions['avatar-pick'] = avatarPick;
actions['modal-close'] = () => closeModal();

// ---------- screen: choose user ----------
let entryRole = null; // role chosen on the entry screen (not persisted)
const normName = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
const greeting = (text) => `<div class="welcome"><div class="sky"><div class="art">${bao('hello', 120, true)}</div></div><div class="body"><div class="eyebrow">Season English · ${esc(S.settings.orgName)}</div><h1>Mỗi ngày một chút nắng.</h1><div class="bubble">${text}</div>
  <div class="pills"><span>${ICONS.clock} 10 phút mỗi ngày, T2–T6</span><span>${ICONS.chat} Luyện chat với Season</span><span>${ICONS.check} Điểm thưởng và huy hiệu</span></div></div></div>`;
route('#/', () => {
  const u = me();
  if (u) { go(u.role === 'learner' ? '#/home' : u.role === 'operator' ? '#/op' : '#/mgr'); return; }
  if (S.users.length === 0) {
    shell(`${greeting('Chưa có ai trong hệ thống. Tạo tài khoản vận hành đầu tiên hoặc nạp dữ liệu mẫu để xem thử.')}
      <div class="card"><h3>Bắt đầu</h3><div class="row"><button class="btn-primary" data-action="add-user" data-role="operator">+ Tạo người vận hành</button><button data-action="seed-demo">Nạp dữ liệu mẫu (demo)</button><label class="btn">Nhập file JSON<input type="file" accept=".json" hidden data-change="import-file"></label></div></div>`, {title: 'Bắt đầu'});
    return;
  }
  if (!entryRole) {
    shell(`${greeting('Chọn vai trò để bắt đầu.')}
      <div class="row between" style="margin-bottom:10px;align-items:baseline"><h2 style="margin:0">Bạn là…</h2><span class="small muted" style="font-weight:800">Chọn một vai trò để vào</span></div>
      <div class="roles">
        <button class="role butter" data-action="entry-role" data-role="learner"><span class="ic">${ICONS.user}</span><span class="t">Người học</span><ul><li>Học bài mỗi ngày, luyện với Season</li><li>Vào bằng họ tên + mã PIN</li></ul><span class="go">Vào học →</span></button>
        <button class="role mint" data-action="entry-role" data-role="operator"><span class="ic">${ICONS.check}</span><span class="t">Người vận hành</span><ul><li>Duyệt mức, soạn và duyệt bài</li><li>Đọc mẫu, xử lý kháng nghị</li></ul><span class="go">Vào vận hành →</span></button>
        <button class="role lav" data-action="entry-role" data-role="manager"><span class="ic">${ICONS.bars}</span><span class="t">Quản lý</span><ul><li>Tiến độ nhóm, nhắc học</li><li>Báo cáo, duyệt xoá tài khoản</li></ul><span class="go">Vào quản lý →</span></button>
      </div>
      <p class="xs muted section" style="text-align:center">🔒 Dữ liệu lưu trên trình duyệt này. Người học chỉ thấy phần của mình; vận hành và quản lý thấy toàn bộ.</p>`, {title: 'Bạn là…'});
    return;
  }
  if (entryRole === 'learner') {
    shell(`${greeting('Nhập tên và mã PIN để vào học. Lần đầu vào, bấm "Tôi là người mới".')}
      <div class="card" style="max-width:480px"><div class="row between"><h3>Người học</h3><button class="btn-sm btn-ghost" data-action="entry-back">← Đổi vai trò</button></div>
        <form id="li-form" onsubmit="return false">
          <label class="field"><span>Họ tên (đúng chữ HOA/thường và dấu như đã đăng ký)</span><input id="li-name" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="VD: Nguyễn Thị Lan"></label>
          <label class="field"><span>Mã PIN cá nhân (4–6 số)</span><input id="li-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="••••"></label>
          <div class="banner info" style="margin:0 0 10px;box-shadow:none"><div class="body small"><b>Lưu ý khi nhập:</b><br>• <b>Họ tên</b>: gõ y như lúc đăng ký, <b>đúng chữ HOA/thường và đúng dấu</b> ("học viên a" khác "Học viên A").<br>• <b>Mã PIN</b>: 4–6 chữ số, đúng từng số.</div></div>
          <div id="li-caps" class="banner warn" style="margin:0 0 10px;box-shadow:none" hidden><div class="body small"><b>Caps Lock đang bật</b> – chữ bạn gõ sẽ thành chữ HOA.</div></div>
          <div id="li-warn" class="banner warn" style="margin:0 0 10px;box-shadow:none;background:var(--peach)" role="alert" hidden><div class="body small" id="li-warn-text"></div></div>
          <div class="row"><button class="btn-primary" data-action="learner-login">Vào học</button><button data-action="learner-register">Tôi là người mới</button></div>
        </form>
        <p class="xs muted" style="margin:10px 0 0">Chưa có PIN (tài khoản do vận hành tạo)? Nhập tên và PIN bạn muốn dùng, PIN sẽ được đặt ở lần vào đầu tiên. Quên PIN thì nhờ người vận hành đặt lại.</p></div>`, {title: 'Người học'});
    setTimeout(() => $('#li-name')?.focus(), 30);
    $('#li-form')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); actions['learner-login'](); } });
    // Caps Lock notice: shown only while the key is really on (state read from the key or mouse event itself)
    ['keydown', 'keyup', 'mousedown'].forEach(ev => $('#li-form')?.addEventListener(ev, e => { const c = $('#li-caps'); if (c && e.getModifierState) c.hidden = !e.getModifierState('CapsLock'); }));
    $('#li-form')?.addEventListener('input', () => { const w = $('#li-warn'); if (w) w.hidden = true; }); // the error box goes away as soon as the learner edits the fields
    return;
  }
  const list = S.users.filter(x => x.role === entryRole);
  shell(`${greeting(entryRole === 'operator' ? 'Chọn tài khoản vận hành của bạn.' : 'Chọn tài khoản quản lý của bạn.')}
    <div class="row between" style="margin-bottom:10px"><h3>${ROLE_NAMES[entryRole]} <span class="muted small">(${list.length})</span></h3><div class="row"><button class="btn-sm" data-action="add-user" data-role="${entryRole}">+ Tạo tài khoản</button><button class="btn-sm btn-ghost" data-action="entry-back">← Đổi vai trò</button></div></div>
    <div class="userlist">${list.map(x => `<button class="usercard" data-action="login" data-id="${x.id}">${userAvatar(x, 44)}<b>${esc(x.name)}</b><span class="small muted">${ROLE_NAMES[x.role]}</span></button>`).join('') || '<div class="muted small">Chưa có tài khoản nào. Bấm "Tạo tài khoản".</div>'}</div>
    ${(entryRole === 'operator' ? S.settings.pinOperator : S.settings.pinManager) ? `<p class="xs muted section">Vai trò này được bảo vệ bằng PIN.${entryRole === 'operator' ? ' Quên PIN? <button class="btn-sm" data-action="pin-forgot" style="margin-left:6px">Báo Quản lý cấp lại PIN</button>' : ''}</p>` : '<p class="xs muted section">Chưa đặt PIN cho vai trò này – nên đặt trong Cài đặt để người học không vào nhầm.</p>'}`, {title: ROLE_NAMES[entryRole]});
});
// ---- forgotten operator PIN: the operator files a report from the sign-in screen; the manager sees it (with every PIN) on their pages ----
const pinReports = () => (S.pinReports = S.pinReports || []);
actions['pin-forgot'] = () => {
  const ops = S.users.filter(x => x.role === 'operator'); if (!ops.length) { toast('Chưa có tài khoản vận hành nào', 'err'); return; }
  openModal(`<h3>Quên PIN người vận hành</h3><p class="small muted">Yêu cầu được gửi tới Quản lý. Quản lý xem được PIN hiện tại và sẽ báo lại cho bạn (hoặc đổi PIN mới trong Cài đặt).</p>
    <label class="field"><span>Bạn là</span><select id="pf-user">${ops.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Ghi chú (tuỳ chọn – cách liên hệ với bạn)</span><input id="pf-note" placeholder="VD: nhắn qua Base @minh.tran"></label>
    <div class="row" style="justify-content:flex-end"><button data-action="modal-close">Huỷ</button><button class="btn-primary" data-action="pin-forgot-send">Gửi yêu cầu</button></div>`);
};
actions['pin-forgot-send'] = () => {
  const id = $('#pf-user').value; const x = userById(id); if (!x) return; const note = $('#pf-note').value.trim();
  const open = pinReports().find(r => r.userId === id && r.status === 'open');
  if (open) { open.at = new Date().toISOString(); open.count = (open.count || 1) + 1; if (note) open.note = note; }
  else pinReports().push({id: uid('pr'), userId: id, userName: x.name, role: x.role, note, at: new Date().toISOString(), status: 'open', count: 1});
  save(true); closeModal(); toast('Đã gửi yêu cầu tới Quản lý. Quản lý sẽ báo lại PIN cho bạn.', 'ok');
};
actions['pinrep-done'] = t => { const r = pinReports().find(x => x.id === t.dataset.id); if (!r || me()?.role !== 'manager') return; r.status = 'done'; r.doneAt = new Date().toISOString(); r.doneBy = me().id; save(true); render(); };
/** Manager only: open "forgot PIN" reports and every PIN in the system (role PINs from Settings, learner PINs). */
function pinCard(viewer) {
  if (viewer.role !== 'manager') return '';
  const open = pinReports().filter(r => r.status === 'open').sort((a, b) => b.at.localeCompare(a.at)); const done = pinReports().filter(r => r.status === 'done').sort((a, b) => b.doneAt.localeCompare(a.doneAt)).slice(0, 3);
  const s = S.settings; const learnersWithPin = learners().filter(x => x.pin);
  const row = r => `<div class="item" style="align-items:flex-start"><div class="body"><div class="title">${esc(r.userName)} <span class="badge">${ROLE_NAMES[r.role] || r.role}</span> ${r.status === 'open' ? '<span class="badge warn">chờ cấp lại</span>' : '<span class="badge ok">đã xử lý</span>'}${(r.count || 1) > 1 ? ` <span class="xs muted">· gửi ${r.count} lần</span>` : ''}</div><div class="xs muted">Gửi ${fmtDateTime(r.at)}${r.note ? ` · ${esc(r.note)}` : ''}${r.doneAt ? ` · xử lý ${fmtDateTime(r.doneAt)}` : ''}</div>${r.status === 'open' ? `<div class="small" style="margin-top:4px">PIN ${ROLE_NAMES[r.role]} hiện tại: <code>${esc((r.role === 'operator' ? s.pinOperator : s.pinManager) || '(chưa đặt)')}</code> – báo lại cho ${esc(r.userName.split(' ').pop())}, hoặc đổi PIN mới ở <a href="#/settings">Cài đặt</a>.</div>` : ''}</div>${r.status === 'open' ? `<button class="btn-sm btn-primary" data-action="pinrep-done" data-id="${r.id}">Đã báo lại</button>` : ''}</div>`;
  return `<div class="card" style="margin-bottom:12px;${open.length ? 'background:var(--warn-soft)' : ''}"><div class="row between"><h3>Mã PIN ${open.length ? `<span class="badge warn">${open.length} yêu cầu quên PIN</span>` : ''}</h3></div>
    ${open.length || done.length ? `<div class="list" style="margin:6px 0 10px">${[...open, ...done].map(row).join('')}</div>` : '<p class="xs muted" style="margin:2px 0 8px">Chưa có yêu cầu quên PIN nào. Người vận hành gửi yêu cầu từ màn đăng nhập.</p>'}
    <details><summary class="small">Tất cả mã PIN trong hệ thống (chỉ Quản lý xem được)</summary><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>PIN</th></tr></thead><tbody>
      <tr><td>Vai trò Vận hành (PIN chung)</td><td>${ROLE_NAMES.operator}</td><td><code>${esc(s.pinOperator || '')}</code>${s.pinOperator ? '' : '<span class="xs muted">chưa đặt</span>'}</td></tr>
      <tr><td>Vai trò Quản lý (PIN chung)</td><td>${ROLE_NAMES.manager}</td><td><code>${esc(s.pinManager || '')}</code>${s.pinManager ? '' : '<span class="xs muted">chưa đặt</span>'}</td></tr>
      ${learnersWithPin.map(x => `<tr><td>${esc(x.name)}</td><td>${ROLE_NAMES.learner}</td><td><code>${esc(x.pin)}</code></td></tr>`).join('')}
      ${learners().filter(x => !x.pin).length ? `<tr><td colspan="3" class="xs muted">${learners().filter(x => !x.pin).length} học viên chưa đặt PIN (đặt ở lần vào đầu tiên).</td></tr>` : ''}</tbody></table></div><p class="xs muted" style="margin:6px 0 0">PIN vai trò đổi ở Cài đặt; PIN học viên đặt lại ở Cài đặt → Người dùng.</p></details></div>`;
}
actions['entry-role'] = t => { entryRole = t.dataset.role; render(); };
actions['entry-back'] = () => { entryRole = null; render(); };
actions['learner-login'] = () => {
  const name = $('#li-name').value.trim(); const pin = $('#li-pin').value.trim();
  const warn = html => { const w = $('#li-warn'); if (w) { $('#li-warn-text').innerHTML = html; w.hidden = false; } };
  if (!name) { warn('<b>Chưa nhập họ tên.</b>'); return; }
  // the name must match exactly: same upper/lower case and same accents (only extra spaces are ignored)
  const exact = s => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const matches = learners().filter(x => exact(x.name) === exact(name));
  if (!matches.length) {
    const near = learners().some(x => normName(x.name) === normName(name));
    warn(near ? `<b>Họ tên chưa đúng chữ HOA/thường hoặc dấu.</b><br>Có tài khoản gần giống với "${esc(name)}", nhưng họ tên phải gõ y như lúc đăng ký: đúng chữ viết hoa, chữ thường và dấu tiếng Việt.` : `<b>Không tìm thấy học viên tên "${esc(name)}".</b><br>Kiểm tra lại họ tên (đủ các từ như lúc đăng ký). Lần đầu dùng thì bấm "Tôi là người mới".`); return;
  }
  if (!/^\d{4,6}$/.test(pin)) { warn('<b>Mã PIN học viên gồm 4–6 chữ số</b>, không có chữ cái hay khoảng trắng.'); return; }
  let u = matches.find(x => x.pin && x.pin === pin);
  if (!u) {
    if (matches.some(x => x.pin)) { warn('<b>Mã PIN không đúng.</b> PIN phải khớp từng ký tự. Quên PIN thì nhờ Người vận hành đặt lại (Cài đặt → Người dùng).'); return; }
    u = matches[0]; u.pin = pin; toast('Đã đặt PIN cho lần vào đầu tiên. Nhớ PIN này nhé!', 'ok');
  }
  setSessionUser(u.id); save(true); computeReminders(); go('#/');
};
actions['learner-register'] = () => {
  openModal(`<h3>Đăng ký người học mới</h3>
    <label class="field"><span>Họ tên</span><input id="rg-name" placeholder="VD: Nguyễn Thị Lan" value="${esc($('#li-name')?.value || '')}"></label>
    <div class="grid cols-2"><label class="field"><span>Mã PIN (4–6 số)</span><input id="rg-pin" type="password" inputmode="numeric"></label><label class="field"><span>Nhập lại PIN</span><input id="rg-pin2" type="password" inputmode="numeric"></label></div>
    <p class="xs muted">PIN chỉ để tránh vào nhầm tài khoản người khác trên máy dùng chung. Quên PIN thì nhờ người vận hành đặt lại.</p>
    <div class="row" style="justify-content:flex-end"><button data-action="modal-close">Huỷ</button><button class="btn-primary" data-action="learner-register-save">Tạo và vào học</button></div>`);
  setTimeout(() => $('#rg-name')?.focus(), 30);
};
actions['learner-register-save'] = () => {
  const name = $('#rg-name').value.trim(); const pin = $('#rg-pin').value.trim(); const pin2 = $('#rg-pin2').value.trim();
  if (!name) { toast('Nhập họ tên', 'err'); return; }
  if (!/^\d{4,6}$/.test(pin)) { toast('Mã PIN gồm 4–6 chữ số', 'err'); return; }
  if (pin !== pin2) { toast('Hai lần nhập PIN không khớp', 'err'); return; }
  if (learners().some(x => normName(x.name) === normName(name))) { toast('Tên này đã có. Nếu là bạn, hãy đăng nhập; nếu trùng tên, thêm bộ phận vào tên (VD: "Lan – Sales").', 'err'); return; }
  const u = {id: uid('u'), name, role: 'learner', pin, cefr: null, cefrSuggested: null, cefrApproved: false, sectionScores: null, monthlyGoal: '', createdAt: new Date().toISOString(), avatar: {color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)][0], acc: 'none', bg: Math.floor(Math.random() * AVATAR_BG.length)}};
  S.users.push(u); setSessionUser(u.id); save(true); closeModal(); toast('Chào mừng ' + name + '! Bấm vào avatar ở góc trên để chọn avatar của bạn.', 'ok'); go('#/');
};
actions.login = async t => {
  const u = userById(t.dataset.id); if (!u) return;
  const pin = u.role === 'operator' ? S.settings.pinOperator : u.role === 'manager' ? S.settings.pinManager : '';
  if (pin) { const v = await promptDlg(`Nhập PIN cho ${ROLE_NAMES[u.role]}`, {label: 'PIN – phân biệt chữ HOA/thường, kiểm tra Caps Lock trước khi gõ', type: 'password', okLabel: 'Vào'}); if (v === null) return; if (v !== pin) { toast('PIN không đúng. PIN phân biệt chữ HOA/thường – kiểm tra phím Caps Lock rồi nhập lại.', 'err'); return; } }
  setSessionUser(u.id); save(true); computeReminders(); go('#/');
};
actions['add-user'] = t => {
  const role = t.dataset.role || 'learner'; const opOnly = me()?.role === 'operator'; // an operator creates learners only
  openModal(`<h3>Thêm ${ROLE_NAMES[opOnly ? 'learner' : role].toLowerCase()}</h3>
    <label class="field"><span>Họ tên</span><input id="nu-name" placeholder="VD: Nguyễn Lan"></label>
    <label class="field"><span>Vai trò</span><select id="nu-role" ${opOnly ? 'disabled' : ''}>${Object.entries(ROLE_NAMES).filter(([k]) => !opOnly || k === 'learner').map(([k, v]) => `<option value="${k}" ${k === role ? 'selected' : ''}>${v}</option>`).join('')}</select>${opOnly ? '<span class="xs muted">Tài khoản Vận hành / Quản lý do Quản lý tạo</span>' : ''}</label>
    <div class="row" style="justify-content:flex-end"><button data-action="modal-close">Huỷ</button><button class="btn-primary" data-action="save-user">Tạo</button></div>`);
  setTimeout(() => $('#nu-name')?.focus(), 30);
};
actions['save-user'] = () => {
  const name = $('#nu-name').value.trim(); const role = me()?.role === 'operator' ? 'learner' : $('#nu-role').value;
  if (!name) { toast('Nhập họ tên', 'err'); return; }
  const u = {id: uid('u'), name, role, cefr: null, cefrSuggested: null, cefrApproved: false, sectionScores: null, monthlyGoal: '', createdAt: new Date().toISOString()};
  S.users.push(u); save(true); closeModal(); toast('Đã tạo ' + name, 'ok'); render();
};
actions['import-file'] = t => { if (t.files[0]) importJSON(t.files[0]); };
actions['seed-demo'] = async () => { if (S.users.length && !(await confirmDlg('Nạp dữ liệu mẫu sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại. Tiếp tục?', {danger: true, okLabel: 'Ghi đè'}))) return; seedDemo(); entryRole = null; toast('Đã nạp dữ liệu mẫu. PIN của mọi học viên mẫu là 1234.', 'ok'); go('#/'); };

// ---------- screen: settings (operator / manager) ----------
route('#/settings', () => {
  const u = me(); if (u.role === 'learner') { go('#/home'); return; }
  const s = S.settings;
  shell(`
    <div class="page-title"><h1>Cài đặt</h1></div>
    <div class="card"><h3>Kết nối AI</h3>
      <p class="small muted">Key chỉ lưu trên trình duyệt này và gửi thẳng tới nhà cung cấp khi sinh bài, chấm bài, chat coach.</p>
      <label class="field"><span>Nhà cung cấp</span><select id="st-provider" data-change="st-provider">
        <option value="claude" ${(s.provider || 'claude') === 'claude' ? 'selected' : ''}>Claude (Anthropic)</option>
        <option value="gemini" ${s.provider === 'gemini' ? 'selected' : ''}>Google Gemini (có gói miễn phí)</option>
        <option value="openai" ${s.provider === 'openai' ? 'selected' : ''}>OpenAI-compatible: Groq / OpenRouter / Ollama… (miễn phí)</option></select></label>
      <div id="st-openai" ${s.provider === 'openai' ? '' : 'hidden'}>
        <label class="field"><span>Dịch vụ</span><select id="st-oai-preset" data-change="st-oai-preset">${Object.entries(OAI_PRESETS).map(([k, p]) => `<option value="${k}" ${(p.base && p.base === s.oaiBase) || (k === 'custom' && !Object.values(OAI_PRESETS).some(x => x.base && x.base === s.oaiBase)) ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label>
        <p class="xs muted" id="st-oai-hint">Groq: đăng ký miễn phí bằng Google/GitHub, không cần thẻ, tạo key tại <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>. OpenRouter: chọn model có đuôi <code>:free</code>. Ollama: cài ollama.com, chạy <code>ollama pull llama3.1</code>, không cần key.</p>
        <label class="field"><span>Base URL</span><input id="st-oai-base" value="${esc(s.oaiBase || '')}" placeholder="https://api.groq.com/openai/v1"></label>
        <div class="grid cols-2"><label class="field"><span>API key (Ollama để trống)</span><input id="st-oai-key" type="password" value="${esc(s.oaiKey || '')}" autocomplete="off"></label>
        <label class="field"><span>Tên model (gõ tự do, theo danh sách của dịch vụ)</span><input id="st-oai-model" value="${esc(s.oaiModel || '')}" placeholder="llama-3.3-70b-versatile"></label></div>
        <label class="field"><span>Model chép lời file ghi âm (endpoint /audio/transcriptions; Groq: whisper-large-v3-turbo)</span><input id="st-stt-model" value="${esc(s.sttModel || 'whisper-large-v3-turbo')}" style="max-width:360px"></label>
        <p class="xs muted">Model nhỏ (dưới 30B) hay trả JSON lỗi khi sinh bài; nên dùng bản 70B trở lên. Gói miễn phí giới hạn request/phút nên sinh bài từng mức một.</p>
      </div>
      <div id="st-claude" ${s.provider === 'gemini' ? 'hidden' : ''}>
        <p class="xs muted">Lấy key tại <a href="https://platform.claude.com/" target="_blank" rel="noopener">platform.claude.com</a> (cần nạp credit).</p>
        <label class="field"><span>Claude API key</span><input id="st-key" type="password" value="${esc(s.apiKey)}" placeholder="sk-ant-..." autocomplete="off"></label>
        <label class="field"><span>Tên model (gõ tự do hoặc chọn gợi ý)</span><input id="st-model" list="cmodels" value="${esc(s.model || 'claude-opus-5-5')}" placeholder="claude-opus-5-5"><datalist id="cmodels"><option value="claude-opus-5-5">chất lượng cao – mặc định</option><option value="claude-sonnet-5-5">nhanh, rẻ hơn</option><option value="claude-haiku-4-5">rẻ nhất</option><option value="claude-fable-5-1">mạnh nhất, đắt nhất</option></datalist></label>
      </div>
      <div id="st-gemini" ${s.provider === 'gemini' ? '' : 'hidden'}>
        <p class="xs muted">Lấy key miễn phí tại <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Gói miễn phí giới hạn số request/phút và /ngày; dữ liệu bài làm có thể được Google dùng để cải thiện sản phẩm – chỉ nên dùng để chạy thử.</p>
        <label class="field"><span>Gemini API key</span><input id="st-gkey" type="password" value="${esc(s.geminiKey || '')}" placeholder="AIza..." autocomplete="off"></label>
        <label class="field"><span>Tên model (gõ tự do hoặc chọn gợi ý)</span><input id="st-gmodel" list="gmodels" value="${esc(s.geminiModel || 'gemini-3.8-flash')}" placeholder="gemini-3.8-flash"><datalist id="gmodels"><option value="gemini-3.8-flash"><option value="gemini-2.5-flash"><option value="gemini-2.5-flash-lite"><option value="gemini-2.5-pro"></datalist></label>
      </div>
      <div class="row"><button class="btn-primary" data-action="st-save">Lưu</button><button data-action="st-test-ai">Kiểm tra kết nối</button><span id="st-ai-status" class="small muted"></span></div>
      <p class="xs muted" style="margin:8px 0 0">Đang dùng: <b>${esc(ai.providerLabel())}</b> · model <code>${esc(ai.modelName())}</code>${ai.hasKey() ? '' : ' · <span class="badge warn">chưa có key</span>'}</p>
    </div>
    <div class="card"><h3>Lịch pilot</h3>
      <div class="grid cols-3">
        <label class="field"><span>Ngày bắt đầu (Thứ Hai tuần 1)</span><input id="st-start" type="date" value="${esc(s.pilotStartDate)}"></label>
        <label class="field"><span>Số tuần</span><select id="st-weeks">${[2, 3, 4].map(n => `<option ${s.pilotWeeks === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>Ép tuần hiện tại (0 = tự tính)</span><input id="st-override" type="number" min="0" max="4" value="${s.weekOverride || 0}"></label>
      </div>
      <label class="field"><span>Khuyến nghị học tối thiểu (phút/ngày)</span><input id="st-min" type="number" min="5" max="60" value="${s.minMinutesPerDay}"></label>
      <label class="field"><span>Chủ đề lớn của khoá (hiện ở Trang chủ học viên, phía trên chủ đề tuần)</span><input id="st-theme" value="${esc(s.courseTheme || '')}" placeholder="Tiếng Anh giao tiếp công sở"></label>
      <label class="field"><span>Giới hạn chat với Season (lượt/ngày cho mỗi học viên)</span><input id="st-chatcap" type="number" min="1" max="200" value="${clamp(+s.coachDailyLimit || 20, 1, 200)}" style="max-width:120px"></label>
      <p class="xs muted">Tuần hiện tại theo cấu hình: <b>Tuần ${currentWeek()}</b> (${fmtDate(weekStart(currentWeek()))} → ${fmtDate(addDays(weekStart(currentWeek()), 6))}).</p>
      <button class="btn-primary" data-action="st-save">Lưu</button>
    </div>
    <div class="card"><h3>Ảnh minh hoạ từ vựng</h3>
      <p class="small muted">Ảnh lấy từ kho ảnh miễn phí theo từ tiếng Anh, không qua AI. Pexels/Pixabay cho ảnh đúng nghĩa nhất nhưng cần key miễn phí (đăng ký tại <a href="https://www.pexels.com/api/" target="_blank" rel="noopener">pexels.com/api</a> hoặc <a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener">pixabay.com/api/docs</a>). Openverse và Wikimedia không cần key. Nguồn nào không có ảnh sẽ rơi về Wikimedia.</p>
      <label class="field"><span>Nguồn ảnh</span><select id="st-img">${Object.entries(IMG_SOURCES).map(([k, v]) => `<option value="${k}" ${(s.imgSource || 'wikimedia') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="grid cols-2"><label class="field"><span>Pexels API key</span><input id="st-pexels" type="password" value="${esc(s.pexelsKey || '')}" autocomplete="off"></label><label class="field"><span>Pixabay API key</span><input id="st-pixabay" type="password" value="${esc(s.pixabayKey || '')}" autocomplete="off"></label></div>
      <div class="row"><button class="btn-primary" data-action="st-save">Lưu</button><button data-action="st-img-test">Thử ảnh cho "notebook"</button><button class="btn-ghost" data-action="st-img-clear">Xoá cache ảnh</button><span id="st-img-status" class="small muted"></span></div>
    </div>
    <div class="card"><h3>Bài test đầu vào / cuối kỳ</h3>
      <p class="small muted">Đề "Workplace English CEFR Placement Test (Refined)": Nghe 20 · Đọc, Ngữ pháp &amp; Từ vựng 40 · Viết 20 (2 task) · Nói 20 (4 task) = 100 điểm. Thời gian tính riêng từng phần; hết giờ tự chuyển phần và tự nộp. Rời khỏi màn hình bài thi sẽ bị cảnh báo; quá số lần cho phép thì tự nộp.</p>
      <label class="check" style="margin-bottom:10px"><input type="checkbox" id="st-timed" ${s.testTimed !== false ? 'checked' : ''}> Bật tính giờ</label>
      <div class="grid cols-4">${SECTIONS.map(k => `<label class="field"><span>${SECTION_NAMES[k]} (phút)</span><input id="st-time-${k}" type="number" min="1" max="60" value="${(s.testTimes || {})[k] || {listening: 15, reading: 20, writing: 20, speaking: 15}[k]}"></label>`).join('')}</div>
      <label class="field"><span>Số lần cảnh báo (kèm âm thanh) khi rời màn hình; vi phạm lần kế tiếp thì tự nộp</span><input id="st-warn" type="number" min="1" max="10" value="${s.testWarnLimit || 3}" style="max-width:120px"></label>
      <button class="btn-primary" data-action="st-save">Lưu</button>
    </div>
    <div class="card"><h3>Ngưỡng xét lên / hạ mức</h3>
      <p class="small muted">Tính trên số ngày gần nhất. "Sẵn sàng thi lên level" khi đủ cả 4 ngưỡng đầu (C1 không xét). "Nên xem xét hạ mức" khi hai tuần liền có tỉ lệ phần bài sai (hết ${MAX_ATTEMPTS} lần vẫn sai) vượt ngưỡng (A1 không xét).</p>
      ${(() => { const c = levelUpCfg(); const f = (k, lbl, max) => `<label class="field"><span>${lbl}</span><input id="st-lu-${k}" type="number" min="${k === 'coach' ? 0 : 1}" max="${max}" step="${k === 'coach' ? 0.5 : 1}" value="${c[k]}"></label>`;
        return `<div class="grid cols-4">${f('days', 'Số ngày xét', 60)}${f('lessons', 'Bài học hoàn thành ≥ (%)', 100)}${f('firstTry', 'Đúng ngay lần đầu ≥ (%)', 100)}${f('submission', 'Bài thực hành gần nhất ≥ (/100)', 100)}${f('coach', 'Rubric Season trung bình ≥ (/5)', 5)}${f('coachTurns', 'Số lượt chat tối thiểu', 100)}${f('wrong', 'Hạ mức: tỉ lệ sai > (%)', 100)}${f('minParts', 'Hạ mức: số phần tối thiểu/tuần', 50)}</div>`; })()}
      <button class="btn-primary" data-action="st-save">Lưu</button>
    </div>
    <div class="card"><h3>Giao diện theo mùa / lễ</h3>
      <p class="small muted">Chỉ bảng màu và icon chính thay đổi; bố cục, nội dung và dữ liệu giữ nguyên. Ở chế độ tự động, app chọn theo ngày: Tết (7 ngày trước – 10 ngày sau), Trung thu (±5 ngày), Giáng sinh – Năm mới (15/12 – 2/1), còn lại theo mùa (xuân 2–4, hạ 5–7, thu 8–10, đông 11–1).</p>
      <label class="field"><span>Chủ đề giao diện (áp dụng ngay khi chọn)</span><select id="st-skin" data-change="st-skin" style="max-width:320px"><option value="auto" ${!s.theme || s.theme === 'auto' ? 'selected' : ''}>Tự động theo ngày (hiện là ${THEMES[autoTheme()].name})</option>${Object.entries(THEMES).map(([k, v]) => `<option value="${k}" ${s.theme === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
      <div class="row" style="gap:10px">${Object.entries(THEMES).map(([k, v]) => `<span class="badge" title="${v.name}" style="gap:6px">${themeMark(16, k)} ${v.name}</span>`).join('')}</div>
    </div>
    ${(() => { const b = audio.cfg(); return `<div class="card"><h3>Nhạc nền của Season</h3>
      <p class="small muted">Nhạc phát qua trình phát YouTube ẩn (cần mạng; chỉ dùng nhạc không bản quyền). Dán link video hoặc playlist YouTube; để trống = playlist mặc định. Mỗi người vẫn tự bật / tắt nhạc bằng nút ♫ trên thanh đầu trang; nhạc tự tắt khi làm phần Nghe và khi có giọng đọc.</p>
      <label class="check" style="margin-bottom:10px"><input type="checkbox" id="st-bgm-on" ${b.enabled ? 'checked' : ''}> Cho phép nhạc nền trong app</label>
      <label class="field"><span>Link YouTube (video hoặc playlist)</span><input id="st-bgm-url" value="${esc(b.url)}" placeholder="https://www.youtube.com/watch?v=…&list=…"></label>
      <p class="xs muted" id="st-bgm-ids">${b.url ? (b.list ? `Playlist: <code>${esc(b.list)}</code>` : '') + (b.video ? ` Video: <code>${esc(b.video)}</code>` : '') + (!b.list && !b.video ? '<span class="badge danger">Link không nhận ra – sẽ dùng playlist mặc định</span>' : '') : `Đang dùng playlist mặc định <code>${audio.YT_LIST}</code>.`}</p>
      <label class="field"><span>Âm lượng: <b id="st-bgm-vol-v">${b.volume}</b>/100</span><input id="st-bgm-vol" type="range" min="0" max="100" value="${b.volume}" style="max-width:320px" data-change="st-bgm-vol"></label>
      <div class="row"><button class="btn-primary" data-action="st-save">Lưu</button><button data-action="st-bgm-test">Lưu &amp; nghe thử</button><button class="btn-ghost" data-action="st-bgm-reset">Về nhạc mặc định</button><span id="st-bgm-status" class="small muted"></span></div>
    </div>`; })()}
    <div class="card"><h3>Nhắc học qua Base.vn (Base Message incoming webhook)</h3>
      <p class="small muted">Trong Base Message: mở nhóm chat → menu <b>"..."</b> → <b>Tích hợp incoming webhook</b> → copy URL và dán vào đây. Tin nhắn gửi với trường <code>base_content</code>. Có thể đổi mẫu payload bên dưới (dùng <code>{message}</code> và <code>{name}</code>).</p>
      <label class="field"><span>Webhook URL</span><input id="st-wh" value="${esc(s.webhookUrl)}" placeholder="https://..."></label>
      <label class="field"><span>Mẫu payload (JSON)</span><textarea id="st-wht" style="min-height:60px">${esc(s.webhookTemplate)}</textarea></label>
      <p class="xs muted">Lưu ý: gửi từ file HTML chạy local nên trình duyệt không đọc được phản hồi của Base (CORS). App đánh dấu "đã gửi" khi request đi được; hãy kiểm tra trong nhóm chat lần đầu.</p>
      <div class="row"><button class="btn-primary" data-action="st-save">Lưu</button><button data-action="st-test-wh">Gửi tin thử</button></div>
    </div>
    <div class="card"><h3>Bảo vệ vai trò (PIN tuỳ chọn)</h3>
      <div class="grid cols-2">
        <label class="field"><span>PIN người vận hành</span><input id="st-pin-op" value="${esc(s.pinOperator)}" placeholder="để trống = không hỏi"></label>
        <label class="field"><span>PIN quản lý</span><input id="st-pin-mgr" value="${esc(s.pinManager)}" placeholder="để trống = không hỏi"></label>
      </div>
      <button class="btn-primary" data-action="st-save">Lưu</button>
    </div>
    ${u.role === 'operator' ? `<div class="card"><h3>Prompt & rubric</h3><p class="small muted">Sửa hướng dẫn hệ thống cho AI sinh bài, coach, chấm bài. Để trống = dùng mặc định.</p><a class="btn" href="#/op/prompts">Mở trình sửa prompt</a></div>` : ''}
    <div class="card"><h3>Dữ liệu</h3>
      <p class="small muted">Toàn bộ dữ liệu (hồ sơ, bài học, tiến độ) lưu trong trình duyệt này. Xuất file để sao lưu hoặc chuyển máy.</p>
      <div class="row"><button data-action="export-json">Xuất JSON</button><label class="btn">Nhập JSON<input type="file" accept=".json" hidden data-change="import-file"></label><button data-action="export-csv">Xuất CSV tiến độ</button><button data-action="seed-demo">Nạp dữ liệu mẫu</button><button class="btn-danger" data-action="wipe">Xoá toàn bộ</button></div>
    </div>
    <div class="card"><h3>Người dùng</h3>
      <div class="table-wrap"><table><thead><tr><th>Tên</th><th>Vai trò</th><th>Mức</th><th></th></tr></thead><tbody>
      ${u.role === 'operator' ? '<p class="xs muted" style="margin:0 0 8px">Người vận hành chỉ quản lý và đổi tên <b>học viên</b> (và tên/avatar của chính mình). Đổi vai trò, quản lý Vận hành khác và tài khoản Quản lý là việc của Quản lý.</p>' : ''}
      ${S.users.map(x => { const can = canManage(u, x); return `<tr><td><span class="row" style="gap:8px;flex-wrap:nowrap">${can ? `<button class="btn-ghost" data-action="avatar-pick" data-id="${x.id}" title="Đổi avatar" style="padding:0;border:0;background:transparent">${userAvatar(x, 30)}</button>` : userAvatar(x, 30)}<span>${esc(x.name)}${x.id === u.id ? ' <span class="xs muted">(bạn)</span>' : ''}${x.role === 'learner' ? `<br><span class="xs muted">PIN: ${x.pin ? (pinShown.has(x.id) ? `<b style="font-size:.95rem;letter-spacing:.12em;color:var(--text)">${esc(x.pin)}</b>` : '••••') : 'chưa đặt (đặt ở lần vào đầu)'}</span>${x.pin ? ` <button class="btn-sm" data-action="show-pin" data-id="${x.id}" style="padding:1px 8px;font-size:.72rem;box-shadow:none">${pinShown.has(x.id) ? 'Ẩn PIN' : 'Show PIN'}</button>` : ''}` : ''}</span></span></td><td>${u.role === 'manager' ? `<select class="btn-sm" data-change="set-role" data-id="${x.id}" style="width:auto;padding:4px 8px">${Object.entries(ROLE_NAMES).map(([k, v]) => `<option value="${k}" ${x.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select>` : `<span class="badge" title="Chỉ Quản lý đổi được vai trò">${ROLE_NAMES[x.role]}</span>`}</td><td>${x.role === 'learner' ? (x.cefr ? `${lvlChip(x.cefr)}${x.cefrApproved ? '' : ' <span class="xs muted">(chưa duyệt)</span>'}` : '—') : ''}</td><td class="row" style="flex-wrap:nowrap">${can ? `<button class="btn-sm" data-action="rename-user" data-id="${x.id}">Đổi tên</button>` : ''}${x.role === 'learner' ? `<button class="btn-sm" data-action="reset-pin" data-id="${x.id}" title="Xoá PIN; người học đặt PIN mới ở lần vào tiếp theo">Đặt lại PIN</button>` : ''}${u.role === 'operator' ? (x.role === 'learner' ? `<button class="btn-sm btn-danger" data-action="del-user" data-id="${x.id}">Yêu cầu xoá</button>` : `<span class="xs muted" title="Người vận hành không quản lý tài khoản Vận hành / Quản lý">${x.id === u.id ? 'chỉ đổi tên' : 'chỉ Quản lý'}</span>`) : `<button class="btn-sm btn-danger" data-action="del-user" data-id="${x.id}">Xoá</button>`}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:10px"><button data-action="add-user" data-role="learner">+ Thêm ${u.role === 'operator' ? 'học viên' : 'người dùng'}</button></div>
    </div>`, {title: 'Cài đặt'});
});
function readAiSettings() { const s = S.settings; s.provider = $('#st-provider').value; s.apiKey = $('#st-key').value.trim(); s.model = $('#st-model').value.trim() || 'claude-opus-5-5'; s.geminiKey = $('#st-gkey').value.trim(); s.geminiModel = $('#st-gmodel').value.trim() || 'gemini-3.8-flash'; s.oaiBase = $('#st-oai-base').value.trim(); s.oaiKey = $('#st-oai-key').value.trim(); s.oaiModel = $('#st-oai-model').value.trim(); s.sttModel = $('#st-stt-model').value.trim() || 'whisper-large-v3-turbo'; }
actions['st-provider'] = t => { $('#st-claude').hidden = t.value !== 'claude'; $('#st-gemini').hidden = t.value !== 'gemini'; $('#st-openai').hidden = t.value !== 'openai'; };
actions['st-oai-preset'] = t => { const p = OAI_PRESETS[t.value]; if (p && p.base) { $('#st-oai-base').value = p.base; $('#st-oai-model').value = p.model; } };
/** Music settings (operator / manager): link, volume, on/off for the whole app. Changing them reloads the hidden player on this device at once. */
function readBgmSettings() { const s = S.settings; const before = JSON.stringify(s.bgm || {}); s.bgm = {enabled: $('#st-bgm-on').checked, url: $('#st-bgm-url').value.trim(), volume: clamp(+$('#st-bgm-vol').value || 0, 0, 100)}; if (JSON.stringify(s.bgm) !== before) { const old = JSON.parse(before); if (old.url !== s.bgm.url || old.enabled !== s.bgm.enabled) audio.reload(); else if (audio.yt.player && audio.yt.ready) { try { audio.yt.player.setVolume(s.bgm.volume); } catch {} } audio.sync(); } }
actions['st-bgm-vol'] = t => { const v = $('#st-bgm-vol-v'); if (v) v.textContent = t.value; if (audio.yt.player && audio.yt.ready) { try { audio.yt.player.setVolume(+t.value); } catch {} } }; // live preview while dragging
actions['st-bgm-test'] = () => { readBgmSettings(); save(true); const c = audio.cfg(); const st = $('#st-bgm-status'); if (!c.enabled) { st.textContent = 'Nhạc đang bị tắt cho cả app – bật ô trên để nghe.'; return; } audio.st.bgm = true; audio.st.mute = false; audio.arm(); audio.reload(); audio.sync(); st.innerHTML = `<span class="spinner"></span> Đang tải nhạc${c.list ? ' (playlist ' + esc(c.list) + ')' : c.video ? ' (video ' + esc(c.video) + ')' : ''}…`; setTimeout(() => { if (!st.isConnected) return; st.textContent = audio.yt.ready ? '♫ Đang phát. Mỗi người có thể tắt bằng nút ♫ trên thanh đầu trang.' : audio.yt.failed ? '✗ Không phát được link này (YouTube chặn nhúng, sai link hoặc không có mạng) – đang dùng tiếng nền thay thế.' : 'Đang tải… nếu không có tiếng sau vài giây, kiểm tra lại link.'; }, 4000); };
actions['st-bgm-reset'] = () => { $('#st-bgm-url').value = ''; $('#st-bgm-vol').value = audio.YT_VOLUME; $('#st-bgm-on').checked = true; readBgmSettings(); save(true); toast('Đã về nhạc mặc định', 'ok'); render(); };
actions['st-skin'] = t => { S.settings.theme = t.value || 'auto'; save(true); applyTheme(); toast(`Giao diện: ${S.settings.theme === 'auto' ? 'tự động (' + THEMES[autoTheme()].name + ')' : THEMES[S.settings.theme].name}`, 'ok'); const y = window.scrollY; render(); window.scrollTo(0, y); }; // applies at once, no Save needed
actions['st-save'] = () => {
  const s = S.settings;
  readAiSettings();
  s.pilotStartDate = $('#st-start').value || s.pilotStartDate; s.pilotWeeks = +$('#st-weeks').value; s.weekOverride = +$('#st-override').value || 0;
  s.minMinutesPerDay = +$('#st-min').value || 15; s.coachDailyLimit = clamp(+$('#st-chatcap').value || 20, 1, 200); s.courseTheme = $('#st-theme').value.trim(); s.theme = $('#st-skin')?.value || 'auto';
  s.imgSource = $('#st-img').value; s.pexelsKey = $('#st-pexels').value.trim(); s.pixabayKey = $('#st-pixabay').value.trim();
  s.testTimed = $('#st-timed').checked; s.testTimes = Object.fromEntries(SECTIONS.map(k => [k, clamp(+$('#st-time-' + k).value || 15, 1, 60)])); s.testWarnLimit = clamp(+$('#st-warn').value || 3, 1, 10);
  s.levelUp = Object.fromEntries(Object.keys(LEVELUP_DEFAULTS).map(k => { const v = parseFloat($('#st-lu-' + k).value); return [k, Number.isFinite(v) ? v : LEVELUP_DEFAULTS[k]]; }));
  readBgmSettings();
  s.webhookUrl = $('#st-wh').value.trim(); s.webhookTemplate = $('#st-wht').value.trim() || '{"base_content":"{message}"}';
  s.pinOperator = $('#st-pin-op').value.trim(); s.pinManager = $('#st-pin-mgr').value.trim();
  save(true); toast('Đã lưu cài đặt', 'ok'); render();
};
actions['st-test-ai'] = async t => {
  const st = $('#st-ai-status'); readAiSettings(); save(true);
  st.innerHTML = '<span class="spinner"></span> Đang kiểm tra…';
  try { const r = await ai.call({system: 'Reply with exactly: OK', user: 'ping', maxTokens: 2000}); st.textContent = '✓ Kết nối thành công (' + (r.model || ai.modelName()) + ')'; }
  catch (e) { st.textContent = '✗ ' + e.message; }
};
actions['st-img-clear'] = () => { let n = 0; Object.keys(localStorage).filter(k => k.startsWith(IMG_CACHE_KEY)).forEach(k => { localStorage.removeItem(k); n++; }); toast(`Đã xoá ${n} ảnh trong cache`, 'ok'); };
actions['st-img-test'] = async () => {
  const s = S.settings; s.imgSource = $('#st-img').value; s.pexelsKey = $('#st-pexels').value.trim(); s.pixabayKey = $('#st-pixabay').value.trim(); save(true);
  const st = $('#st-img-status'); st.innerHTML = '<span class="spinner"></span> Đang tìm…';
  try { localStorage.removeItem(IMG_CACHE_KEY + (s.imgSource || 'wikimedia') + ':notebook'); } catch {}
  const url = await vocabImage('notebook');
  st.innerHTML = url ? `✓ <img src="${esc(url)}" class="vimg" style="width:44px;height:44px;vertical-align:middle"> ${esc(IMG_SOURCES[s.imgSource || 'wikimedia'].split(' (')[0])}` : '✗ Không lấy được ảnh (kiểm tra key hoặc nguồn).';
};
actions['st-test-wh'] = async () => { try { S.settings.webhookUrl = $('#st-wh').value.trim(); S.settings.webhookTemplate = $('#st-wht').value.trim(); save(true); await sendWebhook('Tin nhắn thử từ Season English – ' + new Date().toLocaleString('vi-VN'), me()); toast('Đã gửi request. Kiểm tra nhóm chat Base.', 'ok'); } catch (e) { toast(e.message, 'err'); } };
actions['export-json'] = () => exportJSON();
actions['wipe'] = async () => { if (await confirmDlg('Xoá TOÀN BỘ dữ liệu trên trình duyệt này? Không thể khôi phục nếu chưa xuất JSON.', {danger: true, okLabel: 'Xoá hết'})) { localStorage.removeItem(KEY); S = defaultState(); go('#/'); } };
/** What `actor` may do with account `u`: a manager manages everyone; an operator only learners, plus their own name and avatar. Roles are changed by managers only. */
function canManage(actor, u) { if (!actor || !u) return false; if (actor.role === 'manager') return true; return actor.role === 'operator' && (u.role === 'learner' || u.id === actor.id); }
actions['set-role'] = t => {
  const u = userById(t.dataset.id); if (!u) return;
  if (me().role !== 'manager') { toast('Chỉ Quản lý mới đổi được vai trò tài khoản', 'err'); render(); return; }
  if (u.id === me().id && t.value !== 'manager') { toast('Bạn không tự hạ vai trò của tài khoản đang đăng nhập được', 'err'); render(); return; }
  u.role = t.value; save(true); toast('Đã đổi vai trò', 'ok'); render();
};
const pinShown = new Set(); // learner PINs revealed on this screen (operator and manager may look them up)
actions['show-pin'] = t => { const id = t.dataset.id; if (pinShown.has(id)) pinShown.delete(id); else pinShown.add(id); const y = window.scrollY; render(); window.scrollTo(0, y); };
actions['reset-pin'] = async t => { const u = userById(t.dataset.id); if (!u || u.role !== 'learner' || !isStaff(me())) return; if (await confirmDlg(`Đặt lại PIN của ${u.name}? Người học sẽ tự đặt PIN mới ở lần vào tiếp theo.`, {okLabel: 'Đặt lại PIN', countdown: true})) { u.pin = ''; save(true); toast('Đã xoá PIN', 'ok'); render(); } };
actions['rename-user'] = async t => { const u = userById(t.dataset.id); if (!u) return; if (!canManage(me(), u)) { toast('Người vận hành chỉ đổi tên được học viên (và tên của mình)', 'err'); return; } const v = await promptDlg('Đổi tên', {label: 'Họ tên', value: u.name}); if (v && v.trim()) { u.name = v.trim(); save(true); render(); } };
const USER_DATA_KEYS = ['progress', 'activity', 'coachSessions', 'submissions', 'tests', 'surveys', 'reminders', 'microLessons', 'appeals', 'levelRequests', 'gameSets', 'gameResults', 'topicReports'];
/** Deleting an account moves it, with all of its data, to S.trash. A manager can restore it; it is gone for good only after "Xoá vĩnh viễn". */
function deleteUser(u, actor, reqId) {
  const data = {}; USER_DATA_KEYS.forEach(k => { data[k] = (S[k] || []).filter(x => x.userId === u.id); S[k] = (S[k] || []).filter(x => x.userId !== u.id); });
  const pick = (obj, test) => { const out = {}; Object.keys(obj || {}).forEach(k => { if (test(k)) { out[k] = obj[k]; delete obj[k]; } }); return out; };
  const practiceResults = pick(S.practiceResults, k => k.startsWith(u.id + '_')), testDrafts = pick(S.testDrafts, k => k.startsWith(u.id + ':'));
  S.users = S.users.filter(x => x.id !== u.id);
  (S.trash = S.trash || []).push({id: uid('tr'), user: u, data, practiceResults, testDrafts, deletedAt: new Date().toISOString(), deletedBy: actor?.id || null, deletedByName: actor?.name || '', reqId: reqId || null});
  if (S.session.userId === u.id) S.session.userId = null;
}
function restoreUser(t) {
  const u = t.user; if (S.users.some(x => x.id === u.id)) return false;
  if (u.role === 'learner' && learners().some(x => normName(x.name) === normName(u.name))) u.name += ' (khôi phục)'; // the name was taken while the account was in the trash
  S.users.push(u); USER_DATA_KEYS.forEach(k => { S[k] = [...(S[k] || []), ...((t.data || {})[k] || [])]; });
  S.practiceResults = {...(S.practiceResults || {}), ...(t.practiceResults || {})}; S.testDrafts = {...(S.testDrafts || {}), ...(t.testDrafts || {})};
  S.trash = (S.trash || []).filter(x => x.id !== t.id); return true;
}
/** Approved deletion requests whose account can no longer be restored: deleted before the trash existed, or already purged. They are listed too, so the list of approved deletions is complete. */
const goneRequests = () => delReqs().filter(r => r.status === 'approved' && !r.cleared && !userById(r.userId) && !(S.trash || []).some(t => t.user.id === r.userId));
actions['trash-restore'] = async t => {
  const it = (S.trash || []).find(x => x.id === t.dataset.id);
  if (me().role !== 'manager') { toast('Chỉ Quản lý khôi phục được tài khoản đã xoá', 'err'); return; }
  if (!it) { toast('Tài khoản này không còn trong danh sách đã xoá', 'err'); render(); return; }
  if (!(await confirmDlg(`Khôi phục tài khoản ${it.user.name} cùng toàn bộ dữ liệu học?`, {okLabel: 'Khôi phục'}))) return;
  const name0 = it.user.name;
  if (restoreUser(it)) { delReqs().forEach(r => { if (r.userId === it.user.id && r.status === 'approved') { r.status = 'restored'; r.restoredAt = new Date().toISOString(); } }); save(true); toast(`Đã khôi phục ${it.user.name}${it.user.name !== name0 ? ' (đổi tên vì trùng với tài khoản khác)' : ''}`, 'ok'); }
  else { S.trash = (S.trash || []).filter(x => x.id !== it.id); save(true); toast('Tài khoản này đang hoạt động sẵn rồi nên không cần khôi phục; đã bỏ khỏi danh sách.', ''); }
  render();
};
actions['trash-purge'] = async () => {
  if (me().role !== 'manager') { toast('Chỉ Quản lý xoá vĩnh viễn được', 'err'); return; }
  const n = (S.trash || []).length, g = goneRequests().length; if (!n && !g) { toast('Danh sách đã xoá đang trống', ''); return; }
  if (!(await confirmDlg(n ? `Xoá VĨNH VIỄN ${n} tài khoản trong danh sách đã xoá?\nToàn bộ dữ liệu học của các tài khoản này sẽ mất hẳn, không còn cách khôi phục.` : `Dọn ${g} dòng tài khoản đã xoá hẳn từ trước khỏi danh sách?\nCác tài khoản này không còn dữ liệu; thao tác chỉ xoá dòng ghi nhận.`, {danger: true, okLabel: n ? `Xoá vĩnh viễn ${n} tài khoản` : `Dọn ${g} dòng`}))) return;
  S.trash = []; delReqs().forEach(r => { if (r.status === 'approved' && !userById(r.userId)) r.cleared = true; }); save(true); toast(n ? 'Đã xoá vĩnh viễn' : 'Đã dọn danh sách', 'ok'); render();
};
/** Accounts whose deletion was approved. Manager: restore one, or purge all. Operator: read-only. */
function trashCard(viewer) {
  const list = (S.trash || []).slice().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)); const gone = goneRequests(); if (!list.length && !gone.length) return '';
  const mgr = viewer.role === 'manager'; const size = it => USER_DATA_KEYS.reduce((n, k) => n + ((it.data || {})[k] || []).length, 0) + Object.keys(it.practiceResults || {}).length;
  return `<div class="card" style="margin-bottom:12px"><div class="row between"><h3>Tài khoản đã duyệt xoá <span class="badge">${list.length + gone.length}</span></h3>${mgr ? `<button class="btn-sm btn-danger" data-action="trash-purge">${list.length ? 'Xoá vĩnh viễn (All)' : 'Dọn danh sách (All)'}</button>` : ''}</div>
    <p class="xs muted" style="margin:2px 0 8px">Tài khoản đã xoá nằm ở đây cùng dữ liệu học và không đăng nhập được. ${mgr ? 'Khôi phục từng tài khoản, hoặc xoá vĩnh viễn toàn bộ danh sách.' : 'Chỉ Quản lý khôi phục hoặc xoá vĩnh viễn được; bạn đang xem ở vai trò Người vận hành nên không có nút thao tác.'}</p>
    <div class="list">${list.map(it => `<div class="item"><div class="body"><div class="title">${esc(it.user.name)} <span class="badge">${ROLE_NAMES[it.user.role]}</span>${it.user.cefr ? ' ' + lvlChip(it.user.cefr) : ''}</div><div class="xs muted">Xoá ${fmtDateTime(it.deletedAt)}${it.deletedByName ? ' bởi ' + esc(it.deletedByName) : ''} · ${size(it)} bản ghi dữ liệu học</div></div><div class="row" style="flex-wrap:nowrap">${quickViewBtn(it.user.id)}${mgr ? `<button class="btn-sm btn-primary" data-action="trash-restore" data-id="${it.id}">Khôi phục</button>` : ''}</div></div>`).join('')}
    ${gone.map(r => `<div class="item" style="opacity:.75"><div class="body"><div class="title">${esc(r.userName)} <span class="badge">${ROLE_NAMES[r.userRole] || 'Tài khoản'}</span> <span class="badge danger">đã xoá hẳn</span></div><div class="xs muted">Duyệt xoá ${fmtDateTime(r.decidedAt || r.at)} · tài khoản này bị xoá trước khi có chức năng khôi phục nên <b>không còn dữ liệu để khôi phục</b></div></div>${mgr ? '<button class="btn-sm" disabled title="Không còn dữ liệu để khôi phục">Khôi phục</button>' : ''}</div>`).join('')}</div></div>`;
}
// ---- account deletion is maker-checker: the operator files a request, a manager approves or rejects it ----
const delReqs = () => (S.deleteRequests = S.deleteRequests || []);
const pendingDelReq = uid => delReqs().find(r => r.userId === uid && r.status === 'pending');
actions['del-user'] = async t => {
  const u = userById(t.dataset.id); if (!u) return; const actor = me();
  if (actor.role === 'manager') { // the checker may delete directly; an open request for this account is closed as approved
    if (u.id === actor.id) { toast('Bạn không tự xoá tài khoản đang đăng nhập được', 'err'); return; }
    if (!(await confirmDlg(`Xoá tài khoản ${u.name}?\nTài khoản và dữ liệu học được chuyển vào danh sách "Tài khoản đã duyệt xoá"; bạn khôi phục được cho đến khi bấm Xoá vĩnh viễn.`, {danger: true, okLabel: 'Xoá'}))) return;
    const r = pendingDelReq(u.id); if (r) Object.assign(r, {status: 'approved', decidedBy: actor.id, decidedByName: actor.name, decidedAt: new Date().toISOString()});
    deleteUser(u, actor, r?.id); save(true); toast(`Đã chuyển ${u.name} vào danh sách đã xoá`, 'ok'); render(); return;
  }
  if (u.role !== 'learner') { toast('Người vận hành chỉ được yêu cầu xoá tài khoản học viên; tài khoản Vận hành / Quản lý do Quản lý xử lý', 'err'); return; }
  if (pendingDelReq(u.id)) { toast('Tài khoản này đã có yêu cầu xoá đang chờ Quản lý duyệt', ''); return; }
  const reason = await promptDlg(`Yêu cầu xoá tài khoản ${u.name}`, {label: 'Lý do (bắt buộc) – Quản lý sẽ duyệt trước khi tài khoản bị xoá', okLabel: 'Gửi yêu cầu', multiline: true});
  if (reason === null) return; if (!reason.trim()) { toast('Cần ghi lý do xoá', 'err'); return; }
  delReqs().push({id: uid('dr'), userId: u.id, userName: u.name, userRole: u.role, by: actor.id, byName: actor.name, reason: reason.trim(), at: new Date().toISOString(), status: 'pending'});
  save(true); toast('Đã gửi yêu cầu xoá. Tài khoản chỉ bị xoá khi Quản lý duyệt.', 'ok'); render();
};
actions['delreq-cancel'] = t => { const r = delReqs().find(x => x.id === t.dataset.id); if (r && r.status === 'pending') { r.status = 'cancelled'; r.decidedAt = new Date().toISOString(); save(true); render(); } };
actions['delreq-decide'] = async t => {
  const r = delReqs().find(x => x.id === t.dataset.id); const actor = me(); if (!r || r.status !== 'pending' || actor.role !== 'manager') return;
  const ok = t.dataset.ok === '1'; const u = userById(r.userId);
  if (ok && !(await confirmDlg(`Duyệt xoá ${r.userName}?\nTài khoản và dữ liệu học được chuyển vào danh sách "Tài khoản đã duyệt xoá"; khôi phục được cho đến khi bấm Xoá vĩnh viễn.`, {danger: true, okLabel: 'Duyệt xoá'}))) return;
  let note = ''; if (!ok) { note = await promptDlg(`Từ chối xoá ${r.userName}`, {label: 'Lý do từ chối (người vận hành sẽ thấy)', okLabel: 'Từ chối'}); if (note === null) return; }
  Object.assign(r, {status: ok ? 'approved' : 'rejected', decidedBy: actor.id, decidedByName: actor.name, decidedAt: new Date().toISOString(), note: (note || '').trim()});
  if (ok && u) deleteUser(u, actor, r.id); save(true); toast(ok ? `Đã chuyển ${r.userName} vào danh sách đã xoá` : 'Đã từ chối yêu cầu', 'ok'); render();
};
const DELREQ_STATUS = {restored: ['ok', 'Đã khôi phục tài khoản'], pending: ['warn', 'Chờ Quản lý duyệt'], approved: ['ok', 'Đã duyệt xoá'], rejected: ['danger', 'Bị từ chối'], cancelled: ['', 'Đã rút']};
/** Request list. Manager: decide. Operator: own requests, may withdraw. */
function delReqCard(viewer) {
  const mine = delReqs().filter(r => !r.cleared && (viewer.role === 'manager' || r.by === viewer.id)).sort((a, b) => b.at.localeCompare(a.at));
  const pend = mine.filter(r => r.status === 'pending'); const past = mine.filter(r => r.status !== 'pending').slice(0, 5); if (!pend.length && !past.length) return '';
  const row = r => `<div class="item" style="align-items:flex-start"><div class="body"><div class="title">${esc(r.userName)} <span class="badge ${DELREQ_STATUS[r.status][0]}">${DELREQ_STATUS[r.status][1]}</span></div><div class="small">Lý do: ${esc(r.reason)}</div><div class="xs muted">${esc(r.byName || '')} gửi ${fmtDateTime(r.at)}${r.decidedAt && r.status !== 'cancelled' ? ` · ${esc(r.decidedByName || 'Quản lý')} quyết định ${fmtDateTime(r.decidedAt)}` : ''}${r.note ? ` · “${esc(r.note)}”` : ''}</div></div>
    <div class="row" style="flex-wrap:nowrap">${quickViewBtn(r.userId)}${r.status === 'pending' ? (viewer.role === 'manager' ? `<button class="btn-sm btn-danger" data-action="delreq-decide" data-id="${r.id}" data-ok="1">Duyệt xoá</button><button class="btn-sm" data-action="delreq-decide" data-id="${r.id}" data-ok="0">Từ chối</button>` : `<button class="btn-sm" data-action="delreq-cancel" data-id="${r.id}">Rút yêu cầu</button>`) : ''}</div></div>`;
  return `<div class="card" style="margin-bottom:12px;${pend.length && viewer.role === 'manager' ? 'background:var(--butter)' : ''}"><h3>Yêu cầu xoá tài khoản ${pend.length ? `<span class="badge warn">${pend.length} chờ duyệt</span>` : ''}</h3><p class="xs muted" style="margin:2px 0 8px">Người vận hành tạo yêu cầu, Quản lý duyệt thì tài khoản mới bị xoá. Nút 👁 mở ngay mọi thông tin của tài khoản.</p><div class="list">${[...pend, ...past].map(row).join('')}</div></div>`;
}
// ---- quick view: everything the app holds about one account, in a pop-up (live account, or one in the trash) ----
const quickViewBtn = userId => `<button class="btn-sm" data-action="del-quick" data-uid="${userId}" title="Xem nhanh mọi thông tin của tài khoản">Xem</button>`;
function userDataOf(u) { const d = {}; USER_DATA_KEYS.forEach(k => { d[k] = (S[k] || []).filter(x => x.userId === u.id); }); return d; }
function userQuickViewHtml(u, data, {trash = null, req = null} = {}) {
  const d = data || {}; const L = k => d[k] || []; const n = k => L(k).length;
  const row = (k, v) => v == null || v === '' ? '' : `<div class="row" style="gap:6px;align-items:flex-start"><span class="xs muted" style="min-width:150px;font-weight:800">${k}</span><span class="small">${v}</span></div>`;
  const box = (title, inner) => `<div class="card soft" style="margin-top:8px"><b>${title}</b><div class="stack" style="gap:4px;margin-top:6px">${inner}</div></div>`;
  const byName = id => id ? esc(userById(id)?.name || (S.trash || []).find(t => t.user.id === id)?.user.name || id) : '';
  const prog = L('progress').filter(p => p.completedAt); const act = L('activity'); const days = [...new Set(act.map(a => a.date))].sort(); const mins = act.reduce((s, a) => s + (+a.minutes || 0), 0);
  const cs = L('coachSessions'); const turns = cs.reduce((s, c) => s + (c.turns || []).length, 0); const rub = cs.flatMap(c => (c.turns || []).filter(t => !t.offTopic).map(t => (t.rubric.meaning + t.rubric.vocab + t.rubric.grammar) / 3));
  const subs = L('submissions'); const graded = subs.filter(s => s.total != null); const tests = L('tests').slice().sort((a, b) => String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')));
  const KIND = {placement: 'Đầu vào', final: 'Cuối kỳ', levelup: 'Lên mức'}; const avg = a => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length * 10) / 10 : null;
  const games = L('gameResults'); const lr = L('levelRequests'); const ap = L('appeals'); const surveys = L('surveys'); const hist = (u.cefrHistory || []).slice().reverse();
  return `<div class="row between"><h3><span class="name">${esc(u.name)}</span> <span class="badge">${ROLE_NAMES[u.role] || u.role}</span> ${u.cefr ? lvlChip(u.cefr) : ''} ${trash ? '<span class="badge danger">đã xoá</span>' : req ? '<span class="badge warn">chờ duyệt xoá</span>' : ''}</h3><button class="btn-sm" data-action="modal-close">Đóng</button></div>
    ${req ? `<div class="banner warn" style="margin-top:6px"><span>🗑️</span><div class="body small"><b>Yêu cầu xoá</b> của ${esc(req.byName || '')} lúc ${fmtDateTime(req.at)} · ${esc(DELREQ_STATUS[req.status]?.[1] || req.status)}<br>Lý do: ${esc(req.reason)}${req.decidedAt && req.status !== 'cancelled' ? `<br>${esc(req.decidedByName || 'Quản lý')} quyết định ${fmtDateTime(req.decidedAt)}${req.note ? ` · “${esc(req.note)}”` : ''}` : ''}</div></div>` : ''}
    ${trash ? `<div class="banner info" style="margin-top:6px"><span>🗂️</span><div class="body small">Đã xoá ${fmtDateTime(trash.deletedAt)}${trash.deletedByName ? ' bởi ' + esc(trash.deletedByName) : ''}. Dữ liệu học vẫn còn nguyên trong danh sách đã xoá; Quản lý khôi phục được.</div></div>` : ''}
    ${box('Tài khoản', row('Mã', `<code>${esc(u.id)}</code>`) + row('Vai trò', ROLE_NAMES[u.role] || u.role) + row('Email', esc(u.profile?.email || '')) + row('Tạo lúc', fmtDateTime(u.createdAt)) + row('Mức hiện tại', u.cefr ? `${lvlChip(u.cefr)} ${u.cefrApproved ? 'đã duyệt' + (u.approvedAt ? ' ' + fmtDateTime(u.approvedAt) : '') + (u.approvedBy ? ' bởi ' + byName(u.approvedBy) : '') : 'chưa duyệt'} ${pendingLevelBadge(u)}` : 'chưa xếp mức') + row('Mục tiêu tháng', esc(u.monthlyGoal || '')) + row('Phong cách Season', u.role === 'learner' ? `${PERSONAS[personaOf(u)][1]} · ${PERSONAS[personaOf(u)][0]}` : '') + row('Mã PIN', u.pin ? `<code>${esc(u.pin)}</code>` : 'chưa đặt') + row('Vi phạm chủ đề game', (u.topicStrikes || []).length ? `${u.topicStrikes.length} lần` : ''))}
    ${hist.length ? box('Lịch sử mức', hist.map(h => row(`${fmtDate(h.at)}`, `${h.from ? lvlChip(h.from) + ' → ' : ''}${lvlChip(h.to)} · ${esc(h.reason || '')}${h.by ? ' · ' + byName(h.by) : ''}${h.evidence ? `<div class="xs muted">${esc(h.evidence)}</div>` : ''}`)).join('')) : ''}
    ${u.role === 'learner' ? box('Dữ liệu học', row('Bài học hoàn thành', `${prog.length}${prog.length ? ` · gần nhất ${fmtDateTime(prog.map(p => p.completedAt).sort().pop())}` : ''}`) + row('Ngày có hoạt động', `${days.length} ngày · ${mins} phút${days.length ? ` · gần nhất ${fmtDate(days[days.length - 1])}` : ''}`) + row('Luyện với Season', `${cs.length} phiên · ${turns} lượt${rub.length ? ` · rubric TB ${avg(rub)}/5` : ''}`) + row('Bài thực hành tuần', `${subs.length} bài${graded.length ? ` · điểm TB ${avg(graded.map(s => s.total))}/100` : ''}`) + row('Bài test', tests.length ? tests.map(t => `${KIND[t.kind] || t.kind}${t.target ? ' ' + t.target : ''}: <b>${t.total ?? '—'}/100</b> (${fmtDate(t.submittedAt)})`).join(' · ') : '0') + row('Yêu cầu lên mức', lr.length ? lr.map(r => `${r.from} → ${r.to} · ${r.status}`).join(' · ') : '') + row('Kháng nghị', ap.length ? `${ap.length} (${ap.filter(a => a.status === 'pending').length} chờ)` : '') + row('Mini game', games.length ? `${games.length} lượt chơi` : '') + row('Bài siêu ngắn', n('microLessons') || '') + row('Huy hiệu đã nhận', (u.badgesSeen || []).length || '') + row('Khảo sát', surveys.length ? `${surveys[surveys.length - 1].rating}/5${surveys[surveys.length - 1].comment ? ' · ' + esc(surveys[surveys.length - 1].comment) : ''}` : '') + row('Nhắc học', n('reminders') || '')) : ''}
    ${u.role === 'learner' ? profileCard(u) : ''}`;
}
actions['del-quick'] = t => {
  const id = t.dataset.uid; const live = userById(id); const req = delReqs().filter(r => r.userId === id).sort((a, b) => b.at.localeCompare(a.at))[0] || null;
  if (live) { openModal(userQuickViewHtml(live, userDataOf(live), {req: req && req.status === 'pending' ? req : null}), {wide: true}); return; }
  const it = (S.trash || []).find(x => x.user.id === id);
  if (it) { openModal(userQuickViewHtml(it.user, it.data, {trash: it, req}), {wide: true}); return; }
  toast('Tài khoản này đã bị xoá hẳn, không còn dữ liệu để xem', '');
};

// =====================================================================
// AI layer – direct calls to the Claude Messages API from the browser
// =====================================================================
const PROMPTS = {
  base: `You are the AI engine of "Season English", an internal English-learning product for Vietnamese office staff at ${'GFT'}. Learners range from CEFR A1 to C1. Rules that always apply:
- Adapt vocabulary, sentence length and grammar strictly to the learner's CEFR level.
- For A1 and A2 learners, all explanations, instructions and error feedback are in Vietnamese (the English learning content itself stays in English). For B1 and above, use English only.
- Be warm but honest. Never over-praise. Point out real errors; prioritise the ones that block meaning.
- Keep everything workplace-relevant and culturally appropriate for a Vietnamese company.`,
  placement: `Task: grade the productive parts of the "Workplace English CEFR Placement Test" and suggest a CEFR level.
Listening and Reading/Grammar/Vocabulary are already scored automatically (their points and maxima are given). You grade WRITING – all writing tasks together, weighting the formal task more – with the official rubric (5 criteria, each 1-5: task achievement, organization & coherence, vocabulary, grammar, workplace communication; 5 = fully addresses the task with precise professional language, 3 = adequate but limited development with noticeable errors, 1 = very limited) and SPEAKING from the speech-to-text transcripts of all tasks with 4 criteria, each 1-5 (fluency & interaction judged from how developed and connected the answers are, grammar, vocabulary, professional communication; pronunciation is NOT assessed). Give 0 for a criterion when the text is empty. Ignore punctuation/casing noise typical of speech recognition.
Then suggest ONE overall CEFR level (A1-C1) using the test's conversion table (total /100: 0-24 A1, 25-44 A2, 45-64 B1, 65-84 B2, 85-100 C1) and your judgement of the productive skills; if your judgement differs from the table, say so in the rationale. Write the rationale in Vietnamese (3-5 sentences: strengths, the most important weaknesses with 1-2 quoted examples, and why this level). Suggest a realistic one-month goal in Vietnamese (1 sentence) tied to the learner's job.`,
  lesson: `Chỉ trả về JSON, không bọc markdown, không giải thích.
Nhiệm vụ: Tạo {n} bài học tiếng Anh siêu ngắn cho {n} ngày liên tiếp (day 1 = Thứ Hai), mỗi bài DẠY MỘT mẫu câu/cấu trúc khác nhau trong cùng chủ đề, đi từ dễ đến khó, không lặp mẫu câu.
- Trình độ: {cefr_level}
- Chủ đề tuần: {topic}
- Nghề nghiệp: {job}
- Phong cách học: {learning_style}
- Ngôn ngữ giảng giải: {explain_lang}

Mỗi bài:
"title" = tên ngắn của mẫu câu (tiếng Anh, ≤6 từ).
"theory" = NỘI DUNG DẠY, không phải mô tả hay kế hoạch, không nhắc tới bài tập. Gồm 3 phần viết liền:
1) Công thức mẫu câu, ghi rõ từng thành phần bằng {explain_lang} và liệt kê 2–3 từ có thể lắp vào (A1–A2: giải thích thuật ngữ, ví dụ "verb = động từ, như buy = mua").
2) Dùng khi nào, 1 câu.
3) 2–3 ví dụ tiếng Anh hoàn chỉnh gắn với {job} và {topic} (A1–A2 kèm nghĩa tiếng Việt), mỗi ví dụ dùng 1 từ trong vocab.
Tối đa 90 từ, giọng văn theo {learning_style}.
"examples" = danh sách 2–3 câu ví dụ TIẾNG ANH hoàn chỉnh, chép đúng các câu ví dụ trong theory (chỉ câu, không có công thức, không có nghĩa tiếng Việt). App dùng danh sách này để đọc thành tiếng.
"objective" = 1 câu bằng {explain_lang}: sau bài này người học LÀM ĐƯỢC gì (cụ thể, đo được).
"vocab" = đúng 3 từ CẦN để lắp vào mẫu câu (ưu tiên động từ/cụm từ của mẫu), mỗi từ phải xuất hiện trong ví dụ của theory; mỗi từ có "ipa" (phiên âm IPA) và "phrases" = ĐÚNG 3 cụm từ/collocation thông dụng CHỨA từ đó, gắn với {topic} và {job}, ngắn 2–5 từ, đúng mức {cefr_level}, là cụm người bản ngữ thật sự dùng chứ không ghép máy móc (ví dụ từ "meeting": "have a meeting", "join a meeting", "a team meeting"; SAI: "join a developer"). KHÔNG dùng tên riêng (tên người, tên công ty, địa danh) làm từ vựng hay làm đáp án bài tập.
Mỗi từ vựng còn có: "pos" = từ loại tiếng Anh (noun/verb/adjective/adverb/preposition/phrase…); "family" = 2–3 từ cùng gốc khác từ loại [{"w","pos","v"}] ("v" = nghĩa Việt ngắn); "umbrella" = {"w": 1 từ bao trùm / nhóm nghĩa rộng hơn (ví dụ "tester" → "job"), "v": nghĩa Việt, "words": 3–4 từ KHÁC cùng nằm dưới từ bao trùm đó [{"w","v"}] (ví dụ job → developer, designer, manager)}; "syn" = 1–2 từ đồng nghĩa CÙNG mức {cefr_level} [{"w","v"}], LUÔN kèm nghĩa Việt "v"; "ant" = từ trái nghĩa cùng mức [{"w","v"}] CHỈ KHI từ đó thật sự có từ trái nghĩa tự nhiên (new → old); không có thì để [] – KHÔNG gượng ép (ví dụ "meeting", "email" không có trái nghĩa). Nếu mức là B1 trở lên, thêm: "synAll" = 3–5 từ đồng nghĩa ở mọi mức [{"w","level":"A1|A2|B1|B2|C1","note":"sắc thái, 3–6 từ tiếng Anh"}], "slang" = cách nói lóng/thân mật tương đương {"w", "def": định nghĩa tiếng Anh ngắn, "example": 1 câu ví dụ, "context": bối cảnh dùng được / không dùng được (bằng {explain_lang}), "note": lưu ý (sắc thái, vùng miền, mức độ suồng sã)} – không có thì null; "poetic" = từ văn chương/thi ca tương đương {"w", "def", "example": 1 câu, "source": tác phẩm / tác giả THẬT có dùng từ đó theo nghĩa này (không chắc thì ghi "văn chương thế kỷ …")} – không có thì null. Mức A1–A2: để "synAll": [], "slang": null, "poetic": null.
"pron" = phát âm: "sound" = MỘT âm mục tiêu, chỉ ghi ký hiệu IPA, không kèm dấu gạch chéo (ví dụ "ɜː"); "focus" = tên gọi ngắn của âm đó bằng {explain_lang}; "tip" = 1 câu hướng dẫn cách phát âm bằng {explain_lang}; "words" = ĐÚNG 3 mục {"w": từ tiếng Anh, "ipa": phiên âm IPA đầy đủ của từ đó}. Phiên âm của CẢ 3 từ phải chứa đúng ký hiệu trong "sound" (ví dụ sound "ʌ": bug /bʌɡ/ đúng, could /kʊd/ SAI; sound "æ": cat /kæt/ đúng, automated /ˈɔːtəmeɪtɪd/ SAI). Tự soát từng từ trước khi trả lời; nếu không tìm đủ 3 từ chắc chắn đúng thì đổi sang âm khác. Ưu tiên từ của bài; câu mẫu ở "speaking" phải có ít nhất 1 trong 3 từ này.
Bốn kỹ năng, mỗi phần CHỈ CÓ MỘT ĐÁP ÁN ĐÚNG và chỉ dùng mẫu câu + từ của bài. MỌI câu trắc nghiệm có ĐÚNG 4 lựa chọn, tất cả lựa chọn và câu hỏi bằng TIẾNG ANH (không Việt hoá đáp án), các lựa chọn sai phải hợp ngữ cảnh nhưng sai rõ ràng. CẤM dùng địa danh, quốc gia, thành phố hay tên riêng làm lựa chọn/đáp án (Da Nang, Hanoi, Hue, Laos, Thailand, Vietnam, London…): người học đoán được từ tiếng Việt mà không cần hiểu tiếng Anh; hỏi về nghề, hành động, tính từ, thời gian… thay vì "đến từ đâu":
"listening" = "audio": 1–2 câu tiếng Anh (15–30 từ) sẽ được đọc thành tiếng, người học không thấy chữ; "prompt": 1 câu hỏi tiếng Anh về nội dung nghe; "options": 4 lựa chọn; "answer": nguyên văn lựa chọn đúng.
"reading" = "text": đoạn 2–4 câu tiếng Anh (25–50 từ), nội dung khác phần nghe; "prompt", "options" (4), "answer" như trên.
Mức B1 trở lên: câu hỏi nghe và đọc phải là câu hỏi SUY LUẬN (inference): đáp án không được nêu nguyên văn trong bài, người học phải suy ra từ ngữ cảnh (ví dụ: "What can we infer about…?", "Why most likely…?").
"speaking" = "prompt": yêu cầu nói to một câu bằng {explain_lang}; "answer": đúng 1 câu tiếng Anh mẫu (6–14 từ) người học cần nói.
"practice" = phần VIẾT: 1 bài tập áp dụng ĐÚNG mẫu câu của bài và dùng từ trong vocab, CHỈ CÓ MỘT ĐÁP ÁN ĐÚNG, không gây nhầm lẫn:
- "fill": điền 1 từ vào ___, đề PHẢI có gợi ý nghĩa trong ngoặc ngay sau chỗ trống để chỉ một từ đúng, ví dụ "I want to ___ (mua) a T-shirt."; answer = đúng 1 từ.
- "mcq": đúng 4 lựa chọn tiếng Anh, đúng 1 đáp án, các lựa chọn khác sai rõ ràng về ngữ pháp hoặc nghĩa; answer = nguyên văn lựa chọn đúng.
- "write": tự viết 1–2 câu theo mẫu; answer = 1 câu mẫu.
"wordclass" = bài tập TỪ LOẠI: "prompt" = 1 câu tiếng Anh của bài có chứa 1 từ vựng + câu hỏi tiếng Anh "What part of speech is '<từ>' in this sentence?"; "options" = 4 từ loại tiếng Anh (noun, verb, adjective, adverb, preposition…); "answer" = từ loại đúng.
"worduse" = bài tập CÁCH DÙNG TỪ: "prompt" = "Which sentence uses '<từ vựng>' correctly?"; "options" = 4 câu tiếng Anh ngắn, chỉ 1 câu dùng từ đó đúng nghĩa và đúng ngữ pháp, 3 câu kia sai cách dùng (sai từ loại, sai collocation, sai nghĩa); "answer" = nguyên văn câu đúng.
"trans" = bản dịch TIẾNG VIỆT, app hiện khi người học trả lời đúng. Với từng phần "L" (listening), "R" (reading), "W" (practice), "S" (speaking): "q" = đề bài/câu hỏi bằng tiếng Việt (đề đã là tiếng Việt thì chép lại; câu điền từ thì dịch cả câu đã điền đúng), "a" = NGHĨA TIẾNG VIỆT của đáp án đúng, không chép lại tiếng Anh (ví dụ answer "I work as a tester." → a "Tôi làm nhân viên kiểm thử."; answer "work" → a "làm việc").
Chọn dạng hợp {learning_style}. Đề bài bằng {explain_lang}; từ/câu tiếng Anh giữ nguyên. Bắt buộc đủ các key, không để trống.

JSON (đúng các key này):
{"lessons":[{"day":1,"title":"...","objective":"...","theory":"...","examples":["...","..."],"vocab":[{"e":"word","v":"nghĩa việt","ipa":"/wɜːd/","phrases":["...","...","..."],"pos":"noun","family":[{"w":"...","pos":"...","v":"..."}],"umbrella":{"w":"...","v":"...","words":[{"w":"...","v":"..."}]},"syn":[{"w":"...","v":"..."}],"ant":[],"synAll":[{"w":"...","level":"B2","note":"..."}],"slang":{"w":"...","def":"...","example":"...","context":"...","note":"..."},"poetic":{"w":"...","def":"...","example":"...","source":"..."}}],"pron":{"sound":"ɜː","focus":"...","tip":"...","words":[{"w":"work","ipa":"/wɜːk/"}]},"listening":{"audio":"...","prompt":"...","options":["...","...","...","..."],"answer":"..."},"reading":{"text":"...","prompt":"...","options":["...","...","...","..."],"answer":"..."},"speaking":{"prompt":"...","answer":"..."},"practice":{"type":"write|fill|mcq","prompt":"...","options":["chỉ dùng cho mcq, 4 lựa chọn"],"answer":"..."},"wordclass":{"prompt":"...","options":["noun","verb","adjective","adverb"],"answer":"noun"},"worduse":{"prompt":"...","options":["...","...","...","..."],"answer":"..."},"trans":{"L":{"q":"...","a":"..."},"R":{"q":"...","a":"..."},"W":{"q":"...","a":"..."},"S":{"q":"...","a":"..."}}}]}`,
  weeks: `Chỉ trả về JSON, không bọc markdown.
Đề xuất khung chủ đề tiếng Anh công sở cho {n} tuần (mỗi tuần 1 chủ đề chung cho cả nhóm, bài sẽ sinh riêng theo mức CEFR từng người). Với MỖI tuần đưa 3 phương án khác hẳn nhau để người vận hành chọn.
Nhóm học viên: {learners}
Các mức CEFR cần bài: {levels}
Chủ đề đã dùng (không lặp lại): {used}
Yêu cầu: chủ đề thiết thực với nghề và mục đích của nhóm, đi từ dễ đến khó, mỗi phương án một tình huống giao tiếp cụ thể. Viết bằng tiếng Việt, chủ đề (topic) bằng tiếng Anh ngắn gọn. Lịch học cố định 5 ngày/tuần (Thứ Hai → Thứ Sáu). Với mỗi phương án, lập kế hoạch 5 NGÀY cho TỪNG mức trong danh sách mức: "days" = đúng 5 mục theo thứ tự ngày, mỗi mục là tên mẫu câu hoặc kỹ năng của ngày đó (≤8 từ, tiếng Anh cho mẫu câu), đi từ dễ đến khó, không lặp.
JSON: {"weeks":[{"week":1,"options":[{"topic":"...","description":"tình huống cụ thể, 1–2 câu","objectives":"2–3 mục tiêu đo được, ngắn","keyVocabHint":"5–8 từ/cụm tiếng Anh, cách nhau bằng dấu phẩy","levels":[{"cefr":"A1","days":["T2 ...","T3 ...","T4 ...","T5 ...","T6 ..."]}]}]}]}`,
  mgrade: `Chỉ trả về JSON, không bọc markdown.
Chấm câu trả lời của người học trình độ {cefr_level} cho bài thực hành dưới đây. Giải thích bằng {explain_lang}, ngắn gọn, không khen quá tay.
Nguyên tắc: đáp án tham khảo CHỈ là tham khảo. Mọi câu trả lời đúng ngữ pháp, đúng mẫu câu trong lý thuyết và hợp nghĩa với đề đều được chấm ĐÚNG, kể cả khác đáp án tham khảo (ví dụ "try" và "buy" đều hợp "I want to ___ a T-shirt" khi đề không gợi ý nghĩa). Chỉ chấm sai khi sai ngữ pháp, sai mẫu câu, hoặc không hợp nghĩa.
Lý thuyết: {theory}
Từ vựng: {vocab}
Bài tập ({ptype}): {practice}
Đáp án tham khảo: {key}
Câu trả lời của người học: {answer}
JSON (đúng các key): {"score": 0-10, "ok": true/false, "feedback": "≤40 từ: vì sao đúng/sai so với lý thuyết và gợi ý hướng sửa; nếu SAI thì KHÔNG viết ra đáp án đúng vì người học sẽ làm lại; nếu đúng nhưng khác tham khảo, nói rõ cả hai đều được", "fix": "câu trả lời đúng hoàn chỉnh bằng tiếng Anh (giữ nguyên câu của người học nếu đã đúng)"}`,
  coach: `Task: you are "Season", the learner's friendly sun mascot and conversation coach for this week's topic (the app is "Season English": learning is a year of seasons). Refer to yourself as Season. Each turn:
1) Reply naturally in English as a conversation partner (2-4 sentences, strictly at the learner's level; for A1 use very short simple sentences). Ask one follow-up question to keep the conversation going.
2) Score the learner's LAST message with the rubric (0-5 each): meaning (did they express the idea clearly / answer the question), vocabulary (range and appropriateness for level), grammar (accuracy). 5 = excellent for their level, 3 = okay with noticeable issues, 1 = hard to understand.
3) Give at most 3 concrete suggestions (fewer if the message was good; zero is allowed). Each suggestion: quote the learner's phrase, give the corrected version, and a one-line explanation (Vietnamese for A1/A2, English for B1+).
4) Provide a fully corrected version of the learner's message in "correctedText" (empty string if already correct).
Do not correct spelling of names. Do not praise excessively; one short positive remark is enough.`,
  grade: `Task: grade a learner's weekly practice submission (short writing or dialogue) with the shared rubric. Scores 0-5 each for meaning, vocabulary, grammar, and an overall 0-100 (meaning 40%, vocabulary 30%, grammar 30%). Give feedback (3-5 sentences; Vietnamese for A1/A2, English for B1+) that names the strongest point and the most important fix, then at most 3 suggestions (original → corrected → one-line explanation). Provide a corrected version of the whole text. Be honest; a text full of errors should not score above 50.`,
  levelform: `Chỉ trả về JSON, không bọc markdown, không giải thích.
Tạo một ĐỀ THI NGẮN kiểm tra tiếng Anh công sở ở ĐÚNG mức CEFR {target} (người học đang ở mức thấp hơn và muốn lên {target}). Toàn bộ nội dung đề bằng tiếng Anh; hướng dẫn ngắn bằng tiếng Anh.
1) "listening": MỘT đoạn hội thoại hoặc thông báo nơi làm việc, ĐỘ DÀI BẮT BUỘC 120–180 từ (đếm tổng các "line"; 6–10 lượt nói, 2 người nói, ghi "who" và "line" cho từng lượt) + ĐÚNG 5 câu hỏi trắc nghiệm, mỗi câu 4 lựa chọn và chỉ 1 đáp án đúng ("answer" = chỉ số 0–3), hỏi cả chi tiết lẫn ý ngầm phù hợp mức {target}.
2) "reading": MỘT văn bản công sở (email, quy trình hoặc bài viết ngắn), ĐỘ DÀI BẮT BUỘC 150–220 từ, 2–3 đoạn + ĐÚNG 5 câu hỏi như trên.
3) "writing": "task" = bối cảnh 1 câu; "message" = tin nhắn của quản lý yêu cầu viết 80–120 từ nêu 1 vấn đề và 1 đề xuất.
4) "speaking": "title" ngắn; "prompt" = 1 tình huống để nói 2–3 phút (tiếng Anh); "hint" = 1 câu gợi ý bằng tiếng Việt.
KHÔNG dùng các chủ đề sau (đã có trong đề khác): họp nhóm, khiếu nại khách hàng, chính sách làm việc hybrid/từ xa, chia sẻ tri thức, chuyển văn phòng, giao hàng trễ, công cụ quản lý dự án, onboarding, thẻ khách, xin cấp thiết bị. Gợi ý chủ đề: đào tạo nội bộ, đi công tác, tuyển dụng, an toàn dữ liệu, sự kiện công ty, ngân sách phòng ban, đánh giá nhà cung cấp. Không dùng tên công ty thật. Các lựa chọn sai phải hợp lý nhưng sai rõ ràng.
JSON (đúng các key): {"title":"...","listening":{"title":"...","instruction":"...","audio":[{"who":"...","line":"..."}],"questions":[{"q":"...","options":["...","...","...","..."],"answer":0}]},"reading":{"title":"...","instruction":"...","text":"...","questions":[{"q":"...","options":["...","...","...","..."],"answer":0}]},"writing":{"task":"...","message":"..."},"speaking":{"title":"...","prompt":"...","hint":"..."}}`,
  gamevocab: `Chỉ trả về JSON, không bọc markdown, không giải thích.
Người học tiếng Anh công sở mức CEFR {cefr} nhập một chủ đề tự do để chơi trò chơi từ vựng: "{topic}".
1) Kiểm tra chủ đề. MỌI chủ đề đời thường hoặc công việc đều HỢP LỆ (ví dụ: coffee shop, du lịch, bóng đá, nấu ăn, sprint planning, email, sức khỏe, thời tiết, mua sắm…), kể cả viết bằng tiếng Việt. Từ chối ("valid": false, "reason" = 1 câu tiếng Việt, các mảng rỗng) khi: (a) chuỗi vô nghĩa / ký tự ngẫu nhiên không phải là chủ đề → "soft": false; (b) nội dung độc hại (bạo lực, tình dục, chất cấm, xúc phạm, chính trị nhạy cảm) → "soft": false; (c) chủ đề về một NHÓM NGƯỜI hay bản sắc (LGBT, giới tính, tôn giáo, dân tộc, khuyết tật, tuổi tác…) → KHÔNG coi là vi phạm tình dục hay xúc phạm: "soft": true và "reason" = "Chủ đề chưa hợp bối cảnh đời sống / học tập ở đây, bạn chọn chủ đề khác nhé". Khi hợp lệ: "soft": false.
2) Nếu hợp lệ: "topic" = tên chủ đề bằng tiếng Anh ngắn gọn (≤5 từ); "words" = ĐÚNG {n} từ/cụm từ tiếng Anh THUỘC chủ đề đó và ĐÚNG mức {cefr} (A1–A2: từ rất thông dụng, ngắn, cụ thể; B1: từ phổ biến nơi làm việc; B2–C1: từ ít gặp hơn, collocation tự nhiên). Không trùng nhau, không tên riêng, mỗi từ 1–3 tiếng, chỉ chữ cái a–z và dấu cách; trộn đủ từ loại (ít nhất 2 danh từ, 2 động từ, 1 tính từ). Mỗi từ: "e" (tiếng Anh, viết thường), "v" (nghĩa tiếng Việt ngắn), "def" (định nghĩa tiếng Anh ≤12 từ, dùng từ đơn giản hơn mức {cefr}, KHÔNG chứa chính từ đó), "ipa" (phiên âm), "pos" (từ loại tiếng Anh: noun / verb / adjective / adverb / preposition / phrase).
3) "others" = 8 từ tiếng Anh thông dụng cùng mức {cefr} nhưng KHÔNG liên quan chủ đề (mỗi từ có "e", "v"), dùng làm từ gây nhiễu.
JSON: {"valid":true,"soft":false,"reason":"","topic":"...","words":[{"e":"...","v":"...","def":"...","ipa":"...","pos":"noun"}],"others":[{"e":"...","v":"..."}]}`
};
const prompt = key => (S.settings.prompts && S.settings.prompts[key]) || PROMPTS[key];
// ---- level scope: what grammar a lesson of each CEFR level may use (appended to the lesson prompt by code, so it also applies to an edited prompt) ----
const LEVEL_SCOPE = {
  A1: {max: 9, allow: 'thì hiện tại đơn (be, have, động từ thường), there is/are, can/can\'t, câu mệnh lệnh, this/that, tính từ sở hữu, giới từ cơ bản, want to / would like', ban: 'hiện tại hoàn thành, hoàn thành tiếp diễn, quá khứ tiếp diễn, bị động, câu điều kiện, mệnh đề quan hệ, câu gián tiếp'},
  A2: {max: 13, allow: 'các cấu trúc A1 cộng thêm quá khứ đơn, hiện tại tiếp diễn, be going to / will, so sánh hơn và nhất, should / have to, trạng từ tần suất, some/any', ban: 'hiện tại hoàn thành, hoàn thành tiếp diễn, bị động, câu điều kiện loại 2 và 3, câu gián tiếp'},
  B1: {max: 18, allow: 'các cấu trúc A2 cộng thêm hiện tại hoàn thành đơn, câu điều kiện loại 1, bị động thì đơn, mệnh đề quan hệ, used to, modal chỉ khả năng', ban: 'hoàn thành tiếp diễn, câu điều kiện loại 3 và hỗn hợp, đảo ngữ'},
  B2: {max: 25, allow: 'các cấu trúc B1 cộng thêm hoàn thành tiếp diễn, câu điều kiện loại 2 và 3, bị động mọi thì, câu gián tiếp, từ nối lập luận', ban: 'đảo ngữ nhấn mạnh và cấu trúc văn chương hiếm gặp'},
  C1: {max: 35, allow: 'mọi cấu trúc, chú trọng sắc thái và độ chính xác', ban: '(không)'}
};
const levelScopeNote = cefr => { const s = LEVEL_SCOPE[cefr]; return s ? `\n\nGIỚI HẠN BẮT BUỘC CỦA MỨC ${cefr} (áp dụng cho mẫu câu được dạy, mọi câu ví dụ, đoạn nghe, đoạn đọc, câu nói mẫu và đáp án):\n- Chỉ dùng: ${s.allow}.\n- TUYỆT ĐỐI KHÔNG dùng: ${s.ban}.\n- Mỗi câu tiếng Anh tối đa ${s.max} từ; từ vựng thuộc mức ${cefr} (từ chuyên ngành chỉ dùng khi rất thông dụng trong nghề của người học).\n- Nếu chủ đề gợi ra cấu trúc vượt mức, hãy diễn đạt lại bằng cấu trúc được phép (ví dụ A1: "I am a tester. I test software every day." thay cho "I have been testing software for 2 years").` : ''; };
/** Cheap automatic check for structures above the level (catches the common slips; the operator still reviews). Returns a reason or ''. */
function levelViolation(m, cefr) {
  const s = LEVEL_SCOPE[cefr]; if (!s) return '';
  const en = [...englishLines(m.theory || ''), m.listening?.audio, m.reading?.text, m.speaking?.answer, normPractice(m.practice).type !== 'mcq' ? normPractice(m.practice).answer : ''].filter(Boolean).join(' . ');
  if (['A1', 'A2', 'B1'].includes(cefr) && /\b(have|has|had|'ve|'s)\s+been\s+\w+ing\b/i.test(en)) return 'có thì hoàn thành tiếp diễn (have been + V-ing)';
  if (['A1', 'A2'].includes(cefr) && /\b(have|has|'ve)\s+(?:(?:just|already|never|ever)\s+)?(been|done|gone|seen|made|had|worked|finished|sent|written|\w{3,}ed)\b/i.test(en)) return 'có thì hiện tại hoàn thành (have/has + V3)';
  if (['A1', 'A2'].includes(cefr) && /\bwould have\b|\bif\b[^.]*\bwould\b/i.test(en)) return 'có câu điều kiện loại 2/3';
  if (cefr === 'A1' && /\b(was|were)\s+\w+ing\b/i.test(en)) return 'có thì quá khứ tiếp diễn';
  const say = m.speaking?.answer || ''; if (say && wordCount(say) > s.max + 3) return `câu nói mẫu dài ${wordCount(say)} từ (mức ${cefr} tối đa ${s.max})`;
  return '';
}
// ---- pronunciation words: every drill word must really contain the target sound, checked against its IPA ----
const ipaNorm = s => String(s || '').toLowerCase().replace(/[\/\[\]ˈˌ.()ˑ\s‿]/g, '').replace(/ɹ/g, 'r').replace(/ɡ/g, 'g').replace(/ɛ/g, 'e').replace(/ɝ/g, 'ɜ').replace(/ɚ/g, 'ə').replace(/oʊ/g, 'əʊ').replace(/ː/g, ''); // British/American variants and optional length marks compare equal
function ipaHasSound(ipa, sound) {
  let w = ipaNorm(ipa); const t = ipaNorm(sound); if (!w || !t) return false;
  const DIPH = ['aɪ', 'eɪ', 'ɔɪ', 'aʊ', 'əʊ', 'oʊ', 'ɪə', 'eə', 'ʊə']; const AFFR = ['tʃ', 'dʒ'];
  if (!DIPH.includes(t) && [...t].length <= 2) DIPH.forEach(d => { w = w.split(d).join('|'); }); // "ɪ" inside "aɪ" is a different sound
  if (!AFFR.includes(t)) AFFR.forEach(a => { w = w.split(a).join('|'); });
  return w.includes(t);
}
/** Up to 3 phrases / collocations for a vocabulary word: each must really contain the word, be more than the word itself, and not repeat. */
const cleanPhrases = (list, word) => { const seen = new Set(); return (Array.isArray(list) ? list : String(list || '').split(/[;\n]/)).map(p => String(p || '').trim().replace(/[.]+$/, '')).filter(p => p && p.toLowerCase() !== String(word).toLowerCase() && usesWord(p, word) && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase())).slice(0, 3); };
/** One small AI call: 3 phrases for each given word → {wordLowercase: [phrases]}. Used to complete words whose phrases are missing or were rejected. */
async function fetchPhrases(words, cefr, topic) {
  const r = await ai.call({system: `Chỉ trả về JSON {"items":[{"e":"word","phrases":["...","...","..."]}]}, không giải thích. Với MỖI từ tiếng Anh được đưa, cho đúng 3 cụm từ/collocation thông dụng CHỨA nguyên từ đó, mỗi cụm 2–5 từ, mức ${cefr}, gắn với chủ đề "${topic || 'giao tiếp công việc'}". Phải là cụm người bản ngữ thật sự dùng, không ghép máy móc; không dùng tên riêng. Giữ nguyên chính tả của từ trong trường "e".${levelScopeNote(cefr)}`, user: 'Các từ: ' + words.join(', '), schema: {type: 'object', additionalProperties: false, required: ['items'], properties: {items: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['e', 'phrases'], properties: {e: {type: 'string'}, phrases: {type: 'array', items: {type: 'string'}}}}}}}, effort: 'low', maxTokens: 1500, noBase: true, lean: true});
  const map = {}; (r.json?.items || []).forEach(it => { map[String(it.e || '').trim().toLowerCase()] = it.phrases; }); return map;
}
const phrasesMissing = l => (l.vocab || []).filter(v => (v.phrases || []).length < 3).map(v => v.e);
/** Multiple choice with exactly 4 English options and one of them as the answer (the rule for every quiz item). */
/** Place names / countries that a learner can guess from Vietnamese without understanding the English: never acceptable as quiz options. */
const PLACE_RE = /\b(Da ?Nang|Ha ?Noi|Hanoi|Hue|Saigon|Ho Chi Minh|Can Tho|Hai Phong|Nha Trang|Da Lat|Viet ?Nam|Laos|Thailand|Cambodia|Singapore|Malaysia|Indonesia|Philippines|Japan|Korea|China|India|Taiwan|Australia|America|USA|England|London|Paris|Tokyo|Berlin|Seoul|Bangkok|Manila|Jakarta|Sydney|New York)\b/i;
const mcq4 = p => !!p && Array.isArray(p.options) && p.options.length === 4 && !p.options.some(hasVi) && !p.options.some(o => PLACE_RE.test(o)) && p.options.some(o => normAns(o) === normAns(p.answer));
// vocabulary detail shapes (new AI output is an object; older stored lessons / demo data may still hold plain strings)
const lexItem = x => typeof x === 'string' ? {w: x.trim(), v: ''} : x && typeof x === 'object' ? {w: String(x.w || '').trim(), v: String(x.v || '').trim()} : null;
const lexList = a => (Array.isArray(a) ? a : []).map(lexItem).filter(x => x && x.w).slice(0, 4);
const umbrellaOf = x => typeof x === 'string' ? (x.trim() ? {w: x.trim(), v: '', words: []} : null) : x && typeof x === 'object' && x.w ? {w: String(x.w).trim(), v: String(x.v || '').trim(), words: lexList(x.words)} : null;
const lexNote = (x, keys) => { if (!x) return null; if (typeof x === 'string') return x.trim() ? {w: x.trim()} : null; if (typeof x !== 'object' || !x.w) return null; const o = {w: String(x.w).trim()}; keys.forEach(k => { const s = String(x[k] || '').trim(); if (s) o[k] = s; }); return o; };
const slangOf = x => lexNote(x, ['def', 'example', 'context', 'note']);
const poeticOf = x => lexNote(x, ['def', 'example', 'source']);
/** A detail stored in the old shape (umbrella without group words, synonym without meaning, slang / poetic without definition) – worth refreshing with AI. */
const lexStale = (v, k) => k === 'umbrella' ? !!v.umbrella && !(umbrellaOf(v.umbrella)?.words || []).length : (k === 'syn' || k === 'ant') ? lexList(v[k]).some(x => !x.v) : (k === 'slang' || k === 'poetic') ? !!v[k] && !(typeof v[k] === 'object' && v[k].def) : false;
const mcqOnly = o => { if (!o || typeof o !== 'object') return null; const p = normPractice({type: 'mcq', prompt: o.prompt || o.question, options: o.options, answer: o.answer}); return p.type === 'mcq' && mcq4(p) ? {prompt: p.prompt, options: p.options, answer: p.answer} : null; };
/** Extra vocabulary fields from the AI (word class, family, umbrella, synonyms / antonyms; B1+: synonyms of every level, slang, poetic). */
function vocabExtras(x, cefr) {
  const s = v => String(v || '').trim(); const hi = !isLow(cefr);
  const out = {pos: s(x.pos).toLowerCase(), umbrella: umbrellaOf(x.umbrella) || '', syn: lexList(x.syn), ant: lexList(x.ant), family: (Array.isArray(x.family) ? x.family : []).map(f => ({w: s(f.w), pos: s(f.pos).toLowerCase(), v: s(f.v)})).filter(f => f.w).slice(0, 4)};
  if (hi) { out.synAll = (Array.isArray(x.synAll) ? x.synAll : []).map(f => ({w: s(f.w), level: s(f.level).toUpperCase(), note: s(f.note)})).filter(f => f.w).slice(0, 6); out.slang = slangOf(x.slang) || ''; out.poetic = poeticOf(x.poetic) || ''; }
  return out;
}
/** Fill the vocabulary details, the word-class / word-use exercises and a 4th option for 3-option quizzes of ONE existing lesson. Returns true when something changed. */
async function enrichLesson(l, cefr, topic) {
  const parts = {L: l.listening, R: l.reading, W: normPractice(l.practice).type === 'mcq' ? normPractice(l.practice) : null};
  const need3 = Object.entries(parts).filter(([, p]) => p && (p.options || []).length === 3);
  const user = `Mức: ${cefr}. Chủ đề: ${topic || 'giao tiếp công việc'}.\nTừ vựng: ${(l.vocab || []).map(v => `${v.e} (${v.v})`).join('; ')}\nCâu ví dụ: ${exampleLines(l).join(' | ')}${need3.length ? '\nCác câu trắc nghiệm mới có 3 lựa chọn, cần thêm 1 lựa chọn SAI thứ tư bằng tiếng Anh, hợp ngữ cảnh:\n' + need3.map(([k, p]) => `${k}: "${p.prompt}" – lựa chọn hiện có: ${p.options.join(' / ')} – đáp án: ${p.answer}`).join('\n') : ''}`;
  const sys = `Chỉ trả về JSON, không bọc markdown. Bổ sung cho một bài học tiếng Anh công sở mức {cefr}: với MỖI từ vựng cho "pos" (từ loại tiếng Anh), "family" (2–3 từ cùng gốc [{"w","pos","v"}], "v" = nghĩa Việt), "umbrella" ({"w": từ bao trùm, "v": nghĩa Việt, "words": 3–4 từ khác cùng nhóm [{"w","v"}]}), "syn" (1–2 đồng nghĩa cùng mức [{"w","v"}], luôn có nghĩa Việt), "ant" (trái nghĩa cùng mức [{"w","v"}] chỉ khi thật sự có, không thì []), ${isLow(cefr) ? '"synAll": [], "slang": null, "poetic": null' : '"synAll" (3–5 đồng nghĩa ở mọi mức [{"w","level","note"}]), "slang" ({"w","def","example","context","note"} hoặc null), "poetic" ({"w","def","example","source": tác phẩm/tác giả thật} hoặc null)'}. Không dùng địa danh / tên riêng làm lựa chọn. Thêm "wordclass" = {"prompt": 1 câu ví dụ của bài chứa 1 từ vựng + " What part of speech is '<từ>' in this sentence?", "options": 4 từ loại tiếng Anh, "answer"} và "worduse" = {"prompt": "Which sentence uses '<từ vựng>' correctly?", "options": 4 câu tiếng Anh ngắn chỉ 1 câu đúng, "answer": câu đúng}. "extra" = {"L","R","W"}: 1 lựa chọn sai thứ tư cho các câu được liệt kê (không có thì ""). Toàn bộ lựa chọn bằng tiếng Anh.`.replace(/\{cefr\}/g, cefr) + levelScopeNote(cefr);
  const schema = {type: 'object', additionalProperties: false, required: ['vocab', 'wordclass', 'worduse', 'extra'], properties: {vocab: {type: 'array', items: VOCAB_SCHEMA}, wordclass: MCQ_SCHEMA, worduse: MCQ_SCHEMA, extra: {type: 'object', additionalProperties: false, properties: {L: {type: 'string'}, R: {type: 'string'}, W: {type: 'string'}}}}};
  const r = await ai.call({system: sys, user, schema, effort: 'low', maxTokens: 3000, noBase: true, lean: true}); const j = r.json || {}; let changed = false;
  (j.vocab || []).forEach(x => { const v = (l.vocab || []).find(v => v.e.toLowerCase() === String(x.e || '').trim().toLowerCase()); if (!v) return; const ex = vocabExtras(x, cefr); Object.keys(ex).forEach(k => { const has = Array.isArray(ex[k]) ? ex[k].length : ex[k]; const old = Array.isArray(v[k]) ? v[k].length : v[k]; if (has && (!old || lexStale(v, k))) { v[k] = ex[k]; changed = true; } }); });
  if (!l.wordclass && mcqOnly(j.wordclass)) { l.wordclass = mcqOnly(j.wordclass); changed = true; }
  if (!l.worduse && mcqOnly(j.worduse)) { l.worduse = mcqOnly(j.worduse); changed = true; }
  need3.forEach(([k, p]) => { const o = String((j.extra || {})[k] || '').trim(); if (!o || hasVi(o) || p.options.some(x => normAns(x) === normAns(o))) return; if (k === 'W') l.practice.options = [...p.options, o]; else l[k === 'L' ? 'listening' : 'reading'].options = [...p.options, o]; changed = true; });
  return changed;
}
/** Checked drill words per sound (common A1–A2 words, British IPA). AI models often pick words that do not contain the sound, so the app completes the list from here. Format: word:ipa */
const SOUND_WORDS = {
  'iː': 'see:siː team:tiːm meet:miːt read:riːd week:wiːk', 'ɪ': 'it:ɪt in:ɪn big:bɪɡ this:ðɪs six:sɪks', 'e': 'ten:ten test:test yes:jes send:send desk:desk',
  'æ': 'cat:kæt bag:bæɡ plan:plæn thanks:θæŋks manager:ˈmænɪdʒə', 'ʌ': 'bus:bʌs cup:kʌp lunch:lʌntʃ bug:bʌɡ Monday:ˈmʌndeɪ', 'ɒ': 'job:dʒɒb hot:hɒt office:ˈɒfɪs stop:stɒp box:bɒks',
  'ɔː': 'call:kɔːl four:fɔː door:dɔː report:rɪˈpɔːt morning:ˈmɔːnɪŋ', 'ʊ': 'book:bʊk good:ɡʊd look:lʊk put:pʊt could:kʊd', 'uː': 'you:juː two:tuː new:njuː room:ruːm food:fuːd',
  'ɜː': 'work:wɜːk word:wɜːd first:fɜːst learn:lɜːn thirty:ˈθɜːti', 'ə': 'about:əˈbaʊt teacher:ˈtiːtʃə today:təˈdeɪ tester:ˈtestə computer:kəmˈpjuːtə', 'ɑː': 'car:kɑː start:stɑːt half:hɑːf class:klɑːs park:pɑːk',
  'eɪ': 'day:deɪ name:neɪm late:leɪt email:ˈiːmeɪl today:təˈdeɪ', 'aɪ': 'I:aɪ hi:haɪ time:taɪm price:praɪs write:raɪt', 'ɔɪ': 'boy:bɔɪ join:dʒɔɪn enjoy:ɪnˈdʒɔɪ point:pɔɪnt voice:vɔɪs',
  'aʊ': 'now:naʊ how:haʊ out:aʊt about:əˈbaʊt down:daʊn', 'əʊ': 'go:ɡəʊ no:nəʊ phone:fəʊn home:həʊm hello:həˈləʊ', 'ɪə': 'here:hɪə near:nɪə year:jɪə idea:aɪˈdɪə clear:klɪə', 'eə': 'where:weə chair:tʃeə share:ʃeə their:ðeə software:ˈsɒftweə',
  'θ': 'thank:θæŋk think:θɪŋk three:θriː month:mʌnθ thing:θɪŋ', 'ð': 'this:ðɪs that:ðæt they:ðeɪ with:wɪð the:ðə', 'ʃ': 'she:ʃiː shop:ʃɒp share:ʃeə finish:ˈfɪnɪʃ English:ˈɪŋɡlɪʃ',
  'tʃ': 'check:tʃek chair:tʃeə lunch:lʌntʃ much:mʌtʃ teacher:ˈtiːtʃə', 'dʒ': 'job:dʒɒb join:dʒɔɪn manager:ˈmænɪdʒə project:ˈprɒdʒekt message:ˈmesɪdʒ', 'ŋ': 'meeting:ˈmiːtɪŋ long:lɒŋ thing:θɪŋ morning:ˈmɔːnɪŋ testing:ˈtestɪŋ',
  's': 'six:sɪks send:send test:test office:ˈɒfɪs yes:jes', 'z': 'is:ɪz busy:ˈbɪzi please:pliːz bugs:bʌɡz zero:ˈzɪərəʊ', 'v': 'very:ˈveri five:faɪv have:hæv visit:ˈvɪzɪt seven:ˈsevn', 'w': 'work:wɜːk we:wiː week:wiːk well:wel one:wʌn',
  'r': 'read:riːd report:rɪˈpɔːt room:ruːm right:raɪt problem:ˈprɒbləm', 'l': 'late:leɪt look:lʊk call:kɔːl email:ˈiːmeɪl hello:həˈləʊ', 't': 'ten:ten test:test time:taɪm team:tiːm two:tuː', 'd': 'day:deɪ desk:desk do:duː send:send door:dɔː',
  'k': 'call:kɔːl cat:kæt book:bʊk check:tʃek work:wɜːk', 'p': 'plan:plæn put:pʊt park:pɑːk stop:stɒp price:praɪs', 'b': 'bag:bæɡ big:bɪɡ bus:bʌs book:bʊk job:dʒɒb', 'f': 'four:fɔː five:faɪv first:fɜːst food:fuːd office:ˈɒfɪs',
  'h': 'hi:haɪ how:haʊ hot:hɒt home:həʊm half:hɑːf', 'm': 'meet:miːt name:neɪm time:taɪm morning:ˈmɔːnɪŋ team:tiːm', 'n': 'no:nəʊ new:njuː name:neɪm ten:ten now:naʊ', 'j': 'you:juː yes:jes year:jɪə new:njuː use:juːz', 'g': 'go:ɡəʊ good:ɡʊd big:bɪɡ bag:bæɡ bug:bʌɡ'
};
/** Recordings of single sounds (Wikimedia Commons IPA samples, free licence, not AI). Diphthongs have no single recording, so the browser voice says a word that is exactly that sound. */
const SOUND_FILES = {'iː': 'Close_front_unrounded_vowel', 'ɪ': 'Near-close_near-front_unrounded_vowel', 'e': 'Open-mid_front_unrounded_vowel', 'æ': 'Near-open_front_unrounded_vowel', 'ʌ': 'PR-open-mid_back_unrounded_vowel2', 'ɒ': 'PR-open_back_rounded_vowel', 'ɔː': 'PR-open-mid_back_rounded_vowel', 'ʊ': 'Near-close_near-back_rounded_vowel', 'uː': 'Close_back_rounded_vowel', 'ɜː': 'Open-mid_central_unrounded_vowel', 'ə': 'Mid-central_vowel', 'ɑː': 'Open_back_unrounded_vowel',
  'θ': 'Voiceless_dental_fricative', 'ð': 'Voiced_dental_fricative', 'ʃ': 'Voiceless_palato-alveolar_sibilant', 'tʃ': 'Voiceless_palato-alveolar_affricate', 'dʒ': 'Voiced_palato-alveolar_affricate', 'ŋ': 'Velar_nasal', 's': 'Voiceless_alveolar_sibilant', 'z': 'Voiced_alveolar_sibilant', 'v': 'Voiced_labio-dental_fricative', 'w': 'Voiced_labio-velar_approximant', 'r': 'Alveolar_approximant', 'l': 'Alveolar_lateral_approximant',
  't': 'Voiceless_alveolar_plosive', 'd': 'Voiced_alveolar_plosive', 'k': 'Voiceless_velar_plosive', 'p': 'Voiceless_bilabial_plosive', 'b': 'Voiced_bilabial_plosive', 'f': 'Voiceless_labio-dental_fricative', 'h': 'Voiceless_glottal_fricative', 'm': 'Bilabial_nasal', 'n': 'Alveolar_nasal', 'j': 'Palatal_approximant', 'g': 'Voiced_velar_plosive_02'};
const SOUND_SPOKEN = {'eɪ': 'A', 'aɪ': 'eye', 'ɔɪ': 'oy', 'aʊ': 'ow', 'əʊ': 'oh', 'ɪə': 'ear', 'eə': 'air'};
function playSound(sound) {
  const pick = map => { const k = Object.keys(map).find(x => ipaNorm(x) === ipaNorm(sound)); return k ? map[k] : ''; };
  const file = pick(SOUND_FILES), spoken = pick(SOUND_SPOKEN);
  if (spoken) { speech.speakWord(spoken); return; }
  if (!file) { toast(`Chưa có mẫu âm riêng cho /${sound}/ – hãy nghe qua 3 từ luyện bên dưới`, ''); return; }
  speech.stop(); audio.duck(true); const a = new Audio(); a.crossOrigin = 'anonymous'; a.src = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + file + '.ogg';
  // a short room tail (~1 s) so the sample rings out instead of stopping dead; the music stays paused until the tail has faded
  let tailMs = 1000; try { const ctx = audio.context(); if (ctx) { const src = ctx.createMediaElementSource(a); const dry = ctx.createGain(); dry.gain.value = 1; const wet = ctx.createGain(); wet.gain.value = 0.35; const conv = ctx.createConvolver(); const len = Math.floor(ctx.sampleRate * 1.2); const ir = ctx.createBuffer(2, len, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); } conv.buffer = ir; src.connect(dry); dry.connect(ctx.destination); src.connect(conv); conv.connect(wet); wet.connect(ctx.destination); tailMs = 1200; } } catch {}
  a.onended = () => setTimeout(() => audio.duck(false), tailMs);
  a.onerror = () => { audio.duck(false); toast('Không tải được mẫu âm (cần có mạng) – hãy nghe qua 3 từ luyện bên dưới', 'err'); }; a.play().catch(() => audio.duck(false));
}
actions['say-sound'] = t => playSound(t.dataset.sound);
const soundWords = sound => { const k = Object.keys(SOUND_WORDS).find(x => ipaNorm(x) === ipaNorm(sound)); return k ? SOUND_WORDS[k].split(' ').map(p => { const i = p.indexOf(':'); return {w: p.slice(0, i), ipa: '/' + p.slice(i + 1) + '/'}; }) : []; };
/** Normalise the AI's pron block; keep only words whose IPA contains the target sound, then complete to 3 from the checked list. words stay plain strings, ipa map is kept for display. */
function parsePron(p, {trust = false} = {}) { // trust: words typed by a person in the lesson form are kept as written
  const str = v => String(v || '').trim(); if (!p || !(str(p.tip) || str(p.focus) || str(p.sound) || (p.words || []).length)) return null;
  if (trust) { const sound = str(p.sound).replace(/[\/\[\]]/g, ''); const words = (Array.isArray(p.words) ? p.words : []).map(str).filter(Boolean).slice(0, 3); return {sound, focus: str(p.focus) || (sound ? '/' + sound + '/' : ''), tip: str(p.tip), words, ipa: {}, verified: !!sound && words.length >= 3, rejected: [], manual: true}; }
  const sound = str(p.sound).replace(/[\/\[\]]/g, '') || (str(p.focus).match(/\/([^/]+)\//) || [])[1] || '';
  const raw = (Array.isArray(p.words) ? p.words : []).map(x => typeof x === 'string' ? {w: str(x), ipa: ''} : {w: str(x.w || x.word), ipa: str(x.ipa)}).filter(x => x.w);
  const checkable = !!sound && raw.some(x => x.ipa);
  const bank = soundWords(sound); const known = bank.length > 0;
  // a word passes when its IPA has the sound; single lowercase words only (no names, no phrases)
  let good = (checkable ? raw.filter(x => ipaHasSound(x.ipa, sound)) : known ? [] : raw).filter(x => /^[a-z']+$/.test(x.w) || x.w === 'I');
  const rejected = raw.filter(x => !good.includes(x)).map(x => x.w);
  bank.forEach(b => { if (good.length < 3 && !good.some(x => x.w.toLowerCase() === b.w.toLowerCase())) good.push(b); });
  good = good.slice(0, 3);
  return {sound, focus: str(p.focus) || (sound ? '/' + sound + '/' : ''), tip: str(p.tip), words: good.map(x => x.w), ipa: Object.fromEntries(good.filter(x => x.ipa).map(x => [x.w, x.ipa])), verified: (checkable || known) && good.length >= 3, rejected};
}

const MCQ_SCHEMA = {type: 'object', additionalProperties: false, required: ['prompt', 'options', 'answer'], properties: {prompt: {type: 'string'}, options: {type: 'array', items: {type: 'string'}}, answer: {type: 'string'}}};
const VOCAB_SCHEMA = {type: 'object', additionalProperties: false, required: ['e', 'v'], properties: {e: {type: 'string'}, v: {type: 'string'}, ipa: {type: 'string'}, phrases: {type: 'array', items: {type: 'string'}}, pos: {type: 'string'},
  family: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'pos'], properties: {w: {type: 'string'}, pos: {type: 'string'}, v: {type: 'string'}}}},
  umbrella: {type: 'object', additionalProperties: false, required: ['w', 'v', 'words'], properties: {w: {type: 'string'}, v: {type: 'string'}, words: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'v'], properties: {w: {type: 'string'}, v: {type: 'string'}}}}}},
  syn: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'v'], properties: {w: {type: 'string'}, v: {type: 'string'}}}}, ant: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'v'], properties: {w: {type: 'string'}, v: {type: 'string'}}}},
  synAll: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'level'], properties: {w: {type: 'string'}, level: {type: 'string'}, note: {type: 'string'}}}},
  slang: {type: ['object', 'null'], additionalProperties: false, properties: {w: {type: 'string'}, def: {type: 'string'}, example: {type: 'string'}, context: {type: 'string'}, note: {type: 'string'}}},
  poetic: {type: ['object', 'null'], additionalProperties: false, properties: {w: {type: 'string'}, def: {type: 'string'}, example: {type: 'string'}, source: {type: 'string'}}}}};
const SCHEMAS = {
  placement: {type: 'object', additionalProperties: false, required: ['cefr', 'writing', 'speaking', 'rationale', 'monthlyGoal'],
    properties: {cefr: {type: 'string', enum: LEVELS},
      writing: {type: 'object', additionalProperties: false, required: ['task', 'organization', 'vocabulary', 'grammar', 'communication'], properties: {task: {type: 'integer', description: '1-5, 0 if no text'}, organization: {type: 'integer'}, vocabulary: {type: 'integer'}, grammar: {type: 'integer'}, communication: {type: 'integer'}}},
      speaking: {type: 'object', additionalProperties: false, required: ['fluency', 'grammar', 'vocabulary', 'communication'], properties: {fluency: {type: 'integer', description: '1-5 judged from transcript length/connectedness, 0 if no text'}, grammar: {type: 'integer'}, vocabulary: {type: 'integer'}, communication: {type: 'integer'}}},
      rationale: {type: 'string'}, monthlyGoal: {type: 'string'}}},
  weeks: {type: 'object', additionalProperties: false, required: ['weeks'], properties: {weeks: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['week', 'options'], properties: {week: {type: 'integer'}, options: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['topic', 'description', 'objectives', 'keyVocabHint', 'levels'], properties: {topic: {type: 'string'}, description: {type: 'string'}, objectives: {type: 'string'}, keyVocabHint: {type: 'string'}, levels: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['cefr', 'days'], properties: {cefr: {type: 'string'}, days: {type: 'array', items: {type: 'string'}}}}}}}}}}}}},
  mgrade: {type: 'object', additionalProperties: false, required: ['score', 'ok', 'feedback', 'fix'], properties: {score: {type: 'integer'}, ok: {type: 'boolean'}, feedback: {type: 'string'}, fix: {type: 'string'}}},
  gamevocab: {type: 'object', additionalProperties: false, required: ['valid', 'soft', 'reason', 'topic', 'words', 'others'], properties: {valid: {type: 'boolean'}, soft: {type: 'boolean'}, reason: {type: 'string'}, topic: {type: 'string'},
    words: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['e', 'v', 'def', 'ipa', 'pos'], properties: {e: {type: 'string'}, v: {type: 'string'}, def: {type: 'string'}, ipa: {type: 'string'}, pos: {type: 'string'}}}},
    others: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['e', 'v'], properties: {e: {type: 'string'}, v: {type: 'string'}}}}}},
  levelform: (() => { const Q = {type: 'array', items: {type: 'object', additionalProperties: false, required: ['q', 'options', 'answer'], properties: {q: {type: 'string'}, options: {type: 'array', items: {type: 'string'}}, answer: {type: 'integer'}}}};
    return {type: 'object', additionalProperties: false, required: ['title', 'listening', 'reading', 'writing', 'speaking'], properties: {title: {type: 'string'},
      listening: {type: 'object', additionalProperties: false, required: ['title', 'instruction', 'audio', 'questions'], properties: {title: {type: 'string'}, instruction: {type: 'string'}, audio: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['who', 'line'], properties: {who: {type: 'string'}, line: {type: 'string'}}}}, questions: Q}},
      reading: {type: 'object', additionalProperties: false, required: ['title', 'instruction', 'text', 'questions'], properties: {title: {type: 'string'}, instruction: {type: 'string'}, text: {type: 'string'}, questions: Q}},
      writing: {type: 'object', additionalProperties: false, required: ['task', 'message'], properties: {task: {type: 'string'}, message: {type: 'string'}}},
      speaking: {type: 'object', additionalProperties: false, required: ['title', 'prompt', 'hint'], properties: {title: {type: 'string'}, prompt: {type: 'string'}, hint: {type: 'string'}}}}}; })(),
  lesson: {type: 'object', additionalProperties: false, required: ['lessons'], properties: {lessons: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['day', 'title', 'theory', 'vocab', 'practice'], properties: {
    day: {type: 'integer'}, title: {type: 'string'}, objective: {type: 'string'}, theory: {type: 'string'}, examples: {type: 'array', items: {type: 'string'}}, vocab: {type: 'array', items: VOCAB_SCHEMA},
    wordclass: MCQ_SCHEMA, worduse: MCQ_SCHEMA,
    pron: {type: 'object', additionalProperties: false, required: ['sound', 'focus', 'tip', 'words'], properties: {sound: {type: 'string'}, focus: {type: 'string'}, tip: {type: 'string'}, words: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'ipa'], properties: {w: {type: 'string'}, ipa: {type: 'string'}}}}}},
    listening: {type: 'object', additionalProperties: false, required: ['audio', 'prompt', 'options', 'answer'], properties: {audio: {type: 'string'}, prompt: {type: 'string'}, options: {type: 'array', items: {type: 'string'}}, answer: {type: 'string'}}},
    reading: {type: 'object', additionalProperties: false, required: ['text', 'prompt', 'options', 'answer'], properties: {text: {type: 'string'}, prompt: {type: 'string'}, options: {type: 'array', items: {type: 'string'}}, answer: {type: 'string'}}},
    speaking: {type: 'object', additionalProperties: false, required: ['prompt', 'answer'], properties: {prompt: {type: 'string'}, answer: {type: 'string'}}},
    trans: {type: 'object', additionalProperties: false, properties: Object.fromEntries(['L', 'R', 'W', 'S'].map(c => [c, {type: 'object', additionalProperties: false, required: ['q', 'a'], properties: {q: {type: 'string'}, a: {type: 'string'}}}]))},
    practice: {type: 'object', additionalProperties: false, required: ['type', 'prompt', 'options', 'answer'], properties: {type: {type: 'string', enum: ['write', 'fill', 'mcq']}, prompt: {type: 'string'}, options: {type: 'array', items: {type: 'string'}}, answer: {type: 'string'}}}}}}}},
  coach: {type: 'object', additionalProperties: false, required: ['relevant', 'relevanceNote', 'reply', 'rubric', 'suggestions', 'correctedText', 'usedWords'],
    properties: {relevant: {type: 'boolean'}, relevanceNote: {type: 'string'}, reply: {type: 'string'}, usedWords: {type: 'array', items: {type: 'string'}}, rubric: {type: 'object', additionalProperties: false, required: ['meaning', 'vocab', 'grammar'], properties: {meaning: {type: 'integer'}, vocab: {type: 'integer'}, grammar: {type: 'integer'}}},
      suggestions: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['original', 'corrected', 'explanation'], properties: {original: {type: 'string'}, corrected: {type: 'string'}, explanation: {type: 'string'}}}}, correctedText: {type: 'string'}}},
  grade: {type: 'object', additionalProperties: false, required: ['rubric', 'total', 'feedback', 'suggestions', 'correctedText'],
    properties: {rubric: {type: 'object', additionalProperties: false, required: ['meaning', 'vocab', 'grammar'], properties: {meaning: {type: 'integer'}, vocab: {type: 'integer'}, grammar: {type: 'integer'}}}, total: {type: 'integer'}, feedback: {type: 'string'},
      suggestions: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['original', 'corrected', 'explanation'], properties: {original: {type: 'string'}, corrected: {type: 'string'}, explanation: {type: 'string'}}}}, correctedText: {type: 'string'}}}
};

// Gemini's responseSchema is an OpenAPI subset: strip keys it rejects.
function geminiSchema(s) {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!s || typeof s !== 'object') return s;
  const o = {}; for (const [k, v] of Object.entries(s)) { if (k === 'additionalProperties') continue; o[k] = (k === 'properties') ? Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, geminiSchema(pv)])) : geminiSchema(v); }
  return o;
}
async function geminiCall({system, user, messages, schema, maxTokens, noBase = false}) {
  const key = S.settings.geminiKey; const model = S.settings.geminiModel || 'gemini-3.8-flash';
  const contents = (messages || [{role: 'user', content: user}]).map(m => ({role: m.role === 'assistant' ? 'model' : 'user', parts: [{text: m.content}]}));
  const body = {systemInstruction: {parts: [{text: noBase ? system : PROMPTS.base + '\n\n' + system}]}, contents, generationConfig: {maxOutputTokens: maxTokens, temperature: 0.7}};
  if (schema) { body.generationConfig.responseMimeType = 'application/json'; body.generationConfig.responseSchema = geminiSchema(schema); }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const send = async b => { let res; try { res = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': key}, body: JSON.stringify(b)}); } catch (e) { throw new Error('Không kết nối được tới Gemini API. ' + e.message); } return res; };
  let res = await send(body);
  if (res.status === 400 && schema) { // schema not accepted → fall back to JSON mode with the schema described in the prompt
    const b2 = JSON.parse(JSON.stringify(body)); delete b2.generationConfig.responseSchema; b2.systemInstruction.parts[0].text += '\n\nReturn ONLY valid JSON matching this JSON Schema:\n' + JSON.stringify(schema);
    res = await send(b2);
  }
  if (!res.ok) {
    let detail = ''; try { const j = await res.json(); detail = j.error?.message || ''; } catch {}
    if (res.status === 400 && /API key/i.test(detail)) throw new Error('Gemini API key không hợp lệ. ' + detail);
    if (res.status === 403) throw new Error('Gemini từ chối (403): ' + detail);
    if (res.status === 429) throw new Error('Gemini quá giới hạn gói miễn phí (429), đợi một phút rồi thử lại. ' + detail);
    if (res.status === 404) throw new Error(`Không tìm thấy model "${model}" (404). Đổi model trong Cài đặt. ` + detail);
    throw new Error(`Lỗi Gemini API ${res.status}. ${detail}`);
  }
  const data = await res.json(); const cand = data.candidates?.[0];
  if (!cand) throw new Error('Gemini không trả về nội dung' + (data.promptFeedback?.blockReason ? ' (bị chặn: ' + data.promptFeedback.blockReason + ')' : '.'));
  if (cand.finishReason === 'SAFETY') throw new Error('Gemini chặn nội dung vì lý do an toàn.');
  if (cand.finishReason === 'MAX_TOKENS') throw new Error('Kết quả Gemini bị cắt ngắn (max tokens). Thử lại.');
  let text = (cand.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
  let json = null;
  if (schema) { const m = text.match(/\{[\s\S]*\}/); try { json = JSON.parse(m ? m[0] : text); } catch { throw new Error('Gemini trả về JSON không hợp lệ.'); } }
  return {text, json, model, usage: data.usageMetadata};
}
// OpenAI-compatible chat/completions (Groq, OpenRouter, Cerebras, Mistral, Ollama, LM Studio…)
const OAI_PRESETS = {
  groq: {label: 'Groq (miễn phí, nhanh)', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys'},
  openrouter: {label: 'OpenRouter (model có đuôi :free)', base: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys'},
  cerebras: {label: 'Cerebras (miễn phí)', base: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b', keyUrl: 'https://cloud.cerebras.ai/'},
  ollama: {label: 'Ollama trên máy (không cần key)', base: 'http://localhost:11434/v1', model: 'llama3.1', keyUrl: 'https://ollama.com/download'},
  custom: {label: 'Tuỳ chỉnh', base: '', model: '', keyUrl: ''}
};
const isLocalBase = b => /^https?:\/\/(localhost|127\.0\.0\.1)/.test(b || '');
async function openaiCall({system, user, messages, schema, maxTokens, noBase = false, lean = false}) { // lean: the prompt already shows the JSON shape, so the schema text is not appended (saves ~600 tokens on free tiers)
  const base = (S.settings.oaiBase || '').replace(/\/+$/, ''); const key = S.settings.oaiKey; const model = S.settings.oaiModel;
  if (!base || !model) throw new Error('Chưa cấu hình Base URL / model trong Cài đặt.');
  let sys = noBase ? system : PROMPTS.base + '\n\n' + system;
  if (schema) sys += lean ? '\n\nRespond with ONLY a single JSON object (no markdown, no commentary).' : '\n\nRespond with ONLY a single JSON object (no markdown, no commentary) that matches this JSON Schema exactly:\n' + JSON.stringify(schema);
  const msgs = [{role: 'system', content: sys}, ...(messages || [{role: 'user', content: user}]).map(m => ({role: m.role, content: m.content}))];
  const body = {model, messages: msgs, max_tokens: Math.min(maxTokens, 8192), temperature: 0.7};
  if (schema) body.response_format = {type: 'json_object'};
  if (/gpt-oss/i.test(model)) body.reasoning_effort = 'low'; // reasoning tokens count against max_tokens and the per-minute quota
  const headers = {'Content-Type': 'application/json'}; if (key) headers.Authorization = 'Bearer ' + key;
  if (/openrouter\.ai/.test(base)) { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Season English'; }
  let res;
  try { res = await fetch(base + '/chat/completions', {method: 'POST', headers, body: JSON.stringify(body)}); }
  catch (e) { throw new Error('Không gọi được ' + base + '. ' + (isLocalBase(base) ? 'Ollama/LM Studio đã chạy chưa? Với Ollama cần cho phép CORS: đặt biến môi trường OLLAMA_ORIGINS=* rồi khởi động lại.' : 'Có thể do mạng hoặc dịch vụ không cho gọi từ trình duyệt (CORS).')); }
  if (res.status === 400 && schema) { // some servers reject response_format → retry without it
    const b2 = {...body}; delete b2.response_format; delete b2.reasoning_effort; res = await fetch(base + '/chat/completions', {method: 'POST', headers, body: JSON.stringify(b2)});
  }
  if (!res.ok) {
    let detail = ''; try { const j = await res.json(); detail = j.error?.message || j.message || JSON.stringify(j).slice(0, 200); } catch {}
    if (res.status === 401) throw new Error('API key không hợp lệ (401). ' + detail);
    if (res.status === 404) throw new Error(`Không tìm thấy model "${model}" (404). Xem danh sách model của nhà cung cấp. ` + detail);
    if (res.status === 429) throw new Error('Quá giới hạn gói miễn phí (429), đợi một lúc rồi thử lại. ' + detail);
    throw new Error(`Lỗi API ${res.status}. ${detail}`);
  }
  const data = await res.json(); const choice = data.choices?.[0]; if (!choice) throw new Error('API không trả về nội dung.');
  let text = (choice.message?.content || '').trim();
  if (choice.finish_reason === 'length') throw new Error('Kết quả bị cắt ngắn (max tokens). Thử lại hoặc dùng model khác.');
  let json = null;
  if (schema) { const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''); const m = cleaned.match(/\{[\s\S]*\}/); try { json = JSON.parse(m ? m[0] : cleaned); } catch { throw new Error('Model trả về JSON không hợp lệ – thử model lớn hơn (70B) hoặc gửi lại.'); } }
  return {text, json, model: data.model || model, usage: data.usage};
}
const ai = {
  provider: () => S.settings.provider || 'claude',
  hasKey: () => { const p = ai.provider(); return p === 'gemini' ? !!S.settings.geminiKey : p === 'openai' ? !!(S.settings.oaiKey || isLocalBase(S.settings.oaiBase)) : !!S.settings.apiKey; },
  modelName: () => { const p = ai.provider(); return p === 'gemini' ? (S.settings.geminiModel || 'gemini-3.8-flash') : p === 'openai' ? (S.settings.oaiModel || '?') : (S.settings.model || 'claude-opus-5-5'); },
  providerLabel: () => ({claude: 'Claude API', gemini: 'Google Gemini', openai: 'OpenAI-compatible: ' + (S.settings.oaiBase || '')}[ai.provider()]),
  async call(opts) {
    const p = ai.provider();
    if (p === 'gemini') { if (!S.settings.geminiKey) throw new Error('Chưa có Gemini API key. Người vận hành nhập trong Cài đặt.'); return geminiCall(opts); }
    if (p === 'openai') { if (!ai.hasKey()) throw new Error('Chưa có API key cho dịch vụ OpenAI-compatible. Người vận hành nhập trong Cài đặt.'); return openaiCall(opts); }
    return claudeCall(opts);
  }
};
async function claudeCall({system, user, messages, schema, maxTokens = 16000, effort = 'medium', noBase = false}) {
  {
    const key = S.settings.apiKey; if (!key) throw new Error('Chưa có API key. Người vận hành nhập trong Cài đặt.');
    const model = S.settings.model || 'claude-opus-5-5';
    const body = {model, max_tokens: maxTokens, system: noBase ? [{type: 'text', text: system}] : [{type: 'text', text: PROMPTS.base}, {type: 'text', text: system}], messages: messages || [{role: 'user', content: user}]};
    const supportsEffort = /opus-5|sonnet-5|fable/.test(model);
    if (schema || supportsEffort) { body.output_config = {}; if (supportsEffort) body.output_config.effort = effort; if (schema) body.output_config.format = {type: 'json_schema', schema}; }
    const headers = {'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'};
    if (/opus-5-5|sonnet-5-5|fable/.test(model)) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; body.fallbacks = 'default'; }
    let res;
    try { res = await fetch('https://api.anthropic.com/v1/messages', {method: 'POST', headers, body: JSON.stringify(body)}); }
    catch (e) { throw new Error('Không kết nối được tới api.anthropic.com (mạng hoặc trình duyệt chặn). ' + e.message); }
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); detail = j.error?.message || ''; } catch {}
      if (res.status === 401) throw new Error('API key không hợp lệ (401). ' + detail);
      if (res.status === 429) throw new Error('Quá giới hạn tốc độ (429), thử lại sau ít phút. ' + detail);
      if (res.status === 400) throw new Error('Yêu cầu không hợp lệ (400): ' + detail);
      throw new Error(`Lỗi API ${res.status}. ${detail}`);
    }
    const data = await res.json();
    if (data.stop_reason === 'refusal') throw new Error('AI từ chối xử lý yêu cầu này' + (data.stop_details?.explanation ? ': ' + data.stop_details.explanation : '.'));
    if (data.stop_reason === 'max_tokens') throw new Error('Kết quả bị cắt ngắn (max_tokens). Thử lại hoặc giảm độ dài.');
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let json = null;
    if (schema) { try { json = JSON.parse(text); } catch { throw new Error('AI trả về JSON không hợp lệ.'); } }
    return {text, json, model: data.model, usage: data.usage};
  }
}
Object.assign(ai, {
  assessPlacement(test, u) {
    const f = formOf(test); const a = test.answers; const ss = test.sectionScores;
    const user = `Learner: ${u.name}. Test kind: ${test.kind}.
Learner profile (self-assessment and certificates are hints only – base the decision on the test evidence; tailor the monthly goal to their job): ${profileSummary(u)}
Automatically scored: Listening ${ss.listening.points}/${ss.listening.max} (${ss.listening.cefr}), Reading/Grammar/Vocabulary ${ss.reading.points}/${ss.reading.max} (${ss.reading.cefr}). Writing is worth ${ss.writing.max} points and Speaking ${ss.speaking.max} points of the 100-point total; the rubric scores you give are scaled to those maxima automatically.
${test.warnings?.length ? `Integrity note: the learner left the test screen ${test.warnings.length} time(s).` : ''}${test.autoSubmitted ? ` The test was auto-submitted (${test.autoReason}).` : ''}

${writingTasks(f).map((t, i) => `WRITING ${t.title} (${t.points || ''} pts): ${t.task}\nMessage: ${t.message}\nRequirement: ${t.requirement}\nLEARNER'S ANSWER (${wordCount(a[t.key])} words):\n${a[t.key] || '(no text)'}`).join('\n\n')}

SPEAKING (speech-to-text transcripts):
${f.speaking.tasks.map(t => `${t.title}\nPrompt: ${t.prompt}\nAnswer: ${a[t.key] || '(no answer)'}`).join('\n\n')}`;
    return ai.call({system: prompt('placement'), user, schema: SCHEMAS.placement, effort: 'medium'}).then(r => r.json);
  },
  /** Week of micro-lessons (one per day, Mon→Fri): ONE short system prompt (no base prompt). Returns [{day, title, theory, vocab:[{e,v}], practice}]. */
  generateWeekLessons({cefr, topic, job, style, vi, n = 5, plan = [], persona}) {
    const planNote = (persona ? ` Phong cách nội dung: ${persona === 'formal' ? 'TRANG TRỌNG (tình huống công việc chính thức: email, họp, khách hàng; giọng lịch sự, không tiếng lóng)' : 'THÂN THIỆN (tình huống trò chuyện hằng ngày với đồng nghiệp; giọng gần gũi)'}.` : '') + (plan.length ? ` Bám sát kế hoạch đã duyệt cho từng ngày: ${plan.map((p, i) => `ngày ${i + 1}: ${p}`).join('; ')}.` : '');
    const explainLang = (vi ?? isLow(cefr)) ? 'tiếng Việt (người học mới bắt đầu, chỉ giữ từ/câu mẫu bằng tiếng Anh)' : 'English';
    const mkSys = k => prompt('lesson').replace(/\{n\}/g, String(k)).replace(/\{cefr_level\}/g, cefr).replace(/\{topic\}/g, topic || 'giao tiếp công việc').replace(/\{job\}/g, job || 'nhân viên văn phòng').replace(/\{learning_style\}/g, style || 'ví dụ thực tế ngắn gọn').replace(/\{explain_lang\}/g, explainLang);
    const sys = mkSys(n);
    const parseOne = (j, i) => {
      const pick = (...keys) => { for (const k of keys) { const v = j[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; };
      const vocab = (Array.isArray(j.vocab) ? j.vocab : Array.isArray(j.vocabulary) ? j.vocabulary : []).slice(0, 3).map(x => { const e = String(x.e || x.en || x.word || '').trim(); return {e, v: String(x.v || x.vi || x.meaning || '').trim(), ipa: String(x.ipa || '').trim(), phrases: cleanPhrases(x.phrases, e), ...vocabExtras(x, cefr)}; }).filter(x => x.e);
      const str = v => String(v || '').trim();
      // listening / reading: a passage + one multiple-choice question whose answer is one of the options
      const mcqPart = (o, bodyKey) => { if (!o || typeof o !== 'object') return null; const p = normPractice({type: 'mcq', prompt: o.prompt || o.question, options: o.options, answer: o.answer}); const body = str(o[bodyKey]); return body && p.type === 'mcq' && p.options.some(x => normAns(x) === normAns(p.answer)) ? {[bodyKey]: body, prompt: p.prompt, options: p.options, answer: p.answer} : null; };
      const sp = j.speaking && str(j.speaking.answer) ? {prompt: str(j.speaking.prompt), answer: str(j.speaking.answer)} : null;
      const pron = parsePron(j.pron);
      let practice = normPractice(j.practice ?? j.practise ?? j.exercise ?? j.task ?? j.challenge);
      if (!practice.prompt) practice = {type: 'write', prompt: (vi ?? isLow(cefr)) ? `Viết 2 câu về ${topic || 'công việc của bạn'} theo mẫu câu trong lý thuyết, dùng ${vocab.map(x => '"' + x.e + '"').join(', ') || 'từ vừa học'}.` : `Write two sentences about ${topic || 'your work'} with the pattern above, using ${vocab.map(x => '"' + x.e + '"').join(', ') || 'the new words'}.`, options: [], answer: ''};
      if (practice.type !== 'write') practice.answer = keyList(practice.answer)[0] ? String(practice.answer).split(/\s*\/\s*/)[0].trim() : practice.answer; // one correct answer only
      practice = ensureFillHint(practice, vocab); // guarantee the meaning hint so only one word fits
      return {day: clamp(+j.day || i + 1, 1, n), title: pick('title', 'pattern') || `Bài ${i + 1}`, theory: pick('theory', 'explanation', 'lesson') || '—', vocab, practice, explainLang, objective: pick('objective', 'goal'), examples: (Array.isArray(j.examples) ? j.examples : []).map(str).filter(s => s && !hasVi(s) && !isFormula(s)).slice(0, 4), pron, listening: mcqPart(j.listening, 'audio'), reading: mcqPart(j.reading, 'text'), speaking: sp, wordclass: mcqOnly(j.wordclass), worduse: mcqOnly(j.worduse),
        // keep a translation only when it really is Vietnamese (models sometimes copy the English answer); missing ones are fetched when the learner answers correctly
        trans: Object.fromEntries(['L', 'R', 'W', 'S'].map(c => [c, {q: str(j.trans?.[c]?.q), a: str(j.trans?.[c]?.a)}]).filter(([, v]) => v.q && v.a && hasVi(v.a)))};
    };
    const full = !(S.settings.prompts && S.settings.prompts.lesson); // an operator-edited prompt may not ask for the 4 skills
    const parse = r => { const arr = Array.isArray(r.json?.lessons) ? r.json.lessons : (r.json && r.json.theory ? [r.json] : []); return arr.slice(0, n).map(parseOne).sort((a, b) => a.day - b.day); };
    // quality gate per lesson: theory must teach (long enough, no exercise meta text) and vocab must appear in its examples
    const properVocab = m => m.vocab.filter(v => /^[A-Z]/.test(v.e) && v.e !== 'I').map(v => v.e).join(', '); // names of people / companies are not vocabulary
    const okLesson = m => { if (properVocab(m)) return false; const t = (m.theory || '').toLowerCase(); const used = m.vocab.filter(v => t.includes(v.e.toLowerCase())).length; const meta = /(trắc nghiệm|bài tập|điền từ|chọn câu|exercise|quiz)/i.test(m.theory); return wordCount(m.theory) >= 25 && used >= 2 && !meta && (!full || !!(m.listening && m.reading && m.speaking && m.pron && m.pron.verified && mcq4(m.listening) && mcq4(m.reading))) && !levelViolation(m, cefr); };
    // what exactly was wrong, so the retry can fix it instead of guessing
    const problems = ls => ls.map(m => { const v = levelViolation(m, cefr); const pr = full && m.pron && !m.pron.verified ? `phát âm: cần đủ 3 từ có IPA chứa âm "${m.pron.sound}"${m.pron.rejected.length ? ` (sai: ${m.pron.rejected.join(', ')})` : ''}` : ''; return v || pr ? `bài ngày ${m.day}: ${[v && 'vượt mức – ' + v, pr].filter(Boolean).join('; ')}` : ''; }).filter(Boolean).join(' | ');
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const bad = ls => ls.length < n ? n : ls.filter(m => !okLesson(m)).length;
    const mark = ls => { ls.forEach(m => { m.levelWarn = levelViolation(m, cefr); }); return ls; }; // leftover problems are shown to the operator when reviewing
    const run = note => ai.call({system: sys + levelScopeNote(cefr) + (note ? '\n\nLƯU Ý SỬA: ' + note : ''), user: `Tạo ${n} bài học.${planNote}`, schema: SCHEMAS.lesson, effort: 'low', maxTokens: 8000, noBase: true, lean: true}).then(parse).catch(e => { if (n > 2 && /cắt ngắn|max tokens/i.test(e.message)) return split(note); throw e; });
    // the model ran out of output room for the whole week (small free-tier quotas): build it in two halves instead
    const arrOf = r => Array.isArray(r.json?.lessons) ? r.json.lessons : [];
    const half = (k, offset, extra, note) => ai.call({system: mkSys(k) + levelScopeNote(cefr) + (note ? '\n\nLƯU Ý SỬA: ' + note : ''), user: `Tạo ${k} bài học.${planNote}${extra}`, schema: SCHEMAS.lesson, effort: 'low', maxTokens: 8000, noBase: true, lean: true}).then(r => arrOf(r).slice(0, k).map((j, i) => ({...parseOne(j, i), day: offset + i + 1})));
    const split = async note => {
      const k1 = Math.ceil(n / 2), k2 = n - k1;
      const a = await half(k1, 0, ` Đây là ${k1} ngày ĐẦU của một tuần ${n} ngày.`, note);
      const second = () => half(k2, k1, ` Đây là ${k2} ngày CUỐI của một tuần ${n} ngày. Các ngày trước đã dạy: ${a.map(x => x.title).join('; ')}. Không lặp lại các mẫu câu đó, khó dần lên.`, note);
      let b; try { b = await second(); } catch (e) { if (!/429/.test(e.message)) throw e; await wait(60000); b = await second(); } // per-minute quota: wait once
      return [...a, ...b];
    };
    // Flow: a whole week is built in two halves (smaller answers are complete more often and fit free-tier quotas), then every lesson that fails the checks is rebuilt on its own.
    const why = m => { const out = []; const v = levelViolation(m, cefr); if (v) out.push('vượt mức – ' + v);
      if (wordCount(m.theory) < 25) out.push('theory quá ngắn'); if (properVocab(m)) out.push('vocab không được là tên riêng: ' + properVocab(m));
      if (full && !(m.listening && m.reading && m.speaking)) out.push('thiếu ' + [!m.listening && 'listening', !m.reading && 'reading', !m.speaking && 'speaking'].filter(Boolean).join(', ') + ' (answer của listening/reading phải trùng nguyên văn một lựa chọn)');
      if (full && m.pron && !m.pron.verified) out.push(`pron cần đủ 3 từ có IPA chứa âm "${m.pron.sound}"`); if (full && !m.pron) out.push('thiếu pron');
      return out.join('; ') || 'chưa đạt kiểm tra chất lượng (theory đủ 3 phần, mỗi từ vocab có trong ví dụ, không nhắc tới bài tập)'; };
    const one = (d, all) => { const cur = all.find(x => x.day === d); const others = all.filter(x => x.day !== d).map(x => x.title).join('; ');
      return half(1, d - 1, ` Đây là bài của ngày ${d} trong một tuần ${n} ngày${cur ? `, giữ mẫu câu "${cur.title}"` : ''}.${others ? ` Các ngày khác đã dạy: ${others} (không lặp lại).` : ''}`, cur ? 'bản trước bị lỗi: ' + why(cur) + '. Viết lại đầy đủ mọi key.' : '').then(a => a[0] || null); };
    const say = msg => { try { ai.onStatus && ai.onStatus(msg); } catch {} }; // progress text for the operator's screen
    const patient = async fn => { try { return await fn(); } catch (e) { if (!/429/.test(e.message)) throw e; say('Gói AI miễn phí đã hết hạn mức của phút này – chờ khoảng 60 giây rồi làm tiếp…'); await wait(60000); return fn(); } }; // per-minute quota: wait once
    return (async () => {
      let ls = n >= 4 ? await split('') : await run('');
      const days = Array.from({length: n}, (_, i) => i + 1);
      const todo = days.filter(d => { const m = ls.find(x => x.day === d); return !m || !okLesson(m); }).slice(0, 3);
      for (const d of todo) {
        say(`Bài ngày ${d} chưa đạt kiểm tra chất lượng – đang soạn lại riêng bài này (${todo.indexOf(d) + 1}/${todo.length})…`);
        let fixed = null; try { fixed = await patient(() => one(d, ls)); } catch (e) { break; } // keep what we have if the service gives up
        const cur = ls.find(x => x.day === d);
        if (fixed && (!cur || okLesson(fixed) || (!okLesson(cur) && wordCount(fixed.theory) >= wordCount(cur.theory) && (fixed.listening || !cur.listening)))) ls = [...ls.filter(x => x.day !== d), fixed];
      }
      if (!ls.length) throw new Error('AI không trả về bài học hợp lệ. Thử lại sau ít phút.');
      // words whose 3 phrases are missing or were rejected (did not contain the word) are completed with one small call
      const lack = [...new Set(ls.flatMap(m => m.vocab.filter(v => (v.phrases || []).length < 3).map(v => v.e)))];
      if (lack.length) { say(`Đang bổ sung cụm từ cho ${lack.length} từ vựng…`); try { const map = await patient(() => fetchPhrases(lack, cefr, topic)); ls.forEach(m => m.vocab.forEach(v => { if ((v.phrases || []).length < 3) v.phrases = cleanPhrases([...(v.phrases || []), ...(map[v.e.toLowerCase()] || [])], v.e); })); } catch (e) { /* the operator can fill them later from the set page */ } }
      return mark(ls.sort((a, b) => a.day - b.day));
    })();
  },
  /** Single personalised micro-lesson (kept for the learner's optional extra practice). */
  generateMicroLesson(vars) { return ai.generateWeekLessons({...vars, n: 1}).then(ls => ls[0] || {theory: '—', vocab: [], practice: normPractice(''), explainLang: ''}); },
  /** Suggest weekly topic frameworks for the given week numbers; operator reviews before saving. */
  suggestWeeks(weekNos) {
    const L = learners(); const jobs = [...new Set(L.map(x => x.profile?.position).filter(Boolean))].slice(0, 8);
    const goals = PROFILE_OPTS.goals.map(([k, lbl]) => [lbl, L.filter(x => (x.profile?.goals || []).includes(k)).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => `${x[0]} (${x[1]})`);
    const lv = LEVELS.map(l => [l, activeLearners().filter(x => x.cefr === l).length]).filter(x => x[1]).map(x => `${x[0]}: ${x[1]}`);
    const learnersTxt = `${L.length} người · mức ${lv.join(', ') || 'chưa xếp'} · nghề: ${jobs.join(', ') || 'nhân viên văn phòng'} · mục đích: ${goals.join(', ') || 'giao tiếp công việc'}`;
    const used = S.weeks.filter(w => w.topic && !weekNos.includes(w.n)).map(w => `T${w.n}: ${w.topic}`).join('; ') || '(chưa có)';
    const lvls = levelsInUse().length ? levelsInUse() : ['A1', 'A2', 'B1'];
    const sys = prompt('weeks').replace(/\{n\}/g, String(weekNos.length)).replace(/\{learners\}/g, learnersTxt).replace(/\{used\}/g, used).replace(/\{levels\}/g, lvls.join(', '));
    const str = v => String(v || '').trim();
    // each week → up to 3 options with a per-level focus; an old-format reply (one flat topic per week) becomes a single option
    const opt = o => ({topic: str(o.topic), description: str(o.description), objectives: str(o.objectives), keyVocabHint: str(o.keyVocabHint), levels: Object.fromEntries((Array.isArray(o.levels) ? o.levels : []).map(l => [str(l.cefr).toUpperCase(), (Array.isArray(l.days) ? l.days : [l.focus]).map(d => str(d).replace(/^T[2-6]\s*[:.\-–]?\s*/i, '')).filter(Boolean).slice(0, LESSONS_PER_WEEK)]).filter(l => l[0] && l[1].length))});
    return ai.call({system: sys, user: `Các tuần cần gợi ý: ${weekNos.join(', ')}.`, schema: SCHEMAS.weeks, effort: 'low', maxTokens: Math.min(8000, 1500 + 600 * lvls.length * 3 * weekNos.length), noBase: true}).then(r => (r.json?.weeks || []).map((w, i) => ({week: weekNos.includes(+w.week) ? +w.week : weekNos[i], levels: lvls, options: (Array.isArray(w.options) && w.options.length ? w.options : [w]).map(opt).filter(o => o.topic).slice(0, 4)})).filter(w => w.options.length && weekNos.includes(w.week)));
  },
  /** Audio file → English transcript. Gemini reads audio inline; OpenAI-compatible services use /audio/transcriptions (Groq Whisper). Claude has no audio input. */
  canTranscribe: () => ai.hasKey() && ['gemini', 'openai'].includes(ai.provider()),
  async transcribe(file) {
    const p = ai.provider(); let res;
    if (p === 'openai') {
      const base = (S.settings.oaiBase || '').replace(/\/+$/, ''); const fd = new FormData(); fd.append('file', file, file.name || 'audio.webm'); fd.append('model', S.settings.sttModel || 'whisper-large-v3-turbo'); fd.append('language', 'en');
      try { res = await fetch(base + '/audio/transcriptions', {method: 'POST', headers: S.settings.oaiKey ? {Authorization: 'Bearer ' + S.settings.oaiKey} : {}, body: fd}); } catch (e) { throw new Error('Không gửi được file ghi âm để chép lời. ' + e.message); }
      if (!res.ok) throw new Error(`Dịch vụ AI không chép lời được file này (${res.status}). Kiểm tra "Model chép lời" trong Cài đặt.`);
      return String((await res.json()).text || '').trim();
    }
    if (p === 'gemini') {
      const b64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(file); });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(S.settings.geminiModel || 'gemini-3.8-flash')}:generateContent`;
      const body = {contents: [{role: 'user', parts: [{text: 'Transcribe the English speech in this audio verbatim. Return only the transcript, with no commentary.'}, {inline_data: {mime_type: (file.type || 'audio/mpeg').split(';')[0], data: b64}}]}]};
      try { res = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': S.settings.geminiKey}, body: JSON.stringify(body)}); } catch (e) { throw new Error('Không gửi được file ghi âm để chép lời. ' + e.message); }
      if (!res.ok) throw new Error(`Gemini không chép lời được file này (${res.status}).`);
      const j = await res.json(); return ((j.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join(' ')).trim();
    }
    throw new Error('Nhà cung cấp AI đang chọn không chép lời được file ghi âm.');
  },
  /** Grade a micro-lesson practice answer against its own theory/vocab (short prompt, no base). */
  gradeMicro({cefr, vi, theory, vocab, practice, answer, persona}) {
    const explainLang = (vi ?? isLow(cefr)) ? 'tiếng Việt' : 'English'; const p = normPractice(practice);
    const sys = prompt('mgrade').replace(/\{cefr_level\}/g, cefr).replace(/\{explain_lang\}/g, explainLang).replace(/\{theory\}/g, theory || '').replace(/\{vocab\}/g, (vocab || []).map(v => `${v.e} = ${v.v}`).join('; ')).replace(/\{ptype\}/g, p.type).replace(/\{practice\}/g, p.prompt + (p.options.length ? ' | lựa chọn: ' + p.options.join(' / ') : '')).replace(/\{key\}/g, p.answer || '(không có)').replace(/\{answer\}/g, answer || '');
    return ai.call({system: (persona ? personaNote(persona).trim() + '\n\n' : '') + sys + RELEVANCE_RULE_GRADE + (persona ? `\nViết "feedback" đúng persona ${persona.toUpperCase()} ở đầu prompt.` : ''), user: 'Chấm bài.', schema: SCHEMAS.mgrade, effort: 'low', maxTokens: 600, noBase: true}).then(r => { const j = r.json || {}; return {score: clamp(Math.round(+j.score || 0), 0, 10), ok: !!j.ok, feedback: String(j.feedback || '').trim(), fix: String(j.fix || '').trim(), at: new Date().toISOString()}; });
  },
  /** Operator matrix: 5 daily micro-lessons (Mon→Fri) for a level, using the job/style mix of learners at that level. */
  generateLessonSet(week, cefr) {
    const w = weekInfo(week); const L = activeLearners().filter(x => x.cefr === cefr && x.profile);
    const job = [...new Set(L.map(x => x.profile.position).filter(Boolean))].slice(0, 3).join(', ') || 'nhân viên văn phòng';
    const styleKeys = [...new Set(L.flatMap(x => x.profile.styles || []))].slice(0, 3); const style = styleKeys.length ? optLabels('styles', styleKeys) : 'ví dụ thực tế ngắn gọn';
    return ai.generateWeekLessons({cefr, topic: w.topic, job, style, vi: isLow(cefr), n: LESSONS_PER_WEEK, plan: (w.plan || {})[cefr] || [], persona: levelPersona(cefr)}).then(ls => ls.map(m => ({durationMin: m.listening || m.reading || m.speaking ? 10 : 5, micro: true, ...m, title: m.title || w.topic})));
  },
  coachTurn(session, u, lessonsVocab) {
    const w = weekInfo(session.week);
    const ch = session.challenge; // level-up challenge: Season speaks, asks and scores at the TARGET level
    const sys = personaNote(personaOf(u)).trim() + '\n\n' + prompt('coach') + RELEVANCE_RULE_COACH + `\n\nLearner: ${u.name}, CEFR ${u.cefr}. Explanation language for suggestions: ${learnerWantsVi(u) ? 'Vietnamese' : 'English'}.\nLearner profile (use it to pick situations and examples from their real job, and to match their preferred learning style): ${profileSummary(u)}\nWeek topic: ${w.topic}. ${w.description || ''}\nTarget vocabulary this week: ${lessonsVocab.slice(0, 40).join(', ') || '(none yet)'}\n\nReminder: write "reply" and every explanation strictly in the ${personaOf(u).toUpperCase()} persona defined at the top.`
      + (ch ? `\n\nCHALLENGE MODE (overrides the level above): the learner is trying to move up from ${u.cefr} to ${ch.target}. Speak, ask and judge strictly at ${ch.target} level: use ${ch.target}-level vocabulary and structures, ask questions that need ${ch.target}-level answers (reasons, comparisons, opinions, hypotheticals where the level allows), and score the rubric against what a ${ch.target} learner should produce, not against their current level. Do not simplify your language to help them. Keep "reply" to 2-4 sentences.` + levelScopeNote(ch.target) : '');
    const messages = session.messages.slice(-16).map(m => ({role: m.role, content: m.content}));
    return ai.call({system: sys, messages, schema: SCHEMAS.coach, effort: 'low'}).then(r => r.json);
  },
  gradeSubmission(sub, u) {
    const w = weekInfo(sub.week);
    const user = `Learner: ${u.name}, CEFR ${u.cefr}. Feedback language: ${learnerWantsVi(u) ? 'Vietnamese' : 'English'}. Profile: ${profileSummary(u)}\nWeek ${sub.week} topic: ${w.topic}.\nTask given: ${sub.task}\nSubmission type: ${sub.type}\nRelevance check first: if the submission does not address the task given (off-topic, about something else, meaningless text, or not in English), meaning must be 0 or 1, total must not exceed 30, and the feedback must start by saying the text does not answer the task.${personaNote(personaOf(u))}\n\nSUBMISSION:\n${sub.text}`;
    return ai.call({system: prompt('grade'), user, schema: SCHEMAS.grade, effort: 'medium'}).then(r => r.json);
  },
  /** Vocabulary set for the mini games from a free-text topic: validated by the AI, words at the learner's level, plus unrelated words for "odd one out". */
  gameVocab(topic, cefr, n = 12) {
    return ai.call({system: prompt('gamevocab').replace(/\{cefr\}/g, cefr).replace(/\{topic\}/g, topic.replace(/"/g, '')).replace(/\{n\}/g, String(n)), user: `Chủ đề người học vừa nhập: "${topic.replace(/"/g, '')}". Mức: ${cefr}. Hãy kiểm tra chủ đề rồi tạo bộ ${n} từ theo đúng JSON.`, schema: SCHEMAS.gamevocab, effort: 'low', maxTokens: 4000, noBase: true, lean: true}).then(r => {
      const j = r.json || {}; if (j.valid === false) { const e = new Error(j.reason || 'Chủ đề không phù hợp'); e.rejected = true; e.soft = !!j.soft; throw e; }
      const seen = new Set(); const clean = x => ({e: String(x.e || '').toLowerCase().replace(/[^a-z\s'-]/g, '').trim(), v: String(x.v || '').trim(), def: String(x.def || '').trim(), ipa: String(x.ipa || '').trim(), pos: String(x.pos || '').toLowerCase().trim()});
      const words = (j.words || []).map(clean).filter(w => w.e && w.v && !seen.has(w.e) && seen.add(w.e)).slice(0, n);
      if (words.length < 6) throw new Error('AI trả về quá ít từ – thử lại hoặc đổi chủ đề');
      const others = (j.others || []).map(clean).filter(w => w.e && w.v && !seen.has(w.e)).slice(0, 10);
      return {topic: String(j.topic || topic).trim() || topic, words, others};
    });
  },
  /** Short level-up test at the target level (own prompt, no base prompt). Returns a form in the TEST_FORMS shape. */
  generateLevelForm(target) {
    const run = note => ai.call({system: prompt('levelform').replace(/\{target\}/g, target) + levelScopeNote(target) + (note ? '\n\nLƯU Ý SỬA: ' + note : ''), user: `Tạo đề thi mức ${target}.`, schema: SCHEMAS.levelform, effort: 'medium', maxTokens: 6000, noBase: true, lean: true}).then(r => levelFormFromJson(r.json, target));
    // small models tend to write texts far shorter than asked: one retry with the measured lengths, then keep the result but flag it
    const short = f => { const lw = f.listening.parts[0].audio.map(x => x[1]).join(' ').split(/\s+/).length, rw = f.reading.parts[0].text.split(/\s+/).length; return lw < 90 || rw < 100 ? `đoạn nghe đang ${lw} từ (cần 120–180), bài đọc đang ${rw} từ (cần 150–220): viết DÀI HƠN, nhiều chi tiết hơn để 5 câu hỏi có căn cứ trong bài` : ''; };
    return run('').then(f => { const n = short(f); return n ? run(n).then(g => short(g) ? Object.assign(g, {short: true}) : g) : f; });
  }
});
/** AI JSON → form in the TEST_FORMS shape (1 listening part + 1 reading part, 5 questions × 5 points each, writing 80–120 words, 1 speaking task). */
function levelFormFromJson(j, target) {
  const qs = (arr, what) => { const out = (arr || []).filter(q => q && q.q && Array.isArray(q.options) && q.options.length === 4).slice(0, 5).map(q => mcq(String(q.q).trim(), q.options.map(o => String(o).trim()), clamp(+q.answer || 0, 0, 3), 5)); if (out.length !== 5) throw new Error(`Phần ${what} không đủ 5 câu hỏi 4 lựa chọn – sinh lại`); return out; };
  if (!j || !j.listening || !j.reading || !j.writing || !j.speaking) throw new Error('AI trả về thiếu phần');
  return {title: (j.title || '').trim() || `Level-up test ${target}`,
    listening: {intro: 'Đoạn nghe được phát tối đa 2 lần (giọng đọc của trình duyệt). Nghe xong chọn đáp án.', parts: [{key: 'L1', title: j.listening.title || 'Part A', instruction: j.listening.instruction || 'Listen and answer questions 1–5.', audio: (j.listening.audio || []).map(x => [String(x.who || 'Speaker'), String(x.line || '')]).filter(x => x[1]), questions: qs(j.listening.questions, 'Nghe')}]},
    reading: {parts: [{key: 'R1', title: j.reading.title || 'Part A', instruction: j.reading.instruction || 'Read the text and answer questions 1–5.', text: String(j.reading.text || ''), questions: qs(j.reading.questions, 'Đọc')}]},
    writing: {task: String(j.writing.task || ''), message: String(j.writing.message || ''), requirement: 'Please write 80–120 words.', minWords: 80, maxWords: 120},
    speaking: {tasks: [{key: 'S1', title: j.speaking.title || 'Task 1 – Scenario (3 phút)', prompt: String(j.speaking.prompt || ''), hint: String(j.speaking.hint || '')}]}};
}

// =====================================================================
// Placement test – "Workplace English CEFR Placement Test" (GFT)
// 4 skills × 25 points, per-section timer, auto-submit, warning system
// =====================================================================
const mcq = (q, options, answer, pts) => ({q, options, answer, pts});
const TEST_FORMS = {
  A: {
    title: 'Workplace English CEFR Placement Test',
    listening: {
      intro: 'Mỗi phần nghe được phát tối đa 2 lần (giọng đọc của trình duyệt). Nghe xong chọn đáp án.',
      parts: [
        {key: 'LA', title: 'Part A – Thông báo của quản lý', instruction: 'Listen to the manager\'s announcement and answer questions 1–5.', audio: [['Manager', 'Good morning, everyone. Just a quick reminder about tomorrow\'s team meeting. It will start at 9:30, not 9:00 as originally planned. We\'ll meet in Room 210. Please bring the latest sales report because we\'ll discuss our results from last month. If you have any questions, please speak to Sarah before the meeting.'], ['Employee', 'Why has the time changed?'], ['Manager', 'The client has asked us to move our morning call, so we needed to change the meeting time.']],
          questions: [mcq('What time is the team meeting?', ['9:00', '9:30', '10:00', '10:30'], 1, 1), mcq('Where is the meeting?', ['Room 201', 'Room 210', 'Room 220', 'Online'], 1, 1), mcq('What should employees bring?', ['Their laptops', 'Their ID cards', 'The sales report', 'Their notebooks'], 2, 1), mcq('Who should Maria contact?', ['David', 'Sarah', 'Tom', 'James'], 1, 1), mcq('Why has the meeting changed?', ['The manager is sick.', 'The room is unavailable.', 'The client has changed the schedule.', 'The company is having technical problems.'], 2, 1)]},
        {key: 'LB', title: 'Part B – Hội thoại với cấp trên', instruction: 'Listen to a conversation between a supervisor and an employee and answer questions 6–10.', audio: [['Employee', 'Hi, James. Do you have a minute? I\'m working on the customer report, but I\'m not sure how to handle one part of it.'], ['Supervisor', 'Sure. What\'s the problem?'], ['Employee', 'The customer is asking for a refund, but the situation is a little unusual. I\'m not sure which procedure applies.'], ['Supervisor', 'Have you checked the previous customer cases?'], ['Employee', 'No, not yet.'], ['Supervisor', 'I\'d start there. We had a very similar case last month, and the report might show you which procedure we followed.'], ['Employee', 'Okay. I\'ll check those records first.'], ['Supervisor', 'Good. If you still can\'t find the answer, come back to me. We have to send the report today, but there may be some flexibility with the exact time.'], ['Employee', 'That\'s helpful. Thanks.']],
          questions: [mcq('What problem does the employee have?', ['She cannot access the company website.', 'She is having difficulty completing a report.', 'She does not understand the customer\'s request.', 'She cannot contact her manager.'], 2, 1), mcq('What does the supervisor suggest first?', ['Asking another department for help', 'Checking previous customer records', 'Calling the customer', 'Sending the report immediately'], 1, 1), mcq('Why does the supervisor suggest checking previous records?', ['They may contain a similar case.', 'They contain the customer\'s personal information.', 'They are required by company policy.', 'They are easier to understand.'], 0, 1), mcq('What will the employee do next?', ['Contact the customer', 'Check previous cases', 'Rewrite the whole report', 'Ask the IT department'], 1, 1), mcq('What does the supervisor say about the deadline?', ['It cannot be changed.', 'It has already passed.', 'There may be some flexibility.', 'The report is no longer necessary.'], 2, 1)]},
        {key: 'LC', title: 'Part C – Thảo luận về chính sách hybrid', instruction: 'Listen to a short discussion between two employees about a new hybrid-work policy and answer questions 11–15.', audio: [['Anna', 'So, what do you think about the new hybrid-work policy?'], ['Mark', 'I think there are some advantages. People can probably concentrate better when they\'re working on tasks that require a lot of individual focus. But I\'m concerned about communication.'], ['Anna', 'What do you mean?'], ['Mark', 'When people aren\'t in the office, they may not hear about decisions that are made informally. Someone might have an important conversation in a meeting, for example, but another team member working remotely doesn\'t know about it.'], ['Anna', 'That\'s true. But I don\'t think that means the policy can\'t work. We probably need clearer communication procedures.'], ['Mark', 'Such as?'], ['Anna', 'Important decisions could be documented in one shared system instead of relying on conversations or messages between individual employees.'], ['Mark', 'Yes. That could make the system more reliable.']],
          questions: [mcq('What is the main concern discussed?', ['Employee salaries', 'Office space', 'Communication between teams', 'Employee training'], 2, 2), mcq('What does Anna believe is one advantage of the new system?', ['Employees can work fewer hours.', 'Employees can concentrate better on individual tasks.', 'Managers can reduce staff numbers.', 'Meetings will become unnecessary.'], 1, 2), mcq('What concern does Mark raise?', ['Some employees may receive less information.', 'Employees may work too many hours.', 'The office will become more expensive.', 'Customers may complain about the policy.'], 0, 2), mcq('What does Anna suggest?', ['Cancelling the policy', 'Increasing the number of meetings', 'Establishing clearer communication procedures', 'Requiring everyone to work in the office'], 2, 2), mcq('What can be inferred about both speakers?', ['They completely disagree with the policy.', 'They think the policy has potential but needs adjustments.', 'They believe remote work is impossible.', 'They think communication is not important.'], 1, 2)]}
      ]
    },
    // Part 2 – Reading, Grammar & Vocabulary: 40 single items (1 point each), graded A1 → C1 in blocks of 10. Short texts sit inside the question stem.
    reading: {
      intro: '40 câu, mỗi câu 1 điểm. Chọn một đáp án đúng cho mỗi câu; một số câu có đoạn văn ngắn ngay trong câu hỏi.',
      parts: [
        {key: 'R1', title: 'Questions 1–10 · Basic (A1–A2)', instruction: 'Choose the best answer.', text: '', questions: [
          mcq('Priya ____ a customer service agent.', ['are', 'am', 'is', 'be'], 2, 1),
          mcq('Marco needs to ____ the customer\'s problem.', ['sleep', 'swim', 'solve', 'cook'], 2, 1),
          mcq('Read this notice: "The help desk is open from 9 to 5." – When is the help desk open?', ['From 9 to 5', 'From 5 to 9', 'Only on Monday', 'It is closed'], 0, 1),
          mcq('The company has three ____ this week.', ['complaint', 'complaint\'s', 'complaints\'', 'complaints'], 3, 1),
          mcq('Read this chat message: Customer: "Hi, I have a problem with my refund." Agent: "____"', ['Hello! How can I help you?', 'Hello! Where are you from originally?', 'Hello! What is your favorite color?', 'Hello! Goodbye and have a very nice day.'], 0, 1),
          mcq('The support office is closed on ____.', ['Twelve', 'Angry', 'Sunday', 'Green'], 2, 1),
          mcq('Samuel ____ the manager about his refund yesterday.', ['call', 'called', 'calling', 'calls'], 1, 1),
          mcq('The support team will ____ the complaint carefully before responding.', ['look after', 'look for', 'look out for', 'look into'], 3, 1),
          mcq('Read this email: "Dear Ana, your refund of $45 will arrive in 5 business days. Thank you for your patience." – How much is the refund?', ['$54', '$45', '5 days', '45 days'], 1, 1),
          mcq('This month we received ____ complaints than last month.', ['few', 'fewer', 'less', 'more little'], 1, 1)]},
        {key: 'R2', title: 'Questions 11–20 · Intermediate (A2–B1)', instruction: 'Choose the best answer.', text: '', questions: [
          mcq('Read this chat: Agent: "Your order number, please?" Customer: "Sorry, ____?"', ['could you repeat that', 'I am doing fine today thank you', 'see you later', 'it is Tuesday afternoon today'], 0, 1),
          mcq('Marco could not fix the problem, so he asked his ____ for help.', ['customer', 'supervisor', 'invoice', 'deadline'], 1, 1),
          mcq('Read these instructions: "First, open the refund form. Next, enter your order number. Finally, click submit." – What should you do after opening the form?', ['click submit and finish now', 'enter your order number', 'close the form', 'call the manager on the phone'], 1, 1),
          mcq('Nadia ____ three emails about her refund, but nobody has replied yet.', ['sent', 'is sending', 'send', 'has sent'], 3, 1),
          mcq('The manager decided to ____ a complaint seriously and offer a refund.', ['make', 'do', 'take', 'have'], 2, 1),
          mcq('Read this paragraph: "Tomas ordered a laptop online, but it arrived with a cracked screen. He contacted customer support the same day and explained the problem. The company apologized, offered a full refund, and arranged for a courier to collect the damaged laptop the next morning. Tomas was satisfied with how quickly the issue was resolved." – What is this paragraph mainly about?', ['A customer who forgot to pay', 'A company resolving a customer\'s complaint quickly', 'A courier company changing delivery schedule', 'A laptop factory with quality problems'], 1, 1),
          mcq('If the item arrives damaged, customers ____ contact support within 48 hours.', ['would', 'should', 'were', 'did'], 1, 1),
          mcq('Read this reply: "Unfortunately, we ____ offer a refund after 30 days, but we can send a replacement part."', ['are unable to', 'are happy to', 'never wanted to', 'always refuse to'], 0, 1),
          mcq('The refund was approved; ____, it will take five days to appear in your account.', ['however', 'otherwise', 'as a result', 'in order that'], 0, 1),
          mcq('Read this paragraph: "Priya called the support line four times this week about the same billing error. Each time, a different agent asked her to repeat the whole story from the beginning. By Friday, she asked to speak to a manager and canceled her subscription." – What can you infer about Priya?', ['She was happy', 'She never contacted', 'She fixed it herself', 'She was frustrated by having to repeat her problem repeatedly'], 3, 1)]},
        {key: 'R3', title: 'Questions 21–30 · Upper-intermediate (B1–B2)', instruction: 'Choose the best answer.', text: '', questions: [
          mcq('Diego said that the refund ____ already been processed.', ['has', 'had', 'have', 'was'], 1, 1),
          mcq('Read this paragraph: "Chen\'s email began politely, thanking the support team for their quick reply. However, by the third paragraph, his tone shifted: he listed every delay in bullet points and ended with, \'I trust this will finally be resolved, as I have already spent considerable time on this matter.\' He did not use any angry words, but the message left little doubt about his patience running out." – What does the passage suggest about Chen\'s attitude?', ['He is losing patience despite his polite wording', 'He is completely satisfied', 'He does not care', 'He is thanking the team sincerely throughout'], 0, 1),
          mcq('Which sentence is the most diplomatic way to reject a refund request?', ['No, you cannot have a refund.', 'You should have read the policy before buying.', 'We refuse your request.', 'We understand your frustration, but unfortunately this falls outside our refund policy.'], 3, 1),
          mcq('The agent finally managed ____ the source of the billing error.', ['finding', 'find', 'to find', 'founded'], 2, 1),
          mcq('The support team will ____ the customer by email once the refund is complete.', ['notice', 'note', 'know', 'notify'], 3, 1),
          mcq('Read this paragraph: "Lena\'s complaint email was forwarded to three different departments before anyone replied. When the reply finally came, it apologized for the delay and explained that the ticket had been mislabeled from the start. This explanation, while accurate, did little to change how Lena felt about the overall experience, since the damage to her trust in the company had already been done." – What does \'this explanation\' refer to?', ['Lena\'s original complaint', 'The three different departments', 'The explanation that the ticket had been mislabeled', 'The refund policy'], 2, 1),
          mcq('Which reply is appropriate for a formal complaint from a corporate client?', ['Oops, sorry about that, my bad!', 'Yeah, we\'ll sort it out soon', 'We sincerely apologize for the inconvenience and will resolve this promptly.', 'Chill, it happens sometimes'], 2, 1),
          mcq('____ had the refund been processed than the customer called to complain again.', ['As soon', 'Not until', 'Hardly ever', 'No sooner'], 3, 1),
          mcq('Read this paragraph: "The company claims that its new complaint-handling system has reduced resolution time by half. Internal data shows that the average ticket now closes in two days rather than four. However, customer satisfaction scores have barely moved, suggesting that speed alone has not addressed the underlying issue: many customers report receiving faster replies that still fail to solve their actual problem." – What does the evidence in the passage actually support?', ['The system has completely failed', 'Faster replies have not made customers meaningfully more satisfied', 'Satisfaction scores have doubled', 'Tickets now take four days to close'], 1, 1),
          mcq('Which phrasing best de-escalates an angry customer without conceding fault prematurely?', ['I hear how frustrating this has been, and I want to understand exactly what happened.', 'Calm down', 'That\'s not our fault', 'I don\'t see why you\'re upset'], 0, 1)]},
        {key: 'R4', title: 'Questions 31–40 · Advanced (B2–C1)', instruction: 'Choose the best answer.', text: '', questions: [
          mcq('____ the complaint himself, Samuel understood why the customer was upset.', ['Handled', 'To handle', 'Having handled', 'Handling having'], 2, 1),
          mcq('Management announced that refund delays would be addressed ____ the board, not just for a few customers.', ['over', 'across', 'along', 'through'], 1, 1),
          mcq('Read this paragraph: "Aisha filed her complaint on Monday, expecting a reply within 24 hours as promised. When Thursday arrived with still no response, she escalated the matter to a regional manager, who admitted that the promise had never been realistic given current staffing levels. It was this admission, more than the original delay, that convinced her to leave." – What does \'this admission\' refer to?', ['Aisha\'s decision', 'The original delay', 'The website policy', 'The manager\'s statement that the 24-hour promise was never realistic'], 3, 1),
          mcq('The refund offered was purely ____, meaning the company was not obligated to provide it.', ['mandatory', 'contractual', 'statutory', 'discretionary'], 3, 1),
          mcq('By the time the manager arrived, the customer ____ for over an hour, growing visibly more frustrated.', ['had been waiting', 'was waiting', 'has waited', 'waited'], 0, 1),
          mcq('Read this passage: "Complaint-resolution metrics are frequently treated as proxies for customer trust, yet the two are only loosely correlated. What the data conceals is not the outcome itself but the customer\'s subjective sense of having been heard." – Which statement does the passage actually support?', ['Fast ticket closure does not guarantee that a customer feels genuinely heard', 'Companies should stop measuring resolution time', 'Trust is highest when tickets close quickly', 'Current systems accurately measure trust'], 0, 1),
          mcq('Which reply implies a refund without ever explicitly promising one?', ['We\'re reviewing your case, and I expect you\'ll be pleased with the outcome by Friday.', 'You will get a full refund within five days.', 'We cannot offer a refund in this case.', 'There is no possibility of compensation.'], 0, 1),
          mcq('The customer\'s complaint was ultimately deemed ____, meaning it had no basis in the company\'s actual policy.', ['unfinished', 'unfamiliar', 'unfounded', 'unforeseen'], 2, 1),
          mcq('Read this line from an internal memo: "The rollout of the new refund system was, shall we say, not without its complications." – What does this sentence actually imply?', ['The rollout went perfectly', 'The system was canceled', 'The writer is certain about the outcome', 'The rollout had significant problems'], 3, 1),
          mcq('Neither the manager nor the agents ____ aware that the refund policy had changed overnight.', ['was', 'is', 'were', 'has been'], 2, 1)]}
      ]
    },
    // Part 3 – Writing: two tasks (7 + 13 points), one rubric for the section (5 criteria × 1–5, scaled to 20)
    writing: {
      points: 20,
      tasks: [
        {key: 'writing', title: 'Task 1 – Phản hồi nhanh (7 phút · 7 điểm · A2–B1)', task: 'You receive this message from a colleague:', message: 'Hi! I need to take tomorrow morning off urgently for a family matter. Could you help me monitor the customer support inbox from 9 AM to 12 PM? I owe you one!', requirement: 'Write a short reply (50–80 words): agree to help and ask whether there are any important tickets you should pay special attention to.', minWords: 50, maxWords: 80, points: 7},
        {key: 'writing2', title: 'Task 2 – Báo cáo / đề xuất (13 phút · 13 điểm · B2–C1)', task: 'You work for a company that is updating its customer-service procedures. Your manager has sent you this message:', message: 'Hi,\nSeveral employees have said that they are sometimes unsure which customer-service procedure is the most recent one.', requirement: 'Write a formal email (120–150 words) replying to your manager: explain one serious problem this confusion could cause (for example, giving a customer the wrong refund information) and propose a solution that makes it easy for the team to find and use the latest documents.', minWords: 120, maxWords: 150, points: 13}
      ]
    },
    // Part 4 – Speaking: four tasks, one rubric for the section (4 criteria × 1–5 = 20 points)
    speaking: {
      points: 20,
      tasks: [
        {key: 'S1', title: 'Task 1 – Warm-up (3 phút · A1–A2)', prompt: 'The examiner asks:\n1. What do you do?\n2. What are your main responsibilities?\n3. What English do you use at work?\n4. What is one situation in which you find English difficult?', hint: 'Trả lời lần lượt 4 câu hỏi, mỗi câu 2–4 câu nói.'},
        {key: 'S2', title: 'Task 2 – Data description (4 phút · B1–B2)', prompt: 'You are in a team meeting. The table shows the number of customer complaints in the last three quarters. You have 30 seconds to look at the data. Then speak for 1–2 minutes:\n1. Summarise the main trend in the numbers.\n2. Point out the biggest change in Q3.\n3. Suggest one short-term action the team should take to deal with the Q3 problem.', table: {head: ['Quarter', 'Total complaints', 'Most common issue'], rows: [['Q1', '120', 'Delayed shipping'], ['Q2', '115', 'Delayed shipping'], ['Q3', '280', 'Software bugs']]}, hint: 'Dùng từ vựng mô tả số liệu: increase, decrease, remain stable, the biggest change…'},
        {key: 'S3', title: 'Task 3 – Roleplay (4 phút · B2–C1)', prompt: 'You are a Customer Care Specialist. The examiner plays a customer who is very upset because the refund has not arrived, although the promised deadline of 5 business days has passed. Your job: listen and calm the customer politely; explain tactfully that the accounting system has a technical error so the transfer is stuck; commit to a clear solution (for example, manual processing within the next 24 hours and a confirmation email).\n\nThe examiner starts: "Excuse me, I am extremely frustrated. I was promised my refund would be in my account by last Friday, and it is still not here! What is going on?"', hint: 'Xoa dịu → giải thích khéo → cam kết giải pháp rõ ràng. Ghi âm phần trả lời của bạn như đang nói với khách hàng.'},
        {key: 'S4', title: 'Task 4 – Monologue (4 phút · B2–C2)', prompt: 'Your company is considering creating a centralized internal knowledge platform where employees can find procedures, FAQs and examples of previous cases. You have 1 minute to prepare and 2–3 minutes to present your view on the benefits and the challenges of this new system.', hint: 'Nêu ít nhất 2 lợi ích và 2 thách thức, có ví dụ; kết luận quan điểm của bạn.'}
      ]
    }
  },
  // Form B: parallel to A (same structure, points and difficulty curve, different content). The final test uses the form the learner did not get at placement.
  B: {
    title: 'Workplace English CEFR Placement Test (Form B)',
    listening: {
      intro: 'Mỗi phần nghe được phát tối đa 2 lần (giọng đọc của trình duyệt). Nghe xong chọn đáp án.',
      parts: [
        {key: 'LA', title: 'Part A – Thông báo chuyển văn phòng', instruction: 'Listen to the office manager\'s announcement and answer questions 1–5.', audio: [['Office manager', 'Hello everyone. As you know, our team is moving to the fourth floor next Monday. Please pack your things on Friday afternoon and put a label with your name on every box. The IT team will move the computers on Saturday, so please shut down your computer before you leave on Friday. If you need more boxes, ask Linh at reception.'], ['Employee', 'Will we have the same desks?'], ['Office manager', 'No, the new floor has an open plan, so you can choose any desk in our area.']],
          questions: [mcq('When is the team moving?', ['This Friday', 'Next Monday', 'Next Friday', 'Saturday'], 1, 1), mcq('Which floor is the team moving to?', ['The second floor', 'The third floor', 'The fourth floor', 'The fifth floor'], 2, 1), mcq('What should employees put on each box?', ['A number', 'The floor name', 'A label with their name', 'The date'], 2, 1), mcq('Who should employees ask for more boxes?', ['The IT team', 'Linh', 'The office manager', 'Their team leader'], 1, 1), mcq('What is different about the new floor?', ['It has no windows.', 'It is an open plan.', 'It has fewer desks.', 'It is on the ground floor.'], 1, 1)]},
        {key: 'LB', title: 'Part B – Hội thoại về đơn hàng bị trễ', instruction: 'Listen to a conversation between a team leader and an employee and answer questions 6–10.', audio: [['Employee', 'Hi Minh, do you have a moment? The supplier just told me the equipment will arrive two weeks late.'], ['Team leader', 'Two weeks? That is a problem. The client expects the installation on the fifteenth.'], ['Employee', 'I know. Should I tell the client now, or wait until we have a new date?'], ['Team leader', 'Tell them today. Clients accept a delay much more easily when they hear about it early. But before you call, check whether another supplier can deliver sooner.'], ['Employee', 'I asked one this morning. They can deliver in five days, but the price is about ten percent higher.'], ['Team leader', 'Then send me the two options with the costs, and I will decide this afternoon. In the meantime, prepare a short message for the client explaining the situation.'], ['Employee', 'Okay, I will have it ready by two.']],
          questions: [mcq('What is the problem?', ['The client has cancelled the order.', 'The equipment will arrive late.', 'The installation team is not available.', 'The price has increased.'], 1, 2), mcq('When does the client expect the installation?', ['On the fifth', 'On the tenth', 'On the fifteenth', 'In two weeks'], 2, 2), mcq('What does the team leader say about informing the client?', ['Wait until there is a new date.', 'Tell the client as soon as possible.', 'Let the supplier contact the client.', 'Only tell the client if the delay is confirmed.'], 1, 2), mcq('What is the disadvantage of the second supplier?', ['It is slower.', 'It is more expensive.', 'It is not reliable.', 'It is in another country.'], 1, 2), mcq('What will the team leader do this afternoon?', ['Call the client', 'Visit the supplier', 'Decide between the two options', 'Cancel the order'], 2, 2)]},
        {key: 'LC', title: 'Part C – Thảo luận về công cụ quản lý dự án mới', instruction: 'Listen to a short discussion between two colleagues about a new project-management tool and answer questions 11–15.', audio: [['Hoa', 'Have you tried the new project-management tool yet?'], ['David', 'I have. The dashboard is useful because everyone can see who is working on what, and the client can follow progress without asking us for updates all the time.'], ['Hoa', 'That is true, but I worry that people will spend more time updating the tool than doing the actual work. On my last project, the team stopped updating it after two weeks because it took too long.'], ['David', 'That happens when the tool is too detailed. If we only track the tasks that matter to the client and keep the rest in our team notes, the updates should take a few minutes a day.'], ['Hoa', 'So you are suggesting we agree on what goes into the tool before we start?'], ['David', 'Exactly. And we should review it after the first month. If the team is not using it, the tool is not helping anyone.']],
          questions: [mcq('What is the main topic of the discussion?', ['Hiring a new project manager', 'How to use a new project-management tool well', 'Problems with the client', 'The cost of software'], 1, 2), mcq('What advantage does David mention?', ['The tool is free.', 'The client can follow progress directly.', 'The team can work fewer hours.', 'Meetings are no longer needed.'], 1, 2), mcq('What concern does Hoa raise?', ['The tool may be too expensive.', 'The client may see confidential data.', 'Updating the tool may take too much time.', 'The team may not understand the tool.'], 2, 2), mcq('What does David suggest?', ['Tracking every task in detail', 'Tracking only the tasks that matter to the client', 'Replacing the tool with team notes', 'Asking the client to update the tool'], 1, 2), mcq('What can be inferred about both speakers?', ['They refuse to use the tool.', 'They think the tool can work if it is used carefully.', 'They believe the client should choose the tool.', 'They think the old tool was better.'], 1, 2)]}
      ]
    },
    reading: {
      parts: [
        {key: 'RA', title: 'Part A – Thông báo nội bộ', instruction: 'Read the notice and answer questions 1–5.', text: 'Subject: New Visitor Badges\n\nHi all,\n\nFrom next Monday, all visitors must wear a visitor badge while they are in the building. You can collect badges at reception before your guest arrives. Please return the badge to reception when your visitor leaves.\n\nIf your visitor stays for more than one day, please send their name and the dates to security@company.com at least one day in advance.\n\nThanks,\nMai (Office Services)',
          questions: [mcq('When does the new rule start?', ['Today', 'Next Monday', 'Next month', 'Next Friday'], 1, 1), mcq('Where can employees collect the badges?', ['At security', 'At reception', 'From Mai', 'From their manager'], 1, 1), mcq('What should employees do when the visitor leaves?', ['Keep the badge', 'Email security', 'Return the badge to reception', 'Sign a form'], 2, 1), mcq('What must employees do for a visitor who stays more than one day?', ['Pay a fee', 'Email security in advance', 'Ask Mai for permission', 'Give the visitor a key'], 1, 1), mcq('Who wrote the notice?', ['The security team', 'The reception', 'Mai from Office Services', 'The IT department'], 2, 1)]},
        {key: 'RB', title: 'Part B – Quy trình', instruction: 'Read the procedure and answer questions 6–10.', text: 'Requesting Equipment\n\nEmployees who need new equipment, such as a laptop, monitor or headset, should first check the shared equipment list to see whether a spare item is available. If a spare item is available, employees can book it directly in the list and collect it from the IT room.\n\nIf no spare item is available, employees should submit a request form to their team leader. The team leader checks that the request is necessary for the employee\'s work and forwards it to the IT department. The IT department orders standard items within three working days. Non-standard items require approval from the department head and may take longer.\n\nAll equipment remains the property of the company and must be returned when the employee changes role or leaves.',
          questions: [mcq('What should employees do first?', ['Submit a request form', 'Ask the IT department', 'Check the shared equipment list', 'Contact the department head'], 2, 2), mcq('Who checks that a request is necessary?', ['The IT department', 'The team leader', 'The department head', 'The employee'], 1, 2), mcq('How long does it take to order a standard item?', ['One day', 'Three working days', 'One week', 'It depends on the supplier'], 1, 2), mcq('What is different about non-standard items?', ['They are free.', 'They need approval from the department head.', 'They cannot be ordered.', 'They are delivered faster.'], 1, 2), mcq('Which statement best summarizes the procedure?', ['Employees may buy their own equipment.', 'Equipment requests go through checks before they are ordered and the items stay company property.', 'Only team leaders can use company equipment.', 'All equipment must be returned every month.'], 1, 2)]},
        {key: 'RC', title: 'Part C – Bài viết', instruction: 'Read the following text and answer questions 11–15.', text: 'Onboarding New Colleagues Remotely\n\nWhen new employees join a company, the first weeks shape how quickly they become productive and how connected they feel to the team. In an office, much of this happens informally: a new colleague overhears how a problem is solved, asks a quick question at the next desk, or joins a lunch conversation. When onboarding takes place remotely, these informal moments largely disappear, and organizations have to recreate them deliberately.\n\nSeveral practices help. Assigning a "buddy" who is not the manager gives the newcomer someone to ask the small questions they might not want to raise with their boss. Short, scheduled check-ins during the first month replace the casual conversations that would otherwise happen naturally. Clear written documentation of tools, processes and expectations reduces the number of questions in the first place. However, documentation alone is not enough: newcomers also need opportunities to observe how experienced colleagues actually work, for example by joining meetings as observers before they take on tasks themselves.\n\nThe common thread is intention. Remote onboarding fails not because the distance is too great, but because teams assume that what happened by itself in the office will also happen by itself online.',
          questions: [mcq('Why are the first weeks important according to the text?', ['New employees decide their salary then.', 'They influence productivity and the feeling of belonging.', 'Managers evaluate employees then.', 'Training budgets are set then.'], 1, 2), mcq('What is lost when onboarding is remote?', ['Access to documentation', 'Informal learning moments', 'Scheduled meetings', 'Technical equipment'], 1, 2), mcq('Why should the buddy not be the manager?', ['Managers are too busy.', 'Newcomers may hesitate to ask their boss small questions.', 'Managers do not know the tools.', 'Buddies are paid extra.'], 1, 2), mcq('What does "documentation alone is not enough" imply?', ['Documentation should be removed.', 'Newcomers also need to see real work in practice.', 'Documentation is too expensive.', 'Only managers should write documentation.'], 1, 2), mcq('What is the author\'s main argument?', ['Remote onboarding cannot succeed.', 'Remote onboarding works when teams deliberately recreate what the office provided naturally.', 'Offices are no longer necessary.', 'New employees should onboard themselves.'], 1, 2)]}
      ]
    },
    writing: {
      task: 'Your team has many meetings every week, and several colleagues say they do not have enough time for focused work. Your manager has sent you this message:',
      message: 'Hi,\nI have heard that the number of meetings is becoming a problem for the team. Could you write a short message describing one problem the meetings cause and suggesting what we could change to give people more time for focused work?',
      requirement: 'Please write 150–200 words.', minWords: 150, maxWords: 200
    },
    speaking: {
      tasks: [
        {key: 'S1', title: 'Task 1 – Interview (3 phút)', prompt: 'The examiner asks:\n1. What do you do?\n2. What does a typical week look like for you?\n3. Who do you speak or write English with at work?\n4. What would you like to do better in English?', hint: 'Trả lời lần lượt 4 câu hỏi, mỗi câu 2–4 câu nói.'},
        {key: 'S2', title: 'Task 2 – Scenario (5 phút)', prompt: 'A client asks you to finish a piece of work by Friday, but you know your team cannot finish it before the following Wednesday. Your manager is in a meeting all day. Explain what you would say to the client and what you would do next.', hint: 'Nêu các bước bạn sẽ làm và lý do.'},
        {key: 'S3', title: 'Task 3 – Discussion (7 phút)', prompt: 'Your company is considering letting employees choose their own working hours, as long as they are available for team meetings between 10:00 and 15:00. Discuss the possible benefits and challenges of this policy for the team and for clients.', hint: 'Nêu ít nhất 2 lợi ích và 2 thách thức, có ví dụ.'}
      ]
    }
  }
};
// ---- short level-up forms (S.levelForms: [{id, target, status, form, createdAt, by}]) ----
const levelForms = () => (S.levelForms = S.levelForms || []);
const levelRequests = () => (S.levelRequests = S.levelRequests || []);
/** The form a test (or the running draft T) was made with: a built-in form (A/B) or an operator-approved level-up form. */
const formOf = t => (t && TEST_FORMS[t.form]) || levelForms().find(f => f.id === t?.form)?.form || null;
const approvedLevelForm = target => levelForms().find(f => f.target === target && f.status === 'approved');
const WRITING_CRITERIA = [['task', 'Task achievement'], ['organization', 'Organization & coherence'], ['vocabulary', 'Vocabulary'], ['grammar', 'Grammar'], ['communication', 'Workplace communication']];
const SPEAKING_CRITERIA = [['fluency', 'Fluency & interaction'], ['grammar', 'Grammar'], ['vocabulary', 'Vocabulary'], ['communication', 'Professional communication']]; // pronunciation is not assessed from a transcript
const TEST_STEPS = ['intro', ...SECTIONS, 'done'];
const wordCount = s => (s || '').trim().split(/\s+/).filter(Boolean).length;
const fmtClock = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
const testDurSec = (sec, kind = T?.kind) => (((S.settings.testTimes || {})[sec]) || {listening: 15, reading: 25, writing: 20, speaking: 15}[sec]) * (kind === 'levelup' ? 30 : 60); // refined test: 15 / 25 / 20 / 15 minutes; level-up test: half the time of each section

// ---- speech helpers (TTS for listening, STT for speaking / coach) ----
/** Text for the voice: emoji, icons, symbols and text smileys are removed so the browser voice does not read them out ("kissing face", "check mark"…). */
const ttsClean = s => String(s || '')
  .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, ' ')
  .replace(/[←-⇿⌀-⏿■-➿⤀-⯿〰〽㊗㊙•·▢]/g, ' ')
  .replace(/(^|\s)[:;][-^']?[)(\]\[DPpOo3|\/\\*]+(?=\s|$)/g, ' ').replace(/(^|\s)<3(?=\s|$)/g, ' ')
  .replace(/[*_#`~]+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
const speech = {
  hasVoice: lang => ('speechSynthesis' in window) && speechSynthesis.getVoices().some(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())),
  /** tail = ms kept quiet after the voice stops (pronunciation drills: ~1 s so the word does not end abruptly); the music stays ducked until then. */
  speak(text, onEnd, lang = 'en-US', {tail = 0, rate = 0.92} = {}) {
    if (!('speechSynthesis' in window)) { toast('Trình duyệt không hỗ trợ đọc văn bản', 'err'); return false; }
    speechSynthesis.cancel(); clearTimeout(speech.tailTimer);
    text = ttsClean(text); if (!text) { onEnd && onEnd(); return true; } // nothing but emoji: stay silent instead of reading "smiling face"
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = rate;
    const voices = speechSynthesis.getVoices(); const v = lang.startsWith('en') ? voices.find(v => /^en[-_](US|GB)/.test(v.lang)) : voices.find(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())); if (v) u.voice = v;
    audio.duck(true); // the background music pauses while a voice plays and comes back afterwards
    const done = () => { speech.tailTimer = setTimeout(() => { audio.duck(false); onEnd && onEnd(); }, tail); };
    u.onend = done; u.onerror = done;
    speechSynthesis.speak(u); return true;
  },
  /** One word of a pronunciation drill: a little slower, with a ~1 s tail so it rings out instead of being cut off. */
  speakWord(word, onEnd) { return speech.speak(word, onEnd, 'en-US', {tail: 1000, rate: 0.85}); },
  tailTimer: null,
  rec: null,
  canListen: () => !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  listen(onText, onEnd) {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return false;
    if (speech.rec) { try { speech.rec.stop(); } catch {} }
    const r = new R(); r.lang = 'en-US'; r.interimResults = false; r.continuous = true; r.maxAlternatives = 1;
    r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript); };
    r.onerror = e => { if (e.error !== 'no-speech') toast('Lỗi nhận dạng giọng nói: ' + e.error, 'err'); };
    r.onend = () => { speech.rec = null; onEnd && onEnd(); };
    r.start(); speech.rec = r; return true;
  },
  stop() { if (speech.rec) { try { speech.rec.stop(); } catch {} speech.rec = null; } if ('speechSynthesis' in window) speechSynthesis.cancel(); clearTimeout(speech.tailTimer); audio.duck(false); }
};
if ('speechSynthesis' in window) speechSynthesis.getVoices();
// ---- audio system: SFX (short tones) + BGM (soft generated ambience, no audio files needed) with three independent switches, kept per device ----
const audio = {
  KEY: 'aec:audio', st: {sfx: true, bgm: true, mute: false}, ctx: null, bgmNodes: null,
  load() { try { Object.assign(audio.st, JSON.parse(localStorage.getItem(audio.KEY) || '{}')); } catch {} audio.st.mute = false; }, // the "mute all" switch is gone: a mute saved by an older version must not silence both switches forever
  save() { try { localStorage.setItem(audio.KEY, JSON.stringify(audio.st)); } catch {} },
  context() { if (!audio.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; audio.ctx = new C(); } if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {}); return audio.ctx; },
  sfxOn: () => audio.st.sfx && !audio.st.mute,
  bgmOn: () => audio.st.bgm && !audio.st.mute && audio.cfg().enabled,
  // BGM = a hidden YouTube player on a copyright-free playlist (needs internet). The generated ambience is the fallback when the player cannot load or errors.
  // Operators / managers choose the music in Cài đặt (S.settings.bgm): a YouTube video or playlist link, the volume, and whether music is available at all.
  YT_VIDEO: 'DSWYAclv2I8', YT_LIST: 'PLQwRmTwWx0uaoRXVcKbUDW0wm8G_WJzDI', YT_VOLUME: 22,
  /** Parse a YouTube link (watch?v=…, youtu.be/…, playlist?list=…) or a bare id → {video, list}. Empty → the built-in playlist. */
  parseYt(url) { const s = String(url || '').trim(); if (!s) return {video: audio.YT_VIDEO, list: audio.YT_LIST}; const v = (s.match(/[?&]v=([\w-]{11})/) || s.match(/youtu\.be\/([\w-]{11})/) || s.match(/\/(?:embed|shorts)\/([\w-]{11})/) || [])[1] || (/^[\w-]{11}$/.test(s) ? s : ''); const list = (s.match(/[?&]list=([\w-]+)/) || [])[1] || (/^(PL|UU|OL|RD)[\w-]+$/.test(s) ? s : ''); return {video: v, list}; },
  cfg() { const b = (typeof S !== 'undefined' && S.settings && S.settings.bgm) || {}; const ids = audio.parseYt(b.url); return {enabled: b.enabled !== false, url: b.url || '', video: ids.video, list: ids.list, volume: clamp(+b.volume >= 0 ? +b.volume : audio.YT_VOLUME, 0, 100)}; },
  yt: {player: null, ready: false, failed: false, loading: false},
  /** Throw the player away and load the music from the current settings (after an operator changed it). */
  reload() { const y = audio.yt; try { y.player && y.player.destroy(); } catch {} y.player = null; y.ready = false; y.failed = false; y.loading = false; document.getElementById('bgm-yt')?.remove(); audio.stopAmbience(); if (audio.bgmOn()) { audio.loadYt(); } },
  loadYt() {
    const y = audio.yt; if (y.player || y.loading || y.failed) return; if (!/^https?:/.test(location.protocol)) { y.failed = true; return; } // the IFrame API does not run from file://
    y.loading = true; const c = audio.cfg(); if (!c.video && !c.list) { y.failed = true; y.loading = false; return; }
    const host = document.createElement('div'); host.id = 'bgm-yt'; host.setAttribute('aria-hidden', 'true'); host.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:0;opacity:0;pointer-events:none'; document.body.appendChild(host);
    const vars = {autoplay: 1, mute: 1, controls: 0, playsinline: 1, loop: 1, rel: 0}; if (c.list) { vars.listType = 'playlist'; vars.list = c.list; } else { vars.playlist = c.video; } // a single video loops through `playlist` = itself
    const make = () => { try { y.player = new YT.Player('bgm-yt', {width: 1, height: 1, ...(c.video ? {videoId: c.video} : {}), playerVars: vars, events: {
      onReady: () => { y.ready = true; y.loading = false; if (audio.armed && audio.bgmOn()) audio.startBgm(); },
      onError: () => { y.failed = true; y.loading = false; try { y.player.destroy(); } catch {} y.player = null; host.remove(); if (audio.armed && audio.bgmOn()) audio.startBgm(); },
      onStateChange: e => { if (e.data === YT.PlayerState.ENDED && audio.bgmOn()) { try { y.player.playVideo(); } catch {} } }
    }}); } catch { y.failed = true; y.loading = false; } };
    if (window.YT && YT.Player) { make(); return; }
    const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev && prev(); make(); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { y.failed = true; y.loading = false; if (audio.armed && audio.bgmOn()) audio.startBgm(); }; document.head.appendChild(s);
    setTimeout(() => { if (!y.ready && !y.failed) { y.failed = true; y.loading = false; if (audio.armed && audio.bgmOn()) audio.startBgm(); } }, 12000); // offline / blocked: fall back after 12 s
  },
  /** Start the music: YouTube when available (unmuted on the user's gesture), otherwise the soft generated ambience. */
  startBgm() {
    if (!audio.bgmOn()) return;
    const y = audio.yt;
    if (!y.failed) { if (!y.player) { audio.loadYt(); return; } if (!y.ready) return; try { y.player.setVolume(audio.cfg().volume); y.player.unMute(); y.player.playVideo(); } catch {} if (audio.bgmNodes) audio.stopAmbience(); return; }
    audio.startAmbience();
  },
  stopBgm() { const y = audio.yt; if (y.player && y.ready) { try { y.player.pauseVideo(); } catch {} } audio.stopAmbience(); },
  // The music gives way to anything the learner must hear: it is paused while a voice / sound sample plays (duck) and for the whole Listening section of a test (hold), and comes back on its own afterwards.
  ducked: false, held: false,
  duck(on) { if (audio.ducked === !!on) return; audio.ducked = !!on; if (on) audio.stopBgm(); else if (!audio.held && audio.armed && audio.bgmOn()) audio.startBgm(); },
  hold(on) { if (audio.held === !!on) return; audio.held = !!on; if (on) audio.stopBgm(); else if (!audio.ducked && audio.armed && audio.bgmOn()) audio.startBgm(); },
  /** Soft "rain on the window" ambience: filtered brown noise with a slow swell, plus two very quiet sustained tones (fallback). */
  startAmbience() {
    if (!audio.bgmOn() || audio.bgmNodes) return; const ctx = audio.context(); if (!ctx) return;
    try {
      const len = ctx.sampleRate * 4; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0); let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // brown noise
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.4;
      const swell = ctx.createGain(); swell.gain.value = 0.5; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lfoG = ctx.createGain(); lfoG.gain.value = 0.25; lfo.connect(lfoG); lfoG.connect(swell.gain);
      const master = ctx.createGain(); master.gain.value = 0; master.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 3);
      src.connect(lp); lp.connect(swell); swell.connect(master); master.connect(ctx.destination);
      const tones = [196, 293.66].map((f, i) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.012 - i * 0.004; o.connect(g); g.connect(master); o.start(); return o; });
      src.start(); lfo.start(); audio.bgmNodes = {src, lfo, master, tones};
    } catch {}
  },
  stopAmbience() { const n = audio.bgmNodes; if (!n) return; audio.bgmNodes = null; try { const ctx = audio.ctx; n.master.gain.cancelScheduledValues(ctx.currentTime); n.master.gain.setValueAtTime(n.master.gain.value, ctx.currentTime); n.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8); setTimeout(() => { try { n.src.stop(); n.lfo.stop(); n.tones.forEach(o => o.stop()); } catch {} }, 900); } catch {} },
  sync() { if (audio.bgmOn()) { if (audio.armed && !audio.ducked && !audio.held) audio.startBgm(); } else audio.stopBgm(); audio.save(); $$('.audio-ctl button').forEach(b => { const k = b.dataset.k; const on = k === 'mute' ? audio.st.mute : audio.st[k] && !audio.st.mute; b.classList.toggle('on', k === 'mute' ? !audio.st.mute : on); b.setAttribute('aria-pressed', String(k === 'mute' ? audio.st.mute : on)); b.title = audio.label(k); }); },
  label: k => k === 'sfx' ? `Hiệu ứng âm thanh: ${audio.st.sfx && !audio.st.mute ? 'bật' : 'tắt'}` : k === 'bgm' ? `Nhạc nền: ${audio.st.bgm && !audio.st.mute ? 'bật' : 'tắt'}` : audio.st.mute ? 'Đang tắt tất cả âm thanh – bấm để bật lại' : 'Tắt tất cả âm thanh',
  armed: false, // true after the first click/keypress: only then may sound start (autoplay policy)
  arm() { if (audio.armed) return; audio.armed = true; if (audio.bgmOn() && !audio.ducked && !audio.held) audio.startBgm(); },
  /** Warm mechanical-keyboard click ("thock"): a short filtered noise tick plus a low, fast-decaying tone. Not wired to any control any more (kept for later use). */
  click() {
    if (!audio.sfxOn()) return; const ctx = audio.context(); if (!ctx) return;
    try {
      const t = ctx.currentTime; const out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination);
      const n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate); const d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource(); src.buffer = n; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 500; bp.Q.value = 0.9; const ng = ctx.createGain(); ng.gain.setValueAtTime(0.16, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.035); src.connect(bp); bp.connect(ng); ng.connect(out); src.start(t); src.stop(t + 0.04);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(190 + Math.random() * 30, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.06); const og = ctx.createGain(); og.gain.setValueAtTime(0.12, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.08);
    } catch {}
  }
};
audio.load();
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => audio.arm(), {capture: true, passive: true}));
if (audio.bgmOn()) setTimeout(() => audio.loadYt(), 1500); // preload the (muted) player so the music starts right at the first tap
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.stopBgm(); else if (audio.armed && audio.bgmOn()) audio.startBgm(); });
const ICON_SFX = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M15.5 9a4 4 0 0 1 0 6"/></svg>';
const ICON_BGM = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
const ICON_MUTE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';
/** The three independent switches (SFX · BGM · Mute all) shown in the top bar / sidebar. */
const audioControls = () => `<span class="audio-ctl row" style="gap:4px;flex-wrap:nowrap" role="group" aria-label="Âm thanh"><button class="btn-sm btn-ghost ${audio.sfxOn() ? 'on' : ''}" data-action="audio-toggle" data-k="sfx" title="${audio.label('sfx')}" aria-pressed="${audio.sfxOn()}">${ICON_SFX}</button><button class="btn-sm btn-ghost ${audio.bgmOn() ? 'on' : ''}" data-action="audio-toggle" data-k="bgm" title="${audio.cfg().enabled ? audio.label('bgm') : 'Nhạc nền đang tắt cho cả app (Cài đặt → Nhạc nền của Season)'}" aria-pressed="${audio.bgmOn()}" ${audio.cfg().enabled ? '' : 'disabled style="opacity:.4"'}>${ICON_BGM}</button></span>`; // two switches only: SFX and music (the "mute all" button was removed)
actions['audio-toggle'] = t => { const k = t.dataset.k; if (k === 'mute') audio.st.mute = !audio.st.mute; else { audio.st[k] = !audio.st[k]; if (audio.st[k]) audio.st.mute = false; } audio.sync(); if (k === 'sfx' && audio.sfxOn()) beep(); };
function beep(n = 1) { if (!audio.sfxOn()) return; try { const ctx = audio.context(); if (!ctx) return; for (let i = 0; i < n; i++) { const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08; const t = ctx.currentTime + i * 0.25; o.start(t); o.stop(t + 0.15); } } catch {} }

// ---- scoring ----
// A form may weight its sections freely (refined placement test: Listening 20 · Reading/Grammar/Vocabulary 40 · Writing 20 · Speaking 20).
// Objective sections take their maximum from the question points; writing from `writing.points` (or the sum of its tasks); speaking from `speaking.points`. Older forms without these fields keep 25 each.
/** Writing tasks of a form: the new forms list `writing.tasks`; the older single-task forms are wrapped so every screen can loop over tasks. The answer key equals the task key ('writing' for the first task). */
const writingTasks = f => f.writing.tasks || [{key: 'writing', title: 'Task', task: f.writing.task, message: f.writing.message, requirement: f.writing.requirement, minWords: f.writing.minWords, maxWords: f.writing.maxWords, points: f.writing.points || 25}];
function sectionMax(f, k) {
  if (k === 'listening' || k === 'reading') return sum(f[k].parts.map(p => sum(p.questions.map(q => q.pts))));
  if (k === 'writing') return f.writing.points || sum(writingTasks(f).map(t => t.points || 0)) || 25;
  return f.speaking.points || 25;
}
const secScore = (points, max, extra = {}) => ({points, max, pct: max ? Math.round(points / max * 100) : 0, cefr: skillCefr(points, max), ...extra});
function objectiveScore(form, skill, answers) {
  let pts = 0, max = 0; form[skill].parts.forEach(p => p.questions.forEach((q, i) => { max += q.pts; if (answers[`${p.key}_${i}`] === q.answer) pts += q.pts; })); return {points: pts, max};
}
function scoreTest(T) {
  const f = formOf(T); const a = T.answers; const sec = {};
  ['listening', 'reading'].forEach(k => { const r = objectiveScore(f, k, a); sec[k] = secScore(r.points, r.max); });
  // productive skills: length-based placeholder (at most 60% of the section) until AI or the operator grades with the rubric
  const wMax = sectionMax(f, 'writing'), sMax = sectionMax(f, 'speaking');
  const tasks = writingTasks(f); const w = sum(tasks.map(t => wordCount(a[t.key])));
  const wp = clamp(Math.round(sum(tasks.map(t => Math.min(1, wordCount(a[t.key]) / (t.minWords || 1)) * (t.points || wMax / tasks.length))) * 0.6), 0, wMax);
  const sw = sum(f.speaking.tasks.map(t => wordCount(a[t.key]))); const sp = clamp(Math.round(Math.min(1, sw / (50 * f.speaking.tasks.length)) * sMax * 0.6), 0, sMax);
  sec.writing = secScore(wp, wMax, {heuristic: true, words: w});
  sec.speaking = secScore(sp, sMax, {heuristic: true, words: sw});
  const total = sum(SECTIONS.map(k => sec[k].points));
  return {sectionScores: sec, total, rawLevel: totalCefr(total)};
}
/** Recompute writing/speaking points from rubric scores (AI or manual) and the totals. Writing rubric = 5 criteria × 1–5 (25) and speaking = 4 × 1–5 (20), both scaled to the section's maximum. */
function recomputeTest(test) {
  const ss = test.sectionScores;
  if (test.writingRubric) { const max = ss.writing.max || 25; const p = clamp(Math.round(sum(WRITING_CRITERIA.map(([k]) => +test.writingRubric[k] || 0)) / 25 * max), 0, max); ss.writing = {...ss.writing, ...secScore(p, max), heuristic: false}; }
  if (test.speakingRubric) { const max = ss.speaking.max || 25; const p = clamp(Math.round(sum(SPEAKING_CRITERIA.map(([k]) => +test.speakingRubric[k] || 0)) / 20 * max), 0, max); ss.speaking = {...ss.speaking, ...secScore(p, max), heuristic: false}; }
  test.total = sum(SECTIONS.map(k => ss[k].points)); test.rawLevel = totalCefr(test.total);
}
function applyAiAssessment(test, r) {
  test.writingRubric = r.writing; test.speakingRubric = r.speaking; test.rationale = r.rationale; test.monthlyGoal = r.monthlyGoal; test.aiScored = true; test.gradedBy = 'ai';
  recomputeTest(test); test.aiSuggestedCefr = r.cefr || test.rawLevel;
}
function syncUserFromTest(u, test) { if (test.kind !== 'placement') return; u.cefrSuggested = test.aiSuggestedCefr || test.rawLevel; u.sectionScores = test.sectionScores; if (test.monthlyGoal && !u.monthlyGoal) u.monthlyGoal = test.monthlyGoal; }

// ---- test wizard with timer + warnings ----
let T = null, T_tick = null, micGraceUntil = 0, lastWarnAt = 0;
// Test drafts are kept per learner and per test (S.testDrafts["userId:kind"]). They used to share one slot, so a second learner opening the test wiped the first learner's unfinished attempt.
const draftKey = (userId, kind) => userId + ':' + kind;
function getDraft(userId, kind) {
  S.testDrafts = S.testDrafts || {};
  const old = S.session.testDraft; if (old) { if (old.userId && old.kind && !S.testDrafts[draftKey(old.userId, old.kind)]) S.testDrafts[draftKey(old.userId, old.kind)] = old; delete S.session.testDraft; } // move the old single slot to its owner
  const d = S.testDrafts[draftKey(userId, kind)]; return d && d.userId === userId ? d : null;
}
const draftStarted = (userId, kind) => { const d = getDraft(userId, kind); return !!d && Object.keys(d.sections || {}).length > 0; };
function startTest(kind) {
  const uidNow = S.session.userId; const d = getDraft(uidNow, kind);
  if (d && d.kind === kind && d.sections && Array.isArray(d.warnings) && d.plays) { T = d; return; }
  if (d && (!d.sections || !Array.isArray(d.warnings))) toast('Bản nháp bài test cũ không còn dùng được – bắt đầu lại từ đầu.', '');
  // placement = form A; final = the built-in form the learner did not get at placement; level-up = the approved short form for the next level
  let form = 'A', target = null;
  if (kind === 'final') form = userTest(uidNow, 'placement')?.form === 'B' ? 'A' : 'B';
  if (kind === 'levelup') { const e = levelUpEligibility(userById(uidNow)); form = e.form.id; target = e.target; }
  T = {kind, form, target, step: 0, answers: {}, plays: {}, sections: {}, warnings: [], userId: uidNow, startedAt: new Date().toISOString()};
  S.testDrafts[draftKey(uidNow, kind)] = T; save();
}
const saveDraft = () => { if (!T) return; S.testDrafts = S.testDrafts || {}; S.testDrafts[draftKey(T.userId, T.kind)] = T; save(); };
const curSection = () => T && T.step >= 1 && T.step <= SECTIONS.length ? SECTIONS[T.step - 1] : null;
const testActive = () => !!curSection() && location.hash.startsWith('#/test/');
function ensureSectionStarted(sec) { if (!T.sections[sec]) { T.sections[sec] = {startedAt: Date.now(), deadline: S.settings.testTimed !== false ? Date.now() + testDurSec(sec) * 1000 : null}; saveDraft(); } }
function timeLeft(sec) { const s = T.sections[sec]; if (!s || !s.deadline) return null; return Math.max(0, Math.round((s.deadline - Date.now()) / 1000)); }
function tick() {
  const sec = curSection(); if (!sec || !location.hash.startsWith('#/test/')) { clearInterval(T_tick); return; }
  const s = T.sections[sec]; const left = timeLeft(sec); const el = $('#t-timer');
  if (left == null) { if (el) el.textContent = 'Không giới hạn'; return; }
  if (el) { el.textContent = fmtClock(left); el.className = 'badge ' + (left <= 60 ? 'danger' : left <= 300 ? 'warn' : 'primary'); }
  if (left <= 300 && !s.warned5) { s.warned5 = true; saveDraft(); beep(); toast(`⏰ Còn 5 phút cho phần ${SECTION_NAMES[sec]}`, ''); }
  if (left <= 60 && !s.warned1) { s.warned1 = true; saveDraft(); beep(2); toast('⏰ Còn 1 phút! Hết giờ hệ thống sẽ tự chuyển phần.', 'err'); }
  if (left <= 0 && !pendingAuto) autoAfterCountdown(`⏰ Hết giờ phần ${SECTION_NAMES[sec]}`, T.step < SECTIONS.length ? 'Hệ thống sẽ tự chuyển sang phần tiếp theo.' : 'Hệ thống sẽ tự nộp bài.', () => finishSection(true));
}
/** Copy what is typed in the open text boxes into the draft (change events only fire on blur). */
function flushTestInputs() { if (!T) return; $$('[data-change="t-text"]').forEach(el => { T.answers[el.dataset.key] = el.value; }); saveDraft(); }
/** Every automatic action of the test (time-out, warning limit) shows a 5-second countdown before it runs. */
let pendingAuto = null;
function autoAfterCountdown(title, msg, fn, secs = 5) {
  if (pendingAuto) return; flushTestInputs(); speech.stop(); beep(2);
  let n = secs; const draw = () => openModal(`<h3>${title}</h3><p>${msg}</p><div class="countdown" aria-live="assertive">${n}</div><p class="small muted" style="text-align:center;margin:0">Tự thực hiện sau ${n} giây. Bài làm của bạn đã được lưu.</p>`);
  draw();
  pendingAuto = setInterval(() => { n--; if (n > 0) { draw(); return; } clearInterval(pendingAuto); pendingAuto = null; closeModal(); if (T) fn(); }, 1000);
}
function finishSection(auto) {
  const sec = curSection(); const s = T.sections[sec]; if (!s || s.finishedAt) return;
  s.finishedAt = Date.now(); s.auto = !!auto; speech.stop(); clearInterval(T_tick);
  if (T.step < SECTIONS.length) { T.step++; saveDraft(); if (auto) toast(`Hết giờ phần ${SECTION_NAMES[sec]} – chuyển sang phần tiếp theo`, 'err'); render(); }
  else { T.step = SECTIONS.length + 1; saveDraft(); if (auto) { toast('Hết giờ – hệ thống tự nộp bài', 'err'); submitTest(true, 'timeout'); } else render(); }
}
function integrityWarning(reason) {
  if (!testActive() || T._submitting || pendingAuto) return;
  if (Date.now() < micGraceUntil || Date.now() - lastWarnAt < 2000) return;
  lastWarnAt = Date.now();
  T.warnings.push({at: new Date().toISOString(), section: curSection(), reason}); saveDraft();
  // rule: `limit` warnings with an alarm sound; the next violation (limit + 1) submits the test
  const limit = S.settings.testWarnLimit || 3, n = T.warnings.length; alarm();
  const wc = $('#t-warn'); if (wc) wc.textContent = `Cảnh báo ${Math.min(n, limit)}/${limit}`;
  if (n > limit) { autoAfterCountdown(`⛔ Vi phạm lần thứ ${n}`, `Bạn đã được cảnh báo ${limit} lần mà vẫn rời khỏi màn hình bài thi. Bài sẽ được tự động nộp với phần đã làm.`, () => { T.step = SECTIONS.length + 1; saveDraft(); submitTest(true, 'warnings'); }); return; }
  openModal(`<h3>Cảnh báo ${n}/${limit}</h3><p>Bạn vừa rời khỏi màn hình bài thi (${esc(reason)}). Trong lúc thi không được mở tab, cửa sổ hay pop-up khác.</p><p><b>${n < limit ? `Còn ${limit - n} lần cảnh báo nữa; sau đó vi phạm thêm một lần là bài tự nộp.` : 'Đây là cảnh báo cuối cùng: vi phạm thêm một lần nữa là bài tự nộp.'}</b></p><p class="xs muted">Thời gian vẫn đang chạy.</p><button class="btn-primary" data-action="modal-close">Đã hiểu, tiếp tục</button>`);
}
/** Loud three-tone alarm for integrity warnings. */
function alarm() { try { const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)()); [880, 660, 880].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.connect(g); g.connect(ctx.destination); o.frequency.value = f; g.gain.value = 0.2; const t = ctx.currentTime + i * 0.3; o.start(t); o.stop(t + 0.25); }); } catch {} }
let pickerGrace = false; // the OS file picker blurs the window; that is not leaving the test
document.addEventListener('click', e => { if (e.target.closest('label')?.querySelector('input[type="file"]') || e.target.matches?.('input[type="file"]')) pickerGrace = true; });
window.addEventListener('focus', () => setTimeout(() => { pickerGrace = false; }, 800));
document.addEventListener('visibilitychange', () => { if (document.hidden) integrityWarning('chuyển tab hoặc thu nhỏ cửa sổ'); });
window.addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus() && !pickerGrace) integrityWarning('chuyển sang cửa sổ khác'); }, 300));
// during a test section: no context menu, no copy / cut / paste, no new windows from the page
['contextmenu', 'copy', 'cut', 'paste'].forEach(ev => document.addEventListener(ev, e => { if (testActive()) { e.preventDefault(); if (ev !== 'contextmenu') toast('Không sao chép / dán trong lúc làm bài thi', 'err'); } }));
const nativeOpen = window.open; window.open = (...a) => testActive() ? null : nativeOpen.apply(window, a);
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/test/')) { clearInterval(T_tick); speech.stop(); audio.hold(false); } });

route('#/test/:kind', kind => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  if (!['placement', 'final', 'levelup'].includes(kind)) { go('#/home'); return; }
  if (kind === 'placement' && u.cefrApproved) { go('#/home'); return; }
  if (kind === 'placement' && !u.profile) { toast('Điền hồ sơ cá nhân trước nhé', ''); go('#/onboard'); return; }
  if (kind === 'final' && userTest(u.id, 'final')) { go('#/profile'); return; }
  if (kind === 'final' && !isLastWeek()) { toast('Bài cuối kỳ mở ở tuần cuối pilot', ''); go('#/home'); return; }
  if (kind === 'levelup' && !draftStarted(u.id, 'levelup')) { const e = levelUpEligibility(u); if (!e.ok) { toast(e.reason, 'err'); go('#/home'); return; } }
  startTest(kind);
  const f = formOf(T); if (!f) { toast('Không tìm thấy đề thi', 'err'); T = null; go('#/home'); return; } const step = TEST_STEPS[T.step]; const sec = curSection(); const a = T.answers;
  const title = kind === 'placement' ? 'Test đầu vào' : kind === 'levelup' ? `Bài thi lên mức ${T.target}` : 'Bài kiểm tra cuối kỳ'; const limit = S.settings.testWarnLimit || 3; const timed = S.settings.testTimed !== false;
  const nQ = skill => sum(f[skill].parts.map(p => p.questions.length)); const wTasks = writingTasks(f); const maxOf = k => sectionMax(f, k);
  const desc = {listening: `${f.listening.parts.length} đoạn audio, ${nQ('listening')} câu, mỗi đoạn nghe tối đa 2 lần`, reading: `${f.reading.parts.some(p => p.text) ? f.reading.parts.map(p => p.title.replace(/^Part \w+ – /, '')).join(', ') + ' · ' : 'Đọc, ngữ pháp & từ vựng · '}${nQ('reading')} câu`, writing: `${wTasks.length > 1 ? wTasks.length + ' task: ' : ''}${wTasks.map(t => `${t.minWords}–${t.maxWords} từ`).join(' + ')}, chấm theo rubric 5 tiêu chí`, speaking: `${f.speaking.tasks.length} task, nói qua micro (hoặc gõ), chấm nội dung`};
  const optHtml = (key, q, idx, label) => `<div class="card flat" style="margin-top:8px"><p style="margin:0 0 6px"><b>${label}.</b> ${esc(q.q)} <span class="xs muted">(${q.pts} điểm)</span></p>${q.options.map((o, oi) => `<label class="opt ${a[key] === oi ? 'sel' : ''}"><input type="radio" name="${key}" value="${oi}" ${a[key] === oi ? 'checked' : ''} data-change="t-ans" data-key="${key}"><span>${'ABCD'[oi]}. ${esc(o)}</span></label>`).join('')}</div>`;
  const partsHtml = (skill, extra) => { let n = 0; return f[skill].parts.map(p => { const start = n; n += p.questions.length; return extra(p, start); }).join(''); }; // questions are numbered continuously across the parts
  let body = '';
  if (step === 'intro') {
    const draftStarted = Object.keys(T.sections).length > 0;
    body = `<div class="card"><h2>${esc(f.title)}</h2>
      <div class="table-wrap"><table><thead><tr><th>Phần</th><th>Thời gian</th><th>Điểm</th><th>Nội dung</th></tr></thead><tbody>
        ${SECTIONS.map(s => `<tr><td>${SECTION_NAMES[s]}</td><td>${timed ? testDurSec(s) / 60 + ' phút' : '—'}</td><td>${maxOf(s)}</td><td>${desc[s]}</td></tr>`).join('')}</tbody></table></div>
      ${kind === 'levelup' ? `<div class="banner info" style="margin-top:10px"><div class="body small"><b>Đề ngắn ở mức ${T.target}</b>, thời gian mỗi phần bằng một nửa bài đầu vào. Đạt khi tổng ≥70/100 và mỗi kỹ năng ≥50%; sau đó còn 6 lượt thử thách với Season rồi vận hành duyệt. Không đạt thì thi lại sau 14 ngày.</div></div>` : ''}
      <h3 style="margin:14px 0 8px">Quy định làm bài – đọc trước khi bắt đầu</h3>
      <div class="grid cols-3">
        <div class="card flat" style="background:var(--mint)"><div class="eyebrow" style="color:var(--text);margin-bottom:6px">✅ Bắt buộc</div><ul class="small" style="margin:0;padding-left:18px;font-weight:700;line-height:1.5"><li>Làm một mạch từ đầu đến cuối, theo thứ tự Nghe → Đọc → Viết → Nói.</li><li>Có tai nghe (hoặc loa) và micro; thử cả hai bằng nút bên dưới.</li><li>Ở lại đúng trang này cho đến khi nộp bài.</li><li>Phần Nói nộp bằng file ghi âm (ghi ngay trên trang hoặc tải lên).</li></ul></div>
        <div class="card flat" style="background:var(--peach)"><div class="eyebrow" style="color:var(--text);margin-bottom:6px">⛔ Không được phép</div><ul class="small" style="margin:0;padding-left:18px;font-weight:700;line-height:1.5"><li>Mở tab, cửa sổ, ứng dụng hoặc pop-up khác.</li><li>Sao chép, dán, dùng công cụ dịch hay AI.</li><li>Quay lại phần đã nộp.</li><li>Nghe mỗi đoạn audio quá 2 lần.</li></ul></div>
        <div class="card flat" style="background:var(--butter)"><div class="eyebrow" style="color:var(--text);margin-bottom:6px">Lưu ý</div><ul class="small" style="margin:0;padding-left:18px;font-weight:700;line-height:1.5"><li><b>Bấm Bắt đầu là không lưu tạm hay tạm dừng được</b>: đồng hồ chạy liên tục, kể cả khi bạn thoát ra.</li><li>${timed ? 'Mỗi phần tính giờ riêng; hết giờ tự chuyển phần, hết phần Nói tự nộp.' : 'Không tính giờ, nhưng nộp phần nào là khoá phần đó.'}</li><li>Rời màn hình bị cảnh báo kèm âm thanh, tối đa ${limit} lần; lần thứ ${limit + 1} bài tự nộp.</li><li>Mọi lần tự nộp đều đếm ngược 5 giây trước khi thực hiện.</li></ul></div>
      </div>
      ${kind === 'placement' ? `<div class="banner info" style="margin-top:12px"><div class="body small"><b>Vì sao cần bước này?</b> Kết quả test quyết định mức bài bạn nhận: quá dễ thì chán, quá khó thì nản. Không cần ôn trước, làm đúng sức là tốt nhất.</div></div>` : ''}
      <div class="row prep" style="margin-top:12px" role="group" aria-label="Cần chuẩn bị: tai nghe hoặc loa, và micro"><span title="Tai nghe hoặc loa">${ICONS.headphones}Tai nghe</span><span title="Micro">${ICONS.mic}Micro</span>
        <div class="stack" style="gap:6px;flex:1;min-width:220px"><div class="row" style="gap:8px"><button type="button" class="btn-sm" data-action="t-check-sound">${ICONS.sound} Thử tai nghe</button><span class="xs" id="chk-sound" style="font-weight:800">chưa thử</span></div>
          <div class="row" style="gap:8px">${recorder.can() ? `<button type="button" class="btn-sm" data-action="t-check-mic">${ICONS.mic} Thử micro (3 giây)</button><span class="xs" id="chk-mic" style="font-weight:800">chưa thử</span>` : '<span class="xs muted">Trình duyệt này không ghi âm được: bạn sẽ nộp phần Nói bằng cách tải file lên.</span>'}</div></div></div>
      <p class="small muted" style="margin-top:10px">Thang điểm (tổng /100): A1 0–24 · A2 25–44 · B1 45–64 · B2 65–84 · C1 85–100.</p>
      <div class="row">${kind === 'placement' && !draftStarted ? '<a class="btn" href="#/onboard">← Quay lại hồ sơ</a>' : ''}<button class="btn-primary btn-lg" data-action="t-begin">${draftStarted ? 'Tiếp tục bài đang làm' : 'Bắt đầu phần Nghe'}</button></div></div>`;
  } else if (step === 'listening') {
    body = `<div class="card"><h2>Phần 1 – Nghe <span class="badge">${maxOf('listening')} điểm</span></h2><p class="small muted">${esc(f.listening.intro)}</p>
      ${partsHtml('listening', (p, start) => { const left = 2 - (T.plays[p.key] || 0); return `<div class="card soft" style="margin-top:12px"><div class="row between"><div><b>${esc(p.title)}</b><div class="xs muted">${esc(p.instruction)}</div></div><button class="btn-sm ${left ? 'btn-primary' : ''}" data-action="t-play" data-part="${p.key}" id="play-${p.key}" ${left ? '' : 'disabled'}>${ICONS.sound} ${left ? `Nghe (còn ${left} lần)` : 'Đã hết lượt nghe'}</button></div>
        ${p.questions.map((q, qi) => optHtml(`${p.key}_${qi}`, q, qi, start + qi + 1)).join('')}</div>`; })}</div>`;
  } else if (step === 'reading') {
    body = `<div class="card"><h2>Phần 2 – ${f.reading.parts.some(p => p.text) ? 'Đọc' : 'Đọc, Ngữ pháp & Từ vựng'} <span class="badge">${maxOf('reading')} điểm</span></h2>${f.reading.intro ? `<p class="small muted">${esc(f.reading.intro)}</p>` : ''}
      ${partsHtml('reading', (p, start) => `<div class="card soft" style="margin-top:12px"><b>${esc(p.title)}</b><div class="xs muted">${esc(p.instruction)}</div>${p.text ? `<div class="card" style="white-space:pre-wrap;line-height:1.65;margin-top:8px;font-weight:600">${esc(p.text)}</div>` : ''}${p.questions.map((q, qi) => optHtml(`${p.key}_${qi}`, q, qi, start + qi + 1)).join('')}</div>`)}</div>`;
  } else if (step === 'writing') {
    body = `<div class="card"><h2>Phần 3 – Viết <span class="badge">${maxOf('writing')} điểm</span></h2><p class="small muted">Rubric chung cho cả phần: task achievement · organization · vocabulary · grammar · workplace communication (mỗi tiêu chí 1–5). Không dùng công cụ dịch.</p>
      ${wTasks.map(w => `<div class="card soft" style="margin-top:12px"><b>${esc(w.title)}</b>${w.points && wTasks.length > 1 ? ` <span class="badge">${w.points} điểm</span>` : ''}<p style="margin:6px 0">${esc(w.task)}</p><div class="card" style="white-space:pre-wrap">${esc(w.message)}</div><p class="small" style="margin:8px 0"><b>${esc(w.requirement)}</b></p>
      <textarea id="t-writing-${w.key}" class="t-writing" data-change="t-text" data-key="${w.key}" data-min="${w.minWords}" data-max="${w.maxWords}" style="min-height:${wTasks.length > 1 ? 150 : 220}px" placeholder="Write your answer here…">${esc(a[w.key] || '')}</textarea>
      <div class="row between" style="margin-top:6px"><span class="xs muted" id="t-wc-${w.key}">${wordCount(a[w.key])} / ${w.minWords}–${w.maxWords} từ</span></div></div>`).join('')}</div>`;
  } else if (step === 'speaking') {
    const tableHtml = tb => tb ? `<div class="table-wrap" style="margin:8px 0"><table class="small"><thead><tr>${tb.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${tb.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    body = `<div class="card"><h2>Phần 4 – Nói <span class="badge">${maxOf('speaking')} điểm</span></h2><p class="small muted">Mỗi task nộp bằng <b>file ghi âm</b>: bấm Ghi âm để thu ngay trên trang, hoặc tải lên file có sẵn (mp3, m4a, wav, webm; tối đa 20 MB). Không mở ứng dụng ghi âm khác vì sẽ bị tính rời màn hình. ${ai.canTranscribe() ? 'AI chép lời từ file để chấm nội dung (không chấm phát âm); bạn sửa được lời chép nếu máy nghe sai.' : '<b>Nhà cung cấp AI hiện tại không chép lời được file: sau khi có file, hãy gõ lại nội dung bạn đã nói vào ô bên dưới để được chấm.</b>'}</p>
      ${f.speaking.tasks.map(t => `<div class="card soft" style="margin-top:12px"><b>${esc(t.title)}</b><div style="white-space:pre-wrap;margin:6px 0">${esc(t.prompt)}</div>${tableHtml(t.table)}<div class="xs muted">${esc(t.hint)}</div>
        <textarea id="sp-${t.key}" data-change="t-text" data-key="${t.key}" style="min-height:90px;margin-top:8px" placeholder="Lời chép từ file ghi âm (hoặc gõ lại nội dung bạn đã nói)…">${esc(a[t.key] || '')}</textarea>
        <div class="row" style="margin-top:6px">${recorder.can() ? `<button class="btn-sm" data-action="t-rec" data-key="${t.key}">${ICONS.mic} Ghi âm</button>` : ''}<label class="btn btn-sm">Tải file ghi âm<input type="file" accept="audio/*" hidden data-change="t-audio" data-key="${t.key}"></label><span class="xs muted" id="au-${t.key}">${T.audio?.[t.key] ? esc(T.audio[t.key].name) : 'chưa có file'}</span><span class="xs muted" id="wc-${t.key}">${wordCount(a[t.key])} từ</span></div></div>`).join('')}</div>`;
  } else if (step === 'done') {
    const nL = f.listening.parts.reduce((n, p) => n + p.questions.filter((q, i) => a[`${p.key}_${i}`] !== undefined).length, 0), nR = f.reading.parts.reduce((n, p) => n + p.questions.filter((q, i) => a[`${p.key}_${i}`] !== undefined).length, 0);
    body = `<div class="card"><h2>Nộp bài</h2><ul class="small"><li>Nghe: ${nL}/${nQ('listening')} câu · Đọc: ${nR}/${nQ('reading')} câu</li><li>Viết: ${wTasks.map(t => wordCount(a[t.key]) + ' từ').join(' + ')} · Nói: ${sum(f.speaking.tasks.map(t => wordCount(a[t.key])))} từ</li><li>Cảnh báo rời màn hình: ${T.warnings.length}/${limit}</li></ul>
      <p class="small">${ai.hasKey() ? 'AI sẽ chấm phần Viết/Nói theo rubric và gợi ý trình độ; người vận hành duyệt lại.' : 'Chưa kết nối AI: Nghe/Đọc chấm tự động, Viết/Nói sẽ do người vận hành chấm theo rubric.'}</p>
      <button class="btn-primary btn-lg" data-action="t-submit" id="t-submit">Nộp bài</button><div id="t-status" class="small muted" style="margin-top:8px"></div></div>`;
  }
  const header = sec ? `<div class="card flat" style="position:sticky;top:64px;z-index:5;padding:10px 14px;margin-bottom:10px"><div class="row between"><div class="row"><span class="badge">Phần ${T.step}/4 · ${SECTION_NAMES[sec]}</span><span class="badge primary" id="t-timer">${timed ? fmtClock(testDurSec(sec)) : 'Không giới hạn'}</span></div><div class="row"><span class="xs muted" id="t-warn">Cảnh báo ${T.warnings.length}/${limit}</span><span class="badge warn" title="Bài test không lưu tạm hay tạm dừng được; đồng hồ chạy liên tục">Không lưu tạm</span><button class="btn-sm btn-primary" data-action="t-finish">${T.step < 4 ? 'Nộp phần này →' : 'Kết thúc phần Nói →'}</button></div></div><div class="steps" style="margin:8px 0 0">${SECTIONS.map((s, i) => `<i class="${i + 1 < T.step ? 'done' : i + 1 === T.step ? 'cur' : ''}" title="${SECTION_NAMES[s]}"></i>`).join('')}</div></div>` : '';
  shell(`<div class="page-title"><h1>${title}</h1>${sec ? '<span class="xs muted">Thời gian vẫn chạy nếu bạn rời trang</span>' : `<a class="btn btn-sm" href="#/home">Về trang chủ</a>`}</div>${header}${body}`, {title});
  clearInterval(T_tick);
  if (sec) { ensureSectionStarted(sec); T_tick = setInterval(tick, 1000); tick(); }
  audio.hold(sec === 'listening'); // no background music during the Listening section; it returns in the next section
  $$('.t-writing').forEach(el => el.addEventListener('input', e => { const c = $('#t-wc-' + el.dataset.key); if (c) c.textContent = `${wordCount(e.target.value)} / ${el.dataset.min}–${el.dataset.max} từ`; }));
  f.speaking.tasks.forEach(t => $('#sp-' + t.key)?.addEventListener('input', e => { $('#wc-' + t.key).textContent = wordCount(e.target.value) + ' từ'; }));
});
// equipment check on the intro screen (before the clock starts)
actions['t-check-sound'] = t => { const st = $('#chk-sound'); st.textContent = '🔊 đang phát câu mẫu tiếng Việt…'; const vi = speech.hasVoice('vi'); // the equipment check speaks Vietnamese so the learner only judges the sound, not their English
  const ok = vi ? speech.speak('Đây là câu kiểm tra âm thanh. Nếu bạn nghe rõ câu này, tai nghe của bạn đã sẵn sàng.', () => { if (st.isConnected) st.innerHTML = 'Nghe rõ câu tiếng Việt vừa rồi? → sẵn sàng ✓ · Không nghe thấy: kiểm tra âm lượng / tai nghe rồi thử lại'; }, 'vi-VN')
    : speech.speak('This is a sound check. If you can hear this sentence clearly, your headphones are ready.', () => { if (st.isConnected) st.innerHTML = 'Máy này không có giọng đọc tiếng Việt nên phát câu tiếng Anh. Nghe rõ? → sẵn sàng ✓ · Không nghe thấy: kiểm tra âm lượng / tai nghe rồi thử lại'; });
  if (!ok) st.textContent = '✗ Trình duyệt không phát được giọng đọc'; };
actions['t-check-mic'] = async t => {
  const st = $('#chk-mic'); let stream; t.disabled = true;
  try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); } catch (e) { st.textContent = '✗ Không truy cập được micro – hãy cho phép micro trong trình duyệt'; t.disabled = false; return; }
  const chunks = []; const mr = new MediaRecorder(stream); let peak = 0, raf = 0;
  try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const an = ctx.createAnalyser(); ctx.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.fftSize); const loop = () => { an.getByteTimeDomainData(buf); buf.forEach(v => { peak = Math.max(peak, Math.abs(v - 128)); }); raf = requestAnimationFrame(loop); }; loop(); mr.addEventListener('stop', () => { cancelAnimationFrame(raf); ctx.close(); }); } catch {}
  mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = () => { stream.getTracks().forEach(x => x.stop()); t.disabled = false; if (!st.isConnected) return;
    if (peak < 4) { st.textContent = '✗ Micro không thu được tiếng – kiểm tra micro rồi thử lại'; return; }
    st.textContent = '▶ đang phát lại giọng của bạn…'; const a = new Audio(URL.createObjectURL(new Blob(chunks, {type: mr.mimeType || 'audio/webm'}))); a.onended = () => { if (st.isConnected) st.textContent = 'Nghe lại được giọng mình? → micro sẵn sàng ✓'; }; a.play().catch(() => { st.textContent = 'Micro có thu tiếng ✓ (không phát lại được trên trình duyệt này)'; }); };
  mr.start(); let n = 3; st.textContent = `⏺ đang ghi, hãy nói vài từ… ${n}`; const iv = setInterval(() => { n--; if (n > 0) { if (st.isConnected) st.textContent = `⏺ đang ghi, hãy nói vài từ… ${n}`; } else { clearInterval(iv); if (mr.state !== 'inactive') mr.stop(); } }, 1000);
};
actions['t-begin'] = async () => {
  if (!Object.keys(T.sections).length) { // first start: make the no-pause rule impossible to miss
    const total = S.settings.testTimed !== false ? Math.round(sum(SECTIONS.map(s => testDurSec(s))) / 60) : null;
    if (!(await confirmDlg(`Bắt đầu rồi sẽ KHÔNG lưu tạm hay tạm dừng được.\nĐồng hồ chạy liên tục${total ? ` (tối đa ${total} phút cho cả 4 phần)` : ''}, kể cả khi bạn thoát ra hay tắt trình duyệt. Hãy chắc là bạn có đủ thời gian và đã thử tai nghe, micro.`, {okLabel: 'Tôi đã sẵn sàng, bắt đầu'}))) return;
    if (!T) return;
  }
  T.step = Math.max(1, T.step); saveDraft(); render();
};
actions['t-ans'] = t => { T.answers[t.dataset.key] = +t.value; saveDraft(); $$(`input[name="${t.name}"]`).forEach(r => r.closest('.opt').classList.toggle('sel', r.checked)); };
actions['t-text'] = t => { T.answers[t.dataset.key] = t.value; saveDraft(); };
actions['t-play'] = t => {
  const key = t.dataset.part; const p = formOf(T).listening.parts.find(x => x.key === key); if ((T.plays[key] || 0) >= 2) return;
  T.plays[key] = (T.plays[key] || 0) + 1; saveDraft(); const left = 2 - T.plays[key];
  t.disabled = true; t.innerHTML = '<span class="spinner"></span> Đang phát…';
  const text = p.audio.map(([who, line]) => `${who}: ${line}`).join('. ');
  const done = () => { t.disabled = !left; t.className = 'btn-sm ' + (left ? 'btn-primary' : ''); t.innerHTML = `${ICONS.sound} ${left ? `Nghe (còn ${left} lần)` : 'Đã hết lượt nghe'}`; };
  if (!speech.speak(text, done)) done();
};
// speaking answers are audio files (recorded in the page or uploaded); the transcript box is what gets graded
const keepTestAudio = async (key, file) => { if (!T) return; const ta = $('#sp-' + key); const meta = await takeAudio(file, T.userId + ':' + T.kind + ':' + key, ta, $('#au-' + key)); if (!meta || !T) return; T.audio = T.audio || {}; T.audio[key] = meta; if (ta) { T.answers[key] = ta.value; const wc = $('#wc-' + key); if (wc) wc.textContent = wordCount(ta.value) + ' từ'; } saveDraft(); };
actions['t-audio'] = t => keepTestAudio(t.dataset.key, t.files[0]);
actions['t-rec'] = t => recorder.toggle(t, file => keepTestAudio(t.dataset.key, file));
actions['t-pause'] = async () => {
  flushTestInputs(); const sec = curSection(); const left = timeLeft(sec);
  toast('Đã lưu tạm bài làm', 'ok');
  if (await confirmDlg(`Bài làm đã được lưu trên máy này.\nMuốn thoát ra và làm tiếp sau?${left != null ? ` Lưu ý: đồng hồ phần ${SECTION_NAMES[sec]} vẫn chạy (còn ${fmtClock(left)}); hết giờ phần đó sẽ tự nộp.` : ''}`, {okLabel: 'Thoát, làm tiếp sau'})) go('#/home');
};
actions['t-finish'] = async () => {
  const sec = curSection(); const f = formOf(T); const a = T.answers; let warn = '';
  if (sec === 'listening' || sec === 'reading') { const miss = f[sec].parts.reduce((n, p) => n + p.questions.filter((q, i) => a[`${p.key}_${i}`] === undefined).length, 0); if (miss) warn = `Còn ${miss} câu chưa trả lời.`; }
  if (sec === 'writing') { const short = writingTasks(f).filter(t => wordCount(a[t.key]) < t.minWords); if (short.length) warn = short.map(t => `${t.title.split(' – ')[0]}: mới ${wordCount(a[t.key])} từ (yêu cầu ${t.minWords}–${t.maxWords})`).join('; ') + '.'; }
  if (sec === 'speaking') { const empty = f.speaking.tasks.filter(t => !wordCount(a[t.key])).length; if (empty) warn = `Còn ${empty} task chưa có câu trả lời.`; }
  flushTestInputs();
  if (!(await confirmDlg((warn ? warn + ' ' : '') + `Nộp phần ${SECTION_NAMES[sec]} và chuyển tiếp?\nBạn sẽ không quay lại phần này được. Đồng hồ vẫn chạy trong lúc đếm ngược.`, {okLabel: 'Nộp phần này', countdown: true}))) return;
  if (!T || curSection() !== sec) return; // time ran out during the confirmation
  finishSection(false);
};
async function submitTest(auto = false, reason = '') {
  if (!T || T._submitting) return; T._submitting = true; speech.stop(); clearInterval(T_tick);
  const u = userById(T.userId) || me(); const scored = scoreTest(T);
  const timing = Object.fromEntries(SECTIONS.map(s => [s, T.sections[s] ? {seconds: Math.round(((T.sections[s].finishedAt || Date.now()) - T.sections[s].startedAt) / 1000), auto: !!T.sections[s].auto} : null]));
  const test = {id: uid('t'), userId: u.id, kind: T.kind, form: T.form, target: T.target || null, answers: T.answers, audio: T.audio || {}, ...scored, warnings: T.warnings, timing, autoSubmitted: auto, autoReason: reason, aiSuggestedCefr: null, rationale: '', aiScored: false, submittedAt: new Date().toISOString(), startedAt: T.startedAt};
  const btn = $('#t-submit'); if (btn) btn.disabled = true;
  if (ai.hasKey()) { const st = $('#t-status'); if (st) st.innerHTML = '<span class="spinner"></span> AI đang chấm phần Viết/Nói theo rubric…'; else toast('AI đang chấm phần Viết/Nói…', '');
    try { const r = await ai.assessPlacement(test, u); applyAiAssessment(test, r); } catch (e) { toast('AI không chấm được: ' + e.message + ' – vận hành sẽ chấm tay.', 'err'); } }
  S.tests.push(test); syncUserFromTest(u, test); if (test.kind === 'levelup') evalLevelupTest(test);
  const mins = clamp(Math.round((Date.now() - new Date(T.startedAt)) / 60000), 5, 90); logActivity(u.id, 'test', mins);
  if (S.testDrafts) delete S.testDrafts[draftKey(T.userId, T.kind)]; const kind = T.kind; T = null; save(true);
  toast(auto ? 'Bài đã được tự động nộp' : 'Đã nộp bài', auto ? 'err' : 'ok');
  go(kind === 'final' ? '#/survey' : '#/home');
}
actions['t-submit'] = async () => { if (await confirmDlg('Nộp bài kiểm tra?\nSau khi nộp bạn không sửa hay làm lại được.', {okLabel: 'Nộp bài', countdown: true})) submitTest(false); };

// =====================================================================
// Operator screens
// =====================================================================
const scoreBar = (label, p, heur) => `<div class="row" style="gap:8px"><span class="xs muted" style="width:70px">${label}</span><div class="progress" style="flex:1"><i style="width:${p}%"></i></div><span class="xs" style="width:42px;text-align:right">${p}%${heur ? '<span class="muted" title="Điểm ước lượng theo độ dài, chưa chấm AI">*</span>' : ''}</span></div>`;
const sectionBars = sc => SECTIONS.map(s => scoreBar(SECTION_NAMES[s], sc[s]?.pct ?? 0, sc[s]?.heuristic)).join('');

route('#/op', () => {
  const u = me(); if (!isStaff(u)) { go('#/'); return; }
  const pending = learners().filter(x => !x.cefrApproved && userTest(x.id, 'placement'));
  const noTest = learners().filter(x => !x.cefrApproved && !userTest(x.id, 'placement'));
  const approved = learners().filter(x => x.cefrApproved);
  const w = weekInfo(currentWeek());
  const openAppeals = appeals().filter(a => a.status === 'pending').length;
  const openReports = topicReports().filter(r => r.status === 'open');
  shell(`${delReqCard(u)}${trashCard(u)}${openAppeals ? `<div class="banner warn" style="margin-bottom:12px"><div class="body small"><b>${openAppeals} kháng nghị chấm điểm đang chờ duyệt tay.</b> <a href="#/op/review" data-action="go-appeals">Mở tab Kháng nghị</a></div></div>` : ''}
    ${openReports.length ? `<div class="card" style="margin-bottom:12px;border-color:#6E3B32"><h3>Báo cáo nhập chủ đề mini game (${openReports.length})</h3><p class="small muted" style="margin:2px 0 8px">Học viên nhập chủ đề sai hoặc vi phạm 3 lần liên tiếp. Nhắc nhở rồi bấm Đã xử lý.</p><div class="list">${openReports.map(r => { const x = userById(r.userId); return `<div class="item"><div class="body"><div class="title">${esc(x ? x.name : '?')} <span class="xs muted">${fmtDateTime(r.at)}</span></div><div class="xs">${r.inputs.map(i => `<code>${esc(i.input)}</code> – ${esc(i.reason)}`).join('<br>')}</div></div><button class="btn-sm btn-primary" data-action="tr-done" data-id="${r.id}">Đã xử lý</button></div>`; }).join('')}</div></div>` : ''}
    <div class="page-title"><div><h1>Duyệt trình độ</h1><p class="muted">Tuần ${currentWeek()}/${S.settings.pilotWeeks}${w.topic ? ' · ' + esc(w.topic) : ' · <a href="#/op/weeks">chưa đặt chủ đề</a>'} · ${approved.length} người học đang hoạt động</p></div>
      ${!ai.hasKey() ? '<a class="badge warn" href="#/settings">Chưa có API key – AI sinh bài/chấm bài chưa hoạt động</a>' : ''}</div>
    <section class="section"><h3>Chờ duyệt (${pending.length})</h3>
      ${pending.length ? pending.map(x => { const t = userTest(x.id, 'placement'); return `<div class="card">
        <div class="row between"><div><b class="name" style="font-family:var(--font-display);font-size:1.05rem">${esc(x.name)}</b> <span class="xs muted">nộp ${fmtDateTime(t.submittedAt)} · tổng ${t.total}/100</span></div>
          <div class="row"><span class="badge">Điểm thô: <b class="lvl">&nbsp;${t.rawLevel}</b></span>${t.aiSuggestedCefr ? `<span class="badge primary">AI gợi ý: <b class="lvl">&nbsp;${t.aiSuggestedCefr}</b></span>` : '<span class="badge warn">Chưa chấm AI</span>'}</div></div>
        <div class="grid cols-2" style="margin-top:10px"><div class="stack" style="gap:4px">${sectionBars(t.sectionScores)}</div>
          <div class="small">${t.rationale ? `<p style="margin:0"><b>Nhận xét AI:</b> ${esc(t.rationale)}</p>` : '<p class="muted" style="margin:0">Không có nhận xét AI. Xem bài làm để quyết định.</p>'}${t.monthlyGoal ? `<p style="margin:4px 0 0"><b>Mục tiêu gợi ý:</b> ${esc(t.monthlyGoal)}</p>` : ''}</div></div>
        ${x.profile ? `<details style="margin-top:8px"><summary class="small">Hồ sơ: ${esc([x.profile.position, x.profile.department].filter(Boolean).join(' · ') || '—')} · tự đánh giá ${esc(optLabel('selfLevel', x.profile.selfLevel))}${(x.profile.certs || []).length ? ' · ' + esc(x.profile.certs.map(certLabel).join(', ')) : ''} · thích ${esc(optLabels('styles', x.profile.styles))}</summary><div style="margin-top:6px">${profileCard(x)}</div></details>` : '<p class="xs muted" style="margin:6px 0 0">Chưa điền hồ sơ cá nhân.</p>'}
        <div class="row" style="margin-top:12px"><select style="width:auto" id="lvl_${x.id}">${LEVELS.map(l => `<option value="${l}" ${(t.aiSuggestedCefr || t.rawLevel) === l ? 'selected' : ''}>${LEVEL_NAMES[l]}</option>`).join('')}</select>
          <button class="btn-primary" data-action="op-approve" data-id="${x.id}">Duyệt mức</button><button data-action="op-view-test" data-id="${t.id}">Xem bài làm</button>${!t.aiScored && ai.hasKey() ? `<button data-action="op-rescore" data-id="${t.id}">Chấm lại bằng AI</button>` : ''}<button class="btn-sm btn-danger" data-action="del-user" data-id="${x.id}" style="margin-left:auto">Xoá học viên</button></div></div>`; }).join('') : '<div class="card"><p class="muted" style="margin:0">Không có ai chờ duyệt.</p></div>'}
    </section>
    ${(() => { const sig = approved.map(x => ({x, s: levelSignal(x), st: levelUpState(x)}));
      // "ready" = may start the test now (or only lacks an approved form); learners already in the flow (testing, graded, failed, waiting) are listed separately
      const ready = sig.filter(r => r.s.ready && !r.x.pendingCefr && (r.st.phase === 'eligible' || (r.st.phase === 'none' && !approvedLevelForm(nextLevelOf(r.x.cefr))))), weak = sig.filter(r => r.s.demote && !r.x.pendingCefr);
      const flow = sig.filter(r => ['testing', 'ungraded', 'challenge', 'failed'].includes(r.st.phase));
      const flowLine = r => { const st = r.st, t = st.test; const tl = t ? `bài thi <b>${t.total}/100</b> (${SECTIONS.map(k => SECTION_NAMES[k] + ' ' + t.sectionScores[k].pct + '%').join(', ')})` : '';
        return st.phase === 'testing' ? 'đang làm bài thi' : st.phase === 'ungraded' ? `đã nộp ${tl} – <b>chờ chấm Viết/Nói</b>` : st.phase === 'challenge' ? `qua ${tl} · đang thử thách Season (${st.session ? st.session.turns.length : 0}/${CHALLENGE_TURNS})` : `<b>chưa đạt</b>: ${st.session && st.session.challenge.result === 'fail' ? `thử thách Season TB ${st.session.challenge.mean}/5, ${st.session.challenge.off} lạc đề` : st.req ? 'vận hành từ chối' : tl} · điều kiện thi lại ${st.plan.items.filter(i => i.ok).length}/${st.plan.items.length}: ${st.plan.items.filter(i => !i.ok).map(i => i.label.toLowerCase()).join(', ') || 'đủ'}`; };
      const flowHtml = flow.length ? `<div class="card" style="margin-top:12px"><h4 style="margin:0 0 6px">Đang trong luồng lên mức (${flow.length})</h4><div class="list">${flow.map(r => `<div class="item"><div class="body"><div class="title">${esc(r.x.name)} ${lvlChip(r.x.cefr)} → ${lvlChip(r.st.target)}</div><div class="xs muted">${flowLine(r)}</div></div>${r.st.test ? `<button class="btn-sm" data-action="op-view-test" data-id="${r.st.test.id}">Bài thi</button>` : ''}${r.st.session ? `<button class="btn-sm" data-action="lr-chat" data-id="${r.st.session.id}">Thử thách</button>` : ''}</div>`).join('')}</div></div>` : '';
      const item = (r, demote) => `<div class="item"><div class="body"><div class="title">${esc(r.x.name)} ${lvlChip(r.x.cefr)} ${pendingLevelBadge(r.x)}</div><div class="xs muted">${demote ? r.s.wrongWeeks.map(w => `tuần ${w.w}: ${w.rate}% sai (${w.n} phần)`).join(' · ') : r.s.metrics.map(m => `${{lessons: 'bài', firstTry: 'đúng lần 1', submission: 'thực hành', coach: 'Season'}[m.key]} ${m.value}`).join(' · ') + (approvedLevelForm(nextLevelOf(r.x.cefr)) ? '' : ` · <b>chưa có đề ${nextLevelOf(r.x.cefr)}</b>`)}</div></div>${demote ? `<button class="btn-sm btn-danger" data-action="op-demote" data-id="${r.x.id}" ${r.x.pendingCefr ? 'disabled title="đang chờ đổi mức"' : ''}>Hạ mức</button>` : ''}<button class="btn-sm" data-action="op-change-level" data-id="${r.x.id}">Đổi level</button></div>`;
      const reqs = levelRequests().filter(r => r.status === 'pending').map(r => ({r, x: userById(r.userId), test: S.tests.find(t => t.id === r.testId), s: S.coachSessions.find(c => c.id === r.sessionId)})).filter(q => q.x);
      const reqHtml = reqs.length ? `<section class="section"><h3>Yêu cầu lên mức chờ duyệt (${reqs.length})</h3>${reqs.map(q => `<div class="card" style="background:var(--primary-soft)"><div class="row between"><div><b style="font-family:var(--font-display);font-size:1.1rem">${esc(q.x.name)}</b> ${lvlChip(q.r.from)} → ${lvlChip(q.r.to)} <span class="xs muted">gửi ${fmtDateTime(q.r.at)}</span></div><div class="row" style="gap:6px">${q.test ? `<button class="btn-sm" data-action="op-view-test" data-id="${q.test.id}">Bài thi</button>` : ''}${q.s ? `<button class="btn-sm" data-action="lr-chat" data-id="${q.s.id}">Thử thách</button>` : ''}<button class="btn-sm btn-primary" data-action="lr-approve" data-id="${q.r.id}">Duyệt lên mức</button><button class="btn-sm btn-danger" data-action="lr-reject" data-id="${q.r.id}">Từ chối</button></div></div>
        <div class="small" style="margin-top:6px">${q.test ? `Bài thi: <b>${q.test.total}/100</b> · ${SECTIONS.map(k => `${SECTION_NAMES[k]} <b>${q.test.sectionScores[k].pct}%</b>`).join(' · ')}${q.test.gradedBy === 'ai' ? ' <span class="xs muted">(AI chấm Viết/Nói)</span>' : ''}` : 'Bài thi: —'}<br>Thử thách Season: ${q.s ? `TB <b>${q.s.challenge.mean}/5</b> · ${q.s.challenge.off} lượt lạc đề · ${q.s.turns.length} lượt` : '—'}</div></div>`).join('')}</section>` : '';
      return `${reqHtml}<section class="section"><h3>Tín hiệu đổi mức <span class="small muted">(${levelUpCfg().days} ngày gần nhất · <a href="#/settings">ngưỡng</a> · <a href="#/op/levelforms">đề thi lên mức</a>)</span></h3><div class="grid cols-2">
        <div class="card" style="background:var(--mint)"><h4 style="margin:0 0 6px">Sẵn sàng thi lên level (${ready.length})</h4>${ready.length ? `<div class="list">${ready.map(r => item(r, false)).join('')}</div>` : '<p class="small muted" style="margin:0">Chưa có ai đủ cả 4 tín hiệu.</p>'}</div>
        <div class="card" style="background:var(--peach)"><h4 style="margin:0 0 6px">Nên xem xét hạ mức (${weak.length})</h4>${weak.length ? `<div class="list">${weak.map(r => item(r, true)).join('')}</div>` : '<p class="small muted" style="margin:0">Không ai sai quá ngưỡng hai tuần liền.</p>'}</div></div>${flowHtml}</section>`; })()}
    <section class="section"><h3>Đã duyệt (${approved.length})</h3>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Người học</th><th>Mức</th><th>Điểm đầu vào</th><th>Mục tiêu tháng</th><th></th></tr></thead><tbody>
        ${approved.map(x => { const t = userTest(x.id, 'placement'); return `<tr><td>${esc(x.name)}<br><span class="xs muted">${esc([x.profile?.position, x.profile?.department].filter(Boolean).join(' · '))}</span></td><td>${lvlChip(x.cefr)} ${pendingLevelBadge(x)}</td><td>${t ? t.total + '/100' : '—'}</td><td class="small">${esc(x.monthlyGoal || '—')}</td><td class="row" style="flex-wrap:nowrap"><button class="btn-sm" data-action="op-change-level" data-id="${x.id}">Đổi level</button><button class="btn-sm" data-action="op-edit-goal" data-id="${x.id}">Mục tiêu</button>${t ? `<button class="btn-sm" data-action="op-view-test" data-id="${t.id}">Bài test</button>` : ''}<button class="btn-sm" data-action="op-view-profile" data-id="${x.id}">Hồ sơ</button><button class="btn-sm btn-danger" data-action="del-user" data-id="${x.id}" title="Xoá học viên và toàn bộ dữ liệu học">Xoá</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Chưa có.</td></tr>'}
      </tbody></table></div></div></section>
    <section class="section"><h3>Chưa làm test (${noTest.length})</h3><div class="card">${noTest.length ? `<div class="list">${noTest.map(x => `<div class="item"><div class="body"><div class="title">${esc(x.name)}</div><div class="xs muted">${x.profile ? 'Đã điền hồ sơ · ' + esc([x.profile.position, x.profile.department].filter(Boolean).join(' · ')) : 'Chưa điền hồ sơ'}</div></div><button class="btn-sm" data-action="op-set-level-direct" data-id="${x.id}">Đánh giá thủ công</button>${x.profile ? `<button class="btn-sm" data-action="op-view-profile" data-id="${x.id}">Hồ sơ</button>` : ''}<button class="btn-sm btn-danger" data-action="del-user" data-id="${x.id}">Xoá</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">Tất cả đã làm test.</p>'}</div></section>
  `, {title: 'Duyệt trình độ'});
});
actions['op-view-profile'] = t => { const x = userById(t.dataset.id); openModal(`<div class="row between"><h3><span class="name">${esc(x.name)}</span></h3><button class="btn-sm" data-action="modal-close">Đóng</button></div>${profileCard(x)}`); };
actions['op-approve'] = t => { const x = userById(t.dataset.id); const pt = userTest(x.id, 'placement'); setLevel(x, $('#lvl_' + x.id).value, me().id, 'Duyệt mức đầu vào', pt ? `Test đầu vào ${pt.total}/100${pt.aiSuggestedCefr ? ', AI gợi ý ' + pt.aiSuggestedCefr : ''}` : ''); x.cefrApproved = true; x.approvedAt = new Date().toISOString(); x.approvedBy = me().id; save(true); toast(`${x.name} → ${x.cefr}`, 'ok'); render(); };
actions['op-change-level'] = async t => { const x = userById(t.dataset.id); const hist = (x.cefrHistory || []).slice(-4).reverse();
  openModal(`<h3>Đổi level cho <span class="name">${esc(x.name)}</span></h3><p class="small muted" style="margin:0 0 8px">Mức hiện tại: ${lvlChip(x.cefr)}. Mức mới có hiệu lực từ <b>thứ Hai tuần sau</b> (${fmtDate(nextMonday(todayStr()))}) để tuần đang học không bị đổi bộ bài giữa chừng.</p>
    ${x.pendingCefr ? `<div class="banner warn" style="margin-bottom:8px"><div class="body small">Đang chờ: → <b>${esc(x.pendingCefr.to)}</b> từ ${fmtDate(x.pendingCefr.effective)} (${esc(x.pendingCefr.reason || '')}). Lưu mức mới sẽ thay thế; <button class="btn-sm" data-action="op-cancel-pending" data-id="${x.id}">Huỷ thay đổi chờ</button></div></div>` : ''}
    <label class="field"><span>Mức mới</span><select id="cl-lvl">${LEVELS.map(l => `<option value="${l}" ${(x.pendingCefr?.to || x.cefr) === l ? 'selected' : ''}>${LEVEL_NAMES[l]}</option>`).join('')}</select></label>
    <label class="field"><span>Lý do (bắt buộc)</span><textarea id="cl-reason" style="min-height:60px" placeholder="VD: điểm thực hành 3 tuần liên tiếp trên 85, bài quá dễ">${esc(x.pendingCefr?.reason || '')}</textarea></label>
    ${hist.length ? `<div class="xs muted" style="margin-top:6px"><b>Lịch sử:</b> ${hist.map(h => `${fmtDate(h.at)}: ${h.from || '—'} → ${h.to}${h.reason ? ' (' + esc(h.reason) + ')' : ''}`).join(' · ')}</div>` : ''}
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button data-action="modal-close">Huỷ</button><button class="btn-primary" data-action="op-change-level-save" data-id="${x.id}">Lưu</button></div>`); };
actions['op-change-level-save'] = t => {
  const x = userById(t.dataset.id); const to = $('#cl-lvl').value; const reason = $('#cl-reason').value.trim();
  if (to !== x.cefr && !reason) { toast('Cần ghi lý do đổi mức', 'err'); return; }
  const rw = rewards(x); const r = setLevel(x, to, me().id, reason, `Tuần ${currentWeek()} · ${rw.stats.lessons} bài · ${rw.points} điểm`);
  save(true); closeModal(); toast(r === 'pending' ? `${x.name}: → ${to} từ ${fmtDate(x.pendingCefr.effective)}` : r === 'now' ? `${x.name} → ${to}` : 'Giữ nguyên mức', r === 'same' ? '' : 'ok'); render();
};
actions['op-cancel-pending'] = t => { const x = userById(t.dataset.id); x.pendingCefr = null; save(true); closeModal(); toast('Đã huỷ thay đổi mức đang chờ', 'ok'); render(); };
actions['op-set-level-direct'] = t => { const x = userById(t.dataset.id); openModal(`<h3>Xếp mức trực tiếp: <span class="name">${esc(x.name)}</span></h3><p class="small muted">Dùng khi người học không thể làm test. Nên để họ làm test để đo tiến bộ.</p><select id="cl-lvl">${LEVELS.map(l => `<option value="${l}">${LEVEL_NAMES[l]}</option>`).join('')}</select><div class="row" style="justify-content:flex-end;margin-top:12px"><button data-action="modal-close">Huỷ</button><button class="btn-primary" data-action="op-set-level-direct-save" data-id="${x.id}">Duyệt</button></div>`); };
actions['op-set-level-direct-save'] = t => { const x = userById(t.dataset.id); setLevel(x, $('#cl-lvl').value, me().id, 'Xếp mức trực tiếp (không làm test)', ''); x.cefrApproved = true; x.approvedAt = new Date().toISOString(); x.approvedBy = me().id; save(true); closeModal(); render(); };
actions['op-edit-goal'] = async t => { const x = userById(t.dataset.id); const v = await promptDlg('Mục tiêu tháng của ' + x.name, {label: 'Mục tiêu', value: x.monthlyGoal || '', multiline: true}); if (v !== null) { x.monthlyGoal = v.trim(); save(true); render(); } };
actions['op-rescore'] = async t => {
  const test = S.tests.find(x => x.id === t.dataset.id); const x = userById(test.userId); t.disabled = true; t.innerHTML = '<span class="spinner"></span>';
  try { const r = await ai.assessPlacement(test, x); applyAiAssessment(test, r); syncUserFromTest(x, test); if (test.kind === 'levelup') evalLevelupTest(test); save(true); toast('Đã chấm lại bằng AI', 'ok'); closeModal(); render(); }
  catch (e) { toast(e.message, 'err'); render(); }
};
actions['op-grade-manual'] = t => {
  const test = S.tests.find(x => x.id === t.dataset.id); const x = userById(test.userId);
  const val = k => clamp(+($('#' + k)?.value || 0), 0, 5);
  test.writingRubric = Object.fromEntries(WRITING_CRITERIA.map(([k]) => [k, val('gw-' + k)]));
  test.speakingRubric = Object.fromEntries(SPEAKING_CRITERIA.map(([k]) => [k, val('gs-' + k)]));
  const note = $('#g-note')?.value.trim(); if (note) test.rationale = note;
  test.gradedBy = me().id; test.gradedAt = new Date().toISOString(); recomputeTest(test); test.aiSuggestedCefr = test.aiSuggestedCefr || test.rawLevel; syncUserFromTest(x, test); if (test.kind === 'levelup') evalLevelupTest(test); save(true); toast('Đã lưu điểm chấm tay', 'ok'); closeModal(); render();
};
actions['op-view-test'] = t => {
  const test = S.tests.find(x => x.id === t.dataset.id); const f = formOf(test); const x = userById(test.userId); const a = test.answers; const ss = test.sectionScores;
  if (!f || !f.listening) { openModal(`<h3>Bài test (định dạng cũ)</h3><p class="small">Bài này được làm với đề cũ. Tổng ${test.total}/100 · ${test.rawLevel}.</p><button data-action="modal-close">Đóng</button>`); return; }
  const mcqRow = (q, key, n) => { const ans = a[key]; const ok = ans === q.answer; return `<li>${n}. ${esc(q.q)} <span class="xs muted">(${q.pts}đ)</span><br>${ans === undefined ? '<span class="muted">bỏ qua</span>' : `<span class="badge ${ok ? 'ok' : 'danger'}">${'ABCD'[ans]}. ${esc(q.options[ans])}</span>`}${!ok ? ` <span class="xs muted">→ ${'ABCD'[q.answer]}. ${esc(q.options[q.answer])}</span>` : ''}</li>`; };
  const partRows = skill => { let n = 0; return f[skill].parts.map(p => { const start = n; n += p.questions.length; return `<details style="margin-top:6px"><summary class="small">${esc(p.title)} · ${p.questions.filter((q, i) => a[`${p.key}_${i}`] === q.answer).reduce((s, q) => s + q.pts, 0)}/${sum(p.questions.map(q => q.pts))} điểm</summary>${p.audio ? `<div class="xs muted" style="margin:6px 0"><b>Transcript:</b> ${p.audio.map(([w, l]) => `<i>${esc(w)}:</i> ${esc(l)}`).join(' ')}</div>` : ''}<ol class="small" style="list-style:none;padding:0">${p.questions.map((q, qi) => mcqRow(q, `${p.key}_${qi}`, start + qi + 1)).join('')}</ol></details>`; }).join(''); };
  const mx = k => ss[k].max || 25;
  const rubricInputs = (prefix, criteria, stored) => `<div class="grid cols-3" style="margin-top:6px">${criteria.map(([k, lbl]) => `<label class="field" style="margin:0"><span>${lbl}</span><input id="${prefix}-${k}" type="number" min="0" max="5" value="${stored?.[k] ?? ''}" placeholder="0–5"></label>`).join('')}</div>`;
  const gradedNote = test.gradedBy === 'ai' ? '<span class="badge primary">AI chấm</span>' : test.gradedBy ? '<span class="badge ok">Chấm tay</span>' : '<span class="badge warn">Chưa chấm Viết/Nói (điểm tạm theo độ dài)</span>';
  openModal(`<div class="row between"><h3>Bài ${test.kind === 'placement' ? 'đầu vào' : test.kind === 'levelup' ? `thi lên mức ${esc(test.target || '')}` : 'cuối kỳ'} – <span class="name">${esc(x.name)}</span></h3><button class="btn-sm" data-action="modal-close">Đóng</button></div>
    <p class="small muted">Nộp ${fmtDateTime(test.submittedAt)}${test.autoSubmitted ? ` · <span class="badge danger">tự nộp (${test.autoReason === 'timeout' ? 'hết giờ' : 'quá số cảnh báo'})</span>` : ''} · ${gradedNote}</p>
    <div class="table-wrap"><table><thead><tr><th>Kỹ năng</th><th>Điểm</th><th>CEFR</th><th>Thời gian</th></tr></thead><tbody>
      ${SECTIONS.map(k => `<tr><td>${SECTION_NAMES[k]}</td><td><b>${ss[k].points}</b>/${mx(k)}${ss[k].heuristic ? ' <span class="xs muted" title="điểm tạm theo độ dài">*</span>' : ''}</td><td>${lvlChip(ss[k].cefr)}</td><td class="xs muted">${test.timing?.[k] ? fmtClock(test.timing[k].seconds) + (test.timing[k].auto ? ' (hết giờ)' : '') : '—'}</td></tr>`).join('')}
      <tr><td><b>Tổng</b></td><td><b>${test.total}</b>/100</td><td>${lvlChip(test.rawLevel)}${test.aiSuggestedCefr && test.aiSuggestedCefr !== test.rawLevel ? ` <span class="xs muted">AI gợi ý ${test.aiSuggestedCefr}</span>` : ''}</td><td class="xs muted">Cảnh báo: ${(test.warnings || []).length}</td></tr></tbody></table></div>
    ${(test.warnings || []).length ? `<details><summary class="small">Nhật ký cảnh báo (${test.warnings.length})</summary><ul class="xs muted">${test.warnings.map(w => `<li>${fmtDateTime(w.at)} · ${SECTION_NAMES[w.section] || w.section} · ${esc(w.reason)}</li>`).join('')}</ul></details>` : ''}
    <h4 style="margin-top:12px">Nghe · ${ss.listening.points}/${mx('listening')}</h4>${partRows('listening')}
    <h4 style="margin-top:12px">Đọc · ${ss.reading.points}/${mx('reading')}</h4>${partRows('reading')}
    <h4 style="margin-top:12px">Viết · ${ss.writing.points}/${mx('writing')}</h4>${writingTasks(f).map(w => `<p class="small" style="margin:6px 0 2px"><b>${esc(w.title)}</b> <span class="xs muted">(${wordCount(a[w.key])} từ · yêu cầu ${w.minWords}–${w.maxWords})</span></p><div class="card soft small" style="white-space:pre-wrap">${esc(a[w.key] || '(không có bài viết)')}</div>`).join('')}
    ${rubricInputs('gw', WRITING_CRITERIA, test.writingRubric)}<p class="xs muted" style="margin:4px 0 0">Một rubric cho cả phần Viết (5 tiêu chí × 1–5 = 25), quy đổi về ${mx('writing')} điểm.</p>
    <h4 style="margin-top:12px">Nói · ${ss.speaking.points}/${mx('speaking')}</h4>${f.speaking.tasks.map(tk => `<p class="small" style="margin:4px 0"><b>${esc(tk.title)}</b> ${test.audio?.[tk.key] ? `<button class="btn-sm" data-action="audio-play" data-id="${esc(test.audio[tk.key].id)}" title="${esc(test.audio[tk.key].name)}">${ICONS.sound} Nghe file</button>` : '<span class="xs muted">(không có file ghi âm)</span>'}<br>${nl2br(a[tk.key] || '(không có lời chép)')}</p>`).join('')}
    ${rubricInputs('gs', SPEAKING_CRITERIA, test.speakingRubric)}<p class="xs muted" style="margin:4px 0 0">Phát âm không chấm được từ bản ghi chữ; điểm Nói quy đổi từ 4 tiêu chí (× 1–5 = 20) về ${mx('speaking')} điểm.</p>
    <label class="field" style="margin-top:10px"><span>Nhận xét</span><textarea id="g-note" style="min-height:70px">${esc(test.rationale || '')}</textarea></label>
    <div class="row"><button class="btn-primary" data-action="op-grade-manual" data-id="${test.id}">Lưu điểm chấm tay</button>${ai.hasKey() ? `<button data-action="op-rescore" data-id="${test.id}">Chấm lại bằng AI</button>` : ''}</div>`, {wide: true});
};

// ---- level-up test forms (operator): AI-generate → preview → approve (one approved form per target level) ----
let lfBusy = null; // target level being generated right now
route('#/op/levelforms', () => {
  const u = me(); if (!isStaff(u)) { go('#/'); return; }
  const byTarget = t => levelForms().filter(f => f.target === t).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  shell(`<div class="page-title"><div><a href="#/op" class="small">← Duyệt trình độ</a><h1>Đề thi lên mức</h1><p class="muted">Mỗi mức đích cần một đề ngắn được duyệt: 1 đoạn nghe (5 câu × 5đ), 1 bài đọc (5 câu × 5đ), viết 80–120 từ, 1 task nói – tất cả ở mức đích. Học viên đủ tín hiệu thi đề của mức kế tiếp, thời gian mỗi phần bằng nửa bài đầu vào.</p></div>${!ai.hasKey() ? '<a class="badge warn" href="#/settings">Chưa có API key – không sinh đề được</a>' : ''}</div>
    ${LEVELS.slice(1).map(t => { const fs = byTarget(t); const ok = fs.find(f => f.status === 'approved'); return `<div class="card"><div class="row between"><h3 style="margin:0">Mức đích ${t} ${ok ? '<span class="badge ok">có đề đã duyệt</span>' : '<span class="badge warn">chưa có đề duyệt</span>'}</h3><button class="btn-sm btn-primary" data-action="lf-gen" data-target="${t}" ${!ai.hasKey() || lfBusy ? 'disabled' : ''}>${lfBusy === t ? '<span class="spinner"></span> Đang sinh…' : 'Sinh đề bằng AI'}</button></div>
      ${fs.length ? `<div class="list" style="margin-top:8px">${fs.map(f => `<div class="item"><div class="body"><div class="title">${esc(f.form.title)} <span class="badge ${f.status === 'approved' ? 'ok' : ''}">${f.status === 'approved' ? 'Đã duyệt' : 'Bản nháp'}</span>${f.form.short ? ' <span class="badge warn" title="AI viết đoạn nghe/đọc ngắn hơn yêu cầu dù đã sinh lại – xem kỹ trước khi duyệt hoặc sinh lại">ngắn</span>' : ''}</div><div class="xs muted">${fmtDateTime(f.createdAt)} · ${esc(f.byName || 'AI')} · ${f.form.listening.parts[0].questions.length} câu nghe · ${f.form.reading.parts[0].questions.length} câu đọc · ${S.tests.filter(x => x.form === f.id).length} lượt thi</div></div><button class="btn-sm" data-action="lf-view" data-id="${f.id}">Xem</button>${f.status === 'approved' ? '' : `<button class="btn-sm btn-primary" data-action="lf-approve" data-id="${f.id}">Duyệt</button>`}<button class="btn-sm btn-danger" data-action="lf-delete" data-id="${f.id}">Xoá</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:8px 0 0">Chưa có đề.</p>'}</div>`; }).join('')}`, {title: 'Đề thi lên mức'});
});
actions['lf-gen'] = async t => { const target = t.dataset.target; if (lfBusy) return; lfBusy = target; render(); try { const form = await ai.generateLevelForm(target); levelForms().push({id: uid('lf'), target, status: 'draft', form, createdAt: new Date().toISOString(), by: me().id, byName: me().name}); save(true); toast(`Đã sinh đề mức ${target} – xem rồi duyệt`, 'ok'); } catch (e) { toast('Không sinh được đề: ' + e.message, 'err'); } finally { lfBusy = null; render(); } };
actions['lf-view'] = t => { const f = levelForms().find(x => x.id === t.dataset.id); if (!f) return; const F = f.form; const qs = p => `<ol class="small" style="padding-left:18px">${p.questions.map(q => `<li>${esc(q.q)} <span class="xs muted">(${q.pts}đ)</span><br>${q.options.map((o, i) => `<span class="chip ${i === q.answer ? 'good' : ''}" style="margin:2px">${'ABCD'[i]}. ${esc(o)}</span>`).join('')}</li>`).join('')}</ol>`;
  openModal(`<div class="row between"><h3>${esc(F.title)} <span class="badge">mức ${f.target}</span> <span class="badge ${f.status === 'approved' ? 'ok' : ''}">${f.status === 'approved' ? 'Đã duyệt' : 'Bản nháp'}</span></h3><button class="btn-sm" data-action="modal-close">Đóng</button></div>
    ${F.listening.parts.map(p => `<h4 style="margin:12px 0 4px">Nghe · ${esc(p.title)}</h4><div class="xs muted">${esc(p.instruction)}</div><div class="card soft small" style="margin-top:6px">${p.audio.map(([w, l]) => `<b>${esc(w)}:</b> ${esc(l)}`).join('<br>')}</div>${qs(p)}`).join('')}
    ${F.reading.parts.map(p => `<h4 style="margin:12px 0 4px">Đọc · ${esc(p.title)}</h4><div class="xs muted">${esc(p.instruction)}</div><div class="card soft small" style="white-space:pre-wrap;margin-top:6px">${esc(p.text)}</div>${qs(p)}`).join('')}
    <h4 style="margin:12px 0 4px">Viết</h4><p class="small" style="margin:0">${esc(F.writing.task)}</p><div class="card soft small" style="white-space:pre-wrap;margin-top:6px">${esc(F.writing.message)}</div><p class="xs muted">${esc(F.writing.requirement)}</p>
    <h4 style="margin:12px 0 4px">Nói</h4>${F.speaking.tasks.map(k => `<p class="small" style="margin:0"><b>${esc(k.title)}</b><br>${nl2br(k.prompt)}<br><span class="xs muted">${esc(k.hint)}</span></p>`).join('')}
    ${f.status !== 'approved' && me().role !== 'manager' ? `<div class="row" style="margin-top:12px"><button class="btn-primary" data-action="lf-approve" data-id="${f.id}">Duyệt đề này</button></div>` : ''}`, {wide: true}); };
actions['lf-approve'] = t => { const f = levelForms().find(x => x.id === t.dataset.id); if (!f) return; levelForms().forEach(x => { if (x.target === f.target && x.status === 'approved') x.status = 'draft'; }); f.status = 'approved'; f.approvedAt = new Date().toISOString(); f.approvedBy = me().id; save(true); closeModal(); toast(`Đề mức ${f.target} đã duyệt (mỗi mức chỉ một đề đang dùng)`, 'ok'); render(); };
actions['lf-delete'] = async t => { const f = levelForms().find(x => x.id === t.dataset.id); if (!f) return; if (S.tests.some(x => x.form === f.id)) { toast('Đề này đã có bài thi nên không xoá được; sinh đề mới và duyệt để thay', 'err'); return; } if (await confirmDlg(`Xoá đề "${f.form.title}" (mức ${f.target})?`, {danger: true, okLabel: 'Xoá'})) { S.levelForms = levelForms().filter(x => x.id !== f.id); save(true); render(); } };
// ---- level-up requests (operator decides) and one-click demotion from the signal list ----
actions['lr-approve'] = async t => {
  const r = levelRequests().find(x => x.id === t.dataset.id); if (!r || r.status !== 'pending') return; const u = userById(r.userId); const test = S.tests.find(x => x.id === r.testId); const s = S.coachSessions.find(c => c.id === r.sessionId);
  if (!(await confirmDlg(`Duyệt ${u.name} lên mức ${r.to}? Mức mới có hiệu lực từ thứ Hai tuần sau (${fmtDate(nextMonday(todayStr()))}).`, {okLabel: 'Duyệt lên mức'}))) return;
  const ev = `Bài thi lên mức ${test ? test.total + '/100 (' + SECTIONS.map(k => SECTION_NAMES[k] + ' ' + test.sectionScores[k].pct + '%').join(', ') + ')' : '—'}; thử thách Season ${s ? s.challenge.mean + '/5, ' + s.challenge.off + ' lạc đề' : '—'}`;
  setLevel(u, r.to, me().id, 'Thi lên mức đạt', ev); Object.assign(r, {status: 'approved', decidedBy: me().id, decidedAt: new Date().toISOString()}); if (test) test.outcome = 'pass';
  save(true); toast(`${u.name} → ${r.to} từ ${fmtDate(u.pendingCefr?.effective || todayStr())}`, 'ok'); render();
};
actions['lr-reject'] = async t => {
  const r = levelRequests().find(x => x.id === t.dataset.id); if (!r || r.status !== 'pending') return; const u = userById(r.userId); const test = S.tests.find(x => x.id === r.testId);
  const reason = await promptDlg(`Từ chối yêu cầu lên mức của ${u.name}`, {label: 'Lý do (học viên sẽ thấy) – bắt buộc', okLabel: 'Từ chối', multiline: true}); if (reason === null) return; if (!reason.trim()) { toast('Cần ghi lý do', 'err'); return; }
  Object.assign(r, {status: 'rejected', reason: reason.trim(), decidedBy: me().id, decidedAt: new Date().toISOString()}); if (test) { test.outcome = 'fail'; test.failedAt = new Date().toISOString(); }
  save(true); toast('Đã từ chối; học viên thi lại được sau 14 ngày', 'ok'); render();
};
actions['tr-done'] = t => { const r = topicReports().find(x => x.id === t.dataset.id); if (r) { r.status = 'done'; r.doneBy = me().id; r.doneAt = new Date().toISOString(); save(true); render(); } };
actions['lr-chat'] = t => { const s = S.coachSessions.find(c => c.id === t.dataset.id); if (!s) return; const u = userById(s.userId); openModal(`<div class="row between"><h3>Thử thách lên mức ${esc(s.challenge.target)} – <span class="name">${esc(u?.name || '')}</span></h3><button class="btn-sm" data-action="modal-close">Đóng</button></div><p class="small muted">${s.turns.length} lượt · TB ${s.challenge.mean ?? challengeScore(s).mean}/5 · ${s.challenge.off ?? challengeScore(s).off} lạc đề · ${s.challenge.result === 'pass' ? '<span class="badge ok">đạt</span>' : s.challenge.result === 'fail' ? '<span class="badge danger">chưa đạt</span>' : 'đang làm'}</p><div class="chat" style="background:var(--bg);padding:12px;border-radius:12px">${u ? renderChat(s, u) : ''}</div>`, {wide: true}); };
actions['op-demote'] = async t => {
  const u = userById(t.dataset.id); if (!u) return; const to = LEVELS[LEVELS.indexOf(u.cefr) - 1]; if (!to) { toast('Đang ở mức thấp nhất', 'err'); return; }
  const sig = levelSignal(u); const reason = await promptDlg(`Hạ mức ${u.name}: ${u.cefr} → ${to}`, {label: `Lý do (bắt buộc). Có hiệu lực từ thứ Hai tuần sau (${fmtDate(nextMonday(todayStr()))}).`, okLabel: 'Hạ mức', multiline: true, value: `Hai tuần liền sai nhiều: ${sig.wrongWeeks.map(w => `tuần ${w.w} ${w.rate}%`).join(', ')}`});
  if (reason === null) return; if (!reason.trim()) { toast('Cần ghi lý do', 'err'); return; }
  setLevel(u, to, me().id, reason.trim(), sig.wrongWeeks.map(w => `tuần ${w.w}: ${w.rate}% sai / ${w.n} phần`).join('; ')); save(true); toast(`${u.name}: → ${to} từ ${fmtDate(u.pendingCefr?.effective || todayStr())}`, 'ok'); render();
};
// ---- weeks ----
const weekSug = {}; // week number → {levels, options, confirmed} from the last AI suggestion (not persisted)
function weekSugHtml(n) {
  const s = weekSug[n]; if (!s) return '';
  if (s.confirmed != null) return `<div class="banner ok" style="margin:0 0 10px"><div class="body small">✓ Đã xác nhận và lưu chủ đề <b>${esc(s.options[s.confirmed].topic)}</b> cho tuần ${n}. <a href="#" data-action="wk-sug-reopen" data-week="${n}">Xem lại các phương án</a></div></div>`;
  // every option shows the full plan: 5 days (Mon–Fri) for every level
  return `<div class="card soft" style="margin:0 0 10px;padding:10px"><div class="row between" style="margin-bottom:6px"><b class="small">Gợi ý cho tuần ${n} · kế hoạch 5 ngày (T2–T6) cho từng mức</b><button class="btn-sm btn-x" data-action="wk-sug-close" data-week="${n}">Bỏ gợi ý</button></div>
    ${s.options.map((o, i) => `<div class="card flat" style="margin-top:8px;padding:10px"><div class="row between" style="align-items:flex-start"><div style="flex:1;min-width:200px"><b style="font-family:var(--font-display);font-size:1.05rem">${i + 1}. ${esc(o.topic)}</b><div class="small">${esc(o.description)}</div><div class="xs muted">${esc(o.keyVocabHint)}</div></div><button class="btn-sm btn-primary" data-action="wk-confirm" data-week="${n}" data-i="${i}">Xác nhận phương án này</button></div>
      <div class="table-wrap" style="margin-top:6px"><table><thead><tr><th>Mức</th>${DAY_SHORT.slice(0, LESSONS_PER_WEEK).map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>${s.levels.map(l => { const d = o.levels[l] || []; return `<tr><td>${lvlChip(l)}</td>${Array.from({length: LESSONS_PER_WEEK}, (_, k) => `<td class="xs">${d[k] ? esc(d[k]) : '<span class="muted">—</span>'}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div></div>`).join('')}</div>`;
}
actions['wk-confirm'] = t => {
  const n = +t.dataset.week, s = weekSug[n], o = s?.options[+t.dataset.i], w = S.weeks.find(x => x.n === n); if (!o || !w) return;
  fillWeekForm({week: n, ...o}); Object.assign(w, {topic: o.topic, description: o.description, objectives: o.objectives, keyVocabHint: o.keyVocabHint, plan: o.levels}); save(true); // plan = {level: [5 day titles]}, followed when the lessons are generated
  s.confirmed = +t.dataset.i; $('#wk-sug-' + n).innerHTML = weekSugHtml(n); toast(`Đã lưu chủ đề tuần ${n}`, 'ok');
};
actions['wk-sug-close'] = t => { delete weekSug[+t.dataset.week]; $('#wk-sug-' + t.dataset.week).innerHTML = ''; };
actions['wk-sug-reopen'] = t => { const s = weekSug[+t.dataset.week]; if (s) { s.confirmed = null; $('#wk-sug-' + t.dataset.week).innerHTML = weekSugHtml(+t.dataset.week); } };
route('#/op/weeks', () => {
  const u = me(); if (!isStaff(u)) { go('#/'); return; }
  shell(`<div class="page-title"><div><h1>Khung chủ đề tuần</h1><p class="muted">Mỗi tuần một chủ đề chung cho cả nhóm; AI sinh bài theo chủ đề này cho từng mức. Pilot: ${S.settings.pilotWeeks} tuần, bắt đầu ${fmtDate(S.settings.pilotStartDate)}.</p></div>
      <div class="row"><button data-action="wk-suggest-all" ${ai.hasKey() ? '' : 'disabled title="Chưa kết nối AI"'}>Gợi ý các tuần còn trống</button></div></div>
    <div class="banner info" style="margin-bottom:12px">${bao('think', 44, true)}<div class="body small">Bấm <b>Gợi ý</b>: 3 phương án hiện ngay dưới ô chủ đề, mỗi phương án có <b>kế hoạch đủ 5 ngày T2–T6 cho từng mức</b>; kế hoạch được dùng khi sinh bài. Bấm <b>Xác nhận</b> ở phương án bạn chọn để điền và lưu tuần đó tại chỗ; sau đó vẫn sửa tay được rồi bấm <b>Lưu khung chủ đề</b>.</div></div>
    <div id="wk-status" class="small muted"></div>
    ${S.weeks.slice(0, S.settings.pilotWeeks).map(w => `<div class="card"><div class="row between"><h3>Tuần ${w.n} <span class="small muted">(${fmtDate(weekStart(w.n))} – ${fmtDate(addDays(weekStart(w.n), 6))})</span></h3><div class="row">${w.n === currentWeek() ? '<span class="badge primary">Tuần hiện tại</span>' : ''}<button class="btn-sm" data-action="wk-suggest" data-week="${w.n}" ${ai.hasKey() ? '' : 'disabled title="Chưa kết nối AI"'}>Gợi ý</button></div></div>
      <label class="field"><span>Chủ đề *</span><input id="wk-topic-${w.n}" value="${esc(w.topic)}" placeholder="VD: Giới thiệu bản thân & công việc"></label>
      <div id="wk-sug-${w.n}">${weekSugHtml(w.n)}</div>
      <label class="field"><span>Mô tả ngắn / tình huống</span><textarea id="wk-desc-${w.n}" style="min-height:60px" placeholder="VD: Tự giới thiệu trong buổi họp đầu với khách, nói về vai trò và dự án đang làm">${esc(w.description)}</textarea></label>
      <div class="grid cols-2"><label class="field"><span>Mục tiêu học</span><textarea id="wk-obj-${w.n}" style="min-height:60px" placeholder="VD: Nói được 5 câu về công việc; dùng present simple">${esc(w.objectives)}</textarea></label>
      <label class="field"><span>Gợi ý từ khoá (tuỳ chọn)</span><textarea id="wk-vocab-${w.n}" style="min-height:60px" placeholder="VD: role, responsible for, in charge of, deadline">${esc(w.keyVocabHint)}</textarea></label></div>
    </div>`).join('')}
    <div class="row" style="margin-top:12px"><button class="btn-primary" data-action="wk-save">Lưu khung chủ đề</button><a class="btn" href="#/op/lessons">Đi tới sinh bài →</a></div>`, {title: 'Chủ đề tuần'});
});
function fillWeekForm(w) { const set = (id, v) => { const el = $(id); if (el) { el.value = v; el.style.background = 'var(--butter)'; setTimeout(() => el.style.background = '', 1500); } }; set('#wk-topic-' + w.week, w.topic); set('#wk-desc-' + w.week, w.description); set('#wk-obj-' + w.week, w.objectives); set('#wk-vocab-' + w.week, w.keyVocabHint); }
async function suggestWeeksInto(weekNos, btn) {
  if (!weekNos.length) { toast('Không có tuần nào cần gợi ý', ''); return; }
  const st = $('#wk-status'); if (btn) btn.disabled = true; if (st) st.innerHTML = `<span class="spinner"></span> Season đang gợi ý tuần ${weekNos.join(', ')}…`;
  try { const res = await ai.suggestWeeks(weekNos); if (!res.length) throw new Error('AI không trả về gợi ý hợp lệ'); res.forEach(w => { weekSug[w.week] = w; const box = $('#wk-sug-' + w.week); if (box) box.innerHTML = weekSugHtml(w.week); }); if (st) st.textContent = `✓ Đã có bảng gợi ý cho tuần ${res.map(w => w.week).join(', ')} ngay dưới ô chủ đề. Bấm "Xác nhận" ở phương án bạn chọn.`; $('#wk-sug-' + res[0].week)?.scrollIntoView({behavior: 'smooth', block: 'center'}); }
  catch (e) { toast(e.message, 'err'); if (st) st.textContent = '✗ ' + e.message; }
  finally { if (btn) btn.disabled = false; }
}
actions['wk-suggest'] = t => suggestWeeksInto([+t.dataset.week], t);
actions['wk-suggest-all'] = t => { const empty = S.weeks.slice(0, S.settings.pilotWeeks).filter(w => !($('#wk-topic-' + w.n)?.value || '').trim()).map(w => w.n); suggestWeeksInto(empty.length ? empty : S.weeks.slice(0, S.settings.pilotWeeks).map(w => w.n), t); };
actions['wk-save'] = () => { S.weeks.forEach(w => { if (w.n > S.settings.pilotWeeks) return; const nt = $('#wk-topic-' + w.n).value.trim(); if (nt !== w.topic) delete w.plan; /* a hand-changed topic no longer matches the AI's 5-day plan */ w.topic = nt; w.description = $('#wk-desc-' + w.n).value.trim(); w.objectives = $('#wk-obj-' + w.n).value.trim(); w.keyVocabHint = $('#wk-vocab-' + w.n).value.trim(); }); save(true); toast('Đã lưu', 'ok'); };

// ---- lessons matrix ----
function levelsInUse() { const set = new Set(activeLearners().map(x => x.cefr)); S.lessonSets.forEach(l => set.add(l.cefr)); return LEVELS.filter(l => set.has(l)); }
route('#/op/lessons', () => {
  const u = me(); if (!isStaff(u)) { go('#/'); return; }
  const lv = levelsInUse(); const extra = LEVELS.filter(l => !lv.includes(l));
  const count = l => activeLearners().filter(x => x.cefr === l).length;
  shell(`<div class="page-title"><div><h1>Sinh & duyệt bài học</h1><p class="muted">Mỗi ô trong bảng là một <b>bộ 5 bài (T2–T6)</b> của một tuần. Cách làm: bấm <b>Sinh</b> (AI soạn) hoặc <b>Soạn tay</b> (điền form từng ngày ngay trên trang) → mở bộ bài để đọc → bấm <b>Duyệt</b>. Học viên chỉ thấy bộ đã duyệt.</p></div>
      ${extra.length ? `<div class="row"><select id="add-lvl" style="width:auto">${extra.map(l => `<option value="${l}">${l}</option>`).join('')}</select><button class="btn-sm" data-action="ls-add-level">Thêm cột mức</button></div>` : ''}</div>
    ${!ai.hasKey() ? '<div class="banner warn"><span>⚠️</span><div class="body">Chưa có API key nên không sinh bài được. Vào <a href="#/settings">Cài đặt</a> để nhập key. Bạn vẫn có thể bấm Soạn tay để tự điền bài theo form.</div></div>' : ''}
    <div class="banner info" style="margin-top:12px"><div class="body small"><b>Vì sao có các cột "Mức"?</b> Mỗi cột là một mức CEFR đang có học viên (số trong ngoặc). Cùng một chủ đề nhưng mỗi mức cần bộ bài riêng, vì độ khó và ngôn ngữ giải thích khác nhau (A1–A2 tiếng Việt, B1 trở lên tiếng Anh), và học viên chỉ nhận bộ bài đúng mức của mình. Cột nào có người mà ô còn trống hoặc là bản nháp thì nhóm đó chưa có bài. "Thêm cột mức" để soạn trước cho mức chưa có ai.</div></div>
    <div class="card" style="margin-top:12px"><div class="table-wrap"><table><thead><tr><th>Tuần ↓ · Mức CEFR →</th>${lv.map(l => `<th>${lvlChip(l)} <span class="muted">(${count(l)} học viên)</span></th>`).join('')}</tr></thead><tbody>
      ${S.weeks.slice(0, S.settings.pilotWeeks).map(w => `<tr><td><b>Tuần ${w.n}</b><br><span class="small ${w.topic ? '' : 'muted'}">${esc(w.topic) || 'chưa có chủ đề'}</span></td>
        ${lv.map(l => { const ls = lessonSet(w.n, l); const plan = (w.plan || {})[l] || [];
          // always list the 5 days of the week for this level: generated titles, else the confirmed plan, else empty slots
          const days = `<ol class="xs" style="margin:6px 0 0;padding:0;list-style:none;min-width:150px">${Array.from({length: LESSONS_PER_WEEK}, (_, k) => { const les = ls?.lessons.find((x, xi) => (x.day || xi + 1) === k + 1); const txt = les ? esc(les.title) : plan[k] ? `<span class="muted">${esc(plan[k])} (kế hoạch)</span>` : '<span class="muted">—</span>'; return `<li><b>${DAY_SHORT[k]}</b> ${txt}</li>`; }).join('')}</ol>`;
          return `<td style="vertical-align:top">${ls ? `<span class="badge ${ls.status === 'approved' ? 'ok' : 'warn'}">${ls.status === 'approved' ? 'Đã duyệt' : 'Bản nháp'}</span>${ls.lessons.length && !ls.lessons.every(isFullLesson) ? ' <span class="badge danger" title="Bài định dạng cũ hoặc nhập tay: thiếu Nghe / Nói / Phát âm. Mở bộ bài và bấm Sinh lại.">chưa đủ 4 kỹ năng</span>' : ''}<div class="xs muted">${ls.lessons.length} bài · ${fmtDateTime(ls.generatedAt)}</div><a class="btn btn-sm" href="#/op/lessons/${w.n}/${l}" style="margin-top:6px">Xem / duyệt</a>` : `<span class="badge">Chưa có</span><div class="row" style="margin-top:6px"><button class="btn-sm btn-primary" data-action="ls-generate" data-week="${w.n}" data-lvl="${l}" ${w.topic && ai.hasKey() ? '' : 'disabled'} title="${w.topic ? '' : 'Cần đặt chủ đề tuần trước'}">Sinh</button><button class="btn-sm" data-action="ls-manual" data-week="${w.n}" data-lvl="${l}" title="Tạo bộ bài trống rồi điền form từng ngày">Soạn tay</button></div>`}${days}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>${lv.length ? '' : '<p class="muted small">Chưa có người học nào được duyệt mức. Duyệt mức trước hoặc thêm cột mức.</p>'}</div>
    <div id="ls-status" class="small muted" style="margin-top:8px"></div>`, {title: 'Bài học'});
});
actions['ls-add-level'] = () => { const l = $('#add-lvl').value; window._extraLevels = (window._extraLevels || new Set()).add(l); render(); };
// Column for a level without learners: keep a tiny in-memory set so operator can pre-generate.
const _levelsInUseBase = levelsInUse;
function levelsInUseWithExtra() { const s = new Set(_levelsInUseBase()); (window._extraLevels || []).forEach(l => s.add(l)); return LEVELS.filter(l => s.has(l)); }
levelsInUse = levelsInUseWithExtra; // eslint-disable-line no-func-assign

async function generateSet(week, cefr, statusEl) {
  const w = weekInfo(week); if (!w.topic) { toast('Tuần này chưa có chủ đề', 'err'); return; }
  if (statusEl) statusEl.innerHTML = `<span class="spinner"></span> Đang sinh ${LESSONS_PER_WEEK} bài (T2–T6) tuần ${week} mức ${cefr}… Thường mất 15–30 giây; với gói AI miễn phí có thể tới 2–3 phút vì phải chờ hạn mức. Đừng đóng trang.`;
  ai.onStatus = msg => { const el = $('#ls-status'); if (el) el.innerHTML = `<span class="spinner"></span> ${esc(msg)}`; };
  try {
    const lessons = await ai.generateLessonSet(week, cefr);
    lessons.forEach((l, i) => { l.id = uid('l'); l.order = i + 1; l.day = l.day || i + 1; l.cefr = cefr; l.week = week; l.explanationLang = isLow(cefr) ? 'vi' : 'en'; });
    const existing = lessonSet(week, cefr);
    const set = {id: existing?.id || uid('ls'), week, cefr, status: 'draft', lessons, generatedAt: new Date().toISOString(), generatedBy: me()?.id || null, approvedAt: null, approvedBy: null};
    S.lessonSets = S.lessonSets.filter(x => !(x.week === week && x.cefr === cefr)); S.lessonSets.push(set); save(true);
    toast(`Đã sinh ${lessons.length} bài (bản nháp)`, 'ok'); go(`#/op/lessons/${week}/${cefr}`);
  } catch (e) { toast(e.message, 'err'); if (statusEl) statusEl.textContent = '✗ ' + e.message; }
}
actions['ls-generate'] = t => generateSet(+t.dataset.week, t.dataset.lvl, $('#ls-status'));
actions['ls-manual'] = t => { const week = +t.dataset.week, cefr = t.dataset.lvl; S.lessonSets.push({id: uid('ls'), week, cefr, status: 'draft', lessons: [], generatedAt: new Date().toISOString()}); save(true); go(`#/op/lessons/${week}/${cefr}`); };

route('#/op/lessons/:week/:cefr', (week, cefr) => {
  const u = me(); if (!isStaff(u)) { go('#/'); return; }
  week = +week; const ls = lessonSet(week, cefr); if (!ls) { go('#/op/lessons'); return; }
  const w = weekInfo(week);
  shell(`<div class="page-title"><div><a href="#/op/lessons" class="small">← Ma trận bài học</a><h1>Tuần ${week} · Mức ${cefr} <span class="badge ${ls.status === 'approved' ? 'ok' : 'warn'}">${ls.status === 'approved' ? 'Đã duyệt' : 'Bản nháp'}</span></h1><p class="muted">${esc(w.topic)} · ${ls.lessons.length} bài · giải thích bằng ${isLow(cefr) ? 'tiếng Việt' : 'tiếng Anh'}</p></div>
      <div class="row">${ls.status !== 'approved' ? `<button class="btn-primary" data-action="ls-approve" ${ls.lessons.length ? '' : 'disabled'}>✓ Duyệt bộ bài</button>` : `<button data-action="ls-unapprove">Thu hồi duyệt</button>`}<button data-action="ls-regen" ${ai.hasKey() && w.topic ? '' : 'disabled'}>Sinh lại</button><button class="btn-danger" data-action="ls-delete">Xoá</button></div></div>
    <div id="ls-status" class="small muted"></div>
    ${ls.lessons.length && !ls.lessons.every(isFullLesson) ? `<div class="banner warn" style="margin:8px 0 0"><span>⚠️</span><div class="body small"><b>${ls.lessons.filter(l => !isFullLesson(l)).length}/${ls.lessons.length} bài trong bộ này chưa theo cấu trúc chuẩn</b> (4 kỹ năng Nghe · Đọc · Viết · Nói + Từ vựng · Ngữ pháp · Phát âm). Đây là bài định dạng cũ hoặc bài soạn tay còn thiếu mục, nên học viên sẽ không thấy phần Nghe, Nói và Phát âm. Bấm <b>Sinh lại</b> để AI tạo đủ 5 bài theo cấu trúc mới, rồi duyệt lại.</div></div>` : ''}
    ${ls.lessons.some(l => l.levelWarn || (l.pron && l.pron.verified === false)) ? `<div class="banner warn" style="margin:8px 0 0"><span>⚠️</span><div class="body small"><b>Kiểm tra tự động còn thấy vấn đề ở ${ls.lessons.filter(l => l.levelWarn || (l.pron && l.pron.verified === false)).length} bài:</b> ${ls.lessons.map((l, i) => [l.levelWarn && `vượt mức (${esc(l.levelWarn)})`, l.pron && l.pron.verified === false && 'từ luyện phát âm chưa đủ 3 từ đúng âm'].filter(Boolean).length ? `${DAY_SHORT[(l.day || i + 1) - 1]}: ${[l.levelWarn && `vượt mức (${esc(l.levelWarn)})`, l.pron && l.pron.verified === false && 'từ luyện phát âm chưa đủ 3 từ đúng âm'].filter(Boolean).join(', ')}` : '').filter(Boolean).join(' · ')}. Bấm Sửa ở bài đó để chỉnh trong form, hoặc bấm Sinh lại.</div></div>` : ''}
    ${ls.lessons.some(l => isMicroLesson(l) && phrasesMissing(l).length) ? `<div class="banner warn" style="margin:8px 0 0"><span>⚠️</span><div class="body small"><b>${ls.lessons.filter(l => isMicroLesson(l) && phrasesMissing(l).length).length} bài có từ vựng chưa đủ 3 cụm từ (collocation).</b> Bài soạn trước khi có yêu cầu này sẽ thiếu. <button class="btn-sm btn-primary" data-action="ls-fill-phrases" ${ai.hasKey() ? '' : 'disabled title="Chưa kết nối AI"'} style="margin-left:6px">Bổ sung cụm từ bằng AI</button> hoặc bấm Sửa ở từng bài để tự điền.</div></div>` : ''}
    ${ls.lessons.some(detailsMissing) ? `<div class="banner warn" style="margin:8px 0 0"><span>⚠️</span><div class="body small"><b>${ls.lessons.filter(detailsMissing).length} bài chưa có đủ chi tiết mới:</b> từ loại / word family / đồng–trái nghĩa cho từ vựng, bài tập Từ loại &amp; Dùng từ, hoặc câu trắc nghiệm còn 3 lựa chọn (chuẩn mới là 4, toàn tiếng Anh). <button class="btn-sm btn-primary" data-action="ls-enrich" ${ai.hasKey() ? '' : 'disabled title="Chưa kết nối AI"'} style="margin-left:6px">Bổ sung bằng AI (${ls.lessons.filter(detailsMissing).length} bài)</button></div></div>` : ''}
    <div class="banner info" style="margin:8px 0 12px"><span>🔍</span><div class="body small">Checklist duyệt: đúng mức CEFR (từ/ngữ pháp không vượt mức)? ${isLow(cefr) ? 'Giải thích bằng tiếng Việt dễ hiểu?' : 'Toàn bộ bằng tiếng Anh?'} Đáp án bài tập đúng? Nội dung sát chủ đề tuần và tình huống công việc? Không khen quá tay, không nội dung nhạy cảm?</div></div>
    ${ls.lessons.map((l, i) => `<div class="card"><div class="row between"><h3>${isMicroLesson(l) ? `<span class="badge lvl-${ls.cefr}" style="margin-right:6px">${DAY_SHORT[(l.day || i + 1) - 1] || 'Bài ' + (i + 1)}</span>` : `Bài ${i + 1}: `}${esc(l.title)} <span class="badge">${l.durationMin} phút</span>${isMicroLesson(l) ? ` <span class="badge">${{write: 'tự viết', fill: 'điền từ', mcq: 'trắc nghiệm'}[normPractice(l.practice).type]} · đáp án: ${esc(normPractice(l.practice).answer || '—')}</span>` : ''}</h3><div class="row">${l.manual ? '<span class="badge">soạn tay</span>' : ''}${isMicroLesson(l) ? `<button class="btn-sm" data-action="ls-form" data-day="${l.day || i + 1}">Sửa</button>` : ''}<button class="btn-sm btn-danger" data-action="ls-del-lesson" data-i="${i}">Xoá bài</button></div></div>
      <p class="small muted">${esc(l.intro || '')}</p><details><summary>Xem nội dung</summary><div style="margin-top:8px">${renderLessonContent(l, {reveal: true})}</div></details></div>`).join('')}
    <div class="card"><h3>✍️ Soạn bài trực tiếp</h3><p class="small muted" style="margin:2px 0 10px">Chọn ngày để điền form ngay trên trang: từ vựng, ngữ pháp, phát âm và 4 kỹ năng. Ngày đã có bài thì form mở sẵn nội dung để sửa. App kiểm tra mục còn thiếu trước khi lưu; bộ bài trở về Bản nháp để duyệt lại.</p>
      <div class="row">${Array.from({length: LESSONS_PER_WEEK}, (_, i) => { const l = ls.lessons.find((z, zi) => (z.day || zi + 1) === i + 1); return `<button class="${l ? '' : 'btn-primary'}" data-action="ls-form" data-day="${i + 1}">${l ? 'Sửa ' : 'Soạn '}${DAY_SHORT[i]}</button>`; }).join('')}</div></div>`, {title: `Bài tuần ${week} ${cefr}`});
});
const SAMPLE_LESSON_JSON = {title: 'Introducing yourself at work', durationMin: 12, intro: 'Mục tiêu: tự giới thiệu 4–5 câu về công việc.', vocab: [{word: 'colleague', ipa: '/ˈkɒliːɡ/', meaning: 'đồng nghiệp', example: 'My colleagues are very friendly.'}], patterns: [{pattern: 'I work as a/an + job', example: 'I work as a tester.', note: 'Dùng a trước phụ âm, an trước nguyên âm.'}], reading: {title: 'Lan\'s first day', text: 'Hi, I am Lan. I work at GFT. I am a tester. I like my team.', questions: [{q: 'What is Lan\'s job?', options: ['Tester', 'Designer', 'Manager', 'Driver'], answer: 0}]}, exercises: [{type: 'mcq', prompt: 'I ___ at GFT.', options: ['work', 'works', 'working', 'am work'], answer: 'work', explanation: 'Chủ ngữ I + động từ nguyên mẫu.'}, {type: 'fill', prompt: 'She ___ (work) in the sales team.', options: [], answer: 'works', explanation: 'She/He + V-s.'}, {type: 'write', prompt: 'Write 3 sentences about your job.', options: [], answer: 'I work at GFT. I am a developer. I like my team.', explanation: ''}]};
actions['ls-copy-sample'] = () => copyText(JSON.stringify(SAMPLE_LESSON_JSON, null, 2));
const curSet = () => { const m = location.hash.match(/^#\/op\/lessons\/(\d+)\/(\w+)$/); return m ? lessonSet(+m[1], m[2]) : null; };
actions['ls-approve'] = () => { const ls = curSet(); ls.status = 'approved'; ls.approvedAt = new Date().toISOString(); ls.approvedBy = me().id; save(true); toast('Đã duyệt. Người học mức ' + ls.cefr + ' sẽ thấy bộ bài này.', 'ok'); render(); };
actions['ls-unapprove'] = () => { const ls = curSet(); ls.status = 'draft'; save(true); render(); };
actions['ls-regen'] = async () => { const ls = curSet(); if (ls.lessons.length && !(await confirmDlg('Sinh lại sẽ thay toàn bộ bộ bài hiện tại (tiến độ học của bài cũ vẫn được giữ). Tiếp tục?', {okLabel: 'Sinh lại', countdown: true}))) return; generateSet(ls.week, ls.cefr, $('#ls-status')); };
actions['ls-delete'] = async () => { const ls = curSet(); if (await confirmDlg('Xoá bộ bài này?', {danger: true, okLabel: 'Xoá'})) { S.lessonSets = S.lessonSets.filter(x => x.id !== ls.id); save(true); go('#/op/lessons'); } };
actions['ls-del-lesson'] = async t => { const ls = curSet(); if (await confirmDlg('Xoá bài này?', {danger: true, okLabel: 'Xoá'})) { ls.lessons.splice(+t.dataset.i, 1); save(true); render(); } };
actions['ls-edit-json'] = t => { const ls = curSet(); const l = ls.lessons[+t.dataset.i]; openModal(`<h3>Sửa bài ${+t.dataset.i + 1}</h3><textarea id="lj" style="min-height:50vh;font-family:ui-monospace,monospace;font-size:.8rem">${esc(JSON.stringify(l, null, 2))}</textarea><div class="row" style="justify-content:flex-end;margin-top:8px"><button data-action="modal-close">Huỷ</button><button class="btn-primary" data-action="ls-edit-json-save" data-i="${t.dataset.i}">Lưu</button></div>`, {wide: true}); };
actions['ls-edit-json-save'] = t => { try { const obj = JSON.parse($('#lj').value); const ls = curSet(); obj.id = ls.lessons[+t.dataset.i].id; obj.editedBy = me().id; obj.editedAt = new Date().toISOString(); ls.lessons[+t.dataset.i] = obj; save(true); closeModal(); render(); } catch (e) { toast('JSON lỗi: ' + e.message, 'err'); } };
actions['ls-add-json'] = () => { try { const obj = JSON.parse($('#ls-new-json').value); if (!obj.title) throw new Error('thiếu title'); const ls = curSet(); obj.id = uid('l'); obj.cefr = ls.cefr; obj.week = ls.week; obj.explanationLang = isLow(ls.cefr) ? 'vi' : 'en'; obj.vocab = obj.vocab || []; obj.patterns = obj.patterns || []; obj.exercises = obj.exercises || []; ls.lessons.push(obj); save(true); render(); } catch (e) { toast('JSON lỗi: ' + e.message, 'err'); } };

// ---- hand-written lessons: a form per day right in the CMS page (no JSON, no file) ----
// Field key, label, guidance shown under the input.
const DOC_FIELDS = [
  ['title', 'Tiêu đề bài', 'Tên ngắn của mẫu câu, bằng tiếng Anh. VD: I work as…'],
  ['objective', 'Mục tiêu bài học', 'Sau bài này học viên làm được gì (1 câu).'],
  ['theory', 'Ngữ pháp', 'Công thức + dùng khi nào + 2–3 câu ví dụ có dùng 3 từ vựng.'],
  ['examples', 'Câu ví dụ để đọc thành tiếng', '2–3 câu tiếng Anh, cách nhau bằng dấu ; (chỉ câu, không ghi công thức). Nút loa ở phần Ngữ pháp sẽ đọc các câu này.'],
  ['vocab1', 'Từ vựng 1', 'Mỗi từ: từ tiếng Anh, phiên âm, nghĩa tiếng Việt và 3 cụm từ có chứa từ đó (cách nhau bằng dấu ;). VD: work · /wɜːk/ · làm việc · work at GFT; work with a team; work from home'],
  ['vocab2', 'Từ vựng 2', 'từ | phiên âm | nghĩa | cụm 1; cụm 2; cụm 3'], ['vocab3', 'Từ vựng 3', 'từ | phiên âm | nghĩa | cụm 1; cụm 2; cụm 3'],
  ['sound', 'Âm mục tiêu', 'Một ký hiệu IPA. VD: ɜː'],
  ['tip', 'Mẹo phát âm', '1 câu hướng dẫn cách phát âm âm đó.'],
  ['words', '3 từ luyện âm', '3 từ đều chứa âm mục tiêu, cách nhau bằng dấu phẩy. VD: work, word, first'],
  ['l_audio', 'Nghe – đoạn audio', '1–2 câu tiếng Anh; máy sẽ đọc, học viên không thấy chữ.'],
  ['l_q', 'Nghe – câu hỏi', ''], ['l_opts', 'Nghe – lựa chọn', '3 lựa chọn, cách nhau bằng dấu |'], ['l_a', 'Nghe – đáp án', 'Chép nguyên văn lựa chọn đúng.'],
  ['r_text', 'Đọc – đoạn văn', '2–4 câu tiếng Anh.'],
  ['r_q', 'Đọc – câu hỏi', ''], ['r_opts', 'Đọc – lựa chọn', '3 lựa chọn, cách nhau bằng dấu |'], ['r_a', 'Đọc – đáp án', 'Chép nguyên văn lựa chọn đúng.'],
  ['w_type', 'Viết – dạng bài', 'Ghi một trong ba: điền từ / trắc nghiệm / tự viết'],
  ['w_q', 'Viết – đề bài', 'Điền từ: dùng ___ và ghi gợi ý nghĩa trong ngoặc. VD: I ___ (làm việc) at GFT.'],
  ['w_opts', 'Viết – lựa chọn', 'Chỉ cần khi là trắc nghiệm; cách nhau bằng dấu |'], ['w_a', 'Viết – đáp án', 'Một đáp án đúng duy nhất (tự viết: 1 câu mẫu).'],
  ['s_q', 'Nói – yêu cầu', 'VD: Nói to câu sau.'], ['s_a', 'Nói – câu mẫu', 'Câu tiếng Anh học viên phải nói (6–14 từ).']
];
const docKey = s => normName(s).replace(/[^a-z0-9]+/g, ' ').trim();
/** A stored lesson → the field values of the form (used to open an existing lesson for editing). */
function lessonToFields(l) {
  const p = normPractice(l.practice); const v = i => { const x = (l.vocab || [])[i]; return x ? [x.e, x.ipa || '', x.v, (x.phrases || []).join('; ')].join(' | ') : ''; };
  return {title: l.title || '', objective: l.objective || '', theory: l.theory || '', examples: exampleLines(l).join('; '), vocab1: v(0), vocab2: v(1), vocab3: v(2), sound: l.pron?.sound || '', tip: l.pron?.tip || '', words: (l.pron?.words || []).join(', '),
    l_audio: l.listening?.audio || '', l_q: l.listening?.prompt || '', l_opts: (l.listening?.options || []).join(' | '), l_a: l.listening?.answer || '',
    r_text: l.reading?.text || '', r_q: l.reading?.prompt || '', r_opts: (l.reading?.options || []).join(' | '), r_a: l.reading?.answer || '',
    w_type: {fill: 'điền từ', mcq: 'trắc nghiệm', write: 'tự viết'}[p.type] || 'tự viết', w_q: p.prompt, w_opts: p.options.join(' | '), w_a: p.answer, s_q: l.speaking?.prompt || '', s_a: l.speaking?.answer || ''};
}
/** Field values of the form (same keys as DOC_FIELDS) → a lesson + the list of missing / inconsistent items. */
function fieldsToLesson(f, day, week, cefr, existing) {
  const split = s => String(s || '').split('|').map(z => z.trim()).filter(Boolean);
    const problems = []; const need = (k, name) => { if (!f[k]) problems.push('thiếu ' + name); };
    need('title', 'tiêu đề'); need('theory', 'ngữ pháp');
    const cols = s => String(s || '').split('|').map(z => z.trim()); // keep empty columns: "tester |  | người kiểm thử | …" has an empty phonetic column
    const vocab = ['vocab1', 'vocab2', 'vocab3'].map(k => cols(f[k])).filter(p => p[0]).map(p => p.length >= 3 ? {e: p[0], ipa: p[1], v: p[2], phrases: cleanPhrases(p.slice(3).join(';'), p[0])} : {e: p[0], ipa: '', v: p[1] || '', phrases: []});
    if (vocab.length < 3) problems.push(`mới có ${vocab.length}/3 từ vựng`); if (vocab.some(v => !v.v)) problems.push('từ vựng thiếu nghĩa tiếng Việt');
    const noPhr = vocab.filter(v => v.phrases.length < 3).map(v => v.e); if (noPhr.length) problems.push(`chưa đủ 3 cụm từ chứa từ đó cho: ${noPhr.join(', ')}`);
    const mcq = (body, bodyKey, q, opts, a, name) => { if (!f[body] && !f[q] && !f[opts] && !f[a]) { problems.push('thiếu phần ' + name); return null; } const options = split(f[opts]); if (!f[body]) problems.push(name + ': thiếu nội dung'); if (!f[q]) problems.push(name + ': thiếu câu hỏi'); if (options.length < 2) problems.push(name + ': cần ít nhất 2 lựa chọn'); else if (options.length < 4) problems.push(name + ': chuẩn mới là 4 lựa chọn'); if (!options.some(o => normAns(o) === normAns(f[a]))) problems.push(name + ': đáp án phải trùng nguyên văn một lựa chọn'); return {[bodyKey]: f[body] || '', prompt: f[q] || '', options, answer: f[a] || ''}; };
    const listening = mcq('l_audio', 'audio', 'l_q', 'l_opts', 'l_a', 'Nghe'), reading = mcq('r_text', 'text', 'r_q', 'r_opts', 'r_a', 'Đọc');
    const tk = docKey(f.w_type || ''); const type = /dien|fill/.test(tk) ? 'fill' : /trac|mcq|chon/.test(tk) ? 'mcq' : 'write';
    let practice = normPractice({type, prompt: f.w_q, options: split(f.w_opts), answer: f.w_a});
    if (!f.w_q) problems.push('thiếu phần Viết'); else { if (!f.w_a) problems.push('Viết: thiếu đáp án'); if (type === 'fill' && !/_{2,}/.test(f.w_q)) problems.push('Viết (điền từ): đề cần có chỗ trống ___'); if (type === 'mcq' && !practice.options.some(o => normAns(o) === normAns(practice.answer))) problems.push('Viết (trắc nghiệm): đáp án phải trùng một lựa chọn'); }
    practice = ensureFillHint(practice, vocab);
    const speaking = f.s_a ? {prompt: f.s_q || 'Nói to câu sau:', answer: f.s_a} : null; if (!speaking) problems.push('thiếu phần Nói (câu mẫu)');
    let pron = null; if (f.sound || f.words || f.tip) { pron = parsePron({sound: f.sound, tip: f.tip, words: String(f.words || '').split(/[,;|]/).map(z => z.trim()).filter(Boolean)}, {trust: true}); if (!f.sound) problems.push('Phát âm: thiếu âm mục tiêu'); if ((pron?.words || []).length < 3) problems.push('Phát âm: cần đủ 3 từ luyện'); } else problems.push('thiếu phần Phát âm');
    const old = existing.find((z, zi) => (z.day || zi + 1) === day);
    // editing an existing lesson keeps what the form does not show: vocabulary details (pos, word family, synonyms…), the Word class / Word use exercises, and translations of parts whose text did not change
    if (old) { vocab.forEach(v => { const o = (old.vocab || []).find(x => String(x.e || '').toLowerCase() === v.e.toLowerCase()); if (o) Object.keys(o).forEach(k => { if (!(k in v)) v[k] = o[k]; }); }); }
    const op = old ? normPractice(old.practice) : null;
    const same = {L: () => old.listening && listening && old.listening.prompt === listening.prompt && old.listening.answer === listening.answer, R: () => old.reading && reading && old.reading.prompt === reading.prompt && old.reading.answer === reading.answer, W: () => op && op.prompt === practice.prompt && op.answer === practice.answer, S: () => old.speaking && speaking && old.speaking.answer === speaking.answer, C: () => true, U: () => true};
    const trans = old && old.trans ? Object.fromEntries(Object.entries(old.trans).filter(([c]) => same[c] && same[c]())) : undefined;
    return {problems, lesson: {id: old?.id || uid('l'), day, order: day, title: f.title || `Bài ngày ${day}`, objective: f.objective || '', theory: f.theory || '', examples: String(f.examples || '').split(/[;\n]/).map(z => z.trim()).filter(z => z && !isFormula(z)), vocab, pron, listening: listening && listening.audio ? listening : null, reading: reading && reading.text ? reading : null, speaking, practice,
      micro: true, manual: true, durationMin: 10, cefr, week, explanationLang: isLow(cefr) ? 'vi' : 'en', explainLang: isLow(cefr) ? 'tiếng Việt' : 'English', editedBy: me()?.id || null, editedAt: new Date().toISOString(), wordclass: old?.wordclass, worduse: old?.worduse, trans}};
}
/** Add the 3 phrases to every vocabulary word of a set that lacks them: one small AI call for the whole set; other content is untouched. */
actions['ls-enrich'] = async t => {
  const ls = curSet(); if (!ls) return; const todo = ls.lessons.filter(detailsMissing); if (!todo.length) return;
  t.disabled = true; const st = $('#ls-status'); let done = 0, i = 0;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (const l of todo) { i++; if (st) st.innerHTML = `<span class="spinner"></span> Đang bổ sung chi tiết từ vựng & bài tập mới (bài ${i}/${todo.length})…`;
    try { if (await enrichLesson(l, ls.cefr, weekInfo(ls.week).topic)) done++; } catch (e) { if (/429/.test(e.message)) { if (st) st.innerHTML = `<span class="spinner"></span> Hết hạn mức phút – đợi 60 giây rồi làm tiếp (bài ${i}/${todo.length})…`; await wait(60000); try { if (await enrichLesson(l, ls.cefr, weekInfo(ls.week).topic)) done++; } catch (e2) { toast(`Bài ${i}: ${e2.message}`, 'err'); } } else toast(`Bài ${i}: ${e.message}`, 'err'); }
    if (i < todo.length) await wait(1500); }
  const was = ls.status; if (done && was === 'approved') { ls.status = 'draft'; ls.approvedAt = null; } // new content must be read before learners see it
  save(true); toast(done ? `Đã bổ sung cho ${done} bài${was === 'approved' ? ' – bộ bài trở về Bản nháp, đọc lại rồi duyệt' : ''}` : 'Không bổ sung được – thử lại sau', done ? 'ok' : 'err'); render();
};
actions['ls-fill-phrases'] = async t => {
  const ls = curSet(); if (!ls) return; const need = []; ls.lessons.filter(isMicroLesson).forEach(l => phrasesMissing(l).forEach(e => { if (!need.includes(e)) need.push(e); })); if (!need.length) return;
  t.disabled = true; const st = $('#ls-status'); if (st) st.innerHTML = `<span class="spinner"></span> Đang bổ sung cụm từ cho ${need.length} từ vựng…`;
  try {
    const map = await fetchPhrases(need, ls.cefr, weekInfo(ls.week).topic);
    let done = 0; ls.lessons.filter(isMicroLesson).forEach(l => (l.vocab || []).forEach(v => { if ((v.phrases || []).length >= 3) return; const got = cleanPhrases([...(v.phrases || []), ...(map[v.e.toLowerCase()] || [])], v.e); if (got.length > (v.phrases || []).length) { v.phrases = got; done++; } }));
    const was = ls.status; if (done && was === 'approved') { ls.status = 'draft'; ls.approvedAt = null; } // new content must be read before learners see it
    save(true); toast(done ? `Đã bổ sung cụm từ cho ${done} từ${was === 'approved' ? ' – bộ bài trở về Bản nháp, đọc lại rồi duyệt' : ''}` : 'AI không trả về cụm từ dùng được – thử lại sau', done ? 'ok' : 'err'); render();
  } catch (e) { toast(e.message, 'err'); t.disabled = false; if (st) st.textContent = '✗ ' + e.message; }
};
// -- the lesson form (modal): one input per field of DOC_FIELDS; vocabulary and multiple-choice options get their own boxes --
const docHint = k => (DOC_FIELDS.find(d => d[0] === k) || [])[2] || '';
function lessonFormHtml(ls, day, f) {
  const H = (k, label, {ta = false, w = '', ph = ''} = {}) => `<label class="field" style="${w}"><span>${label}</span>${ta ? `<textarea data-f="${k}" style="min-height:58px" placeholder="${esc(ph)}">${esc(f[k] || '')}</textarea>` : `<input data-f="${k}" value="${esc(f[k] || '')}" placeholder="${esc(ph)}">`}${docHint(k) ? `<small class="xs muted" style="display:block;margin-top:2px">${esc(docHint(k))}</small>` : ''}</label>`;
  const sec = (title, inner) => `<div class="card soft" style="margin-top:8px"><b>${title}</b><div style="margin-top:6px">${inner}</div></div>`;
  const vocabRow = i => { const p = String(f['vocab' + i] || '').split('|').map(z => z.trim()); return `<div class="grid cols-4" style="gap:6px;margin-bottom:6px"><input data-f="vocab${i}_w" value="${esc(p[0] || '')}" placeholder="Từ ${i}"><input data-f="vocab${i}_ipa" value="${esc(p[1] || '')}" placeholder="Phiên âm /…/"><input data-f="vocab${i}_v" value="${esc(p[2] || '')}" placeholder="Nghĩa tiếng Việt"><input data-f="vocab${i}_p" value="${esc(p.slice(3).join(' | '))}" placeholder="3 cụm từ, cách nhau bằng ;"></div>`; };
  const mcq = (pre, body, bodyLabel, bodyHint) => { const opts = String(f[pre + '_opts'] || '').split('|').map(z => z.trim()); const ansIdx = Math.max(0, opts.findIndex(o => o && normAns(o) === normAns(f[pre + '_a'])));
    return `${H(body, bodyLabel, {ta: true, ph: bodyHint})}${H(pre + '_q', 'Câu hỏi')}<div class="grid cols-4" style="gap:6px">${[0, 1, 2, 3].map(i => `<input data-f="${pre}_opt${i}" value="${esc(opts[i] || '')}" placeholder="Lựa chọn ${i + 1}">`).join('')}</div><label class="field" style="margin-top:6px"><span>Đáp án đúng</span><select data-f="${pre}_ans" style="width:auto">${[0, 1, 2, 3].map(i => `<option value="${i}" ${i === ansIdx ? 'selected' : ''}>Lựa chọn ${i + 1}</option>`).join('')}</select><small class="xs muted" style="display:block;margin-top:2px">4 lựa chọn, toàn tiếng Anh, chỉ một đáp án đúng.</small></label>`; };
  const wt = {fill: 'fill', mcq: 'mcq', write: 'write'}[/dien|fill/.test(docKey(f.w_type || '')) ? 'fill' : /trac|mcq|chon/.test(docKey(f.w_type || '')) ? 'mcq' : 'write'];
  const wopts = String(f.w_opts || '').split('|').map(z => z.trim());
  return `<div class="row between"><h3>${f.title ? 'Sửa' : 'Soạn'} bài ${DAY_SHORT[day - 1]} · Tuần ${ls.week} · ${ls.cefr}</h3><button class="btn-sm" data-action="modal-close">Đóng</button></div>
    <p class="xs muted" style="margin:2px 0 6px">Mỗi bài cần đủ: 3 từ vựng (mỗi từ 3 cụm), ngữ pháp, phát âm (1 âm + 3 từ) và 4 phần Nghe, Đọc, Viết, Nói. ${isLow(ls.cefr) ? 'Mức A1–A2: giải thích bằng tiếng Việt.' : 'Mức B1 trở lên: toàn bộ bằng tiếng Anh.'}</p>
    <input type="hidden" data-f="day" value="${day}">
    ${sec('Chung', H('title', 'Tiêu đề bài') + H('objective', 'Mục tiêu bài học'))}
    ${sec('Ngữ pháp', H('theory', 'Ngữ pháp', {ta: true}) + H('examples', 'Câu ví dụ để đọc thành tiếng', {ta: true, ph: 'I work as a tester.; She works in the sales team.'}))}
    ${sec('Từ vựng (3 từ)', vocabRow(1) + vocabRow(2) + vocabRow(3) + `<small class="xs muted">${esc(docHint('vocab1'))}</small>`)}
    ${sec('Phát âm', `<div class="grid cols-3" style="gap:6px">${H('sound', 'Âm mục tiêu')}${H('words', '3 từ luyện âm')}${H('tip', 'Mẹo phát âm')}</div>`)}
    ${sec('Nghe', mcq('l', 'l_audio', 'Đoạn audio (máy đọc, học viên không thấy chữ)', '1–2 câu tiếng Anh'))}
    ${sec('Đọc', mcq('r', 'r_text', 'Đoạn văn', '2–4 câu tiếng Anh'))}
    ${sec('Viết', `<label class="field"><span>Dạng bài</span><select data-f="w_type" style="width:auto"><option value="điền từ" ${wt === 'fill' ? 'selected' : ''}>Điền từ</option><option value="trắc nghiệm" ${wt === 'mcq' ? 'selected' : ''}>Trắc nghiệm</option><option value="tự viết" ${wt === 'write' ? 'selected' : ''}>Tự viết</option></select></label>${H('w_q', 'Đề bài', {ta: true})}<div class="grid cols-4" style="gap:6px">${[0, 1, 2, 3].map(i => `<input data-f="w_opt${i}" value="${esc(wopts[i] || '')}" placeholder="Lựa chọn ${i + 1} (chỉ khi trắc nghiệm)">`).join('')}</div>${H('w_a', 'Đáp án')}`)}
    ${sec('Nói', H('s_q', 'Yêu cầu', {ph: 'Nói to câu sau.'}) + H('s_a', 'Câu mẫu học viên phải nói'))}
    <div id="lsf-problems"></div>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button data-action="modal-close">Huỷ</button><button class="btn-primary" data-action="ls-form-save">Kiểm tra &amp; lưu</button></div>`;
}
/** Inputs of the open form → field values with the same keys DOC_FIELDS uses. */
function readLessonForm() {
  const f = {}; $$('#modal [data-f]').forEach(el => { f[el.dataset.f] = String(el.value || '').trim(); });
  [1, 2, 3].forEach(i => { f['vocab' + i] = f[`vocab${i}_w`] ? [f[`vocab${i}_w`], f[`vocab${i}_ipa`], f[`vocab${i}_v`], f[`vocab${i}_p`]].join(' | ') : ''; });
  ['l', 'r'].forEach(p => { const opts = [0, 1, 2, 3].map(i => f[`${p}_opt${i}`]).filter(Boolean); f[p + '_opts'] = opts.join(' | '); f[p + '_a'] = f[`${p}_opt${+f[p + '_ans'] || 0}`] || ''; });
  f.w_opts = [0, 1, 2, 3].map(i => f['w_opt' + i]).filter(Boolean).join(' | ');
  return f;
}
actions['ls-form'] = t => { const ls = curSet(); if (!ls) return; const day = +t.dataset.day; const l = ls.lessons.find((z, zi) => (z.day || zi + 1) === day); openModal(lessonFormHtml(ls, day, l && isMicroLesson(l) ? lessonToFields(l) : {}), {wide: true}); $('#modal input[data-f="title"]')?.focus(); };
actions['ls-form-save'] = t => {
  const ls = curSet(); if (!ls) return; const f = readLessonForm(); const day = +f.day;
  const {problems, lesson} = fieldsToLesson(f, day, ls.week, ls.cefr, ls.lessons);
  const box = $('#lsf-problems');
  if (problems.length && t.dataset.force !== '1') { // first click: show what is missing; the operator may still save and finish later
    box.innerHTML = `<div class="banner warn" style="margin-top:10px"><span>⚠️</span><div class="body small"><b>${problems.length} mục cần bổ sung:</b><ul style="margin:4px 0 0;padding-left:18px">${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul><p style="margin:6px 0 0">Bạn có thể sửa tiếp, hoặc lưu tạm: bài sẽ bị gắn nhãn "chưa đủ 4 kỹ năng" cho đến khi bổ sung.</p></div></div>`;
    t.textContent = 'Lưu dù còn thiếu'; t.dataset.force = '1'; t.classList.remove('btn-primary'); box.scrollIntoView({block: 'nearest'}); return;
  }
  ls.lessons.forEach((z, zi) => { if (!z.day) z.day = zi + 1; }); // old-format lessons have no day: fix their position before replacing by day
  ls.lessons = ls.lessons.filter(z => z.day !== day); ls.lessons.push(lesson); ls.lessons.sort((a, b) => (a.day || 99) - (b.day || 99));
  const was = ls.status; ls.status = 'draft'; ls.approvedAt = null; ls.generatedBy = ls.generatedBy || me().id; ls.generatedAt = ls.generatedAt || new Date().toISOString(); ls.editedAt = new Date().toISOString();
  save(true); closeModal(); toast(`Đã lưu bài ${DAY_SHORT[day - 1]}${problems.length ? ` (còn ${problems.length} mục thiếu)` : ''}${was === 'approved' ? ' – bộ bài trở về Bản nháp, cần duyệt lại' : ''}`, problems.length ? '' : 'ok'); render();
};
// ---- review (submissions, coach samples, tests) ----
route('#/op/review', () => {
  const u = me(); if (!isStaff(u)) { go('#/'); return; }
  const tab = S.session.reviewTab || 'subs';
  const subs = S.submissions.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const turns = []; S.coachSessions.forEach(cs => cs.turns.forEach(t => turns.push({...t, userId: cs.userId, week: cs.week, sessionId: cs.id}))); turns.sort((a, b) => b.at.localeCompare(a.at));
  const rubricChips = r => r ? `<span class="chips"><span class="chip">Ý: ${r.meaning}/5</span><span class="chip">Từ: ${r.vocab}/5</span><span class="chip">NP: ${r.grammar}/5</span></span>` : '';
  let body = '';
  if (tab === 'subs') body = subs.length ? subs.map(s => { const x = userById(s.userId); return `<div class="card"><div class="row between"><div><b>${esc(x?.name)}</b> ${lvlChip(x?.cefr)} <span class="xs muted">Tuần ${s.week} · ${s.type === 'dialogue' ? 'Hội thoại' : 'Viết'} · ${fmtDateTime(s.submittedAt)}</span></div>
      <label class="check small"><input type="checkbox" data-change="rv-check" data-id="${s.id}" ${s.operatorChecked ? 'checked' : ''}> Đã đọc mẫu</label></div>
      <p class="small muted" style="margin:6px 0 2px">Đề: ${esc(s.task)}</p><div class="card soft small" style="white-space:pre-wrap">${esc(s.text)}</div>
      ${s.total != null ? `<div class="row" style="margin-top:8px"><b>${s.total}/100</b>${rubricChips(s.rubric)}${s.aiGraded ? '' : '<span class="badge">chấm tay</span>'}</div><p class="small" style="margin-top:6px">${nl2br(s.feedback || '')}</p>${(s.suggestions || []).length ? `<ul class="sugg">${s.suggestions.map(g => `<li><s class="muted">${esc(g.original)}</s> → <b>${esc(g.corrected)}</b> <span class="muted">– ${esc(g.explanation)}</span></li>`).join('')}</ul>` : ''}` : `<div class="row" style="margin-top:8px"><span class="badge warn">Chưa chấm</span>${ai.hasKey() ? `<button class="btn-sm" data-action="rv-grade-ai" data-id="${s.id}">Chấm bằng AI</button>` : ''}<button class="btn-sm" data-action="rv-grade-manual" data-id="${s.id}">Chấm tay</button></div>`}
    </div>`; }).join('') : '<div class="empty">Chưa có bài nộp.</div>';
  else if (tab === 'coach') body = turns.length ? `<div class="card"><p class="small muted">Đọc mẫu phản hồi của AI coach để kiểm tra chất lượng (lệch mức, sửa sai, khen quá tay). Sửa prompt nếu cần.</p>${turns.slice(0, 40).map(t => { const x = userById(t.userId); return `<div class="item" style="align-items:flex-start"><div class="body small"><div class="row between"><span><b>${esc(x?.name)}</b> ${lvlChip(x?.cefr)} <span class="xs muted">Tuần ${t.week} · ${fmtDateTime(t.at)}</span></span><label class="check xs"><input type="checkbox" data-change="rv-turn-check" data-sid="${t.sessionId}" data-at="${t.at}" ${t.checked ? 'checked' : ''}> Đã kiểm</label></div>
      <div style="margin-top:4px"><span class="muted">Học viên:</span> ${esc(t.userText)}</div><div><span class="muted">Coach:</span> ${esc(t.reply)}</div><div style="margin-top:4px">${rubricChips(t.rubric)}</div>${(t.suggestions || []).length ? `<ul class="sugg">${t.suggestions.map(g => `<li><s class="muted">${esc(g.original)}</s> → <b>${esc(g.corrected)}</b> <span class="muted">– ${esc(g.explanation)}</span></li>`).join('')}</ul>` : ''}</div></div>`; }).join('')}</div>` : '<div class="empty">Chưa có lượt luyện nào.</div>';
  else if (tab === 'micro') { const ms = (S.microLessons || []).slice().sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).slice(0, 60);
    body = ms.length ? `<div class="card"><p class="small muted">Bài siêu ngắn do học viên tự tạo (1 prompt ngắn, theo nghề + phong cách học). Kiểm tra mẫu xem có lệch mức hay sai nghĩa không; xoá bài kém.</p><div class="list">${ms.map(m => { const x = userById(m.userId); return `<div class="item" style="align-items:flex-start"><div class="body small"><div class="row between"><span><b>${esc(x?.name || '—')}</b> ${lvlChip(m.cefr)} <span class="xs muted">${fmtDate(m.date)} · ${esc(m.topic || '')}${m.completedAt ? ' · đã học' : ''}</span></span><button class="btn-sm btn-danger" data-action="micro-del" data-id="${m.id}">Xoá</button></div><div style="margin-top:4px"><b>Lý thuyết:</b> ${esc(m.theory)}</div><div><b>Từ:</b> ${(m.vocab || []).map(v => `${esc(v.e)} = ${esc(v.v)}`).join(' · ')}</div><div><b>Thực hành (${normPractice(m.practice).type}):</b> ${esc(practiceText(m.practice))}${normPractice(m.practice).answer ? ` <span class="muted">→ ${esc(normPractice(m.practice).answer)}</span>` : ''}</div>${m.answer ? `<div><b>Bài làm:</b> ${esc(m.answer)}${m.grade ? ` <span class="badge ${m.grade.ok ? 'ok' : 'warn'}">${m.grade.score}/10</span>` : ''}</div>` : ''}<div class="xs muted">${esc(m.job)} · ${esc(m.style)}</div></div></div>`; }).join('')}</div></div>` : '<div class="empty">Chưa có bài siêu ngắn nào.</div>'; }
  else if (tab === 'appeals') {
    const list = appeals().slice().sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.at.localeCompare(a.at)).slice(0, 60);
    body = list.length ? list.map(a => `<div class="card" style="${a.status === 'pending' ? 'background:var(--butter)' : ''}"><div class="row between"><div><b>${esc(a.userName || userById(a.userId)?.name || '—')}</b> ${lvlChip(userById(a.userId)?.cefr)} <span class="xs muted">${esc(a.title)} · ${esc(a.part)} · ${fmtDateTime(a.at)}${a.kind === 'part' ? ` · đã làm ${a.attempts} lần` : ''}</span></div><span class="badge ${APPEAL_STATUS[a.status][0]}">${APPEAL_STATUS[a.status][1]}</span></div>
      <div class="small" style="margin-top:6px"><b>Đề:</b> ${esc(a.question)}${a.options?.length ? ` <span class="muted">(${a.options.map(esc).join(' / ')})</span>` : ''}</div>
      <div class="card soft small" style="white-space:pre-wrap;margin-top:6px"><b>Bài làm của học viên:</b> ${esc(a.answer)}</div>
      <div class="small" style="margin-top:6px">${a.key ? `<b>Đáp án tham khảo:</b> ${esc(a.key)} · ` : ''}<b>AI nhận xét:</b> ${esc(a.aiFeedback || '(chấm theo đáp án, không có nhận xét)')}</div>
      <div class="small" style="margin-top:6px"><b>Lý do học viên báo cáo:</b> ${esc(a.reason)}</div>
      ${a.status === 'pending' ? `<div class="row" style="margin-top:10px"><button class="btn-primary btn-sm" data-action="appeal-decide" data-id="${a.id}" data-ok="1">${a.kind === 'sub' ? 'Chấp nhận – chấm lại điểm' : 'Chấp nhận – tính là đúng'}</button><button class="btn-sm" data-action="appeal-decide" data-id="${a.id}" data-ok="0">Giữ nguyên kết quả</button></div>` : `<div class="xs muted" style="margin-top:6px">${esc(a.decidedByName || '')} xử lý ${fmtDateTime(a.decidedAt)}${a.note ? ` · ${esc(a.note)}` : ''}</div>`}</div>`).join('') : '<div class="empty">Chưa có kháng nghị nào. Học viên bấm "Báo cáo: AI chấm sai" ở bài tập hoặc bài tuần thì yêu cầu hiện ở đây.</div>';
  }
  else if (tab === 'attempts') {
    // attempts per exercise part: n = right on attempt n, ✗ = used all attempts without getting it right
    const rows = []; const pr = S.practiceResults || {};
    learners().forEach(x => S.lessonSets.filter(ls => ls.cefr === x.cefr).forEach(ls => ls.lessons.filter(isMicroLesson).forEach(l => {
      const cells = ['L', 'R', 'W', 'S'].map(c => { const has = lessonParts(l).some(p => p.code === c); const st = resState(pr[x.id + '_' + partKey(l.id, c)]); return {has, ...st}; });
      if (cells.some(c => c.attempts)) rows.push({x, ls, l, cells, total: sum(cells.map(c => c.attempts)), failed: cells.filter(c => c.done && !c.ok).length});
    })));
    rows.sort((a, b) => b.failed - a.failed || b.total - a.total);
    const cell = c => !c.has ? '<span class="muted">·</span>' : !c.attempts ? '<span class="muted">chưa làm</span>' : `<span class="badge ${c.ok ? (c.attempts === 1 ? 'ok' : 'warn') : c.done ? 'danger' : ''}">${c.ok ? '✓' : c.done ? '✗' : '…'} ${c.attempts}/${MAX_ATTEMPTS}</span>`;
    body = rows.length ? `<div class="card"><p class="small muted">Số lần làm từng phần của mỗi bài (tối đa ${MAX_ATTEMPTS}). ✓ = làm đúng ở lần đó · ✗ = hết lượt vẫn sai, đã hiện đáp án · … = đang làm dở. Sắp theo số phần hết lượt, rồi tổng số lần.</p>
      <div class="table-wrap"><table><thead><tr><th>Người học</th><th>Bài</th><th>Nghe</th><th>Đọc</th><th>Viết</th><th>Nói</th><th>Tổng lần</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.x.name)}</b> ${lvlChip(r.x.cefr)}</td><td class="small">Tuần ${r.ls.week} · ${DAY_SHORT[(r.l.day || 1) - 1] || ''} · ${esc(r.l.title)}</td>${r.cells.map(c => `<td>${cell(c)}</td>`).join('')}<td><b>${r.total}</b></td></tr>`).join('')}</tbody></table></div></div>` : '<div class="empty">Chưa có học viên nào làm bài thực hành.</div>';
  }
  else body = S.tests.length ? `<div class="card"><div class="table-wrap"><table><thead><tr><th>Người học</th><th>Loại</th><th>Nộp</th><th>Tổng</th><th>Mức thô</th><th>AI</th><th></th></tr></thead><tbody>${S.tests.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map(t => `<tr><td>${esc(userById(t.userId)?.name)}</td><td>${t.kind === 'placement' ? 'Đầu vào' : 'Cuối kỳ'}</td><td>${fmtDateTime(t.submittedAt)}</td><td>${t.total}</td><td>${t.rawLevel}</td><td>${t.aiSuggestedCefr || '—'}</td><td><button class="btn-sm" data-action="op-view-test" data-id="${t.id}">Xem</button></td></tr>`).join('')}</tbody></table></div></div>` : '<div class="empty">Chưa có bài test.</div>';
  shell(`<div class="page-title"><div><h1>Đọc mẫu & kiểm tra AI</h1><p class="muted">Kiểm tra bài nộp thứ Sáu, phản hồi của AI coach và các bài test.</p></div></div>
    <div class="tabs"><button class="${tab === 'subs' ? 'active' : ''}" data-action="rv-tab" data-tab="subs">Bài nộp (${subs.filter(s => !s.operatorChecked).length} chưa đọc)</button><button class="${tab === 'coach' ? 'active' : ''}" data-action="rv-tab" data-tab="coach">Phản hồi coach (${turns.filter(t => !t.checked).length})</button><button class="${tab === 'micro' ? 'active' : ''}" data-action="rv-tab" data-tab="micro">Bài siêu ngắn (${(S.microLessons || []).length})</button><button class="${tab === 'appeals' ? 'active' : ''}" data-action="rv-tab" data-tab="appeals">Kháng nghị (${appeals().filter(a => a.status === 'pending').length})</button><button class="${tab === 'attempts' ? 'active' : ''}" data-action="rv-tab" data-tab="attempts">Số lần làm bài</button><button class="${tab === 'tests' ? 'active' : ''}" data-action="rv-tab" data-tab="tests">Bài test (${S.tests.length})</button></div>${body}`, {title: 'Đọc mẫu'});
});
actions['go-appeals'] = () => { S.session.reviewTab = 'appeals'; save(); go('#/op/review'); };
actions['rv-tab'] = t => { S.session.reviewTab = t.dataset.tab; save(); render(); };
actions['micro-del'] = async t => { if (await confirmDlg('Xoá bài siêu ngắn này?', {danger: true, okLabel: 'Xoá'})) { S.microLessons = S.microLessons.filter(m => m.id !== t.dataset.id); save(true); render(); } };
actions['rv-check'] = t => { const s = S.submissions.find(x => x.id === t.dataset.id); s.operatorChecked = t.checked; s.checkedBy = me().id; save(true); };
actions['rv-turn-check'] = t => { const cs = S.coachSessions.find(x => x.id === t.dataset.sid); const turn = cs?.turns.find(x => x.at === t.dataset.at); if (turn) { turn.checked = t.checked; turn.checkedBy = me().id; save(true); } };
actions['rv-grade-ai'] = async t => { const s = S.submissions.find(x => x.id === t.dataset.id); t.disabled = true; t.innerHTML = '<span class="spinner"></span>'; try { await gradeSubmissionAI(s); render(); } catch (e) { toast(e.message, 'err'); render(); } };
async function gradeSubmissionAI(s) { const x = userById(s.userId); const r = await ai.gradeSubmission(s, x); s.rubric = r.rubric; s.total = clamp(r.total, 0, 100); s.feedback = r.feedback; s.suggestions = (r.suggestions || []).slice(0, 3); s.correctedText = r.correctedText; s.aiGraded = true; s.gradedAt = new Date().toISOString(); save(true); }
actions['rv-grade-manual'] = t => { const s = S.submissions.find(x => x.id === t.dataset.id); openModal(`<h3>Chấm tay</h3><p class="small muted">Rubric 0–5: Đúng ý / Từ vựng / Ngữ pháp. Tổng = 40/30/30.</p><div class="grid cols-3"><label class="field"><span>Đúng ý</span><input id="g-m" type="number" min="0" max="5" value="${s.rubric?.meaning ?? 3}"></label><label class="field"><span>Từ vựng</span><input id="g-v" type="number" min="0" max="5" value="${s.rubric?.vocab ?? 3}"></label><label class="field"><span>Ngữ pháp</span><input id="g-g" type="number" min="0" max="5" value="${s.rubric?.grammar ?? 3}"></label></div><label class="field"><span>Nhận xét</span><textarea id="g-f">${esc(s.feedback || '')}</textarea></label><div class="row" style="justify-content:flex-end"><button data-action="modal-close">Huỷ</button><button class="btn-primary" data-action="rv-grade-manual-save" data-id="${s.id}">Lưu</button></div>`); };
actions['rv-grade-manual-save'] = t => { const s = S.submissions.find(x => x.id === t.dataset.id); const m = clamp(+$('#g-m').value, 0, 5), v = clamp(+$('#g-v').value, 0, 5), g = clamp(+$('#g-g').value, 0, 5); s.rubric = {meaning: m, vocab: v, grammar: g}; s.total = Math.round((m * 0.4 + v * 0.3 + g * 0.3) * 20); s.feedback = $('#g-f').value.trim(); s.suggestions = s.suggestions || []; s.aiGraded = false; s.operatorChecked = true; s.gradedAt = new Date().toISOString(); save(true); closeModal(); render(); };

// ---- prompts editor ----
route('#/op/prompts', () => {
  const u = me(); if (!isStaff(u)) { go('#/'); return; }
  const keys = [['base', 'Quy tắc chung (mọi lời gọi trừ sinh bài siêu ngắn)'], ['placement', 'Chấm test & xếp trình độ'], ['lesson', 'Sinh 5 bài siêu ngắn cho tuần (giữ nguyên các biến {n} {cefr_level} {topic} {job} {learning_style} {explain_lang} và key JSON lessons[].day/title/objective/theory/vocab/pron/listening/reading/speaking/practice)'], ['weeks', 'Gợi ý khung chủ đề tuần (giữ các biến {n} {learners} {levels} {used} và key weeks[].week/options[].topic/description/objectives/keyVocabHint/levels[].cefr/days[5])'], ['mgrade', 'Chấm bài thực hành siêu ngắn (giữ các biến {cefr_level} {explain_lang} {theory} {vocab} {practice} {answer} và key score/ok/feedback/fix)'], ['coach', 'AI coach hội thoại'], ['grade', 'Chấm bài thực hành thứ Sáu']];
  shell(`<div class="page-title"><div><a href="#/settings" class="small">← Cài đặt</a><h1>Prompt & rubric</h1><p class="muted">Đây là hướng dẫn hệ thống gửi cho AI. Sửa khi thấy AI lệch mức, sửa sai hoặc khen quá tay. Để trống ô = dùng mặc định.</p></div></div>
    ${keys.map(([k, lbl]) => `<div class="card"><div class="row between"><h3>${lbl}</h3><button class="btn-sm" data-action="pr-reset" data-key="${k}">Về mặc định</button></div><textarea id="pr-${k}" style="min-height:140px;font-size:.85rem">${esc(S.settings.prompts[k] || PROMPTS[k])}</textarea></div>`).join('')}
    <button class="btn-primary" data-action="pr-save">Lưu prompt</button>`, {title: 'Prompt'});
});
actions['pr-save'] = () => { ['base', 'placement', 'lesson', 'weeks', 'mgrade', 'coach', 'grade'].forEach(k => { const v = $('#pr-' + k).value.trim(); if (v && v !== PROMPTS[k]) S.settings.prompts[k] = v; else delete S.settings.prompts[k]; }); PROMPTS.base = S.settings.prompts.base || PROMPTS_DEFAULT_BASE; save(true); toast('Đã lưu prompt', 'ok'); };
actions['pr-reset'] = t => { $('#pr-' + t.dataset.key).value = t.dataset.key === 'base' ? PROMPTS_DEFAULT_BASE : PROMPTS[t.dataset.key]; };
const PROMPTS_DEFAULT_BASE = PROMPTS.base; if (S.settings.prompts.base) PROMPTS.base = S.settings.prompts.base;

// =====================================================================
// Learner screens
// =====================================================================
const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const DOW_FULL = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const dowIndex = ds => (new Date(ds + 'T00:00:00').getDay() + 6) % 7;
function weekDots(uid, week=currentWeek()) {
  const start = weekStart(week); const today = todayStr(); const act = activeDays(uid, start, addDays(start, 6));
  return `<div class="days" style="grid-template-columns:repeat(5,1fr)">${DOW.slice(0, 5).map((d, i) => { /* fixed schedule: Monday → Friday */ const ds = addDays(start, i); const on = act.has(ds); const isToday = ds === today; const past = ds < today;
    return `<div class="day ${isToday ? 'cur' : ''}"><span>${d}</span><i class="${on ? 'on' : isToday ? 'today' : past ? 'miss' : ''}">${on ? ICONS.check : isToday && !on ? '<span style="width:10px;height:10px;border-radius:50%;background:var(--ink);display:block"></span>' : ''}</i></div>`; }).join('')}</div>`;
}
/** Consecutive active days ending today (or yesterday when today has no activity yet). */
// Streaks count STUDY days (Mon–Fri, the fixed schedule): Saturday and Sunday neither add to a streak nor break it, so Fri → Mon continues the run.
const isStudyDay = ds => dowIndex(ds) < 5;
const prevStudyDay = ds => { let d = addDays(ds, -1); while (!isStudyDay(d)) d = addDays(d, -1); return d; };
function streakDays(uid) { const t = todayStr(); const act = activeDays(uid, addDays(t, -120), t); let d = isStudyDay(t) && act.has(t) ? t : prevStudyDay(t), n = 0; while (act.has(d)) { n++; d = prevStudyDay(d); } return n; }
// ---- reward system: points and badges are derived from learning data, nothing extra is stored except which badges were already announced ----
const BADGES = [
  ['first', '🐣', 'Khởi động', 'Hoàn thành bài học đầu tiên', s => s.lessons >= 1],
  ['week', '📅', 'Tuần trọn vẹn', 'Xong tất cả bài của một tuần', s => s.fullWeeks >= 1],
  ['streak3', '🔥', 'Chuỗi 3 ngày', 'Học 3 ngày học liên tiếp (T2–T6)', s => s.bestStreak >= 3],
  ['streak7', '🌟', 'Chuỗi 5 ngày', 'Học 5 ngày học liên tiếp (T2–T6), không tính cuối tuần', s => s.bestStreak >= 5], // id kept from the old 7-day badge so stored data stays valid
  ['sharp', '🎯', 'Chuẩn ngay lần đầu', 'Làm đúng cả 4 kỹ năng Nghe, Đọc, Viết, Nói của một bài ngay ở lần làm đầu tiên', s => s.perfectLessons >= 1],
  ['words', '🔑', 'Thợ mở khoá', 'Mở 10 ô từ bí mật khi chat với Season', s => s.words >= 10],
  ['chat', '💬', 'Bạn của Season', '10 lượt luyện với Season', s => s.turns >= 10],
  ['friday', '✍️', 'Đúng hẹn thứ Sáu', 'Nộp bài thực hành tuần', s => s.subs >= 1]
];
const REWARD_RULES = [['Hoàn thành 1 bài học', '+10'], ['Mỗi phần Nghe/Đọc/Viết/Nói làm đúng', '+5 nếu đúng lần 1, giảm 1 điểm mỗi lần làm lại'], ['1 lượt luyện với Season', '+2'], ['Mở 1 ô từ bí mật', '+2'], ['Nộp bài tuần (thứ Sáu)', '+15'], ['Xong trọn bài của một tuần', '+20']];
// Season levels (the learner's year: spring → summer → autumn → winter). Points and badges are two separate tracks: to move up a level the learner needs BOTH the points of that level AND every badge assigned to it.
const GOOSE_LEVELS = [
  {name: 'Mùa xuân – gieo hạt', short: 'Mùa xuân', icon: '🌱', min: 0, badges: [], color: 'var(--mint)', size: 64},
  {name: 'Mùa hạ – đón nắng', short: 'Mùa hạ', icon: '☀️', min: 60, badges: ['first', 'streak3'], color: 'var(--primary)', size: 76},
  {name: 'Mùa thu – gặt hái', short: 'Mùa thu', icon: '🍂', min: 180, badges: ['week', 'friday', 'chat'], color: 'var(--peach)', size: 88},
  {name: 'Mùa đông – vững vàng', short: 'Mùa đông', icon: '❄️', min: 360, badges: ['streak7', 'sharp', 'words'], color: 'var(--lav)', size: 100}
];
const REWARD_LEVELS = GOOSE_LEVELS.map(l => [l.min, l.name]);
/** Level reached with these points and earned badge ids. Levels are climbed in order; a level is reached only with its points AND all of its badges. */
function gooseLevel(points, earnedIds) {
  const has = new Set(earnedIds); let i = 0;
  while (i + 1 < GOOSE_LEVELS.length && points >= GOOSE_LEVELS[i + 1].min && GOOSE_LEVELS[i + 1].badges.every(b => has.has(b))) i++;
  const nx = GOOSE_LEVELS[i + 1];
  return {index: i, ...GOOSE_LEVELS[i], next: nx ? {index: i + 1, name: nx.name, icon: nx.icon, min: nx.min, badges: nx.badges, needPoints: Math.max(0, nx.min - points), missing: nx.badges.filter(b => !has.has(b))} : null};
}
function rewards(u) {
  const lessons = S.progress.filter(p => p.userId === u.id && p.completedAt).length;
  let partPts = 0, firstTry = 0;
  Object.entries(S.practiceResults || {}).forEach(([k, r]) => { if (!k.startsWith(u.id + '_')) return; const st = resState(r); if (st.ok) { partPts += Math.max(1, 6 - st.attempts); if (st.attempts === 1) firstTry++; } });
  const sessions = practiceSessions(u); const turns = sessions.reduce((n, c) => n + goodTurns(c).length, 0);
  const words = sessions.reduce((n, c) => { const seen = new Set(); approvedLessons(Math.abs(c.week), cefrAt(u, Math.abs(c.week))).flatMap(l => l.vocab || []).forEach(v => { const e = (v.e || v.word || '').trim(); if (e && relevantUserTexts(c).some(txt => usesWord(txt, e))) seen.add(e.toLowerCase()); }); return n + seen.size; }, 0);
  const subs = S.submissions.filter(s => s.userId === u.id).length;
  const fullWeeks = Array.from({length: S.settings.pilotWeeks}, (_, i) => i + 1).filter(w => { const ls = approvedLessons(w, cefrAt(u, w)); return ls.length >= LESSONS_PER_WEEK && ls.every(l => userProgress(u.id, l.id)?.completedAt); }).length; // a full week = all 5 daily lessons; a shorter (old or hand-made) set never counts
  const days = [...new Set(S.activity.filter(a => a.userId === u.id).map(a => a.date))].filter(isStudyDay).sort(); let bestStreak = 0, run = 0;
  days.forEach((d, i) => { run = i && prevStudyDay(d) === days[i - 1] ? run + 1 : 1; bestStreak = Math.max(bestStreak, run); });
  // "right first time": one lesson whose four skills (Listening, Reading, Writing, Speaking) were ALL correct on attempt 1; a result corrected by an appeal does not count
  const pr = S.practiceResults || {}; const firstGo = key => { const r = pr[u.id + '_' + key]; const st = resState(r); return st.ok === true && st.attempts === 1 && !(r && r.manual); };
  const perfectLessons = S.lessonSets.flatMap(ls => ls.lessons).filter(l => isMicroLesson(l) && ['L', 'R', 'W', 'S'].every(c => lessonParts(l).some(p => p.code === c) && firstGo(partKey(l.id, c)))).length;
  const stats = {lessons, firstTry, perfectLessons, turns, words, subs, fullWeeks, bestStreak};
  const points = lessons * 10 + partPts + turns * 2 + words * 2 + subs * 15 + fullWeeks * 20;
  return rewardState(points, BADGES.filter(b => b[4](stats)).map(b => b[0]), stats);
}
/** Reward state from points + earned badge ids. Used for real learners and for the manager's simulator, so both show exactly the same UI. */
function rewardState(points, earnedIds, stats = {}) {
  const lv = gooseLevel(points, earnedIds);
  return {points, stats, lv, level: lv.name, badges: BADGES.map(([id, icon, name, desc]) => ({id, icon, name, desc, earned: earnedIds.includes(id), tier: GOOSE_LEVELS.findIndex(l => l.badges.includes(id))}))};
}
/** Toast badges earned since the last look (called on the learner's home). */
function announceBadges(u) {
  const r = rewards(u); const seen = (u.badgesSeen || []).filter(id => r.badges.some(b => b.id === id && b.earned)); // forget badges that were announced by mistake
  if (seen.length !== (u.badgesSeen || []).length) { u.badgesSeen = seen; save(); }
  const fresh = r.badges.filter(b => b.earned && !seen.includes(b.id));
  if (fresh.length) { u.badgesSeen = [...seen, ...fresh.map(b => b.id)]; save(); fresh.forEach(b => toast(`${b.icon} Huy hiệu mới: ${b.name}`, 'ok')); beep(2); buzz(); }
  // level-up: shown once per level, only when points AND that level's badges are both there
  if (r.lv.index > (u.levelSeen || 0)) { u.levelSeen = r.lv.index; save(true); if (r.lv.index < GOOSE_LEVELS.length - 1) levelUpModal(r.lv.index, u.name); }
  else if (r.lv.index < (u.levelSeen || 0)) { u.levelSeen = r.lv.index; save(); }
  if (r.lv.index === GOOSE_LEVELS.length - 1 && !u.allBadgesAt) { u.allBadgesAt = new Date().toISOString(); save(true); go('#/reward/done'); } // the top-level screen shows once, for real
}
const gooseFigure = (i, big = false) => { const L = GOOSE_LEVELS[i]; const s = big ? L.size + 40 : L.size; return `<span style="position:relative;display:inline-grid;place-items:center;width:${s + 28}px;height:${s + 28}px;border-radius:50%;background:${L.color}"><span style="font-size:${Math.round(s * .55)}px;line-height:1">${L.icon}</span></span>`; };
function levelUpModal(i, name, sim = false) {
  const L = GOOSE_LEVELS[i];
  openModal(`<div style="text-align:center">${sim ? '<span class="ribbon">Giả lập</span><br>' : ''}<div style="margin:10px 0">${gooseFigure(i, true)}</div><div class="eyebrow">Lên cấp ${i + 1}/${GOOSE_LEVELS.length}</div><h2 style="margin:4px 0">${esc(String(name).split(' ').pop())} đã thành ${L.name}!</h2>
    <p class="small" style="font-weight:700">Bạn đã đủ <b>${L.min} điểm</b> và đủ huy hiệu của cấp này: ${L.badges.map(id => { const b = BADGES.find(x => x[0] === id); return `${b[1]} ${b[2]}`; }).join(' · ')}.</p>
    ${GOOSE_LEVELS[i + 1] ? `<p class="small muted">Cấp tiếp theo: <b>${GOOSE_LEVELS[i + 1].name}</b> – cần ${GOOSE_LEVELS[i + 1].min} điểm và ${GOOSE_LEVELS[i + 1].badges.length} huy hiệu mới.</p>` : ''}
    <button class="btn-primary btn-lg" data-action="modal-close">Tiếp tục</button></div>`);
  beep(2); buzz(); fireworks();
}
/** Celebration screen for a complete badge collection. mode 'preview' = mock-up with every badge lit, to review the reward UI before anyone earns it. */
route('#/reward/:mode', mode => {
  const u = me(); const preview = mode !== 'done'; const r = u.role === 'learner' ? rewards(u) : null;
  if (!preview && !(r && r.lv.index === GOOSE_LEVELS.length - 1)) { go('#/'); return; }
  // a sober, printable certificate: no confetti, no mascot – an A4 document with a frame, the facts, the badge criteria and two signature lines
  const name = u.role === 'learner' ? u.name : 'Nguyễn Văn A'; const points = preview ? Math.max(r?.points || 0, REWARD_LEVELS[REWARD_LEVELS.length - 1][0] + 60) : r.points;
  const back = u.role === 'learner' ? '#/profile' : '#/mgr/rewards';
  const dateStr0 = preview ? todayStr() : (u.allBadgesAt || todayStr()).slice(0, 10); const d = new Date(dateStr0 + 'T00:00:00');
  const longDate = `ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
  const certNo = `SE-${d.getFullYear()}-${String((u.id || 'x').replace(/\W/g, '')).slice(-6).toUpperCase()}`;
  const level = GOOSE_LEVELS[GOOSE_LEVELS.length - 1]; const cefr = u.cefr ? LEVEL_NAMES[u.cefr] || u.cefr : '—';
  const operators = S.users.filter(x => x.role === 'operator'); const managers = S.users.filter(x => x.role === 'manager');
  shell(`<div class="rw">${preview ? `<div class="banner info no-print" style="margin-bottom:12px"><div class="body small"><b>Bản xem trước.</b> Đây là chứng nhận học viên nhận được khi đạt đủ ${BADGES.length}/${BADGES.length} huy hiệu; số điểm dưới đây là giả lập, không ghi vào dữ liệu.${r ? ` Hiện bạn có ${r.badges.filter(b => b.earned).length}/${BADGES.length} huy hiệu.` : ''}</div></div>` : ''}
    <div class="cert-doc">
      <div class="cert-head"><div class="row" style="gap:14px;align-items:center"><img class="cert-logo" src="design/gft-logo.png" alt="${esc(S.settings.orgName)}"><div><div class="cert-org">Season English</div><div class="xs muted">${esc(S.settings.orgName)} · Chương trình tiếng Anh nội bộ</div></div></div><div class="cert-no xs muted">Số: ${certNo}</div></div>
      <div class="cert-body">
        <div class="eyebrow" style="letter-spacing:.18em">Chứng nhận hoàn thành</div>
        <h1 class="cert-title">Certificate of Completion</h1>
        <p class="cert-line">Chứng nhận</p>
        <div class="cert-name">${esc(name)}</div>
        <p class="cert-line">đã hoàn thành trọn vẹn bộ ${BADGES.length} huy hiệu của chương trình Season English, đạt cấp <b>${esc(level.name)}</b> với <b>${points} điểm</b>${u.cefr ? `, ở trình độ <b>${esc(cefr)}</b>` : ''}.</p>
        <div class="cert-facts"><div><span class="xs muted">Ngày hoàn thành</span><b>${fmtDate(dateStr0)}/${d.getFullYear()}</b></div><div><span class="xs muted">Huy hiệu</span><b>${BADGES.length}/${BADGES.length}</b></div><div><span class="xs muted">Điểm tích luỹ</span><b>${points}</b></div><div><span class="xs muted">Cấp độ</span><b>${esc(level.short || level.name)}</b></div></div>
        <div class="cert-badges">${BADGES.map(([id, icon, bname, desc]) => `<div class="cert-badge"><span class="ck">✓</span><div><b>${esc(bname)}</b><div class="xs muted">${esc(desc)}</div></div></div>`).join('')}</div>
      </div>
      <div class="cert-sign"><div><div class="line"></div><div class="small">Người vận hành</div><div class="xs muted">${esc(operators[0]?.name || '')}</div></div><div class="cert-date xs muted">${esc(S.settings.orgName)}, ${longDate}</div><div><div class="line"></div><div class="small">Quản lý</div><div class="xs muted">${esc(managers[0]?.name || '')}</div></div></div>
      <div class="cert-foot xs muted">Chứng nhận được tạo tự động từ dữ liệu học trên Season English; có giá trị nội bộ. ${preview ? 'BẢN XEM TRƯỚC' : ''}</div>
    </div>
    ${u.role !== 'learner' ? `<div class="card soft no-print" style="margin-top:12px"><div class="eyebrow" style="margin-bottom:4px">Phần thưởng kèm theo</div><div class="small">Ô này dành cho phần thưởng do công ty quyết định (quà, ngày nghỉ, vinh danh). Hiện chưa có phần thưởng nào được cấu hình, nên học viên chỉ nhận chứng nhận.</div></div>` : ''}
    <div class="row no-print" style="margin-top:12px;justify-content:center">${preview && u.role === 'learner' ? '<span class="xs muted">Nút in / lưu chứng nhận chỉ mở khi bạn đạt cấp cao nhất thật.</span>' : `<button data-action="reward-print">In / lưu chứng nhận (PDF, 1 trang A4 ngang)</button>`}<a class="btn btn-primary" href="${preview ? back : '#/home'}">${preview ? '← Quay lại' : 'Tiếp tục học'}</a></div></div>`, {title: preview ? 'Xem trước chứng nhận' : 'Chứng nhận hoàn thành'});
  // the certificate prints on a landscape A4 page; the rule is attached only while this screen is shown (render() removes it)
  const st = document.createElement('style'); st.id = 'print-landscape'; st.textContent = '@page{size:A4 landscape;margin:10mm}'; document.head.appendChild(st);
});
actions['reward-print'] = () => { const u = me(); if (u?.role === 'learner' && !u.allBadgesAt) { toast('Chứng nhận chỉ in được khi bạn đạt cấp cao nhất thật', 'err'); return; } window.print(); };
/** Fireworks over the whole screen, shown every time a learner moves up a season level. Drawn on a canvas that ignores clicks; skipped when the device asks for reduced motion. */
let fwLast = 0;
function fireworks(ms = 3600) {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (Date.now() - fwLast < 1500) return; fwLast = Date.now(); // a re-render must not restart the show
  document.getElementById('fw')?.remove();
  const c = document.createElement('canvas'); c.id = 'fw'; c.setAttribute('aria-hidden', 'true'); c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999';
  document.body.appendChild(c); const dpr = Math.min(window.devicePixelRatio || 1, 2); const W = c.width = innerWidth * dpr, H = c.height = innerHeight * dpr; const ctx = c.getContext('2d');
  const colors = ['#FBB829', '#F6D3CB', '#A8BF55', '#7A7064', '#FFFFFF', '#FFB347']; let parts = []; const rockets = [];
  const launch = () => rockets.push({x: W * (0.12 + Math.random() * 0.76), y: H, ty: H * (0.14 + Math.random() * 0.36), vy: -(9 + Math.random() * 4) * dpr, col: colors[Math.floor(Math.random() * colors.length)]});
  const burst = r => { const n = 54; for (let i = 0; i < n; i++) { const a = Math.PI * 2 * i / n + Math.random() * 0.1, sp = (1.8 + Math.random() * 4.2) * dpr; parts.push({x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, col: i % 6 === 0 ? '#FFFFFF' : r.col, r: (1.6 + Math.random() * 2.2) * dpr}); } };
  const t0 = performance.now(); let next = 0;
  const step = t => {
    const el = t - t0; if (el >= next && el < ms - 1300) { launch(); if (Math.random() < 0.45) launch(); next = el + 260 + Math.random() * 240; }
    ctx.clearRect(0, 0, W, H);
    for (let i = rockets.length - 1; i >= 0; i--) { const r = rockets[i]; r.y += r.vy; r.vy += 0.12 * dpr; ctx.globalAlpha = 0.9; ctx.fillStyle = r.col; ctx.beginPath(); ctx.arc(r.x, r.y, 2.4 * dpr, 0, 6.283); ctx.fill(); if (r.y <= r.ty || r.vy >= 0) { burst(r); rockets.splice(i, 1); } }
    parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.07 * dpr; p.vx *= 0.984; p.vy *= 0.984; p.life -= 0.012; ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); });
    parts = parts.filter(p => p.life > 0);
    if (el < ms || parts.length || rockets.length) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}
const rewardCard = u => rewardView(rewards(u));
// ---- level-up / level-down signals over the last N days (default 14); thresholds in S.settings.levelUp ----
const levelUpCfg = () => ({...LEVELUP_DEFAULTS, ...(S.settings.levelUp || {})});
const weekOfDate = ds => clamp(Math.floor(daysBetween(S.settings.pilotStartDate, ds) / 7) + 1, 1, S.settings.pilotWeeks);
/** Date of an exercise result: its own timestamp, else the day its lesson was scheduled (results saved before timestamps existed). */
function resDate(key, r) { if (r && r.at) return dateStr(r.at); const f = lessonById(key.split('~')[0]); if (!f) return null; const i = f.set.lessons.indexOf(f.lesson); return addDays(weekStart(f.set.week), (f.lesson.day || i + 1) - 1); }
function levelSignal(u, days) {
  const cfg = levelUpCfg(); days = days || cfg.days; const today = todayStr(); const from = addDays(today, -(days - 1)); const wk = currentWeek();
  // lessons scheduled in the window (weekdays already reached) and how many of them are done
  let due = 0, done = 0;
  for (let w = 1; w <= wk; w++) approvedLessons(w, cefrAt(u, w)).forEach((l, i) => { const d = addDays(weekStart(w), (l.day || i + 1) - 1); if (d >= from && d <= today) { due++; if (userProgress(u.id, l.id)?.completedAt) done++; } });
  // exercise parts: right-first-time share in the window; wrong share per week for the demote signal
  let parts = 0, first = 0; const byWeek = {};
  Object.entries(S.practiceResults || {}).forEach(([k, r]) => {
    if (!k.startsWith(u.id + '_')) return; const key = k.slice(u.id.length + 1); if (key.endsWith('~P')) return; const st = resState(r); if (!st.done) return; const d = resDate(key, r); if (!d) return;
    if (d >= from && d <= today) { parts++; if (st.ok && st.attempts === 1) first++; }
    const w = weekOfDate(d); byWeek[w] = byWeek[w] || {n: 0, wrong: 0}; byWeek[w].n++; if (!st.ok) byWeek[w].wrong++;
  });
  const sub = S.submissions.filter(s => s.userId === u.id && s.total != null && dateStr(s.submittedAt) >= from).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  const turns = practiceSessions(u).flatMap(goodTurns).filter(t => t.rubric && t.at && dateStr(t.at) >= from);
  const coach = turns.length ? Math.round(10 * turns.reduce((s, t) => s + (t.rubric.meaning + t.rubric.vocab + t.rubric.grammar) / 3, 0) / turns.length) / 10 : 0;
  const m = (key, label, value, target, ok, text) => ({key, label, value, target, ok, text});
  const metrics = [
    m('lessons', 'Bài học hoàn thành', pct(done, due), cfg.lessons + '%', due > 0 && pct(done, due) >= cfg.lessons, `${done}/${due} bài đến hạn trong ${days} ngày`),
    m('firstTry', 'Phần bài đúng ngay lần đầu', pct(first, parts), cfg.firstTry + '%', parts > 0 && pct(first, parts) >= cfg.firstTry, `${first}/${parts} phần`),
    m('submission', 'Bài thực hành tuần gần nhất', sub ? sub.total : 0, cfg.submission + '/100', !!sub && sub.total >= cfg.submission, sub ? `${sub.total}/100 (tuần ${sub.week})` : 'chưa có bài được chấm'),
    m('coach', 'Rubric khi luyện với Season', coach, cfg.coach + '/5', turns.length >= cfg.coachTurns && coach >= cfg.coach, `trung bình ${coach}/5 qua ${turns.length} lượt (cần ≥${cfg.coachTurns} lượt)`)
  ];
  const wrongWeeks = [wk - 1, wk].filter(w => w >= 1).map(w => { const b = byWeek[w] || {n: 0, wrong: 0}; return {w, n: b.n, rate: pct(b.wrong, b.n)}; });
  const demote = u.cefr !== 'A1' && wrongWeeks.length === 2 && wrongWeeks.every(x => x.n >= cfg.minParts && x.rate > cfg.wrong);
  const ready = u.cefr !== 'C1' && metrics.every(x => x.ok);
  return {ready, demote, metrics, wrongWeeks, days, cfg};
}
/** Learner-facing card: each signal against its threshold. */
function levelSignalCard(u) {
  const s = levelSignal(u); const next = LEVELS[LEVELS.indexOf(u.cefr) + 1];
  const row = x => { const target = parseFloat(x.target); const w = Math.min(100, Math.round(100 * x.value / (target || 1))); return `<div style="margin-top:8px"><div class="row between small" style="font-weight:800"><span>${x.ok ? '✅' : '◻️'} ${x.label}</span><span class="${x.ok ? '' : 'muted'}">${x.value} / ${x.target}</span></div><div style="height:8px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);overflow:hidden"><div style="width:${w}%;height:100%;background:${x.ok ? 'var(--mint)' : 'var(--butter)'}"></div></div><div class="xs muted">${x.text}</div></div>`; };
  return `<div class="card" style="margin-top:12px"><div class="row between" style="align-items:baseline"><h3>${!next ? 'Bạn đang ở mức cao nhất' : s.ready ? `Sẵn sàng thi lên ${next}` : `Đường lên mức ${next}`}</h3><span class="small muted" style="font-weight:800">${s.days} ngày gần nhất</span></div>
    ${s.metrics.map(row).join('')}
    ${s.demote ? `<div class="banner warn" style="margin-top:10px"><div class="body small"><b>Hai tuần liền sai nhiều</b> (${s.wrongWeeks.map(x => `tuần ${x.w}: ${x.rate}%`).join(', ')} phần sai sau ${MAX_ATTEMPTS} lần). Vận hành có thể đề nghị ôn lại ở mức thấp hơn – không sao cả, học chắc rồi lên lại.</div></div>` : ''}
    ${levelUpBlock(u)}
    <p class="xs muted" style="margin:10px 0 0">${next ? (s.ready ? 'Đủ cả 4 mục – bạn được thi lên mức ngay khi có đề được duyệt.' : 'Đủ cả 4 mục thì bạn được thi lên mức: bài thi ngắn + 6 lượt thử thách với Season, rồi vận hành duyệt.') : 'Giữ nhịp học để duy trì mức C1.'}</p></div>`;
}
// ---- level-up flow: signals → short test (kind 'levelup') → Season challenge → operator decision → P1 pending change ----
const LEVELUP_RETRY_DAYS = 14, CHALLENGE_TURNS = 6;
const nextLevelOf = cefr => LEVELS[LEVELS.indexOf(cefr) + 1] || null;
const openLevelRequest = u => levelRequests().find(r => r.userId === u.id && r.status === 'pending');
const levelupTests = u => S.tests.filter(t => t.userId === u.id && t.kind === 'levelup').sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
const lastLevelupFail = u => levelupTests(u).filter(t => t.outcome === 'fail').sort((a, b) => (b.failedAt || b.submittedAt).localeCompare(a.failedAt || a.submittedAt))[0];
const challengeOf = test => S.coachSessions.find(c => c.challenge && c.challenge.testId === test.id);
/** What a learner must do after a failed attempt before the next try: wait 14 days, have the 4 signals again, and fix the weak skill. {items:[{label, ok, text}], ok, retry, weak} */
function retakePlan(u, fail) {
  const since = fail.failedAt || fail.submittedAt; const from = dateStr(since); const retry = addDays(from, LEVELUP_RETRY_DAYS); const cfg = levelUpCfg();
  const chal = challengeOf(fail); const byChallenge = !!(chal && chal.challenge.result === 'fail'); const weak = byChallenge ? 'coach' : (fail.weakest || 'writing');
  const items = [{label: `Đợi đủ ${LEVELUP_RETRY_DAYS} ngày`, ok: retry <= todayStr(), text: `thi lại từ ${fmtDate(retry)}`}];
  const sig = levelSignal(u); items.push({label: 'Giữ đủ 4 tín hiệu sẵn sàng', ok: sig.ready, text: `${sig.metrics.filter(m => m.ok).length}/4 chỉ số đạt (xem thẻ bên trên)`});
  if (weak === 'coach') { const turns = practiceSessions(u).flatMap(goodTurns).filter(t => t.at > since); const mean = turns.length ? Math.round(10 * turns.reduce((a, t) => a + (t.rubric.meaning + t.rubric.vocab + t.rubric.grammar) / 3, 0) / turns.length) / 10 : 0;
    items.push({label: 'Luyện lại với Season', ok: turns.length >= 10 && mean >= 4, text: `cần ≥10 lượt mới có trung bình ≥4/5 – hiện ${turns.length} lượt, TB ${mean}/5`}); }
  else if (weak === 'writing') { const subs = S.submissions.filter(s => s.userId === u.id && s.total != null && s.submittedAt > since); const good = subs.filter(s => s.total >= 80).length;
    items.push({label: 'Luyện Viết: bài thực hành tuần', ok: good >= 2, text: `cần 2 bài thực hành tuần được chấm ≥80 – hiện ${good}/2 (${subs.length} bài đã chấm)`}); }
  else { const code = {listening: 'L', reading: 'R', speaking: 'S'}[weak]; let n = 0, first = 0;
    Object.entries(S.practiceResults || {}).forEach(([k, r]) => { if (!k.startsWith(u.id + '_')) return; const key = k.slice(u.id.length + 1); const c = key.includes('~') ? key.split('~')[1] : 'W'; if (c !== code) return; const st = resState(r); if (!st.done) return; const d = resDate(key, r); if (!d || d < from) return; n++; if (st.ok && st.attempts === 1) first++; });
    items.push({label: `Luyện ${SECTION_NAMES[weak]}: phần ${SECTION_NAMES[weak]} trong bài học`, ok: n >= 4 && pct(first, n) >= 80, text: `cần ≥4 phần ${SECTION_NAMES[weak]} mới với ≥80% đúng ngay lần đầu – hiện ${first}/${n}${n ? ` (${pct(first, n)}%)` : ''}`}); }
  return {items, ok: items.every(i => i.ok), retry, weak, byChallenge};
}
/** May the learner start a level-up test now? {ok, reason, target, form, retry, plan} */
function levelUpEligibility(u) {
  const target = nextLevelOf(u.cefr); const no = reason => ({ok: false, reason, target});
  if (!target) return no('Bạn đang ở mức cao nhất');
  if (u.pendingCefr) return no(`Đang chờ đổi mức sang ${u.pendingCefr.to} từ ${fmtDate(u.pendingCefr.effective)}`);
  if (openLevelRequest(u)) return no('Yêu cầu lên mức của bạn đang chờ vận hành duyệt');
  if (levelupTests(u).some(t => ['ungraded', 'challenge'].includes(t.outcome))) return no('Bài thi lên mức đã nộp – hoàn thành thử thách với Season trước');
  const fail = lastLevelupFail(u); if (fail && fail.target === target) { const plan = retakePlan(u, fail); if (!plan.ok) return {ok: false, reason: `Chưa thi lại được: ${plan.items.filter(i => !i.ok).map(i => i.label.toLowerCase()).join(', ')}`, target, retry: plan.retry, plan, fail}; }
  if (!levelSignal(u).ready) return no('Chưa đủ 4 tín hiệu sẵn sàng');
  const form = approvedLevelForm(target); if (!form) return no(`Chưa có đề thi lên mức ${target} được duyệt`);
  return {ok: true, target, form};
}
/** Outcome of a level-up test: 'ungraded' (Writing/Speaking still estimated), 'challenge' (passed → Season challenge next), 'fail'. Pass = total ≥70 and every skill ≥50%. */
function evalLevelupTest(test) {
  if (levelRequests().some(r => r.testId === test.id)) return; // decided already
  const ss = test.sectionScores; test.weakest = SECTIONS.reduce((a, k) => ss[k].pct < ss[a].pct ? k : a, SECTIONS[0]);
  // Listening/Reading are final at submit: when they already rule out a pass, fail now instead of waiting for Writing/Speaking grades
  const lrOut = ss.listening.pct < 50 || ss.reading.pct < 50 || ss.listening.points + ss.reading.points + 50 < 70;
  if (!lrOut && SECTIONS.some(k => ss[k].heuristic)) { test.outcome = 'ungraded'; return; }
  if (test.total >= 70 && SECTIONS.every(k => ss[k].pct >= 50)) { if (test.outcome !== 'challenge') { test.outcome = 'challenge'; delete test.failedAt; } }
  else { test.outcome = 'fail'; test.failedAt = test.failedAt || new Date().toISOString(); }
}
function challengeSession(u, test) {
  let s = challengeOf(test);
  if (!s) { const name = u.name.split(' ').pop(); s = {id: uid('cs'), userId: u.id, week: currentWeek(), startedAt: new Date().toISOString(), challenge: {target: test.target, testId: test.id, result: null}, messages: [{role: 'assistant', content: `Hi ${name}, this is your ${test.target} challenge: ${CHALLENGE_TURNS} turns, and I will talk to you at ${test.target} level. Let's start. Tell me about a recent problem at work and how you dealt with it.`}], turns: []}; S.coachSessions.push(s); save(); }
  return s;
}
const challengeScore = s => { const t = s.turns; const mean = t.length ? Math.round(10 * t.reduce((a, x) => a + (x.rubric.meaning + x.rubric.vocab + x.rubric.grammar) / 3, 0) / t.length) / 10 : 0; const off = t.filter(x => x.offTopic).length; return {mean, off, pass: mean >= 3.5 && off <= 1}; };
/** After the 6th turn: pass → request for the operator; fail → retry after 14 days. */
function finishChallenge(u, s) {
  const r = challengeScore(s); const now = new Date().toISOString(); Object.assign(s.challenge, {result: r.pass ? 'pass' : 'fail', mean: r.mean, off: r.off, finishedAt: now});
  const test = S.tests.find(t => t.id === s.challenge.testId);
  if (r.pass && test && test.outcome === 'challenge') { test.outcome = 'requested'; levelRequests().push({id: uid('lr'), userId: u.id, from: u.cefr, to: s.challenge.target, testId: test.id, sessionId: s.id, status: 'pending', at: now}); }
  else if (test) { test.outcome = 'fail'; test.failedAt = now; }
  save(true); return r;
}
/** Where the learner is in the level-up flow (for the card on home / profile). */
function levelUpState(u) {
  const target = nextLevelOf(u.cefr); const req = openLevelRequest(u); if (req) return {phase: 'requested', req, target: req.to, test: S.tests.find(t => t.id === req.testId), session: S.coachSessions.find(c => c.id === req.sessionId)};
  if (draftStarted(u.id, 'levelup')) return {phase: 'testing', target};
  const t = levelupTests(u)[0];
  if (t && t.outcome === 'ungraded') return {phase: 'ungraded', test: t, target: t.target};
  if (t && t.outcome === 'challenge') return {phase: 'challenge', test: t, session: challengeOf(t), target: t.target};
  const e = levelUpEligibility(u); if (e.ok) return {phase: 'eligible', e, target};
  if (e.plan) { const test = e.fail; return {phase: 'failed', test, retry: e.retry, plan: e.plan, target, session: challengeOf(test), req: levelRequests().find(r => r.testId === test.id && r.status === 'rejected')}; }
  if (u.pendingCefr && levelRequests().some(r => r.userId === u.id && r.status === 'approved' && r.to === u.pendingCefr.to)) return {phase: 'approved', target};
  return {phase: 'none', reason: e.reason, target};
}
function levelUpBlock(u) {
  const st = levelUpState(u); const T2 = st.target; const box = (bg, html) => `<div class="card soft" style="margin-top:10px;background:${bg}">${html}</div>`;
  const testLine = t => t ? `Bài thi: <b>${t.total}/100</b> (${SECTIONS.map(k => `${SECTION_NAMES[k]} ${t.sectionScores[k].pct}%`).join(' · ')})` : '';
  switch (st.phase) {
    case 'eligible': return box('var(--mint)', `<b>Bạn đủ điều kiện thi lên mức ${T2}.</b><div class="small" style="margin:4px 0 8px">Đề ngắn (≈${Math.round(sum(SECTIONS.map(s => testDurSec(s, 'levelup'))) / 60)} phút, 4 phần), sau đó 6 lượt thử thách với Season. Chuẩn bị tai nghe và micro như bài đầu vào.</div><a class="btn btn-primary" href="#/test/levelup">Thi lên mức ${T2}</a>`);
    case 'testing': return box('var(--butter)', `<b>Bài thi lên mức ${T2} đang làm dở.</b> <a class="btn btn-sm btn-primary" href="#/test/levelup">Tiếp tục bài thi</a>`);
    case 'ungraded': return box('var(--butter)', `<b>Đã nộp bài thi lên mức ${T2}</b> (${fmtDate(st.test.submittedAt)}). Vận hành đang chấm phần Viết/Nói; kết quả hiện ở đây.`);
    case 'challenge': return box('var(--mint)', `<b>✅ Qua bài thi lên mức ${T2}!</b> ${testLine(st.test)}<div class="small" style="margin:4px 0 8px">Còn thử thách với Season: ${CHALLENGE_TURNS} lượt ở mức ${T2}, đạt khi điểm trung bình ≥3.5/5 và tối đa 1 lượt lạc đề. Các lượt này tính vào giới hạn chat trong ngày, không tính điểm thưởng.</div><a class="btn btn-primary" href="#/challenge">${st.session ? `Tiếp tục thử thách (${st.session.turns.length}/${CHALLENGE_TURNS})` : 'Bắt đầu thử thách với Season'}</a>`);
    case 'requested': return box('var(--primary-soft)', `<b>Chờ vận hành duyệt lên mức ${T2}.</b><div class="small" style="margin-top:4px">${testLine(st.test)}${st.session ? ` · Thử thách Season: <b>${st.session.challenge.mean}/5</b>, ${st.session.challenge.off} lượt lạc đề` : ''} · gửi ${fmtDate(st.req.at)}</div>`);
    case 'approved': return box('var(--mint)', `<b>Vận hành đã duyệt: lên ${T2} từ ${fmtDate(u.pendingCefr.effective)}.</b>`);
    case 'failed': { const t = st.test; const ch = st.session && st.session.challenge.result === 'fail'; const w = t.weakest; const p = st.plan;
      return box('var(--peach)', `<b>Chưa đạt lần này.</b><div class="small" style="margin-top:4px">${st.req ? `Vận hành từ chối: ${esc(st.req.reason || '')}` : ch ? `Thử thách với Season: ${st.session.challenge.mean}/5 (cần ≥3.5), ${st.session.challenge.off} lượt lạc đề (tối đa 1).` : `${testLine(t)}.`}${w && !ch ? ` Kỹ năng yếu nhất: <b>${SECTION_NAMES[w]} ${t.sectionScores[w].pct}%</b>.` : ''}</div>
        <div class="small" style="margin-top:8px;font-weight:800">Để thi lại cần đủ ${p.items.length} điều kiện (${p.items.filter(i => i.ok).length}/${p.items.length}):</div><ul class="small" style="margin:4px 0 0;padding-left:4px;list-style:none;line-height:1.5">${p.items.map(i => `<li>${i.ok ? '✅' : '◻️'} <b>${i.label}</b> – ${i.text}</li>`).join('')}</ul>`); }
    default: return '';
  }
}
/** The learner's reward card: season level, then the two separate tracks (points, badges of the next level), then all badges grouped by level. sim = manager's simulator (no links into the learner's own data). */
function rewardView(r, {sim = false} = {}) {
  const lv = r.lv, nx = lv.next; const earned = r.badges.filter(b => b.earned).length; const top = !nx;
  const ptsOk = top || nx.needPoints === 0, bdgOk = top || nx.missing.length === 0;
  const track = (ok, title, value, bar, note) => `<div class="card flat" style="background:${ok ? 'var(--mint)' : 'var(--surface)'}"><div class="row between"><b class="small">${title}</b><span class="badge ${ok ? 'ok' : 'warn'}">${ok ? '✓ Đạt' : 'Chưa đạt'}</span></div><div style="font-family:var(--font-display);font-weight:800;font-size:1.3rem;margin:2px 0">${value}</div><div class="progress thin"><i style="width:${bar}%"></i></div><div class="xs muted" style="margin-top:4px">${note}</div></div>`;
  const tiers = GOOSE_LEVELS.slice(1).map((L, k) => { const i = k + 1; const list = r.badges.filter(b => b.tier === i); const reached = lv.index >= i;
    return `<div style="margin-top:12px"><div class="row" style="gap:8px;margin-bottom:6px"><span class="badge ${reached ? 'ok' : lv.index + 1 === i ? 'warn' : ''}">${L.icon} Cấp ${i + 1} · ${L.name}</span><span class="xs muted" style="font-weight:800">${L.min} điểm + ${list.length} huy hiệu${reached ? ' · đã đạt' : lv.index + 1 === i ? ' · cấp tiếp theo' : ''}</span></div><div class="badges">${list.map(b => `<div class="bdg ${b.earned ? '' : 'off'}" title="${esc(b.desc)}"><span class="ic">${b.icon}</span><b>${b.name}</b><span>${b.desc}</span></div>`).join('')}</div></div>`; }).join('');
  return `<div class="card" style="margin-top:12px" id="rewards"><div class="row" style="gap:16px;align-items:center">${gooseFigure(lv.index)}<div style="flex:1;min-width:200px"><div class="eyebrow">Mùa học ${lv.index + 1}/${GOOSE_LEVELS.length}</div><div style="font-family:var(--font-display);font-weight:800;font-size:1.5rem;line-height:1.2">${lv.name}</div>
      <div class="small" style="font-weight:700">${top ? 'Cấp cao nhất – đủ điểm và đủ toàn bộ huy hiệu.' : `Lên <b>${nx.name}</b> cần đủ <b>cả hai</b>: điểm và huy hiệu của cấp đó.`}</div></div></div>
    ${top ? '' : `<div class="grid cols-2" style="margin-top:12px">
      ${track(ptsOk, '① Điểm', `★ ${r.points} / ${nx.min}`, pct(Math.min(r.points, nx.min), nx.min), ptsOk ? 'Đã đủ điểm cho cấp tiếp theo.' : `Còn thiếu ${nx.needPoints} điểm.`)}
      ${track(bdgOk, '② Huy hiệu của cấp tiếp theo', `${nx.badges.length - nx.missing.length} / ${nx.badges.length}`, pct(nx.badges.length - nx.missing.length, nx.badges.length), bdgOk ? 'Đã đủ huy hiệu cho cấp tiếp theo.' : 'Còn thiếu: ' + nx.missing.map(id => { const b = BADGES.find(x => x[0] === id); return `${b[1]} ${b[2]}`; }).join(', ') + '.')}</div>
      ${ptsOk !== bdgOk ? `<div class="banner warn" style="margin-top:10px;box-shadow:none"><div class="body small">${ptsOk ? `<b>Đủ điểm nhưng chưa lên cấp</b> vì còn thiếu huy hiệu. Điểm không thay thế được huy hiệu.` : `<b>Đủ huy hiệu nhưng chưa lên cấp</b> vì chưa đủ điểm. Huy hiệu không thay thế được điểm.`}</div></div>` : ''}`}
    <div class="row between" style="margin-top:14px"><h3 style="margin:0">Huy hiệu theo cấp</h3><span class="small muted" style="font-weight:800">${earned}/${r.badges.length} huy hiệu · ★ ${r.points} điểm</span></div>${tiers}
    ${sim ? '' : `<div class="row" style="margin-top:12px"><a class="btn btn-sm" href="#/reward/${top ? 'done' : 'preview'}">${top ? 'Xem màn hình cấp cao nhất' : 'Xem trước màn hình khi đạt cấp cao nhất'}</a></div>`}
    <details style="margin-top:10px"><summary class="small" style="font-weight:800;cursor:pointer">Cách tính điểm và lên cấp</summary><ul class="small" style="margin:6px 0 0;padding-left:20px">${REWARD_RULES.map(([a, b]) => `<li>${a}: <b>${b}</b></li>`).join('')}<li>Lên cấp: phải đủ <b>điểm của cấp</b> và <b>mọi huy hiệu của cấp</b>; các cấp đi lần lượt, không nhảy cấp.</li></ul></details></div>`;
}
// ---- manager: reward simulator (CMS preview of every season level and every edge case, nothing is written to learner data) ----
let rewardSim = {points: 0, badges: []};
const SIM_CASES = [
  ['Mới bắt đầu', 0, []], ['Cấp 1 · đủ điểm, thiếu huy hiệu', 80, ['first']], ['Cấp 1 · đủ huy hiệu, thiếu điểm', 40, ['first', 'streak3']],
  ['Vừa lên cấp 2', 65, ['first', 'streak3']], ['Cấp 2 · điểm cao, kẹt vì huy hiệu', 400, ['first', 'streak3', 'week']], ['Vừa lên cấp 3', 190, ['first', 'streak3', 'week', 'friday', 'chat']],
  ['Cấp 3 · thiếu 1 huy hiệu cuối', 420, ['first', 'streak3', 'week', 'friday', 'chat', 'streak7', 'sharp']], ['Cấp cao nhất', 420, BADGES.map(b => b[0])], ['Có huy hiệu cấp cao nhưng thiếu cấp dưới', 400, ['first', 'streak7', 'sharp', 'words']]
];
route('#/mgr/rewards', () => {
  const u = me(); if (!isStaff(u)) { go('#/'); return; }
  const r = rewardState(rewardSim.points, rewardSim.badges);
  shell(`<div class="page-title"><div><a href="#/mgr" class="small">← Tiến độ nhóm</a><h1>Giả lập phần thưởng</h1><p class="muted">Xem trước mọi trường hợp của mùa học mà học viên có thể gặp. Đây là bản giả lập: không đọc và không ghi dữ liệu của học viên nào.</p></div></div>
    <div class="card"><h3>Chọn nhanh một trường hợp</h3><div class="row" style="gap:8px;margin-top:6px">${SIM_CASES.map((c, i) => `<button class="btn-sm ${c[1] === rewardSim.points && c[2].length === rewardSim.badges.length && c[2].every(b => rewardSim.badges.includes(b)) ? 'btn-primary' : ''}" data-action="sim-case" data-i="${i}">${c[0]}</button>`).join('')}</div>
      <div class="grid cols-2" style="margin-top:14px"><label class="field"><span>Số điểm giả lập (0–600)</span><input id="sim-points" type="number" min="0" max="600" step="5" value="${rewardSim.points}" data-change="sim-points"></label>
        <div class="field"><span style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:4px;font-weight:800">Huy hiệu đã có (bấm để bật/tắt)</span><div class="row" style="gap:6px">${BADGES.map(b => `<button class="btn-sm ${rewardSim.badges.includes(b[0]) ? 'btn-primary' : ''}" data-action="sim-badge" data-id="${b[0]}" title="${esc(b[3])}">${b[1]} ${b[2]}</button>`).join('')}</div></div></div>
      <div class="row" style="margin-top:6px"><span class="small" style="font-weight:800">Kết quả: cấp ${r.lv.index + 1}/${GOOSE_LEVELS.length} · ${r.lv.name}</span></div></div>
    <h3 style="margin:16px 0 0">Học viên sẽ thấy (Tiến độ & hồ sơ)</h3>${rewardView(r, {sim: true})}
    <div class="card" style="margin-top:12px"><h3>4 mùa học</h3><div class="table-wrap"><table><thead><tr><th>Cấp</th><th>Hình</th><th>Điểm cần</th><th>Huy hiệu cần</th><th>Màn chúc mừng</th></tr></thead><tbody>${GOOSE_LEVELS.map((L, i) => `<tr><td><b>${i + 1}. ${L.name}</b></td><td>${gooseFigure(i)}</td><td>${L.min}</td><td class="small">${L.badges.map(id => { const b = BADGES.find(x => x[0] === id); return `${b[1]} ${b[2]}`; }).join('<br>') || '<span class="muted">không cần</span>'}</td><td>${i === 0 ? '<span class="muted">—</span>' : i === GOOSE_LEVELS.length - 1 ? '<a class="btn btn-sm" href="#/reward/preview">Xem màn cấp cao nhất</a>' : `<button class="btn-sm" data-action="sim-levelup" data-i="${i}">Xem màn lên cấp</button>`}</td></tr>`).join('')}</tbody></table></div></div>`, {title: 'Giả lập phần thưởng'});
});
actions['sim-case'] = t => { const c = SIM_CASES[+t.dataset.i]; rewardSim = {points: c[1], badges: [...c[2]]}; render(); };
actions['sim-points'] = t => { rewardSim.points = clamp(Math.round(+t.value || 0), 0, 600); render(); };
actions['sim-badge'] = t => { const id = t.dataset.id; rewardSim.badges = rewardSim.badges.includes(id) ? rewardSim.badges.filter(x => x !== id) : [...rewardSim.badges, id]; const y = window.scrollY; render(); window.scrollTo(0, y); };
actions['sim-levelup'] = t => levelUpModal(+t.dataset.i, 'Nguyễn Văn A', true);
const courseTheme = () => (S.settings.courseTheme || '').trim() || 'Tiếng Anh giao tiếp công sở'; // the umbrella topic of the whole course; weekly topics sit under it
const learnerLessons = u => approvedLessons(currentWeek(), u.cefr);
/** English words of this week's approved lessons (micro lessons store {e,v}; old lessons store {word}). */
const weekVocab = u => [...new Set(learnerLessons(u).flatMap(l => (l.vocab || []).map(v => (v.e || v.word || '').trim()).filter(Boolean)))];
const doneCount = (u, lessons) => lessons.filter(l => userProgress(u.id, l.id)?.completedAt).length;
/** Target words with their Vietnamese clue, de-duplicated by English word. */
const weekVocabPairs = u => { const seen = new Set(); return learnerLessons(u).flatMap(l => l.vocab || []).map(v => ({e: (v.e || v.word || '').trim(), v: (v.v || v.meaning || '').trim()})).filter(p => p.e && !seen.has(p.e.toLowerCase()) && seen.add(p.e.toLowerCase())); };
/** True when the text uses the target word (whole word, any case, common endings allowed). */
const usesWord = (text, w) => new RegExp('(^|[^a-z])' + w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '(s|es|d|ed|ing)?([^a-z]|$)', 'i').test(text || '');
// a cleared chat keeps its week as a negative number, so its turns still count
/** The learner's messages of a chat, without the ones flagged as not answering the question (the n-th user message belongs to the n-th turn). */
const relevantUserTexts = c => c.messages.filter(m => m.role === 'user').filter((m, i) => !(c.turns[i] && c.turns[i].offTopic)).map(m => m.content);
const goodTurns = c => c.turns.filter(t => !t.offTopic); // off-topic turns do not count towards targets, points or badges (they still use up the daily limit)
const practiceSessions = u => S.coachSessions.filter(c => c.userId === u.id && !c.challenge); // level-up challenge chats count for the daily cap only, never for goals, points or badges
const coachTurnsThisWeek = u => practiceSessions(u).filter(c => Math.abs(c.week) === currentWeek()).reduce((n, c) => n + goodTurns(c).length, 0);
const weekSubmission = (u, week=currentWeek()) => S.submissions.find(s => s.userId === u.id && s.week === week);
const apiKeyNote = () => ai.hasKey() ? '' : `<div class="banner warn" style="margin-bottom:12px">${bao('oops', 56, true)}<div class="body small">Hệ thống chưa kết nối AI (chưa có API key). Bạn vẫn làm test và học bài đã duyệt được; hãy báo người vận hành để bật AI coach.</div></div>`;

route('#/home', () => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  const wk = currentWeek(); const w = weekInfo(wk); const today = todayStr();
  const dowName = DOW_FULL[dowIndex(today)];
  // state machine: no test → test pending approval → learning
  const pt = userTest(u.id, 'placement');
  let main = '';
  if (!u.cefrApproved) {
    const cur = !u.profile ? 1 : !pt ? 2 : 3; const hasDraft = draftStarted(u.id, 'placement');
    const testMin = S.settings.testTimed !== false ? Math.round(sum(SECTIONS.map(s => testDurSec(s))) / 60) : null;
    const st = (n, title, meta, why, cta) => `<div class="st ${n < cur ? 'done' : n === cur ? 'cur' : 'todo'}"><span class="num">${n < cur ? ICONS.check : n}</span><div style="flex:1;min-width:0"><div class="row between"><b style="font-family:var(--font-display);font-size:1.1rem">${title}</b><span class="badge ${n < cur ? 'ok' : n === cur ? 'warn' : ''}">${n < cur ? 'Xong' : n === cur ? 'Đang ở bước này' : meta}</span></div><p class="why"><b>Vì sao cần?</b> ${why}</p>${cta}</div></div>`;
    main = `<h3 style="margin-bottom:10px">3 bước để bắt đầu học</h3><div class="setup">
      ${st(1, 'Hồ sơ cá nhân', '~2 phút', 'Bài học lấy ví dụ theo đúng công việc của bạn, và Season giải thích theo cách bạn chọn.', cur === 1 ? `<a class="btn btn-primary" href="#/onboard">${u.profileDraft ? 'Điền tiếp phần đã lưu tạm' : 'Điền hồ sơ (~2 phút)'}</a>` : '<a class="btn btn-sm" href="#/onboard">← Xem / sửa hồ sơ</a>')}
      ${st(2, 'Test đầu vào', testMin ? `tối đa ${testMin} phút` : 'không tính giờ', 'Để xếp đúng mức CEFR: bài quá dễ thì chán, quá khó thì nản. Không cần ôn trước.', cur === 2 ? `<a class="btn btn-primary" href="#/test/placement">${hasDraft ? 'Tiếp tục bài đang làm dở' : `Bắt đầu test${testMin ? ` (tối đa ${testMin} phút)` : ''}`}</a><div class="xs muted" style="margin-top:6px">4 phần: Nghe · Đọc · Viết · Nói. Cần tai nghe và micro.</div>` : cur > 2 ? `<span class="small">Đã nộp lúc ${fmtDateTime(pt.submittedAt)} · tổng ${pt.total}/100${pt.aiSuggestedCefr ? ` · AI gợi ý mức <b>${pt.aiSuggestedCefr}</b>` : ''}</span>` : '<span class="xs muted">Mở sau khi xong hồ sơ.</span>')}
      ${st(3, 'Vận hành duyệt mức', 'sau khi nộp test', 'Một người thật xem lại gợi ý của AI trước khi mở bài, tránh xếp nhầm mức.', cur === 3 ? '<span class="small">Đang chờ duyệt. Bài học tự mở ngay khi có mức, bạn không cần làm gì thêm.</span>' : '<span class="xs muted">Tự động sau khi bạn nộp test.</span>')}</div>`;
  } else {
    const lessons = learnerLessons(u); const done = doneCount(u, lessons);
    // today's lesson = the one scheduled for this weekday (Mon=1…); if already done or weekend → next unfinished
    const dayIdx = dowIndex(today); const scheduled = lessons.find(l => (l.day || lessons.indexOf(l) + 1) === dayIdx + 1);
    const next = lessons.find(l => !userProgress(u.id, l.id)?.completedAt); // lessons unlock in order, so "today" is always the first unfinished one
    // fixed schedule Mon–Fri: a lesson also waits for its own weekday (missed ones stay open for catching up)
    const openDate = l => addDays(weekStart(wk), (l.day || lessons.indexOf(l) + 1) - 1); const nextOpen = !!next && openDate(next) <= today;
    const practiceLocked = lessons.length > 0 && done < lessons.length;
    const dayLabel = l => { const d = l.day || lessons.indexOf(l) + 1; return DAY_SHORT[d - 1] || ('Bài ' + d); };
    const miss = missedDays(u.id);
    const turns = coachTurnsThisWeek(u); const sub = weekSubmission(u);
    const isFri = dowIndex(today) >= 4;
    const sess = sessionsThisWeek(u.id); const streak = streakDays(u.id); const rw = rewards(u);
    main = `
      ${miss >= 2 ? `<div class="banner warn">${bao('oops', 56, true)}<div class="body"><b>Bạn đã ${miss} ngày chưa vào học.</b> Chỉ cần ${S.settings.minMinutesPerDay} phút hôm nay – học 1 bài ngắn hoặc nói chuyện với Season 1 lượt là đủ giữ nhịp.</div></div>` : ''}
      ${!w.topic ? `<div class="card"><div class="bao-row">${bao('think', 72, true)}<div><h3>Tuần ${wk} chưa có bài</h3><p class="small" style="margin:0">Người vận hành chưa đặt chủ đề tuần. Bạn có thể luyện với Season trong lúc chờ.</p></div></div></div>`
      : !lessons.length ? `<div class="card"><div class="bao-row">${bao('think', 72, true)}<div><h3>Tuần ${wk}: ${esc(w.topic)}</h3><p class="small" style="margin:0">Bộ bài mức ${u.cefr} đang được chuẩn bị và duyệt. Quay lại sau nhé, hoặc luyện với Season trước.</p></div></div></div>`
      : next && !nextOpen ? `<div class="hero" style="background:var(--mint);color:var(--text)"><div class="bao-row">${bao('praise', 72, true)}<div><div class="eyebrow" style="color:inherit">Tuần ${wk} · ${esc(w.topic)}</div><h2>Xong bài hôm nay rồi!</h2><div style="font-weight:700">Bài tiếp theo (${dayLabel(next)} · ${esc(next.title)}) mở vào ${DOW_FULL[dowIndex(openDate(next))]} ${fmtDate(openDate(next))}. Trong lúc chờ, luyện với Season nhé.</div></div></div></div>`
      : next ? `<div class="hero"><div><div class="eyebrow">Bài hôm nay · ${dayLabel(next)} · Tuần ${wk}${openDate(next) < today ? ' · học bù' : ''}</div><h2>${esc(next.title)}</h2><div style="font-weight:700">${esc(w.topic)}</div></div>
          <div class="row" style="gap:14px;font-weight:800;font-size:.9rem"><span class="row" style="gap:6px">${ICONS.clock} ${next.durationMin} phút</span><span>Bài ${lessons.indexOf(next) + 1}/${lessons.length}</span></div>
          <a class="btn btn-lg" href="#/lesson/${next.id}" style="background:var(--butter);color:#1E1E1E;justify-content:center">Học ngay</a></div>`
      : `<div class="hero" style="background:var(--mint);color:var(--text)"><div class="bao-row">${bao('praise', 72, true)}<div><div class="eyebrow" style="color:inherit">Tuần ${wk} · ${esc(w.topic)}</div><h2>Xong hết ${lessons.length} bài rồi!</h2><div style="font-weight:700">Ôn lại bài hoặc luyện thêm với Season nhé.</div></div></div></div>`}
      <div class="stats">
        <div class="stat"><div class="ring" style="--p:${lessons.length ? Math.round(done / lessons.length * 100) : 0}"><b>${done}/${lessons.length || '–'}</b></div><span class="lbl">Bài tuần này</span></div>
        <div class="stat"><div class="ring" style="--p:${Math.min(100, Math.round(sess / 5 * 100))};--c:var(--butter)"><b>${Math.min(sess, 5)}/5</b></div><span class="lbl">Ngày học (T2–T6)</span></div>
        <div class="stat"><div class="ring" style="--p:${streak ? 100 : 0};--c:var(--peach)"><b>${streak}</b></div><span class="lbl">Ngày liên tiếp</span></div>
        <a class="stat" href="#/profile" style="text-decoration:none;color:inherit;background:var(--butter)" title="Xem huy hiệu và cách tính điểm"><div class="ring" style="--p:100;--c:var(--surface)"><b>★</b></div><span class="lbl" style="color:var(--text)">${rw.points} điểm · ${rw.badges.filter(b => b.earned).length} huy hiệu</span></a>
      </div>
      ${lessons.length ? `<div class="card" style="margin-top:12px"><div class="row between" style="align-items:baseline"><h3>Lộ trình tuần ${wk}</h3><span class="small muted" style="font-weight:800">T2–T6 · mỗi ngày một bài</span></div>
        <div class="path">${lessons.map(l => { const p = userProgress(u.id, l.id); const isToday = l === next && nextOpen; return `<a href="#/lesson/${l.id}" class="${p?.completedAt ? 'done' : isToday ? 'today' : 'locked'}" title="${esc(l.title)}${p?.completedAt || isToday ? '' : (l === next ? ' – mở vào ' + fmtDate(openDate(l)) : ' – mở sau khi xong bài trước')}"><span class="node">${p?.completedAt ? ICONS.check : isToday ? '▶' : '🔒'}</span><span class="d">${dayLabel(l)}${isToday ? ' · hôm nay' : ''}</span><span class="ttl">${esc(l.title)}</span></a>`; }).join('')}</div></div>` : ''}
      <div class="card"><div class="row between" style="align-items:baseline"><h3>Điểm danh tuần này</h3><span class="small muted" style="font-weight:800">${Math.min(sess, 5)}/5 ngày</span></div>${weekDots(u.id)}
        <p class="xs muted" style="margin:10px 0 0">Lịch học cố định 5 ngày/tuần (T2–T6), mỗi ngày 1 bài, ≥${S.settings.minMinutesPerDay} phút. ${u.monthlyGoal ? '' + esc(u.monthlyGoal) : ''}</p></div>
      <div class="grid cols-2" style="margin-top:12px">
        <a class="tile peach" href="#/coach">${ICONS.chat}<span class="t">Luyện với Season</span><span class="s">${turns >= 2 ? `Đã đạt mục tiêu tuần ✓ (${turns} lượt)` : `Mục tiêu tuần: đã luyện ${turns}/2 lượt`}</span></a>
        <a class="tile butter" href="#/practice">${ICONS.pen}<span class="t">${practiceLocked && !sub ? '🔒 ' : ''}Bài thực hành cuối tuần</span><span class="s">${sub ? (sub.total != null ? `Đã chấm: ${sub.total}/100` : 'Đã nộp, chờ chấm') : practiceLocked ? `Chưa mở khoá bài Tuần ${wk} – mở khi xong đủ ${lessons.length} bài T2–T6 (đã xong ${done}/${lessons.length})` : isFri ? 'Đến hạn hôm nay!' : isLow(u.cefr) ? 'Viết 3–5 câu' : 'Viết ngắn / hội thoại'}</span></a>
      </div>
      ${levelSignalCard(u)}
      ${isLastWeek() && !userTest(u.id, 'final') ? `<div class="card" style="margin-top:12px;background:var(--primary-soft)"><div class="bao-row">${bao('hello', 64, true)}<div><h3>Bài kiểm tra cuối kỳ đã mở</h3><p class="small" style="margin:0 0 8px">Cùng rubric với bài đầu vào để xem bạn tiến bộ bao nhiêu (20–25 phút).</p><a class="btn btn-primary" href="#/test/final">Làm bài cuối kỳ</a></div></div></div>` : ''}`;
  }
  shell(`
    <div class="row between" style="margin-bottom:14px"><div><div class="small muted" style="font-weight:800">${dowName} · Tuần ${wk}/${S.settings.pilotWeeks}</div><h1 style="margin:0">Chào <span class="name">${esc(u.name.split(' ').pop())}</span>!</h1></div>${u.cefrApproved ? `<span style="text-align:right"><span class="badge lvl lvl-${u.cefr}" style="font-size:1rem;padding:6px 14px">Trình độ ${u.cefr}</span>${u.pendingCefr ? `<br><span class="xs" style="font-weight:800">Lên mức ${esc(u.pendingCefr.to)} từ ${fmtDate(u.pendingCefr.effective)}</span>` : ''}</span>` : ''}</div>
    <div class="row" style="gap:8px;margin-bottom:14px;align-items:stretch">
      <div class="card flat" style="flex:1 1 200px;padding:10px 14px;background:var(--primary-soft)"><div class="eyebrow" style="color:var(--text)">Chủ đề lớn của khoá</div><div style="font-family:var(--font-display);font-weight:800;font-size:1.1rem;line-height:1.25">${esc(courseTheme())}</div></div>
      <div class="card flat" style="flex:1 1 200px;padding:10px 14px;background:var(--butter)"><div class="eyebrow" style="color:var(--text)">Chủ đề tuần ${wk}</div><div style="font-family:var(--font-display);font-weight:800;font-size:1.1rem;line-height:1.25">${w.topic ? esc(w.topic) : '<span style="font-weight:700">Chưa đặt</span>'}</div></div>
    </div>
    <div class="bao-row" style="margin-bottom:16px">${bao(u.cefrApproved ? 'hello' : 'think', 96, true)}<div class="bubble" style="flex:1">${u.cefrApproved ? (missedDays(u.id) >= 2 ? 'Lâu rồi không gặp! Học 10 phút thôi nhé?' : 'Hôm nay học gì nào?') : (pt ? 'Mình đang xem bài test của bạn…' : 'Mình cần biết trình độ của bạn trước nhé!')}</div></div>
    ${apiKeyNote()}${main}`, {title: 'Trang chủ'});
  if (u.cefrApproved) announceBadges(u);
});

// ---- onboarding form: personal info + learning style ----
route('#/onboard', () => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  const p = u.profile || u.profileDraft || {}; const setup = !u.profile && !u.cefrApproved;
  const REQ = '<span style="color:#6E3B32;font-weight:900" title="Bắt buộc">*</span><span class="badge danger" style="margin-left:4px;font-size:.7rem;padding:0 8px">bắt buộc</span>';
  const checks = (group, name, selected) => `<div class="row" style="gap:8px">${PROFILE_OPTS[group].map(([k, lbl]) => `<label class="opt" style="margin:0;padding:8px 12px;flex:0 0 auto"><input type="checkbox" name="${name}" value="${k}" ${(selected || []).includes(k) ? 'checked' : ''}><span class="small">${lbl}</span></label>`).join('')}</div>`;
  const radios = (group, name, selected) => `<div class="row" style="gap:8px">${PROFILE_OPTS[group].map(([k, lbl]) => `<label class="opt" style="margin:0;padding:8px 12px;flex:0 0 auto"><input type="radio" name="${name}" value="${k}" ${selected === k ? 'checked' : ''}><span class="small">${lbl}</span></label>`).join('')}</div>`;
  shell(`<div style="margin-bottom:10px"><a class="btn btn-sm" href="${u.profile ? '#/profile' : '#/home'}">← Quay lại</a></div>
    <div class="bao-row" style="margin-bottom:16px">${bao('hello', 90, true)}<div><div class="eyebrow">${setup ? 'Bước 1/2 · Hồ sơ' : 'Hồ sơ'}</div><h1 style="margin:2px 0 6px">${u.profile ? 'Sửa hồ sơ của bạn' : 'Cho Season biết về bạn nhé'}</h1><div class="bubble" style="display:inline-block">Mình dùng thông tin này để chọn ví dụ sát công việc và cách học hợp với bạn. Khoảng 2 phút thôi.</div></div></div>
    ${setup ? `<div class="grid cols-2" style="margin-bottom:12px">
      <div class="card flat" style="background:var(--primary-soft)"><div class="eyebrow">Bước 1 · Hồ sơ · đang làm</div><p class="small" style="margin:4px 0 0"><b>Vì sao cần?</b> Bài học lấy ví dụ theo đúng công việc của bạn, và Season giải thích theo cách bạn chọn (tiếng Việt hay tiếng Anh, bài ngắn hay hội thoại).</p></div>
      <div class="card flat"><div class="eyebrow">Bước 2 · Test đầu vào · tiếp theo</div><p class="small" style="margin:4px 0 0"><b>Vì sao cần?</b> Để xếp đúng mức CEFR: bài quá dễ thì chán, quá khó thì nản. Hồ sơ không thay thế được test vì tự đánh giá thường lệch.</p></div></div>` : ''}
    ${!u.profile && u.profileDraft ? '<div class="banner info" style="margin-bottom:12px"><div class="body small">Đã khôi phục phần bạn <b>lưu tạm</b> lần trước. Điền nốt rồi bấm Lưu.</div></div>' : ''}
    <p class="small" style="margin:0 0 8px;font-weight:800">Các mục có dấu ${REQ} là bắt buộc; các mục còn lại có thể bỏ trống.</p>
    <form id="ob-form" onsubmit="return false">
    <div class="card"><h3>Thông tin cá nhân</h3>
      <div class="grid cols-2">
        <label class="field"><span>Họ tên ${REQ}</span><input id="ob-name" value="${esc(u.name)}" required aria-required="true"></label>
        <label class="field"><span>Email ${REQ}</span><input id="ob-email" type="email" value="${esc(p.email || '')}" placeholder="VD: lan.nguyen@gft.com" required aria-required="true" autocomplete="email"><small id="ob-email-err" class="xs" style="display:none;color:#6E3B32;font-weight:600;margin-top:2px">Email chưa đúng định dạng (VD: ten@congty.com)</small></label>
        <label class="field"><span>Phòng ban / team</span><input id="ob-dept" value="${esc(p.department || '')}" placeholder="VD: Sales, QA, Marketing"></label>
        <label class="field"><span>Vị trí công việc</span><input id="ob-pos" value="${esc(p.position || '')}" placeholder="VD: Tester, Sales executive"></label>
        <label class="field"><span>Base username nhận nhắc học (tuỳ chọn)</span><input id="ob-contact" value="${esc(p.contact || '')}" placeholder="VD: @lan.nguyen"></label>
      </div>
      <label class="field"><span>Bạn dùng tiếng Anh ở công ty cho việc gì? ${REQ} (chọn ít nhất 1)</span>${checks('goals', 'ob-goals', p.goals)}</label>
      <label class="field"><span>Mức độ dùng tiếng Anh trong môi trường làm việc? ${REQ}</span>${radios('envUse', 'ob-env', p.envUse)}</label>
      <label class="field"><span>Mức độ sử dụng tiếng Anh trong gia đình bạn? ${REQ}</span>${radios('familyUse', 'ob-family', p.familyUse)}</label>
      <label class="field"><span>Thói quen dùng tiếng Anh ngoài công việc? ${REQ} (chọn ít nhất 1)</span>${checks('habits', 'ob-habits', p.habits)}</label>
      <label class="field"><span>Tình huống cụ thể hay gặp (tuỳ chọn)</span><textarea id="ob-sit" style="min-height:60px" placeholder="VD: Trả lời email khách Nhật, họp daily với team Singapore…">${esc(p.situations || '')}</textarea></label>
    </div>
    <div class="card"><h3>Phong cách học yêu thích</h3>
      <label class="field"><span>Bạn học hiệu quả nhất khi… ${REQ} (chọn ít nhất 1)</span>${checks('styles', 'ob-styles', p.styles)}</label>
      <div class="field"><span style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:4px;font-weight:800">Ngôn ngữ giải thích</span><div class="card soft small" style="padding:8px 12px;font-weight:700">Tự động theo trình độ: A1–A2 giải thích bằng tiếng Việt, B1 trở lên bằng tiếng Anh.</div></div>
      <div class="field"><span style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:4px;font-weight:800">Phong cách của Season</span><div class="row" style="gap:8px">${Object.entries(PERSONAS).map(([k, [vi, en, tip]]) => `<label class="opt" style="margin:0;padding:8px 12px;flex:1 1 220px"><input type="radio" name="ob-persona" value="${k}" ${personaOf(u) === k ? 'checked' : ''}><span class="small"><b>${en} · ${vi}</b><br>${tip}</span></label>`).join('')}</div></div>
      <div class="grid cols-2">
        <label class="field"><span>Mỗi buổi học bao lâu là vừa</span>${radios('duration', 'ob-dur', p.duration || '10')}</label>
        <div class="field"><span style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:4px;font-weight:800">Lịch học</span><div class="card soft small" style="padding:8px 12px;font-weight:700">Cố định 5 ngày/tuần, Thứ Hai → Thứ Sáu, mỗi ngày 1 bài. Cuối tuần có bài thực hành.</div></div>
        <label class="field"><span>Thiết bị hay dùng</span>${radios('device', 'ob-device', p.device || 'phone')}</label>
      </div>
    </div>
    <div class="card"><h3>Về tiếng Anh của bạn</h3>
      <label class="field"><span>Bạn tự thấy trình độ mình ở đâu?</span>${radios('selfLevel', 'ob-self', p.selfLevel || 'unknown')}</label>
      <div class="field"><span style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:4px;font-weight:800">Chứng chỉ bạn có (tuỳ chọn – tick và ghi kết quả, năm thi)</span>
        <div class="stack" style="gap:6px">${PROFILE_OPTS.certs.map(([k, lbl, hint]) => { const c = (p.certs || []).find(x => x.type === k); return `<div class="row" style="gap:8px;flex-wrap:nowrap"><label class="opt" style="margin:0;padding:8px 12px;flex:0 0 190px"><input type="checkbox" name="ob-cert" value="${k}" ${c ? 'checked' : ''} data-change="ob-cert-toggle"><span class="small">${lbl}</span></label><input id="ob-cert-score-${k}" value="${esc(c?.score || '')}" placeholder="${hint}" style="flex:1;min-width:0" ${c ? '' : 'disabled'}><input id="ob-cert-year-${k}" value="${esc(c?.year || '')}" placeholder="năm" inputmode="numeric" style="flex:0 0 84px" ${c ? '' : 'disabled'}></div>`; }).join('')}</div></div>
      <label class="field"><span>Đã học tiếng Anh thế nào trước đây? (tuỳ chọn)</span><input id="ob-exp" value="${esc(p.experience || '')}" placeholder="VD: Học ở trường, app Duolingo 1 năm, trung tâm…"></label>
      <label class="field"><span>Điều bạn lo ngại hoặc muốn Season giúp nhất</span><textarea id="ob-concern" style="min-height:60px" placeholder="VD: Sợ nói sai, không nhớ từ, ngại hỏi lại khách…">${esc(p.concerns || '')}</textarea></label>
    </div>
    <div class="row" style="margin-top:12px"><a class="btn" href="${u.profile ? '#/profile' : '#/home'}">← Quay lại</a>${u.profile ? '<a class="btn btn-x" href="#/profile">Huỷ</a>' : '<button data-action="ob-draft">Lưu tạm</button>'}<button class="btn-primary btn-lg" data-action="ob-save">${u.profile ? 'Lưu hồ sơ' : 'Lưu và làm test đầu vào →'}</button></div>
    </form>`, {title: 'Hồ sơ'});
  // email: report a wrong format at once while typing (the field is required, so an empty box is not an error yet)
  const em = $('#ob-email'); const emErr = $('#ob-email-err'); const checkEmail = () => { const v = em.value.trim(); const bad = v && !EMAIL_RE.test(v); emErr.style.display = bad ? 'block' : 'none'; em.style.borderColor = bad ? '#6E3B32' : ''; em.setAttribute('aria-invalid', bad ? 'true' : 'false'); };
  em?.addEventListener('input', checkEmail); em?.addEventListener('blur', checkEmail); if (em?.value) checkEmail();
});
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function readObForm() {
  const vals = n => $$(`input[name="${n}"]:checked`).map(i => i.value); const val = n => ($(`input[name="${n}"]:checked`) || {}).value || '';
  return {department: $('#ob-dept').value.trim(), position: $('#ob-pos').value.trim(), email: $('#ob-email').value.trim().toLowerCase(), /* e-mail is case-insensitive: stored in lower case so "jame@GMAIL.COM" and "jame@gmail.com" are the same */ contact: $('#ob-contact').value.trim(), goals: vals('ob-goals'), envUse: val('ob-env'), familyUse: val('ob-family'), habits: vals('ob-habits'), situations: $('#ob-sit').value.trim(),
    styles: vals('ob-styles'), explain: 'auto', duration: val('ob-dur') || '10', sessionsPerWeek: 5, device: val('ob-device') || 'phone',
    selfLevel: val('ob-self') || 'unknown', certs: vals('ob-cert').map(k => ({type: k, score: $('#ob-cert-score-' + k).value.trim(), year: $('#ob-cert-year-' + k).value.trim()})),
    experience: $('#ob-exp').value.trim(), concerns: $('#ob-concern').value.trim()};
}
actions['ob-save'] = () => {
  const u = me(); const name = $('#ob-name').value.trim(); if (!name) { toast('Nhập họ tên', 'err'); return; }
  const f = readObForm();
  if (!EMAIL_RE.test(f.email)) { toast('Nhập email hợp lệ (bắt buộc)', 'err'); const em = $('#ob-email'); if (em) { em.focus(); em.dispatchEvent(new Event('input')); } return; }
  if (!f.goals.length) { toast('Chọn ít nhất một mục đích dùng tiếng Anh', 'err'); return; }
  if (!f.envUse) { toast('Chọn mức độ dùng tiếng Anh trong môi trường làm việc', 'err'); return; }
  if (!f.familyUse) { toast('Chọn mức độ sử dụng tiếng Anh trong gia đình', 'err'); return; }
  if (!f.habits.length) { toast('Chọn ít nhất một thói quen dùng tiếng Anh (hoặc "Chưa có thói quen nào")', 'err'); return; }
  if (!f.styles.length) { toast('Chọn ít nhất một phong cách học', 'err'); return; }
  const isNew = !u.profile; u.name = name; u.persona = ($('input[name="ob-persona"]:checked') || {}).value || personaOf(u);
  u.profile = {...f, completedAt: u.profile?.completedAt || new Date().toISOString(), updatedAt: new Date().toISOString()}; delete u.profileDraft;
  save(true); toast('Đã lưu hồ sơ', 'ok');
  go(isNew && !u.cefrApproved ? '#/test/placement' : '#/profile');
};
// partial profile, no validation; it does not count as a finished step 1
actions['ob-draft'] = () => { const u = me(); u.profileDraft = readObForm(); save(true); toast('Đã lưu tạm – quay lại điền tiếp bất cứ lúc nào', 'ok'); go('#/home'); };
actions['ob-cert-toggle'] = t => { ['score', 'year'].forEach(f => { const i = $(`#ob-cert-${f}-${t.value}`); if (i) { i.disabled = !t.checked; if (t.checked && f === 'score') i.focus(); } }); };
/** Vietnamese profile card used by operator/manager/profile screens. */
function profileCard(u, {editable=false} = {}) {
  const p = u.profile; if (!p) return `<div class="card soft"><p class="small muted" style="margin:0">Chưa điền hồ sơ cá nhân.${editable ? ' <a href="#/onboard">Điền ngay</a>' : ''}</p></div>`;
  const row = (k, v) => v ? `<div class="row" style="gap:6px;align-items:flex-start"><span class="xs muted" style="min-width:120px;font-weight:800">${k}</span><span class="small">${esc(v)}</span></div>` : '';
  return `<div class="card soft"><div class="row between"><b>Hồ sơ cá nhân</b>${editable ? '<a class="btn btn-sm" href="#/onboard">Sửa</a>' : ''}</div><div class="stack" style="gap:4px;margin-top:6px">
    ${row('Công việc', [p.position, p.department].filter(Boolean).join(' · '))}${row('Email', p.email)}${row('Base', p.contact)}${row('Dùng tiếng Anh để', optLabels('goals', p.goals))}${row('Mức độ dùng ở công ty', optLabel('envUse', p.envUse))}${row('Dùng trong gia đình', p.familyUse ? optLabel('familyUse', p.familyUse) : '')}${row('Thói quen ngoài việc', optLabels('habits', p.habits))}${row('Tình huống', p.situations)}
    ${row('Cách học thích', optLabels('styles', p.styles))}${row('Giải thích bằng', u.cefr ? (isLow(u.cefr) ? `Tiếng Việt (tự động theo mức ${u.cefr})` : `Tiếng Anh (tự động theo mức ${u.cefr})`) : 'Tự động theo trình độ')}${row('Phong cách Season', `${PERSONAS[personaOf(u)][1]} · ${PERSONAS[personaOf(u)][0]}`)}${row('Lịch học', [p.duration + ' phút/buổi', '5 ngày/tuần (T2–T6)', optLabel('device', p.device)].filter(Boolean).join(' · '))}
    ${row('Tự đánh giá', optLabel('selfLevel', p.selfLevel))}${row('Chứng chỉ', (p.certs || []).map(certLabel).join(', '))}${row('Đã học', p.experience)}${row('Lo ngại / mong muốn', p.concerns)}</div></div>`;
}
const learnerWantsVi = u => isLow(u.cefr); // explanation language follows the level automatically: A1–A2 Vietnamese, B1 and above English
// ---- Season persona: the learner picks Formal or Informal; tone, feedback and example content follow it ----
const PERSONAS = {informal: ['Thân thiện', 'Informal', 'Giọng đồng nghiệp thân ở bàn bên: câu ngắn, dạng rút gọn (I\'m, don\'t), mở đầu bằng phản ứng tự nhiên, 1 emoji/lượt, hỏi ngắn kiểu "What about you?". Tình huống: trò chuyện hằng ngày, tin nhắn nhanh, giờ nghỉ. Vẫn yêu cầu bạn viết câu đầy đủ – thân thiện không phải cộc lốc.'], formal: ['Trang trọng', 'Formal', 'Giọng chuyên viên đào tạo lịch sự: câu đầy đủ, không rút gọn, không emoji / dấu chấm than, khen ngắn gọn khách quan ("That is correct."), hỏi bằng "Could you…?". Tình huống: email khách hàng, họp, báo cáo, nói với quản lý.']};
const personaOf = u => u?.persona === 'formal' ? 'formal' : 'informal';
// The persona block is written as hard MUST / MUST NOT rules with an example reply, and it is placed first and repeated last in the prompt: a one-line hint at the end was too weak to change the model's tone.
const personaNote = p => p === 'formal'
  ? `\n=== PERSONA: FORMAL (this overrides every other tone instruction, including "friendly") ===
Season speaks like a courteous corporate trainer talking to a colleague in a client meeting.
REGISTER – MUST: complete sentences of 8–20 words; NO contractions (write "I am", "do not", "that is", "you are"); open with a neutral acknowledgement ("Thank you, Lan.", "I see.", "Understood."); questions as indirect requests ("Could you tell me…?", "Would you mind describing…?", "May I ask…?"); praise measured and specific ("That is correct.", "That is a clear explanation of your role."); corrections introduced politely ("One small point:", "A more natural way to say this is…"); vocabulary of formal work: colleague (not buddy), supervisor/manager (not boss), confirm, schedule, inform, discuss, propose; situations: emails to clients, meetings, status reports, speaking with a manager or a partner.
MUST NOT: emoji, exclamation marks, slang or idioms ("no worries", "stuff", "cool", "awesome", "gonna", "kind of"), interjections ("Hey", "Hi there", "Wow", "Oh"), jokes, nicknames, questions tagged on with "right?" / "huh?", more than one question per reply.
Address: the learner's first name once per reply at most, never "dear" or "my friend".
Vietnamese text (explanations, feedback, relevanceNote): trang trọng, xưng "bạn", dùng "vui lòng", "xin lưu ý", "nên"; KHÔNG dùng "nhé", "nha", "nè", "nhen", "ok", "siêu", emoji.
Example reply 1: "Thank you, Lan. That is a clear introduction. Could you tell me which team you work with and what your main responsibilities are?"
Example reply 2 (correction): "I see. One small point: we say "responsible for testing", not "responsible of testing". Could you describe a typical task in your week?"
=== END PERSONA ===`
  : `\n=== PERSONA: INFORMAL (this overrides every other tone instruction) ===
Season speaks like a cheerful teammate chatting at the next desk during a coffee break.
REGISTER – MUST: short sentences (4–14 words); contractions everywhere ("I'm", "that's", "don't", "you're", "we've"); open with a short warm reaction ("Nice!", "Oh cool,", "Got it!", "Same here –"); exactly ONE emoji per reply, placed after the first sentence or at the end; casual questions ("What about you?", "How's that going?", "Anything fun this week?"); everyday vocabulary: teammate, boss, stuff, a lot, pretty (= quite), grab lunch, catch up; situations: desk chat, quick messages, lunch, Friday plans, small wins and annoyances at work.
MUST NOT: stiff phrases ("Could you please", "Thank you for your answer", "I would like to", "May I ask", "Kindly"), formal connectors ("furthermore", "therefore", "in addition"), long paragraphs, more than one emoji, more than one question per reply.
Address: the learner's first name in roughly every second reply, no titles.
Vietnamese text (explanations, feedback, relevanceNote): thân mật, xưng "bạn/mình", dùng "nhé", "nha", "nè", "ok"; không dùng "vui lòng", "xin lưu ý".
Informal does NOT excuse the learner's curtness: friendly means relaxed, COMPLETE sentences; one-word or bare-keyword replies are impolite and must be flagged, not praised.
Example reply 1: "Nice, Lan! So you're a tester 😊 Who do you work with most days?"
Example reply 2 (correction): "Got it! Tiny fix: it's "responsible for testing" 🙂 What's the trickiest thing you tested this week?"
=== END PERSONA ===`;
/** Last line of defence for the formal persona: remove emoji and exclamation marks the model may still produce. */
const personaText = (text, p) => p === 'formal' ? String(text || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/!+/g, '.').replace(/\s{2,}/g, ' ').replace(/\s+([.,?])/g, '$1').trim() : String(text || '');
/** Appended by code (so it also applies to an edited prompt): an answer that does not address the question must be caught, not graded as if it were fine. */
const RELEVANCE_RULE_COACH = `\n\nRELEVANCE CHECK (do this first): decide whether the learner's LAST message really responds to your previous message and is a genuine attempt in English. Set "relevant": false when it is off-topic, ignores your question, answers something else, is random or meaningless text, is filler only ("ok", "yes", "I don't know", "asdf"), or is not written in English. When "relevant" is false: rubric.meaning must be 0 or 1; "reply" must NOT continue the conversation as if the answer were fine – say in one short sentence that the message does not answer the question, then ask the same question again in simpler words; "relevanceNote" = the reason in the explanation language (max 20 words); "suggestions" may be empty. When "relevant" is true, "relevanceNote" is an empty string.
CURT ANSWERS ARE IMPOLITE, NOT "INFORMAL": a single word, a bare keyword, a list of words, "ok" / "yes" / "fine", or anything that is not at least one real sentence is rude in a work conversation whatever the persona. Treat it as "relevant": false, rubric.meaning = 0, and in "reply" ask (in the persona's tone) for a full sentence, giving a short example sentence. "Informal" means friendly, relaxed COMPLETE sentences – never curtness.
"usedWords": list the target vocabulary words (from the target list) that the learner used CORRECTLY in the last message – inside a real sentence, with the right meaning and grammar. A bare keyword, a word dropped into a list, slang, or a wrong usage does NOT count; when "relevant" is false the list is empty.`;
const RELEVANCE_RULE_GRADE = '\nKiểm tra trước tiên: câu trả lời có đúng yêu cầu của đề không. Nếu lạc đề, trả lời một câu hỏi khác, là chuỗi vô nghĩa, chỉ chép lại đề, hoặc không phải tiếng Anh thì ok = false, score tối đa 2, và feedback phải nói rõ câu trả lời chưa đúng yêu cầu của đề (kể cả khi câu đó đúng ngữ pháp).';
/** Lesson sets are shared by a level, so they follow the persona most learners of that level picked. */
const levelPersona = cefr => { const L = activeLearners().filter(x => x.cefr === cefr); return L.filter(x => personaOf(x) === 'formal').length > L.length / 2 ? 'formal' : 'informal'; };
const personaToggle = u => `<span class="row" style="gap:4px;flex-wrap:nowrap" role="group" aria-label="Phong cách của Season">${Object.entries(PERSONAS).map(([k, [vi, en, tip]]) => `<button class="btn-sm ${personaOf(u) === k ? 'btn-primary' : ''}" data-action="persona-set" data-p="${k}" title="${tip}" aria-pressed="${personaOf(u) === k}">${en}</button>`).join('')}</span>`;
actions['persona-set'] = t => { const u = me(); if (personaOf(u) === t.dataset.p) return; u.persona = t.dataset.p; save(true); toast(`Season chuyển sang phong cách ${PERSONAS[u.persona][1]} (${PERSONAS[u.persona][0]})`, 'ok'); render(); };
/** Pick the Season line for the current learner's persona. */
const tone = (informal, formal) => personaOf(me()) === 'formal' ? formal : informal;

// ---- micro-lesson (theory / vocab[{e,v}] / practice) ----
const isMicroLesson = l => !!(l && (l.micro || l.theory !== undefined));
/** Practice may be a plain string (old records) or {type, prompt, options, answer}. */
function normPractice(p) {
  if (!p) return {type: 'write', prompt: '', options: [], answer: ''};
  if (typeof p === 'string') return {type: 'write', prompt: p.trim(), options: [], answer: ''};
  const type = ['write', 'fill', 'mcq', 'say'].includes(p.type) ? p.type : 'write';
  const options = Array.isArray(p.options) ? p.options.map(o => String(o).trim()).filter(Boolean) : [];
  return {type: type === 'mcq' && options.length < 2 ? 'write' : type, prompt: String(p.prompt || p.task || p.question || '').trim(), options, answer: String(p.answer || p.key || '').trim()};
}
const practiceText = p => normPractice(p).prompt;
// ---- English-only audio for theory + free vocabulary images (Wikipedia / Wikimedia Commons, no AI) ----
const hasVi = s => /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s || '');
const VI_PLAIN = new Set(['la', 'khi', 'dung', 'ban', 'nhu', 'voi', 'muon', 'mua', 'thu', 'xem', 'cua', 'cho', 'va', 'hay', 'de', 'co', 'khong', 'nghia', 'cau', 'tu', 'vi', 'du', 'cong', 'thuc']);
/** Pull the English pattern/example sentences out of a mixed VI/EN theory text. */
function englishLines(theory) {
  const t = String(theory || '').replace(/\([^)]*\)/g, m => hasVi(m) ? '' : m); // drop Vietnamese glosses in parentheses
  const tok = "(?:[A-Za-z][A-Za-z'’\\-]*|___|\\d+|\\$\\d+|\\([a-z][a-z ]*\\)|[,+])";
  const re = new RegExp(tok + '(?:\\s+' + tok + ')*[.!?]?', 'g');
  const out = []; let m;
  while ((m = re.exec(t))) {
    // skip fragments cut out of a Vietnamese word (e.g. "t mong mu" from "biểu đạt mong muốn")
    const before = t[m.index - 1] || ' ', after = t[m.index + m[0].length] || ' ';
    if (hasVi(before) || hasVi(after)) continue;
    const run = m[0].replace(/^[,+\s]+|[,+\s]+$/g, '').replace(/\s+,/g, ',');
    const words = run.split(/\s+/).filter(w => /[A-Za-z]/.test(w)); // "I" and "a" are words too: "I am a tester." is a full sentence
    if (words.length < 3 || words.filter(w => /[A-Za-z]{2,}/.test(w)).length < 2) continue;
    if (words.some(w => VI_PLAIN.has(w.toLowerCase()))) continue;
    if (/^(verb|noun|adjective)$/i.test(run)) continue;
    const clean = run.replace(/^(?:verb|noun)\s*=\s*/i, '');
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}
/** A grammar formula, not a sentence: has "+", "=", a blank, a bracketed slot, or grammar labels (Subject, verb, V-ing, S + V…). Formulas are shown but never read aloud. */
const isFormula = line => /[+=]|_{2,}|\.\.\.|…|\(|\)|\/|\[|\]/.test(line) || /\b(subject|verb|verbs|noun|nouns|adjective|adverb|object|pronoun|preposition|infinitive|gerund|V-?ing|V-?ed|to-?V|V[0-3]|Adj|Adv|sb|sth)\b/i.test(line) || /(^|\s)(S|V|O|N)(\s|$)/.test(line);
const spokenLines = theory => englishLines(theory).filter(l => !isFormula(l) && l.split(/\s+/).length >= 3);
/** Sentences the Grammar audio button reads: the lesson's own list of example sentences when it has one (new lessons), otherwise the sentences found in the theory text. Formulas are excluded either way. */
const exampleLines = m => { const ex = (m.examples || []).map(s => String(s || '').trim()).filter(s => s && !isFormula(s) && !hasVi(s)); return ex.length ? ex : spokenLines(m.theory); };
const speakable = s => s.replace(/___/g, ' blank ').replace(/[()]/g, ' ').replace(/\s+/g, ' ');
actions['say-en'] = t => { const lines = JSON.parse(t.dataset.lines || '[]'); if (!lines.length) return; speech.speak(lines.map(speakable).join('. ')); };
const IMG_CACHE_KEY = 'aec:img:';
const IMG_SOURCES = {pexels: 'Pexels (ảnh stock, cần key miễn phí)', pixabay: 'Pixabay (ảnh stock, cần key miễn phí)', openverse: 'Openverse (Creative Commons, không cần key)', wikimedia: 'Wikipedia / Wikimedia Commons (không cần key)', none: 'Tắt ảnh minh hoạ'};
async function stockImage(word) {
  const src = S.settings.imgSource || 'wikimedia'; const q = encodeURIComponent(word.trim());
  try {
    if (src === 'pexels' && S.settings.pexelsKey) { const r = await fetch(`https://api.pexels.com/v1/search?query=${q}&per_page=3&orientation=square&size=small`, {headers: {Authorization: S.settings.pexelsKey}}); if (r.ok) { const j = await r.json(); const p = (j.photos || [])[0]; return p ? (p.src.tiny || p.src.small) : ''; } }
    if (src === 'pixabay' && S.settings.pixabayKey) { const r = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(S.settings.pixabayKey)}&q=${q}&image_type=photo&safesearch=true&per_page=3`); if (r.ok) { const j = await r.json(); const h = (j.hits || [])[0]; return h ? h.previewURL : ''; } }
    if (src === 'openverse') { const r = await fetch(`https://api.openverse.org/v1/images/?q=${q}&page_size=3&mature=false&license_type=all-cc`, {headers: {accept: 'application/json'}}); if (r.ok) { const j = await r.json(); const it = (j.results || []).find(x => x.thumbnail || x.url); return it ? (it.thumbnail || it.url) : ''; } }
  } catch (e) { /* fall through */ }
  return null; // null = source unavailable → try Wikimedia fallback
}
async function vocabImage(word) {
  const src = S.settings.imgSource || 'wikimedia'; if (src === 'none') return '';
  const key = IMG_CACHE_KEY + src + ':' + word.toLowerCase(); try { const c = localStorage.getItem(key); if (c !== null) return c; } catch {}
  let url = '';
  if (src !== 'wikimedia') { const s = await stockImage(word); if (s) { try { localStorage.setItem(key, s); } catch {} return s; } if (s === '') { try { localStorage.setItem(key, ''); } catch {} return ''; } }
  const q = word.trim().replace(/\s+/g, '_');
  try { const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}?redirect=true`, {headers: {accept: 'application/json'}}); if (r.ok) { const j = await r.json(); if (j.thumbnail?.source && j.type !== 'disambiguation') url = j.thumbnail.source; } } catch {}
  if (!url) {
    const isBitmap = /^image\/(jpeg|png|webp)/;
    try {
      const u2 = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=' + encodeURIComponent(word + ' filetype:bitmap') + '&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=160&format=json&origin=*';
      const r = await fetch(u2);
      if (r.ok) { const j = await r.json(); const pages = Object.values((j.query && j.query.pages) || {}); const p = pages.map(x => (x.imageinfo || [])[0]).find(i => i && isBitmap.test(i.mime || '')); if (p) url = p.thumburl || p.url; }
    } catch (e) { /* no image */ }
  }
  try { localStorage.setItem(key, url); } catch {}
  return url;
}
function hydrateVocabImages() {
  $$('[data-vocab-img]').forEach(async el => {
    const word = el.dataset.vocabImg; delete el.dataset.vocabImg;
    const url = await vocabImage(word); if (!url) return;
    const img = document.createElement('img'); img.src = url; img.alt = word; img.className = 'vimg'; img.loading = 'lazy'; img.title = 'Ảnh: ' + (IMG_SOURCES[S.settings.imgSource || 'wikimedia'] || '').split(' (')[0]; img.onerror = () => img.remove();
    el.replaceWith(img);
  });
}
/** Fill-in items must have exactly one answer: if the prompt has no hint after ___, add the answer's Vietnamese meaning from vocab, e.g. "I want to ___ (mua) a T-shirt". Keeps a single answer. */
function ensureFillHint(p, vocab) {
  const n = normPractice(p); if (n.type !== 'fill' || !n.prompt.includes('___')) return n;
  const first = String(n.answer || '').split(/\s*\/\s*/)[0].trim(); n.answer = first;
  if (/___\s*\(/.test(n.prompt) || !first) return n;
  const v = (vocab || []).find(x => normAns(x.e) === normAns(first)); const hint = v?.v || '';
  if (hint) n.prompt = n.prompt.replace('___', `___ (${hint})`);
  return n;
}
function fixLessonPractice(l) { if (l && l.practice && typeof l.practice === 'object' && l.practice.type === 'fill') l.practice = ensureFillHint(l.practice, l.vocab); }
const normAns = s => String(s || '').toLowerCase().replace(/[“”"'.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
/** answer key may list several accepted answers: "buy / try" or "buy, try" */
const keyList = key => String(key || '').split(/\s*(?:\/|\||;)\s*|,\s+/).map(normAns).filter(Boolean);
const matchesKey = (answer, key) => { const a = normAns(answer); return keyList(key).some(k => k === a); };
// ---- lesson structure: 4 skills (Listening, Reading, Writing, Speaking) + 3 components (Vocabulary, Grammar, Pronunciation) ----
const MAX_ATTEMPTS = 2;
const PART_NAMES = {L: ['Nghe', 'Listening'], R: ['Đọc', 'Reading'], W: ['Viết', 'Writing'], C: ['Từ loại', 'Word class'], U: ['Dùng từ', 'Word use'], S: ['Nói', 'Speaking']};
const SKILL_CODES = ['L', 'R', 'W', 'S']; // the four skills; C and U are vocabulary exercises
/** Exercises of a lesson in learning order: Listening → Reading → Writing → Word class → Word use → Speaking. Lessons generated before the 4-skill structure only have the writing part. */
function lessonParts(l) {
  const out = [];
  if (l.listening) out.push({code: 'L', practice: normPractice({type: 'mcq', ...l.listening}), context: 'Đoạn nghe (listening audio): ' + l.listening.audio});
  if (l.reading) out.push({code: 'R', practice: normPractice({type: 'mcq', ...l.reading}), context: 'Đoạn đọc (reading text): ' + l.reading.text});
  if (normPractice(l.practice).prompt) out.push({code: 'W', practice: normPractice(l.practice), context: ''});
  if (l.wordclass && normPractice({type: 'mcq', ...l.wordclass}).type === 'mcq') out.push({code: 'C', practice: normPractice({type: 'mcq', ...l.wordclass}), context: 'Bài tập từ loại (word class)'});
  if (l.worduse && normPractice({type: 'mcq', ...l.worduse}).type === 'mcq') out.push({code: 'U', practice: normPractice({type: 'mcq', ...l.worduse}), context: 'Bài tập cách dùng từ (word use)'});
  if (l.speaking) out.push({code: 'S', practice: {type: 'say', prompt: l.speaking.prompt || '', options: [], answer: l.speaking.answer || ''}, context: ''});
  return out;
}
/** Vocabulary details / new exercises an older lesson still lacks (filled by "Bổ sung bằng AI" on the set page). */
const detailsMissing = l => isMicroLesson(l) && ((l.vocab || []).some(v => !v.pos || ['umbrella', 'syn', 'ant', 'slang', 'poetic'].some(k => lexStale(v, k))) || !l.wordclass || !l.worduse || ['listening', 'reading'].some(k => l[k] && ((l[k].options || []).length < 4 || (l[k].options || []).some(o => PLACE_RE.test(o)))));
/** Standard structure: 4 skills + vocabulary, grammar, pronunciation. */
const isFullLesson = l => isMicroLesson(l) && SKILL_CODES.every(c => lessonParts(l).some(p => p.code === c)) && !!l.pron && (l.vocab || []).length > 0 && !!l.theory;
const partKey = (id, code) => code === 'W' ? id : id + '~' + code;
/** {attempts, ok, done}: done = answered correctly, or all attempts used (only then the answer is shown). */
function resState(res) {
  if (!res || (res.localOk === undefined && !res.grade && !res.attempts)) return {attempts: 0, ok: null, done: false};
  const ok = res.ok ?? (res.grade ? !!res.grade.ok : !!res.localOk); const attempts = res.attempts || 1;
  return {attempts, ok, done: ok || attempts >= MAX_ATTEMPTS};
}
/** Spoken sentence vs model sentence: ok when at most 20% of the model words are missing. */
function sayMatch(said, model) { const w = s => normAns(s).split(' ').filter(Boolean); const have = new Set(w(said)); const need = w(model); const missing = need.filter(x => !have.has(x)); return {ok: need.length > 0 && missing.length / need.length <= 0.2, missing}; }

// ---- audio files: recordings are kept as files in IndexedDB of this browser (too large for localStorage / JSON export) ----
const audioStore = {
  db: null,
  open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('aec-audio', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async put(id, blob) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); },
  async get(id) { const db = await this.open(); return new Promise((res, rej) => { const rq = db.transaction('files').objectStore('files').get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); }); }
};
actions['audio-play'] = async t => { const b = await audioStore.get(t.dataset.id).catch(() => null); if (!b) { toast('File ghi âm không có trên trình duyệt này (file nằm trên máy của người nộp).', 'err'); return; } const a = new Audio(URL.createObjectURL(b)); a.play().catch(() => toast('Trình duyệt không phát được định dạng file này', 'err')); };
/** In-page recording that produces an audio file (so the learner does not have to leave the page to record). */
const recorder = {
  mr: null,
  can: () => !!(navigator.mediaDevices && window.MediaRecorder),
  async toggle(btn, onFile) {
    if (this.mr) { this.mr.stop(); return; }
    micGraceUntil = Date.now() + 8000; // the permission prompt may blur the page
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); } catch (e) { toast('Không dùng được micro – hãy tải file ghi âm lên', 'err'); return; }
    const chunks = []; const mr = new MediaRecorder(stream); const orig = btn.innerHTML; this.mr = mr;
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => { stream.getTracks().forEach(x => x.stop()); this.mr = null; btn.innerHTML = orig; btn.classList.remove('btn-danger'); const type = (mr.mimeType || 'audio/webm').split(';')[0]; onFile(new File(chunks, 'ghi-am-' + Date.now() + (/mp4|aac/.test(type) ? '.m4a' : /ogg/.test(type) ? '.ogg' : '.webm'), {type})); };
    mr.start(); btn.innerHTML = '⏹ Dừng ghi'; btn.classList.add('btn-danger');
  }
};
/** Validate + store an audio file, show its name, and fill the transcript box when the AI provider can transcribe. Returns the file meta or null. */
async function takeAudio(file, id, ta, label) {
  if (!file) return null;
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|ogg|oga|webm|aac|flac|amr|3gp)$/i.test(file.name)) { toast('Hãy chọn file âm thanh (mp3, m4a, wav, webm…)', 'err'); return null; }
  if (file.size > 20 * 1048576) { toast('File quá lớn (tối đa 20 MB)', 'err'); return null; }
  try { await audioStore.put(id, file); } catch (e) { console.warn('audio not stored', e); }
  const meta = {id, name: file.name, size: file.size, at: new Date().toISOString()};
  const shown = `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB`;
  if (ta && ai.canTranscribe()) {
    if (label) label.innerHTML = '<span class="spinner"></span> Đang chép lời từ file…';
    try { ta.value = await ai.transcribe(file); meta.transcribed = true; } catch (e) { toast(e.message + ' Hãy gõ lại nội dung bạn đã nói.', 'err'); ta.readOnly = false; }
  }
  if (label) label.textContent = shown;
  return meta;
}

/** Re-render the current screen without losing the scroll position or what is typed in the other exercise boxes. */
function rerenderKeep() { const y = window.scrollY; const vals = $$('[id^="mp-"]').filter(e => 'value' in e && e.type !== 'file').map(e => [e.id, e.value]); render(); vals.forEach(([id, v]) => { const e = document.getElementById(id); if (e && !e.disabled && !e.value) e.value = v; }); window.scrollTo(0, y); }
/** Explanations must never contain the correct answer while attempts remain: mask it if the AI wrote it anyway. */
function maskAnswer(text, p) {
  if (!text || !p.answer) return text || ''; const q = p.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return p.type === 'write' ? text.replace(new RegExp(q, 'gi'), '▢▢▢') : text.replace(new RegExp('(^|[^A-Za-z])' + q + '(?![A-Za-z])', 'gi'), (m, pre) => pre + '▢▢▢');
}
/** Stronger hints as attempts go up, without giving the answer (length, first letters, where to look). */
function ladderHint(p, attempts, vi) {
  const a = String(p.answer || ''); const T2 = (x, y) => vi ? x : y; if (!a || attempts < 2) return '';
  if (p.type === 'fill') return attempts >= 4 ? T2(`từ cần điền có ${a.length} chữ cái và bắt đầu bằng "${a.slice(0, 2)}…"`, `the word has ${a.length} letters and starts with "${a.slice(0, 2)}…"`) : attempts === 3 ? T2(`từ cần điền có ${a.length} chữ cái, chữ đầu là "${a[0]}"`, `the word has ${a.length} letters; the first one is "${a[0]}"`) : T2('đọc lại nghĩa trong ngoặc rồi tìm từ đó ở phần Từ vựng', 'reread the meaning in brackets and find that word in Vocabulary');
  if (p.type === 'mcq') return T2('các lựa chọn bạn đã thử sai được gạch đi; so từng lựa chọn còn lại với nội dung đã nghe/đọc', 'the options you already tried are crossed out; compare each remaining one with what you heard/read');
  if (p.type === 'write') return attempts >= 3 ? T2(`câu mẫu có ${wordCount(a)} từ và bắt đầu bằng "${a.split(/\s+/)[0]}…"`, `the model sentence has ${wordCount(a)} words and starts with "${a.split(/\s+/)[0]}…"`) : T2('đối chiếu từng thành phần của câu bạn viết với công thức ở phần Ngữ pháp', 'check each part of your sentence against the pattern in Grammar');
  return '';
}
// ---- pronunciation drill: listen to and repeat the 3 target-sound words before recording is enabled ----
const drillWords = m => m.pron ? [...new Set((m.pron.words || []).map(x => String(x || '').trim()).filter(Boolean))].slice(0, 3) : []; // only words checked to contain the target sound (no filling up from vocab)
const drilled = id => ((S.practiceResults || {})[me().id + '_' + id + '~P'] || {}).drilled || [];
const drillDone = (id, m) => drillWords(m).every(w => drilled(id).includes(w));
actions.drill = t => {
  const id = t.dataset.key, w = t.dataset.w, u = me(); speech.speakWord(w); const found = S.microLessons.find(x => x.id === id && x.userId === u.id) || lessonById(id)?.lesson; if (!found) return;
  const k = u.id + '_' + id + '~P'; S.practiceResults = S.practiceResults || {}; const got = S.practiceResults[k]?.drilled || []; if (got.includes(w)) return;
  S.practiceResults[k] = {drilled: [...got, w]}; save();
  if (drillDone(id, found)) { toast(tone('Luyện đủ 3 từ rồi! Phần Nói đã mở ghi âm.', 'Đã luyện đủ 3 từ. Phần Nói đã mở ghi âm.'), 'ok'); rerenderKeep(); }
  else { t.classList.add('good'); const c = document.getElementById('drill-count-' + id); if (c) c.textContent = `${drilled(id).filter(x => drillWords(found).includes(x)).length}/${drillWords(found).length}`; }
};
// ---- grading appeals: the learner reports a wrong AI verdict (reason required) and an operator reviews it by hand ----
const appeals = () => (S.appeals = S.appeals || []);
const appealFor = (userId, kind, ref) => appeals().filter(a => a.userId === userId && a.kind === kind && a.ref === ref).sort((a, b) => b.at.localeCompare(a.at))[0];
const APPEAL_STATUS = {pending: ['warn', 'Chờ Người vận hành duyệt'], upheld: ['ok', 'Đã duyệt lại – chấp nhận'], rejected: ['danger', 'Giữ nguyên kết quả']};
const appealReason = async title => { const r = await promptDlg(title, {label: 'Lý do (bắt buộc): vì sao bạn cho rằng AI chấm chưa đúng?', okLabel: 'Gửi báo cáo', multiline: true}); if (r === null) return null; if (r.trim().length < 5) { toast('Cần ghi rõ lý do thì mới gửi báo cáo được', 'err'); return null; } return r.trim(); };
/** Status line / report button shown under a graded result. */
function appealLine(kind, ref, action, canReport) {
  const a = appealFor(me().id, kind, ref);
  if (a) return `<div class="small" style="margin-top:8px"><span class="badge ${APPEAL_STATUS[a.status][0]}">${APPEAL_STATUS[a.status][1]}</span> <span class="muted">Bạn báo cáo: “${esc(a.reason)}”${a.note ? ` · Vận hành: “${esc(a.note)}”` : ''}</span></div>`;
  return canReport ? `<div style="margin-top:8px"><button type="button" class="btn-sm" data-action="${action}" data-ref="${esc(ref)}" title="Gửi cho Người vận hành xem lại bằng tay">Báo cáo: AI chấm sai</button></div>` : '';
}
actions['appeal-part'] = async t => {
  const key = t.dataset.ref; const tgt = practiceTarget(key); if (!tgt) return; const u = me(); const r = tgt.get(); const p = normPractice(tgt.m.practice);
  const reason = await appealReason('Báo cáo kết quả chấm phần ' + PART_NAMES[tgt.code][0]); if (!reason) return;
  appeals().push({id: uid('ap'), userId: u.id, userName: u.name, kind: 'part', ref: key, title: tgt.m.title || '', part: PART_NAMES[tgt.code][0], question: p.prompt, options: p.options, key: p.answer, answer: r.answer || '', aiFeedback: r.grade?.feedback || '', attempts: resState(r).attempts, reason, at: new Date().toISOString(), status: 'pending'});
  save(true); toast('Đã gửi báo cáo cho Người vận hành', 'ok'); rerenderKeep();
};
actions['appeal-sub'] = async t => {
  const s = S.submissions.find(x => x.id === t.dataset.ref); const u = me(); if (!s) return;
  const reason = await appealReason('Báo cáo điểm bài thực hành cuối tuần'); if (!reason) return;
  appeals().push({id: uid('ap'), userId: u.id, userName: u.name, kind: 'sub', ref: s.id, title: `Bài thực hành tuần ${s.week}`, part: 'Bài tuần', question: s.task, options: [], key: '', answer: s.text, aiFeedback: `${s.total}/100 · ${s.feedback || ''}`, attempts: 1, reason, at: new Date().toISOString(), status: 'pending'});
  save(true); toast('Đã gửi báo cáo cho Người vận hành', 'ok'); render();
};
actions['appeal-decide'] = async t => {
  const a = appeals().find(x => x.id === t.dataset.id); if (!a || a.status !== 'pending') return; const ok = t.dataset.ok === '1'; const actor = me(); let note = '';
  if (a.kind === 'sub' && ok) {
    const s = S.submissions.find(x => x.id === a.ref); if (!s) { toast('Không còn bài nộp này', 'err'); return; }
    const v = await promptDlg('Chấm lại bằng tay', {label: `Điểm mới (0–100). Điểm AI chấm: ${s.total}`, value: String(s.total ?? ''), type: 'number', okLabel: 'Lưu điểm mới'}); if (v === null) return; if (v === '' || isNaN(+v)) { toast('Nhập điểm 0–100', 'err'); return; }
    note = `Điểm ${s.total} → ${clamp(Math.round(+v), 0, 100)}`; s.total = clamp(Math.round(+v), 0, 100); s.manualReview = {by: actor.id, at: new Date().toISOString()}; s.aiGraded = false;
  } else if (ok) { // exercise part: count the learner's answer as correct
    const mic = S.microLessons.find(x => x.id === a.ref && x.userId === a.userId); const patch = {ok: true, localOk: true, done: true, manual: {by: actor.id, at: new Date().toISOString()}};
    if (mic) Object.assign(mic, patch); else { S.practiceResults = S.practiceResults || {}; const k = a.userId + '_' + a.ref; S.practiceResults[k] = {...(S.practiceResults[k] || {}), ...patch}; }
  } else { const v = await promptDlg('Giữ nguyên kết quả', {label: 'Giải thích cho học viên (bắt buộc)', okLabel: 'Gửi', multiline: true}); if (v === null) return; if (!v.trim()) { toast('Cần ghi giải thích cho học viên', 'err'); return; } note = v.trim(); }
  Object.assign(a, {status: ok ? 'upheld' : 'rejected', note, decidedBy: actor.id, decidedByName: actor.name, decidedAt: new Date().toISOString()}); save(true); toast(ok ? 'Đã chấp nhận kháng nghị' : 'Đã giữ nguyên kết quả', 'ok'); render();
};
// ---- translation shown with every correct answer: Vietnamese for the question and for the answer ----
const transBusy = new Set(), transFailed = new Set();
const lessonBase = id => S.microLessons.find(x => x.id === id && x.userId === me()?.id) || lessonById(id)?.lesson || null;
function transBlock(m, code, baseId) {
  const t = (m.trans || {})[code]; const k = baseId + '~' + code;
  if (t && (t.q || t.a)) return `<div class="why" style="margin-top:6px;padding-top:6px;border-top:2px dashed var(--border)"><b>Bản dịch</b>${t.q ? `<br>Câu hỏi: ${esc(t.q)}` : ''}${t.a ? `<br>Đáp án: ${esc(t.a)}` : ''}</div>`;
  if (ai.hasKey() && !transFailed.has(k)) return `<div class="why muted" style="margin-top:6px" data-trans-wait="${esc(k)}"><span class="spinner"></span> Đang lấy bản dịch câu hỏi và đáp án…</div>`;
  return `<div class="why muted" style="margin-top:6px">Chưa có bản dịch cho câu này (${ai.hasKey() ? 'AI không trả về bản dịch' : 'bài soạn trước khi có tính năng dịch và chưa kết nối AI'}).</div>`;
}
/** Lessons generated before translations existed get them on demand, once, and keep them in the lesson itself. */
async function ensureTrans(k) {
  if (transBusy.has(k) || transFailed.has(k)) return; const [id, code] = k.split('~'); const base = lessonBase(id); if (!base || (base.trans || {})[code]) return;
  const part = lessonParts(base).find(p => p.code === code); if (!part) return; transBusy.add(k);
  try {
    const r = await ai.call({system: 'Chỉ trả về JSON {"q":"...","a":"..."}, không giải thích. Dịch sang tiếng Việt tự nhiên, ngắn gọn. "q" = bản dịch của đề bài/câu hỏi (đề đã là tiếng Việt thì giữ nguyên; đề là câu điền từ thì dịch cả câu đã điền đúng). "a" = bản dịch của đáp án đúng.', user: `${part.context ? part.context + '\n' : ''}Đề: ${part.practice.prompt}${part.practice.options.length ? '\nLựa chọn: ' + part.practice.options.join(' / ') : ''}\nĐáp án đúng: ${part.practice.answer}`, schema: {type: 'object', additionalProperties: false, required: ['q', 'a'], properties: {q: {type: 'string'}, a: {type: 'string'}}}, effort: 'low', maxTokens: 400, noBase: true, lean: true});
    const q = String(r.json?.q || '').trim(), a = String(r.json?.a || '').trim(); if (!q && !a) throw new Error('empty');
    base.trans = {...(base.trans || {}), [code]: {q, a}}; save(true); transBusy.delete(k); if (document.querySelector(`[data-trans-wait="${k}"]`)) rerenderKeep();
  } catch (e) { transBusy.delete(k); transFailed.add(k); const el = document.querySelector(`[data-trans-wait="${k}"]`); if (el) el.textContent = 'Chưa lấy được bản dịch lúc này (' + String(e.message || '').slice(0, 80) + ').'; }
}
function hydrateTranslations() { $$('[data-trans-wait]').forEach(el => ensureTrans(el.dataset.transWait)); }
/** Answer box for one exercise (adapts to type) with the attempt rule: wrong → explanation → retry, answer shown only when done. */
function practiceBox(key, m, res, vi) {
  const p = normPractice(m.practice); const g = res?.grade; const ans = res?.answer || ''; const st = resState(res); const tried = st.attempts > 0; const code = key.split('~')[1] || 'W';
  const lock = st.done ? 'disabled' : '';
  const hint = {L: vi ? 'Nghe lại đoạn audio, chú ý từ khoá có trong câu hỏi.' : 'Listen again and focus on the key words of the question.', R: vi ? 'Đọc lại đoạn văn, tìm câu chứa thông tin được hỏi.' : 'Read the text again and find the sentence with that information.', W: vi ? 'Xem lại công thức ở phần Ngữ pháp và gợi ý trong đề.' : 'Check the pattern in Grammar and the hint in the task.', C: vi ? 'Xem từ loại ghi cạnh từ vựng ở phần Học: danh từ chỉ người/vật, động từ chỉ hành động, tính từ mô tả.' : 'Check the part of speech shown next to the word in the study section: nouns name things, verbs are actions, adjectives describe.', U: vi ? 'Xem lại 3 cụm từ đi kèm từ vựng: từ đó thường đứng cạnh những từ nào?' : 'Look at the 3 phrases of the word: which words usually go next to it?', S: ''}[code];
  const reveal = st.done && p.answer ? `<div class="fix">${p.type === 'write' || p.type === 'say' ? (vi ? 'Câu mẫu' : 'Model answer') : (vi ? 'Đáp án' : 'Answer')}: <span class="hl">${esc(p.answer)}</span></div>` : '';
  const result = tried ? `<div class="correction" style="max-width:100%;margin-top:10px;background:${st.ok ? 'var(--mint)' : st.done ? 'var(--peach)' : 'var(--butter)'}"><div class="row between"><span class="ttl">${st.ok ? (res?.manual ? (vi ? 'Vận hành đã duyệt lại: tính đúng' : 'Reviewed by the operator: counted as correct') : vi ? tone('Đúng rồi!', 'Chính xác.') : tone('Correct!', 'That is correct.')) : st.done ? (vi ? `Hết ${MAX_ATTEMPTS} lượt – xem đáp án` : 'No attempts left – see the answer') : (vi ? tone('Chưa đúng – đọc gợi ý rồi làm lại nhé', 'Chưa chính xác. Vui lòng đọc gợi ý và làm lại.') : tone('Not yet – read the hint and try again', 'Not correct yet. Please read the hint and try again.'))}</span><span class="chip ${st.ok ? 'good' : st.done ? 'low' : 'mid'}">${vi ? 'Lần' : 'Attempt'} ${st.attempts}/${MAX_ATTEMPTS}</span></div>
      ${g?.feedback ? `<div class="why">${esc(st.done ? g.feedback : maskAnswer(g.feedback, p))}</div>` : (!st.ok && hint ? `<div class="why">${hint}</div>` : '')}${!st.done && ladderHint(p, st.attempts, vi) ? `<div class="why">${vi ? 'Gợi ý thêm' : 'Extra hint'}: ${esc(ladderHint(p, st.attempts, vi))}.</div>` : ''}${reveal}${st.ok && SKILL_CODES.includes(code) ? transBlock(m, code, key.split('~')[0]) : st.ok && (m.trans || {})[code] ? transBlock(m, code, key.split('~')[0]) : ''}${st.done && g?.fix && normAns(g.fix) !== normAns(ans) && normAns(g.fix) !== normAns(p.answer) ? `<div class="fix">✓ <span class="hl">${esc(g.fix)}</span></div>` : ''}</div>` : '';
  let input = '';
  const baseId = key.split('~')[0]; const needDrill = p.type === 'say' && !st.done && !drillDone(baseId, m); // recording stays locked until the pronunciation drill is done
  const triedWrong = (res?.tried || []).map(normAns); // options already tried and wrong are crossed out (a hint that does not reveal the answer)
  if (p.type === 'mcq') input = `<div>${p.options.map((o, i) => { const mine = normAns(ans) === normAns(o); const out = !st.done && !mine && triedWrong.includes(normAns(o)); return `<label class="opt ${mine ? (tried ? (st.ok ? 'correct' : 'wrong') : 'sel') : (st.done && matchesKey(o, p.answer) ? 'correct' : out ? 'wrong' : '')}" style="${out || (mine && tried && !st.ok && !st.done) ? 'text-decoration:line-through;opacity:.65' : ''}"><input type="radio" name="mp-${key}" value="${esc(o)}" ${mine && st.done ? 'checked' : ''} ${lock || (out || (mine && tried && !st.ok) ? 'disabled' : '')}><span>${'ABCD'[i] || ''}. ${esc(o)}</span></label>`; }).join('')}</div>`;
  else if (p.type === 'fill') input = `<input id="mp-${key}" value="${esc(ans)}" placeholder="${vi ? 'Điền từ vào chỗ ___' : 'Type the missing word'}" autocomplete="off" style="max-width:360px" ${lock}>`;
  else if (needDrill) input =`<div class="card soft small" style="font-weight:700">🔒 ${vi ? `Luyện đủ ${drillWords(m).length} từ ở phần <b>Phát âm</b> phía trên trước (bấm từng từ để nghe và đọc theo). Xong thì nút Ghi âm mới mở.` : `Drill the ${drillWords(m).length} words in <b>Pronunciation</b> above first (tap each word, listen and repeat). Recording unlocks after that.`} <b>${drilled(baseId).filter(x => drillWords(m).includes(x)).length}/${drillWords(m).length}</b></div>`;
  else if (p.type === 'say') { const a = res?.audio;
    input = `<div class="row" style="gap:8px">${recorder.can() ? `<button type="button" class="btn-sm" data-action="mp-rec" data-key="${key}" ${lock}>${ICONS.mic} ${vi ? 'Ghi âm' : 'Record'}</button>` : ''}<label class="btn btn-sm" ${st.done ? 'style="opacity:.5;pointer-events:none"' : ''}>${vi ? 'Tải file ghi âm' : 'Upload audio file'}<input type="file" accept="audio/*" hidden data-change="mp-audio" data-key="${key}"></label><span class="xs muted" id="mp-audio-${key}">${a ? esc(a.name) : (vi ? 'chưa có file' : 'no file yet')}</span>${a ? `<button type="button" class="btn-sm btn-ghost" data-action="audio-play" data-id="${esc(a.id)}" title="Nghe lại file">${ICONS.sound}</button>` : ''}</div>
      <textarea id="mp-${key}" style="min-height:60px;margin-top:8px" ${ai.canTranscribe() ? 'readonly' : ''} ${lock} placeholder="${ai.canTranscribe() ? (vi ? 'Lời chép từ file ghi âm sẽ hiện ở đây' : 'The transcript of your file appears here') : (vi ? 'AI hiện không chép lời được: gõ lại đúng câu bạn đã nói trong file' : 'No transcription available: type exactly what you said in the file')}">${esc(ans)}</textarea>`; }
  else input = `<textarea id="mp-${key}" style="min-height:80px" ${lock} placeholder="${vi ? 'Viết câu áp dụng mẫu câu trong phần Ngữ pháp…' : 'Write your sentence using the pattern above…'}">${esc(ans)}</textarea>`;
  return `<div class="card flat" style="margin-top:10px" id="mp-box-${key}" data-ptype="${p.type}">
    <div class="eyebrow" style="margin-bottom:6px">${vi ? 'Bài làm của bạn' : 'Your answer'} <span class="badge" style="margin-left:6px">${{write: vi ? 'tự viết' : 'write', fill: vi ? 'điền từ' : 'fill in', mcq: vi ? 'trắc nghiệm' : 'multiple choice', say: vi ? 'file ghi âm' : 'audio file'}[p.type]}</span></div>
    ${input}
    <div class="row" style="margin-top:8px">${st.done || needDrill ? '' : `<button class="btn-primary" data-action="mp-submit" data-key="${key}">${tried ? (vi ? `Làm lại (lần ${st.attempts + 1}/${MAX_ATTEMPTS})` : `Try again (${st.attempts + 1}/${MAX_ATTEMPTS})`) : (vi ? 'Nộp bài' : 'Submit')}</button>`}<span class="xs muted" id="mp-status-${key}">${ai.hasKey() || st.done ? '' : (vi ? 'Chưa kết nối AI – chấm theo đáp án, giải thích ngắn.' : 'AI not connected – answer key only.')}</span></div>
    ${result}${tried ? appealLine('part', key, 'appeal-part', !st.ok && !res?.manual) : ''}</div>`;
}
let lessonPhase = 'study'; /* learner view of a lesson: 'study' (vocab → grammar → pronunciation) or 'practice' (exercises) */
const POS_VI = {noun: 'danh từ', verb: 'động từ', adjective: 'tính từ', adverb: 'trạng từ', preposition: 'giới từ', phrase: 'cụm từ', 'phrasal verb': 'cụm động từ', pronoun: 'đại từ', conjunction: 'liên từ', determiner: 'từ hạn định', interjection: 'thán từ'};
const posLabel = (pos, vi) => pos ? (vi ? (POS_VI[String(pos).toLowerCase()] || pos) : pos) : '';
const studiedOf = (u, key) => !!u && (!!(u.studied && u.studied[key]) || !!userProgress(u.id, key)?.completedAt || Object.keys(S.practiceResults || {}).some(k => k.startsWith(u.id + '_' + key) && resState(S.practiceResults[k]).attempts > 0)); // lessons completed or started before the study step existed stay open
/** Vocabulary details: part of speech, word family, umbrella word, synonyms / antonyms (same level), and for B1+ synonyms of every level, slang and poetic words. */
function vocabDetails(v, m, i, isVi, practiceKey) {
  const T2 = (a, b) => isVi ? a : b; const hi = !isLow(m.cefr); const bits = []; const umb = umbrellaOf(v.umbrella); const sl = slangOf(v.slang), po = poeticOf(v.poetic);
  const lex = (x, sign, cls, title) => bits.push(`<button class="chip ${cls}" data-action="say" data-text="${esc(x.w)}" style="cursor:pointer" title="${title}">${sign} ${esc(x.w)}${x.v ? ` <span class="muted">(${esc(x.v)})</span>` : ''}</button>`);
  lexList(v.syn).forEach(x => lex(x, '=', 'good', T2('Đồng nghĩa', 'Synonym'))); // synonyms always with their meaning; antonyms only when the word really has one
  lexList(v.ant).forEach(x => lex(x, '≠', 'low', T2('Trái nghĩa', 'Antonym')));
  if (umb) bits.unshift(`<button class="chip umb" data-action="vocab-umbrella" data-id="${esc(m.id)}" data-i="${i}" style="cursor:pointer" title="${T2('Từ bao trùm và các từ cùng nhóm', 'Umbrella word and words in the same group')}">☂ <span class="umb-lbl">${T2('Từ bao trùm', 'Umbrella')}</span> <b>${esc(umb.w)}</b>${umb.v ? ` <span class="muted">(${esc(umb.v)})</span>` : ''}${umb.words.length ? ` <span class="umb-n">+${umb.words.length}</span>` : ''}</button>`); // first and highlighted: the umbrella word is the anchor of the group
  if ((v.family || []).length) bits.push(`<button class="chip" data-action="vocab-family" data-id="${esc(m.id)}" data-i="${i}" style="cursor:pointer">👪 ${T2('Word family', 'Word family')} (${v.family.length})</button>`);
  if (hi && (v.synAll || []).length) bits.push(`<button class="chip" data-action="vocab-synall" data-id="${esc(m.id)}" data-i="${i}" style="cursor:pointer">Synonyms – every level (${v.synAll.length})</button>`);
  if (hi && sl) bits.push(`<button class="chip" data-action="vocab-slang" data-id="${esc(m.id)}" data-i="${i}" style="cursor:pointer;background:var(--peach)" title="Slang / informal – ${T2('bấm xem định nghĩa, ví dụ, bối cảnh', 'tap for definition, example, context')}">🗣 slang: ${esc(sl.w)}</button>`);
  if (hi && po) bits.push(`<button class="chip" data-action="vocab-poetic" data-id="${esc(m.id)}" data-i="${i}" style="cursor:pointer;background:var(--primary-soft)" title="Poetic / literary – ${T2('bấm xem định nghĩa, ví dụ, tác phẩm', 'tap for definition, example, source')}">🪶 poetic: ${esc(po.w)}</button>`);
  if (!bits.length) return practiceKey ? '' : `<div class="xs muted" style="margin-top:4px">${T2('Chưa có từ loại / đồng nghĩa – bấm "Bổ sung bằng AI" ở bộ bài', 'No word class / synonyms yet – use "Bổ sung bằng AI" on the set page')}</div>`;
  return `<div class="chips" style="margin-top:6px;gap:4px">${bits.join('')}</div>`;
}
const vocabOf = (id, i) => { const base = lessonBase(id) || lessonById(id)?.lesson; return base && (base.vocab || [])[i] ? {base, v: base.vocab[i]} : null; };
actions['vocab-family'] = t => { const f = vocabOf(t.dataset.id, +t.dataset.i); if (!f) return; const vi = isLow(f.base.cefr); openModal(`<div class="row between"><h3>👪 Word family: <span class="name">${esc(f.v.e)}</span></h3><button class="btn-sm" data-action="modal-close">Đóng</button></div><p class="small muted">${vi ? 'Các từ cùng gốc, khác từ loại.' : 'Words with the same root in other parts of speech.'}</p><div class="list">${f.v.family.map(x => `<div class="item"><div class="body"><div class="title">${esc(x.w)} <span class="badge">${esc(posLabel(x.pos, vi))}</span></div>${x.v ? `<div class="xs muted">${esc(x.v)}</div>` : ''}</div><button class="btn-sm btn-ghost" data-action="say" data-text="${esc(x.w)}">${ICONS.sound}</button></div>`).join('')}</div>`); };
actions['vocab-synall'] = t => { const f = vocabOf(t.dataset.id, +t.dataset.i); if (!f) return; const lv = {A1: 'var(--butter)', A2: 'var(--butter)', B1: 'var(--mint)', B2: 'var(--primary-soft)', C1: 'var(--peach)', C2: 'var(--peach)'}; openModal(`<div class="row between"><h3>Synonyms of <span class="name">${esc(f.v.e)}</span></h3><button class="btn-sm" data-action="modal-close">Đóng</button></div><p class="small muted">Lower, same and higher level than ${esc(f.base.cefr)}; pick the register that fits your situation.</p><div class="list">${f.v.synAll.map(x => `<div class="item"><div class="body"><div class="title">${esc(x.w)} <span class="badge" style="background:${lv[x.level] || 'var(--surface-2)'}">${esc(x.level || '?')}</span></div>${x.note ? `<div class="xs muted">${esc(x.note)}</div>` : ''}</div><button class="btn-sm btn-ghost" data-action="say" data-text="${esc(x.w)}">${ICONS.sound}</button></div>`).join('')}</div>`); };
actions['vocab-umbrella'] = t => { const f = vocabOf(t.dataset.id, +t.dataset.i); if (!f) return; const u = umbrellaOf(f.v.umbrella); if (!u) return; const vi = isLow(f.base.cefr); const row = (w, v, mark) => `<div class="item"><div class="body"><div class="title">${esc(w)}${mark ? ` <span class="badge primary">${mark}</span>` : ''}</div>${v ? `<div class="xs muted">${esc(v)}</div>` : ''}</div><button class="btn-sm btn-ghost" data-action="say" data-text="${esc(w)}">${ICONS.sound}</button></div>`;
  openModal(`<div class="row between"><h3>☂ ${esc(u.w)}${u.v ? ` <span class="muted small">– ${esc(u.v)}</span>` : ''}</h3><button class="btn-sm" data-action="modal-close">Đóng</button></div><p class="small muted">${vi ? `"${esc(u.w)}" là từ bao trùm (nhóm nghĩa rộng hơn) của "${esc(f.v.e)}". Các từ dưới đây cùng nằm trong nhóm đó.` : `"${esc(u.w)}" is the umbrella word (broader category) of "${esc(f.v.e)}". The words below belong to the same group.`}</p><div class="list">${row(f.v.e, f.v.v, vi ? 'từ của bài' : 'this lesson')}${u.words.map(x => row(x.w, x.v)).join('')}${!u.words.length ? `<p class="xs muted">${vi ? 'Chưa có từ cùng nhóm – bấm "Bổ sung bằng AI" ở bộ bài.' : 'No group words yet – use "Bổ sung bằng AI" on the set page.'}</p>` : ''}</div>`); };
const lexModal = (title, icon, x, rows, vi) => openModal(`<div class="row between"><h3>${icon} ${title}: <span class="name">${esc(x.w)}</span> <button class="btn-sm btn-ghost" data-action="say" data-text="${esc(x.w)}">${ICONS.sound}</button></h3><button class="btn-sm" data-action="modal-close">Đóng</button></div><div class="stack" style="gap:8px">${rows.filter(([, val]) => val).map(([k, val]) => `<div class="card soft" style="padding:10px 14px"><div class="eyebrow" style="margin-bottom:2px">${k}</div><div class="small">${esc(val)}</div></div>`).join('') || `<p class="small muted">${vi ? 'Chưa có chi tiết – bấm "Bổ sung bằng AI" ở bộ bài để lấy định nghĩa, ví dụ và bối cảnh.' : 'No details yet – use "Bổ sung bằng AI" on the set page for the definition, example and context.'}</p>`}</div>`);
actions['vocab-slang'] = t => { const f = vocabOf(t.dataset.id, +t.dataset.i); const x = f && slangOf(f.v.slang); if (!x) return; const vi = isLow(f.base.cefr); lexModal(vi ? 'Cách nói lóng / thân mật của' : 'Slang / informal for', '🗣', x, [[vi ? 'Định nghĩa' : 'Definition', x.def], [vi ? 'Ví dụ' : 'Example', x.example], [vi ? 'Bối cảnh sử dụng' : 'Where it fits', x.context], [vi ? 'Lưu ý' : 'Note', x.note]], vi); };
actions['vocab-poetic'] = t => { const f = vocabOf(t.dataset.id, +t.dataset.i); const x = f && poeticOf(f.v.poetic); if (!x) return; const vi = isLow(f.base.cefr); lexModal(vi ? 'Từ văn chương / thi ca của' : 'Poetic / literary word for', '🪶', x, [[vi ? 'Định nghĩa' : 'Definition', x.def], [vi ? 'Ví dụ' : 'Example', x.example], [vi ? 'Xuất hiện trong' : 'Found in', x.source]], vi); };
actions['lesson-phase'] = t => { lessonPhase = t.dataset.p; rerenderKeep(); window.scrollTo(0, 0); };
actions['lesson-studied'] = t => { const u = me(); u.studied = u.studied || {}; u.studied[t.dataset.key] = new Date().toISOString(); lessonPhase = 'practice'; save(true); toast('Đã ghi nhận phần Học – sang Bài tập', 'ok'); render(); };
function renderMicro(m, {week, topic, practiceKey, vi} = {}) {
  const isVi = vi ?? (m.explainLang ? /Việt/.test(m.explainLang) : isLow(m.cefr)); const T2 = (a, b) => isVi ? a : b;
  const en = exampleLines(m); /* audio = example sentences only, never the grammar formula */ const parts = lessonParts(m); const has = c => parts.some(p => p.code === c);
  const chip = (name, on, cls) => `<span class="badge ${on ? cls : ''}" style="${on ? '' : 'opacity:.45'}">${name}</span>`;
  const structure = ['L', 'S', 'R', 'W'].map(c => chip(PART_NAMES[c][isVi ? 0 : 1], has(c), 'primary')).join('') + chip(T2('Từ vựng', 'Vocabulary'), (m.vocab || []).length, 'ok') + chip(T2('Ngữ pháp', 'Grammar'), m.theory && m.theory !== '—', 'ok') + chip(T2('Phát âm', 'Pronunciation'), !!m.pron, 'ok') + chip(T2('Từ loại · Dùng từ', 'Word class · Word use'), has('C') && has('U'), 'warn');
  const objective = m.objective || (m.title ? T2(`Dùng được mẫu câu "${m.title}" khi nói và viết về chủ đề tuần.`, `Use the pattern "${m.title}" when speaking and writing about this week's topic.`) : '');
  const order = parts.map(p => PART_NAMES[p.code][isVi ? 0 : 1]).join(' → ');
  const guide = isVi ? ['Bước Học: 3 từ vựng (nghe từ, cụm từ, xem từ loại / đồng nghĩa) → Ngữ pháp (nghe câu ví dụ) → Phát âm (luyện 3 từ).', 'Bấm "Đã học xong" để mở bước Bài tập.', `Làm lần lượt các phần: ${order}.`, `Mỗi câu được làm tối đa ${MAX_ATTEMPTS} lần: làm sai thì đọc giải thích rồi làm lại; đúng hoặc hết lượt mới hiện đáp án.`, 'Xong hết các phần thì bấm Hoàn thành bài. Phải xong bài này mới mở được bài sau.']
    : ['Study step: 3 words (listen, phrases, word class / synonyms) → Grammar (listen to the examples) → Pronunciation (drill 3 words).', 'Press "Done studying" to open the Exercises step.', `Do the parts in order: ${order}.`, `Each question allows up to ${MAX_ATTEMPTS} attempts: if wrong, read the explanation and try again; the answer appears when you are right or out of attempts.`, 'When every part is done, press Complete. The next lesson unlocks after this one.'];
  const u = me(); const studied = practiceKey ? studiedOf(u, practiceKey) : false; const phase = practiceKey ? (lessonPhase === 'practice' && studied ? 'practice' : 'study') : 'all';
  const partsDone = practiceKey ? parts.filter(p => resState(practiceTarget(partKey(practiceKey, p.code))?.get()).done).length : 0;
  const tabs = practiceKey ? `<div class="ltabs"><button class="${phase === 'study' ? 'active' : ''}" data-action="lesson-phase" data-p="study">1. ${T2('Học', 'Study')} ${studied ? '✓' : ''}</button><button class="${phase === 'practice' ? 'active' : ''}" data-action="lesson-phase" data-p="practice" ${studied ? '' : 'disabled title="' + T2('Bấm Đã học xong ở bước Học trước', 'Finish the Study step first') + '"'}>2. ${T2('Bài tập', 'Exercises')} ${studied ? `${partsDone}/${parts.length}` : '🔒'}</button></div>` : '';
  const q = p => `<div style="font-weight:800;line-height:1.4">${esc(p.prompt)}</div>`;
  const preview = p => `<div class="small" style="margin-top:6px">${p.options.map(o => `<span class="chip ${matchesKey(o, p.answer) ? 'good' : ''}" style="margin:2px">${esc(o)}</span>`).join('')}<div class="muted">${T2('Đáp án', 'Answer')}: <b>${esc(p.answer || '—')}</b></div></div>`;
  const sec = (code, body) => { const part = parts.find(p => p.code === code); if (!part) return ''; const key = practiceKey ? partKey(practiceKey, code) : '';
    return `<div class="card flat"><div class="eyebrow" style="margin-bottom:6px">${PART_NAMES[code][0]} · ${PART_NAMES[code][1]}</div>${body(part.practice)}${key ? practiceBox(key, {...m, practice: part.practice}, practiceTarget(key)?.get() || {}, isVi) : preview(part.practice)}</div>`; };
  const vocabHtml = `<div><div class="eyebrow" style="margin-bottom:6px">${T2('Từ vựng', 'Vocabulary')} <span style="text-transform:none;letter-spacing:0;font-weight:700">· ${T2('mỗi từ kèm từ loại, 3 cụm hay dùng, đồng / trái nghĩa', 'word class, 3 common phrases, synonyms / antonyms')}</span></div><div class="vocab">${(m.vocab || []).map((v, i) => `<div class="w"><div style="display:flex;gap:12px;align-items:center"><span class="vimg-slot" data-vocab-img="${esc(v.e)}"></span><div style="flex:1"><div class="row between"><span><b>${esc(v.e)}</b>${v.pos ? ` <span class="badge" style="font-size:.7rem;padding:0 8px">${esc(posLabel(v.pos, isVi))}</span>` : ''}${v.ipa ? ` <span class="ipa">${esc(v.ipa)}</span>` : ''}</span><button class="btn-sm btn-ghost" data-action="say" data-text="${esc(v.e)}" title="Nghe">${ICONS.sound}</button></div><div>${esc(v.v)}</div></div></div>
      ${(v.phrases || []).length ? `<div class="chips" style="margin-top:8px">${v.phrases.map(ph => `<button class="chip" data-action="say" data-text="${esc(ph)}" style="cursor:pointer;padding:4px 10px" title="${T2('Nghe cụm từ', 'Listen')}">${ICONS.sound} <span style="font-weight:700">${esc(ph)}</span></button>`).join('')}</div>` : (practiceKey ? '' : `<div class="xs" style="margin-top:6px;color:#6E3B32;font-weight:800">${T2('Chưa có 3 cụm từ cho từ này', 'No phrases for this word yet')}</div>`)}${vocabDetails(v, m, i, isVi, practiceKey)}</div>`).join('') || '<span class="muted small">—</span>'}</div></div>`;
  const grammarHtml = `<div class="card soft"><div class="row between"><div class="eyebrow" style="margin-bottom:4px">${T2('Ngữ pháp', 'Grammar')}</div>${en.length ? `<button class="btn-sm" data-action="say-en" data-lines="${esc(JSON.stringify(en))}" title="${T2('Chỉ đọc các câu ví dụ; công thức ngữ pháp không được đọc thành tiếng', 'Reads the example sentences only, not the formula')}">${ICONS.sound} ${isVi ? 'Nghe câu ví dụ' : 'Listen to examples'}</button>` : ''}</div><div style="font-weight:700;line-height:1.6">${nl2br((m.theory || '—').replace(/\s+(?=[1-3]\)\s)/g, '\n'))}</div>
      ${en.length ? `<div class="chips" style="margin-top:8px">${en.map(l => `<button class="chip" data-action="say-en" data-lines="${esc(JSON.stringify([l]))}" style="cursor:pointer;padding:4px 10px">${ICONS.sound} <span style="font-weight:700">${esc(l)}</span></button>`).join('')}</div>` : ''}</div>`;
  const pronHtml = m.pron ? `<div class="card soft"><div class="row between"><div class="eyebrow" style="margin-bottom:4px">${T2('Phát âm', 'Pronunciation')}${m.pron.focus ? ' · ' + esc(m.pron.focus) : ''}</div>${m.pron.sound ? `<button class="btn-sm btn-primary" data-action="say-sound" data-sound="${esc(m.pron.sound)}" title="${T2('Nghe riêng âm này, không kèm từ ví dụ', 'Hear this sound on its own')}">${ICONS.sound} ${T2('Nghe âm', 'Hear the sound')} /${esc(m.pron.sound)}/</button>` : ''}</div><div style="font-weight:700;line-height:1.5">${esc(m.pron.tip)}</div>${drillWords(m).length ? `<div class="small" style="margin-top:8px;font-weight:800">${practiceKey ? `${T2('Luyện trước khi ghi âm: bấm từng từ để nghe, đọc to theo 2–3 lần.', 'Drill before recording: tap each word, listen, and repeat it aloud 2–3 times.')} <span class="badge" id="drill-count-${practiceKey}">${drilled(practiceKey).filter(x => drillWords(m).includes(x)).length}/${drillWords(m).length}</span>` : T2('3 từ chứa âm mục tiêu (học viên phải luyện đủ rồi mới ghi âm):', '3 words with the target sound (drilled before recording):')}</div><div class="chips" style="margin-top:6px">${drillWords(m).map(w => `<button class="chip ${practiceKey && drilled(practiceKey).includes(w) ? 'good' : ''}" data-action="${practiceKey ? 'drill' : 'say'}" data-word data-key="${practiceKey || ''}" data-w="${esc(w)}" data-text="${esc(w)}" style="cursor:pointer;padding:4px 10px">${ICONS.sound} <span style="font-weight:800">${esc(w)}</span>${m.pron.ipa?.[w] ? ` <span class="ipa" style="font-weight:600">${esc(m.pron.ipa[w])}</span>` : ''}</button>`).join('')}</div>` : ''}${!practiceKey && m.pron.verified === false ? `<div class="small" style="margin-top:8px;color:#6E3B32;font-weight:800">Chưa đủ 3 từ được kiểm tra là chứa âm /${esc(m.pron.sound || '?')}/${(m.pron.rejected || []).length ? ` (đã loại vì IPA không có âm này: ${m.pron.rejected.map(esc).join(', ')})` : ''}. Sửa trong file Word hoặc Sinh lại trước khi duyệt.</div>` : ''}</div>` : '';
  const exercisesHtml = `${''/* the sticky quick-look bar (vocabulary & grammar) was removed: learners re-open step 1 "Học" instead */}
    ${sec('L', p => `<button class="btn-sm btn-primary" data-action="say" data-text="${esc(m.listening.audio)}">${ICONS.sound} ${T2('Nghe đoạn audio', 'Play the audio')}</button>${practiceKey ? '' : `<div class="small muted" style="margin-top:6px"><i>${esc(m.listening.audio)}</i></div>`}<div style="margin-top:8px">${q(p)}</div>`)}
    ${sec('R', p => `<div class="card soft" style="line-height:1.7;font-weight:600">${esc(m.reading.text)}</div><div style="margin-top:8px">${q(p)}</div>`)}
    ${sec('W', q)}
    ${sec('C', q)}
    ${sec('U', q)}
    ${practiceKey && has('S') && !drillDone(practiceKey, m) ? pronHtml : ''}
    ${sec('S', p => `${p.prompt ? q(p) : ''}<div class="row" style="margin-top:6px;gap:8px"><b style="font-family:var(--font-display);font-size:1.15rem">${esc(p.answer)}</b><button class="btn-sm btn-ghost" data-action="say" data-text="${esc(p.answer)}" title="Nghe câu mẫu">${ICONS.sound}</button></div>`)}`;
  const studyHtml = `${objective ? `<div class="card soft" style="background:var(--primary-soft)"><div class="eyebrow" style="color:var(--text);margin-bottom:4px">${T2('Mục tiêu bài học', 'Learning objective')}</div><div style="font-weight:800;font-size:1.05rem;line-height:1.4">${esc(objective)}</div></div>` : ''}
    ${practiceKey ? `<div class="card soft" style="background:var(--butter)"><div class="eyebrow" style="color:var(--text);margin-bottom:4px">📋 ${T2('Hướng dẫn làm bài', 'Guideline')}</div><ol class="small" style="margin:0;padding-left:20px;font-weight:700;line-height:1.55">${guide.map(g => `<li>${g}</li>`).join('')}</ol></div>` : ''}
    ${vocabHtml}${grammarHtml}${pronHtml}
    ${!practiceKey && m.levelWarn ? `<div class="banner warn"><div class="body small"><b>Có dấu hiệu vượt mức ${esc(m.cefr || '')}:</b> ${esc(m.levelWarn)}. Kiểm tra lại câu ví dụ, đoạn nghe/đọc và câu nói mẫu trước khi duyệt.</div></div>` : ''}
    ${practiceKey ? `<div class="card" style="background:var(--mint)"><div class="row between" style="gap:10px"><div><b style="font-family:var(--font-display);font-size:1.1rem">${studied ? T2('Bạn đã học xong phần này ✓', 'Study step done ✓') : T2('Học xong 3 mục trên chưa?', 'Finished the three sections above?')}</b><div class="small">${T2('Bước 2 có ' + parts.length + ' phần bài tập: ' + order + '.', 'Step 2 has ' + parts.length + ' exercises: ' + order + '.')}</div></div>${studied ? `<button class="btn-primary" data-action="lesson-phase" data-p="practice">${T2('Sang bài tập →', 'Go to exercises →')}</button>` : `<button class="btn-primary btn-lg" data-action="lesson-studied" data-key="${esc(practiceKey)}">✅ ${T2('Đã học xong → Làm bài tập', 'Done studying → Exercises')}</button>`}</div></div>` : ''}`;
  return `<div class="stack" style="gap:12px">
    ${topic ? `<div class="eyebrow">Bài siêu ngắn${week ? ' · Tuần ' + week : ''} · ${esc(topic)}</div>` : ''}
    <div class="row" style="gap:6px">${structure}</div>
    ${tabs}
    ${phase === 'all' ? studyHtml + exercisesHtml : phase === 'study' ? studyHtml : exercisesHtml}
  </div>`;
}
/** Where an exercise answer lives. key = lessonId (writing part) or lessonId~L / ~R / ~S. Own micro-lessons keep the writing result on the record; everything else is in S.practiceResults[userId_key]. */
function practiceTarget(key) {
  const u = me(); if (!u) return null; const [id, code = 'W'] = key.split('~');
  const mic = S.microLessons.find(x => x.id === id && x.userId === u.id); const base = mic || lessonById(id)?.lesson; if (!base) return null;
  const part = lessonParts(base).find(p => p.code === code); if (!part) return null;
  const m = {...base, practice: part.practice, theory: part.context || base.theory};
  if (mic && code === 'W') return {m, code, get: () => ({answer: mic.answer, localOk: mic.localOk, grade: mic.grade, attempts: mic.attempts, ok: mic.ok, done: mic.done}), set: r => Object.assign(mic, r)};
  const pk = u.id + '_' + key; S.practiceResults = S.practiceResults || {};
  return {m, code, get: () => S.practiceResults[pk] || {}, set: r => { S.practiceResults[pk] = {...(S.practiceResults[pk] || {}), ...r}; }};
}
const keepAudio = async (key, file) => { const tgt = practiceTarget(key); if (!tgt) return; const meta = await takeAudio(file, me().id + ':' + key, document.getElementById('mp-' + key), document.getElementById('mp-audio-' + key)); if (meta) { tgt.set({audio: meta}); save(); } };
actions['mp-audio'] = t => keepAudio(t.dataset.key, t.files[0]);
actions['mp-rec'] = t => recorder.toggle(t, file => keepAudio(t.dataset.key, file));
actions['mp-submit'] = async t => {
  const key = t.dataset.key; const tgt = practiceTarget(key); if (!tgt) return; const u = me(); const m = tgt.m; const p = normPractice(m.practice);
  const prev = tgt.get(); const st0 = resState(prev); if (st0.done) return;
  const answer = p.type === 'mcq' ? ($(`input[name="mp-${key}"]:checked`) || {}).value || '' : document.getElementById('mp-' + key).value.trim();
  if (p.type === 'say' && !prev.audio) { toast('Ghi âm hoặc tải file ghi âm lên trước nhé', 'err'); return; }
  if (!answer) { toast(p.type === 'mcq' ? 'Chọn một đáp án' : p.type === 'say' ? 'Chưa có lời chép từ file – gõ lại câu bạn đã nói' : 'Nhập câu trả lời', 'err'); return; }
  if (p.type === 'write' && wordCount(answer) < 2) { toast('Viết ít nhất một câu nhé', 'err'); return; }
  speech.stop(); const attempts = st0.attempts + 1; const last = attempts >= MAX_ATTEMPTS;
  const vi = m.explainLang ? /Việt/.test(m.explainLang) : learnerWantsVi(u);
  const finish = (ok, grade) => {
    tgt.set({answer, localOk: ok, ok, grade, attempts, done: ok || last, at: new Date().toISOString(), tried: ok ? (prev.tried || []) : [...(prev.tried || []), answer]}); logActivity(u.id, 'practice', 3); save(true);
    toast(ok ? 'Chính xác!' : last ? 'Hết lượt – xem đáp án' : `Chưa đúng – còn ${MAX_ATTEMPTS - attempts} lượt`, ok ? 'ok' : '');
    rerenderKeep();
  };
  if (p.type === 'say') { const r = sayMatch(answer, p.answer); finish(r.ok, r.ok ? null : {ok: false, score: 0, feedback: (vi ? 'Chưa khớp câu mẫu. Các từ chưa nghe thấy: ' : 'Not matching the model yet. Words not heard: ') + r.missing.join(', ') + (vi ? '. Nghe lại câu mẫu, ghi âm lại rồi nộp.' : '. Listen to the model and record again.'), fix: ''}); return; }
  if (p.type !== 'write' && matchesKey(answer, p.answer)) { finish(true, null); return; }
  if (!ai.hasKey()) { finish(p.type === 'write', null); return; } // no AI: objective items are judged by the key, free writing is accepted
  t.disabled = true; const st = document.getElementById('mp-status-' + key); if (st) st.innerHTML = '<span class="spinner"></span> Season đang chấm…';
  try {
    const grade = await ai.gradeMicro({cefr: u.cefr, vi, theory: m.theory, vocab: m.vocab, practice: m.practice, answer, persona: personaOf(u)});
    grade.feedback = personaText(grade.feedback, personaOf(u));
    if (p.type === 'mcq') grade.ok = false; // not the keyed option: AI only explains
    finish(grade.ok, grade);
  } catch (e) { toast(e.message + ' (lượt này chưa bị tính)', 'err'); t.disabled = false; if (st) st.textContent = ''; }
};
const microVars = (u, week) => { const p = u.profile || {}; return {cefr: u.cefr, topic: weekInfo(week).topic, job: [p.position, p.department].filter(Boolean).join(' – ') || 'nhân viên văn phòng', style: (p.styles || []).length ? optLabels('styles', p.styles) : 'ví dụ thực tế ngắn gọn', vi: learnerWantsVi(u), persona: personaOf(u)}; };
const todayMicro = u => S.microLessons.filter(m => m.userId === u.id && m.date === todayStr()).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
async function generateMyMicro(u) {
  const wk = currentWeek(); const vars = microVars(u, wk);
  const m = await ai.generateMicroLesson(vars);
  const rec = {id: uid('ml'), userId: u.id, week: wk, date: todayStr(), cefr: u.cefr, topic: vars.topic, job: vars.job, style: vars.style, ...m, generatedAt: new Date().toISOString(), completedAt: null};
  S.microLessons.push(rec); save(true); return rec;
}
route('#/micro/:id', id => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  const m = S.microLessons.find(x => x.id === id && x.userId === u.id); if (!m) { go('#/home'); return; }
  shell(`<div class="row" style="gap:12px;margin-bottom:14px"><a class="btn" href="#/home" style="width:44px;height:44px;padding:0;justify-content:center" aria-label="Quay lại">${ICONS.back}</a><div><div class="eyebrow">Bài siêu ngắn · ${fmtDate(m.date)} · ${m.cefr}</div><h1 style="margin:0">${esc(m.topic || 'Hôm nay')}</h1></div></div>
    <div class="card">${renderMicro(m, {practiceKey: m.id, result: {answer: m.answer, localOk: m.localOk, grade: m.grade}})}</div>
    <div class="panel" style="margin-top:14px"><div class="bao-row">${bao(m.completedAt || m.grade?.ok ? 'praise' : m.grade ? 'oops' : 'hello', 72, true)}<div class="bubble" style="flex:1">${m.completedAt ? 'Xong rồi! Muốn thử nói về tình huống này với mình không?' : (m.grade || m.localOk !== undefined) ? ((m.grade ? m.grade.ok : m.localOk) ? 'Tốt lắm! Bấm Hoàn thành để ghi nhận.' : 'Sửa theo gợi ý rồi nộp lại, hoặc Hoàn thành nếu đã hiểu.') : 'Đọc lý thuyết, nghe 3 từ, rồi làm bài thực hành và nộp để mình chấm.'}</div></div>
      <div class="row" style="margin-top:12px">${m.completedAt ? '' : `<button class="btn-primary btn-lg" data-action="micro-done" data-id="${m.id}" ${m.grade || m.localOk !== undefined || !ai.hasKey() ? '' : 'disabled title="Nộp bài thực hành trước"'}>Hoàn thành</button>`}<a class="btn" href="#/coach">Luyện với Season</a><button class="btn-ghost" data-action="micro-gen" ${ai.hasKey() ? '' : 'disabled'}>↻ Tạo bài khác</button></div></div>
    <p class="xs muted" style="margin-top:10px">Sinh theo: ${esc(m.job)} · ${esc(m.style)}</p>`, {title: 'Bài siêu ngắn'});
});
actions['micro-gen'] = async t => {
  const u = me(); if (!ai.hasKey()) { toast('Chưa kết nối AI', 'err'); return; }
  if (t) { t.disabled = true; t.innerHTML = '<span class="spinner"></span> Đang tạo…'; }
  try { const m = await generateMyMicro(u); toast('Đã tạo bài siêu ngắn', 'ok'); go('#/micro/' + m.id); } catch (e) { toast(e.message, 'err'); render(); }
};
actions['micro-done'] = t => { const m = S.microLessons.find(x => x.id === t.dataset.id); if (!m) return; m.completedAt = new Date().toISOString(); logActivity(m.userId, 'lesson', 5); save(true); toast('Hoàn thành bài siêu ngắn!', 'ok'); render(); };
function microHomeCard(u) {
  const m = todayMicro(u);
  if (m) return `<a class="card" href="#/micro/${m.id}" style="display:block;text-decoration:none;color:inherit;margin-top:12px;background:${m.completedAt ? 'var(--mint)' : 'var(--surface)'}"><div class="row between"><div><div class="eyebrow">Bài siêu ngắn hôm nay ${m.completedAt ? '· đã xong ✓' : ''}</div><b style="font-family:var(--font-display);font-size:1.1rem">${esc((m.vocab || []).map(v => v.e).join(' · ') || m.topic)}</b><div class="small" style="margin-top:2px">${esc((m.theory || '').slice(0, 90))}${(m.theory || '').length > 90 ? '…' : ''}</div></div><span class="badge">5′</span></div></a>`;
  return `<div class="card" style="margin-top:12px"><div class="row between"><div><div class="eyebrow">Bài siêu ngắn hôm nay</div><div class="small">1 ý lý thuyết · 3 từ · 1 thực hành, sinh theo nghề và cách học của bạn.</div></div><button class="btn-primary" data-action="micro-gen" ${ai.hasKey() ? '' : 'disabled title="Chưa kết nối AI"'}>Tạo bài</button></div></div>`;
}

// ---- lesson viewer ----
function renderLessonContent(l, {reveal=false, interactive=false, uidKey=''} = {}) {
  if (isMicroLesson(l)) return renderMicro(l, interactive ? {practiceKey: l.id, result: (S.practiceResults || {})[me().id + '_' + l.id] || {}} : {});
  const vi = l.explanationLang === 'vi' || isLow(l.cefr);
  const lbl = vi ? {vocab: 'Từ vựng', patterns: 'Mẫu câu', reading: 'Bài đọc', ex: 'Bài tập', q: 'Câu hỏi'} : {vocab: 'Vocabulary', patterns: 'Patterns', reading: 'Reading', ex: 'Exercises', q: 'Questions'};
  const vocab = `<h3>${lbl.vocab}</h3><div class="vocab">${(l.vocab || []).map((v, i) => `<div class="w"><div class="row between"><div><b>${esc(v.word)}</b><span class="ipa">${esc(v.ipa || '')}</span></div><button class="btn-sm btn-ghost" data-action="say" data-text="${esc(v.word)}" title="Nghe">${ICONS.sound}</button></div><div>${esc(v.meaning)}</div><div class="small muted"><i>${esc(v.example)}</i> <button class="btn-sm btn-ghost" data-action="say" data-text="${esc(v.example)}" style="padding:0 6px">${ICONS.sound}</button></div></div>`).join('')}</div>`;
  const patterns = `<h3 style="margin-top:16px">${lbl.patterns}</h3>${(l.patterns || []).map(p => `<div class="card flat" style="margin-top:8px"><b style="font-family:var(--font-display);font-size:1.05rem">${esc(p.pattern)}</b><div><i>${esc(p.example)}</i> <button class="btn-sm btn-ghost" data-action="say" data-text="${esc(p.example)}" style="padding:0 6px">${ICONS.sound}</button></div>${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}</div>`).join('')}`;
  const r = l.reading || {};
  const reading = `<h3 style="margin-top:16px">${lbl.reading}: ${esc(r.title || '')} <button class="btn-sm btn-ghost" data-action="say" data-text="${esc(r.text || '')}">${ICONS.sound}</button></h3><div class="card soft" style="white-space:pre-wrap;line-height:1.7;font-weight:600">${esc(r.text || '')}</div>
    ${(r.questions || []).map((q, qi) => { const key = `${uidKey}r${qi}`; return `<div style="margin-top:10px"><p style="margin:0 0 6px"><b>${qi + 1}.</b> ${esc(q.q)}</p>${(q.options || []).map((o, oi) => `<label class="opt ${reveal && oi === q.answer ? 'correct' : ''}" data-q="${key}" data-ans="${q.answer}"><input type="radio" name="${key}" value="${oi}" ${interactive ? `data-change="ex-pick"` : 'disabled'}><span>${esc(o)}</span></label>`).join('')}</div>`; }).join('')}`;
  const exercises = `<h3 style="margin-top:16px">${lbl.ex}</h3>${(l.exercises || []).map((e, ei) => { const key = `${uidKey}e${ei}`;
    if (e.type === 'mcq') return `<div class="card flat" style="margin-top:8px"><p style="margin:0 0 6px"><b>${ei + 1}.</b> ${esc(e.prompt)}</p>${(e.options || []).map((o, oi) => `<label class="opt ${reveal && o === e.answer ? 'correct' : ''}" data-q="${key}" data-ans="${(e.options || []).indexOf(e.answer)}"><input type="radio" name="${key}" value="${oi}" ${interactive ? 'data-change="ex-pick"' : 'disabled'}><span>${esc(o)}</span></label>`).join('')}${reveal && e.explanation ? `<div class="small muted">${esc(e.explanation)}</div>` : `<div class="small muted ex-expl" id="expl-${key}" hidden>${esc(e.explanation || '')}</div>`}</div>`;
    if (e.type === 'fill') return `<div class="card flat" style="margin-top:8px"><p style="margin:0 0 6px"><b>${ei + 1}.</b> ${esc(e.prompt).replace(/_{2,}/, `<input class="fill-blank" data-q="${key}" data-ans="${esc(e.answer)}" ${interactive ? 'data-change="ex-fill"' : `disabled value="${esc(e.answer)}"`} placeholder="…">`)}</p>${reveal ? `<div class="small muted">✓ ${esc(e.answer)}${e.explanation ? ' · ' + esc(e.explanation) : ''}</div>` : `<div class="small muted ex-expl" id="expl-${key}" hidden></div>`}</div>`;
    return `<div class="card flat" style="margin-top:8px"><p style="margin:0 0 6px"><b>${ei + 1}.</b> ${esc(e.prompt)}</p>${interactive ? `<textarea data-q="${key}" data-change="ex-write" placeholder="${vi ? 'Viết câu trả lời của bạn…' : 'Write your answer…'}"></textarea>` : ''}<details style="margin-top:6px"><summary class="small">${vi ? 'Xem câu mẫu' : 'Show model answer'}</summary><div class="small" style="white-space:pre-wrap">${esc(e.answer)}</div>${e.explanation ? `<div class="small muted">${esc(e.explanation)}</div>` : ''}</details></div>`; }).join('')}`;
  return `${l.intro ? `<p class="small muted" style="margin-top:0">${esc(l.intro)}</p>` : ''}${vocab}${patterns}${reading}${exercises}`;
}
actions.say = t => (t.dataset.word !== undefined ? speech.speakWord(t.dataset.text) : speech.speak(t.dataset.text)); // data-word: pronunciation drill words ring out ~1 s
let LS = null; // lesson state {lessonId, startedAt, answers:{}, graded:{}}
route('#/lesson/:id', id => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  const found = lessonById(id); if (!found) { toast('Bài không tồn tại', 'err'); go('#/home'); return; }
  const {lesson: l, set} = found;
  if (set.status !== 'approved' || set.cefr !== u.cefr) { toast('Bài này chưa mở cho bạn', 'err'); go('#/home'); return; }
  if (!LS || LS.lessonId !== id || LS.userId !== u.id) { LS = {userId: u.id, lessonId: id, startedAt: Date.now(), answers: {}, graded: {}}; lessonPhase = studiedOf(u, id) ? 'practice' : 'study'; } // answers in progress belong to one learner and one lesson; a studied lesson opens on its exercises
  const prog = userProgress(u.id, id); const lessons = approvedLessons(set.week, set.cefr); const idx = lessons.indexOf(l);
  const micro = isMicroLesson(l);
  // no skipping: a lesson opens only when every earlier lesson of the week is completed
  const blocker = lessons.slice(0, idx).find(x => !userProgress(u.id, x.id)?.completedAt);
  if (blocker) {
    const bi = lessons.indexOf(blocker); const lbl = x => DAY_SHORT[(x.day || lessons.indexOf(x) + 1) - 1] || 'Bài ' + (lessons.indexOf(x) + 1);
    shell(`<div class="card"><div class="bao-row">${bao('oops', 80, true)}<div><div class="eyebrow">🔒 Bài ${idx + 1}/${lessons.length} · ${lbl(l)} chưa mở</div><h3>Học bù bài trước đã nhé</h3><p class="small">Bạn chưa hoàn thành <b>${lbl(blocker)} · ${esc(blocker.title)}</b> (bài ${bi + 1}/${lessons.length}). Các bài nối tiếp nhau nên không bỏ qua được: xong bài đó thì bài này tự mở.</p><div class="row"><a class="btn btn-primary" href="#/lesson/${blocker.id}">Học bài ${lbl(blocker)} ngay</a><a class="btn" href="#/home">← Về trang chủ</a></div></div></div></div>`, {title: 'Bài chưa mở'});
    return;
  }
  const opens = addDays(weekStart(set.week), (l.day || idx + 1) - 1);
  if (opens > todayStr() && !prog?.completedAt) { // fixed Mon–Fri schedule: no learning ahead of the day
    shell(`<div class="card"><div class="bao-row">${bao('hello', 80, true)}<div><div class="eyebrow">🔒 Bài ${idx + 1}/${lessons.length} · chưa đến ngày</div><h3>Bài này mở vào ${DOW_FULL[dowIndex(opens)]} ${fmtDate(opens)}</h3><p class="small">Lịch học cố định mỗi ngày một bài từ Thứ Hai đến Thứ Sáu. Bạn đã xong các bài trước; hôm nay có thể luyện thêm với Season.</p><div class="row"><a class="btn btn-primary" href="#/coach">Luyện với Season</a><a class="btn" href="#/home">← Về trang chủ</a></div></div></div></div>`, {title: 'Bài chưa mở'});
    return;
  }
  const parts = micro ? lessonParts(l) : []; const partsDone = parts.filter(p => resState(practiceTarget(partKey(id, p.code))?.get()).done).length;
  const total = micro ? 0 : (l.reading?.questions || []).length + (l.exercises || []).filter(e => e.type !== 'write').length;
  const answered = Object.keys(LS.graded).length;
  shell(`
    <div class="row" style="gap:12px;margin-bottom:14px"><a class="btn" href="#/home" style="width:44px;height:44px;padding:0;justify-content:center" aria-label="Quay lại">${ICONS.back}</a>${micro ? `<div class="eyebrow" style="flex:1">Tuần ${set.week} · ${DAY_SHORT[(l.day || idx + 1) - 1] || 'Bài ' + (idx + 1)} · ${esc(weekInfo(set.week).topic)}</div>` : `<div class="progress" style="flex:1;height:18px"><i style="width:${pct(answered, total)}%"></i></div><b style="font-family:var(--font-display)">${answered}/${total}</b>`}</div>
    <div class="row" style="margin-bottom:8px"><span class="badge lvl lvl-${l.cefr}">Bài ${idx + 1}/${lessons.length} · ${l.cefr}</span><span class="badge">${ICONS.clock}&nbsp;${l.durationMin} phút</span>${prog?.completedAt ? `<span class="badge ok">Đã hoàn thành · ${prog.score}%</span>` : ''}</div>
    <h1 style="margin-bottom:12px">${esc(l.title)}</h1>
    <div class="card">${renderLessonContent(l, {interactive: true, uidKey: 'L'})}</div>
    <div class="panel" style="margin-top:14px"><div class="bao-row">${bao(prog?.completedAt ? 'praise' : 'hello', 72, true)}<div style="flex:1"><div id="lesson-fb" class="display" style="font-size:1.2rem">${prog?.completedAt ? 'Bạn đã học bài này rồi, ôn lại thoải mái!' : micro ? (partsDone < parts.length ? `Đã xong ${partsDone}/${parts.length} phần. Làm nốt rồi bấm Hoàn thành nhé.` : 'Đủ các phần rồi! Bấm Hoàn thành để mở bài tiếp theo.') : (isLow(l.cefr) ? 'Làm hết bài tập rồi bấm Hoàn thành nhé.' : 'Finish the exercises, then mark the lesson complete.')}</div><div class="small muted" id="lesson-score"></div></div></div>
      <div class="row" style="margin-top:12px"><button class="btn-primary btn-lg" data-action="lesson-complete" data-id="${id}" ${!prog?.completedAt && partsDone < parts.length ? `disabled title="Làm xong ${parts.length} phần bài tập trước (${parts.map(p => PART_NAMES[p.code][0]).join(', ')})"` : ''}>${prog?.completedAt ? 'Lưu lần ôn này' : 'Hoàn thành bài'}</button>${idx + 1 < lessons.length && prog?.completedAt ? `<a class="btn" href="#/lesson/${lessons[idx + 1].id}">Bài tiếp →</a>` : ''}<a class="btn btn-ghost" href="#/coach">Luyện với Season</a></div></div>`, {title: l.title});
});
function gradePick(t, correctIdx) {
  const key = t.name; const ok = +t.value === correctIdx;
  $$(`[data-q="${key}"]`).forEach(o => { o.classList.remove('sel', 'correct', 'wrong'); const inp = o.querySelector('input'); if (inp && inp.checked) o.classList.add(ok ? 'correct' : 'wrong'); if (!ok && inp && +inp.value === correctIdx) o.classList.add('correct'); inp && (inp.disabled = true); });
  LS.graded[key] = ok; const ex = $('#expl-' + key); if (ex) ex.hidden = false;
  lessonFeedback(ok);
}
function lessonFeedback(ok) {
  const fb = $('#lesson-fb'); if (!fb) return;
  const total = Object.keys(LS.graded).length; const good = Object.values(LS.graded).filter(Boolean).length;
  const l = lessonById(LS.lessonId).lesson; const vi = isLow(l.cefr);
  fb.textContent = ok ? (vi ? ['Chính xác!', 'Giỏi lắm!', 'Đúng rồi!'][total % 3] : ['Correct!', 'Nice work!', 'Exactly!'][total % 3]) : (vi ? 'Chưa đúng, xem giải thích nhé.' : 'Not quite – check the explanation.');
  $('#lesson-score').textContent = `${good}/${total} ${vi ? 'câu đúng' : 'correct'}`;
  const svg = fb.closest('.bao-row').querySelector('svg.bao'); if (svg) svg.outerHTML = bao(ok ? 'praise' : 'oops', 72, true);
  const bar = $('.progress > i'); const totalQ = $$('.opt[data-q], .fill-blank').length ? new Set($$('[data-q]').map(e => e.dataset.q)).size : 1; if (bar) bar.style.width = pct(total, totalQ) + '%'; const cnt = bar?.closest('.row')?.querySelector('b'); if (cnt) cnt.textContent = `${total}/${totalQ}`;
}
actions['ex-pick'] = t => gradePick(t, +t.closest('.opt').dataset.ans);
actions['ex-fill'] = t => { const ok = t.value.trim().toLowerCase().replace(/[.!?]$/, '') === t.dataset.ans.trim().toLowerCase(); t.style.background = ok ? 'var(--mint)' : 'var(--peach)'; LS.graded[t.dataset.q] = ok; const ex = $('#expl-' + t.dataset.q); if (ex) { ex.hidden = false; ex.textContent = ok ? '✓' : `✓ ${t.dataset.ans}`; } lessonFeedback(ok); };
actions['ex-write'] = t => { LS.answers[t.dataset.q] = t.value; };
actions['lesson-complete'] = t => {
  const u = me(); const id = t.dataset.id; const l = lessonById(id).lesson;
  if (!LS || LS.userId !== u.id || LS.lessonId !== id) LS = {userId: u.id, lessonId: id, startedAt: Date.now(), answers: {}, graded: {}};
  const graded = Object.values(LS.graded); let score = graded.length ? pct(graded.filter(Boolean).length, graded.length) : 100;
  const mins = clamp(Math.round((Date.now() - LS.startedAt) / 60000), 3, 30);
  const existing = userProgress(u.id, id);
  if (isMicroLesson(l)) { // score = share of parts answered correctly within the attempt limit
    const sts = lessonParts(l).map(p => resState(practiceTarget(partKey(id, p.code))?.get()));
    if (!existing && sts.some(s => !s.done)) { toast(`Còn ${sts.filter(s => !s.done).length} phần chưa làm xong`, 'err'); return; }
    if (sts.length) score = pct(sts.filter(s => s.ok).length, sts.length);
  }
  if (existing) { existing.reviews = (existing.reviews || 0) + 1; existing.lastScore = score; existing.minutes += mins; }
  else S.progress.push({userId: u.id, lessonId: id, week: l.week, completedAt: new Date().toISOString(), score, minutes: mins, writeAnswers: LS.answers});
  logActivity(u.id, 'lesson', mins); save(true);
  toast(existing ? 'Đã lưu lần ôn' : `Hoàn thành bài! ${score}% đúng`, 'ok'); LS = null; go('#/home');
};

// ---- AI coach ----
let coachBusy = false;
// ---- chat limit: a daily cap per learner keeps AI cost predictable; the weekly target (≥2 turns) is separate ----
const coachDailyLimit = () => clamp(+S.settings.coachDailyLimit || 20, 1, 200);
const coachTurnsToday = u => { const t = todayStr(); return S.coachSessions.filter(c => c.userId === u.id).reduce((n, c) => n + c.turns.filter(x => localDay(x.at) === t).length, 0); };
const localDay = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function coachSession(u) {
  const wk = currentWeek();
  let s = S.coachSessions.filter(c => c.userId === u.id && c.week === wk && !c.challenge).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!s) {
    const w = weekInfo(wk); const name = u.name.split(' ').pop();
    // no small talk: a short greeting, then straight into a question built on the lesson the learner is on
    const ls = learnerLessons(u); const cur = ls.find(l => !userProgress(u.id, l.id)?.completedAt) || ls[ls.length - 1]; const pattern = cur ? `"${cur.title}"` : (w.topic ? `"${w.topic}"` : 'this week\'s pattern');
    const ask = isLow(u.cefr) ? `tell me about yourself and your job in two sentences` : `tell me about your current work and one thing you are working on this week`;
    const opener = personaOf(u) === 'formal' ? `Hello ${name}. ${w.topic ? `This week's topic is "${w.topic}". ` : ''}Let us begin with ${pattern}: could you ${ask}?` : `Hi there, ${name}! ${w.topic ? `This week: "${w.topic}". ` : ''}Let's start with ${pattern}: ${ask} 😊`;
    s = {id: uid('cs'), userId: u.id, week: wk, startedAt: new Date().toISOString(), messages: [{role: 'assistant', content: opener}], turns: []};
    S.coachSessions.push(s); save();
  }
  return s;
}
const rubricCls = v => v >= 4 ? 'good' : v >= 3 ? 'mid' : 'low';
function renderChat(s, u) {
  const vi = isLow(u.cefr);
  const out = []; let ti = 0;
  s.messages.forEach((m, i) => {
    if (m.role === 'user') { out.push(`<div class="msg user">${esc(m.content)}</div>`); const t = s.turns[ti++];
      if (t && t.offTopic) out.push(`<div class="correction" style="background:var(--peach)"><div class="row between" style="gap:6px"><span class="ttl">${vi ? 'Chưa trả lời đúng câu hỏi' : 'This does not answer the question'}</span><span class="chips"><span class="chip low">${vi ? 'Ý' : 'Meaning'} ${t.rubric.meaning}/5</span></span></div>${t.relevanceNote ? `<div class="why">${esc(t.relevanceNote)}</div>` : ''}<div class="why">${vi ? 'Lượt này không tính vào mục tiêu tuần và không mở ô từ. Đọc lại câu hỏi của Season rồi trả lời lại bằng tiếng Anh.' : 'This turn does not count towards your weekly goal. Read Season\'s question again and answer it in English.'}</div></div>`);
      else if (t) {
      const sug = (t.suggestions || []).slice(0, 3);
      out.push(`<div class="correction"><div class="row between" style="gap:6px"><span class="ttl">${sug.length ? (vi ? 'Gần đúng rồi!' : 'Almost there!') : (vi ? 'Tốt lắm!' : 'Well said!')}</span><span class="chips"><span class="chip ${rubricCls(t.rubric.meaning)}">${vi ? 'Ý' : 'Meaning'} ${t.rubric.meaning}/5</span><span class="chip ${rubricCls(t.rubric.vocab)}">${vi ? 'Từ' : 'Vocab'} ${t.rubric.vocab}/5</span><span class="chip ${rubricCls(t.rubric.grammar)}">${vi ? 'NP' : 'Grammar'} ${t.rubric.grammar}/5</span></span></div>
        ${sug.map(g => `<div class="fix"><s style="opacity:.6;font-weight:600">${esc(g.original)}</s> → <span class="hl">${esc(g.corrected)}</span></div><div class="why">${esc(g.explanation)}</div>`).join('')}
        ${t.correctedText && sug.length ? `<div class="why" style="margin-top:4px">✓ <i>${esc(t.correctedText)}</i></div>` : ''}</div>`); } }
    else out.push(`<div class="msg ai">${esc(m.content)}</div>`);
  });
  return out.join('');
}
route('#/coach', () => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  if (!u.cefrApproved) { shell(`<div class="card"><div class="bao-row">${bao('think', 80, true)}<div><h3>Season cần biết trình độ của bạn trước</h3><p class="small">Làm test đầu vào và chờ duyệt mức, rồi mình luyện nói với nhau nhé.</p><a class="btn btn-primary" href="#/home">Về trang chủ</a></div></div></div>`, {title: 'Luyện với Season'}); return; }
  const s = coachSession(u); const w = weekInfo(s.week); const vi = isLow(u.cefr);
  const used = coachTurnsToday(u), cap = coachDailyLimit(), capped = used >= cap, wkTurns = coachTurnsThisWeek(u);
  shell(`
    <div class="card" style="padding:0;overflow:hidden">
      <div class="row" style="padding:14px 16px;border-bottom:var(--bw) solid var(--border);gap:12px">${baoAvatar(48)}<div style="flex:1"><div class="display" style="font-size:1.2rem;line-height:1.2">Season</div><div class="small muted" style="font-weight:700">${esc(w.topic || 'Trò chuyện tự do')} · ${u.cefr}</div></div>${personaToggle(u)}<button class="btn-sm btn-x" data-action="coach-new" title="Xoá đoạn chat này và bắt đầu hội thoại mới">Xoá chat</button></div>
      ${!ai.hasKey() ? `<div class="banner warn" style="margin:12px;box-shadow:none">${bao('oops', 48, true)}<div class="body small">Chưa kết nối AI nên Season chưa trả lời được. Báo người vận hành nhập API key trong Cài đặt.</div></div>` : ''}
      <div class="row between" style="padding:8px 16px;border-bottom:2px solid var(--line);gap:8px"><span class="row" style="gap:6px"><span class="badge ${capped ? 'danger' : used >= cap * 0.8 ? 'warn' : 'primary'}" id="coach-cap">Hôm nay ${used}/${cap} lượt</span><span class="badge ${wkTurns >= 2 ? 'ok' : ''}">Tuần này ${wkTurns} lượt${wkTurns >= 2 ? ' ✓' : ' · mục tiêu ≥2'}</span></span>
        <details class="xs" style="flex:1;min-width:200px"><summary style="cursor:pointer;font-weight:800">Giới hạn chat hoạt động thế nào?</summary><div class="muted" style="margin-top:4px;line-height:1.5">1 lượt = 1 tin nhắn bạn gửi và Season trả lời kèm chấm điểm. Mỗi người được tối đa <b>${cap} lượt mỗi ngày</b> (để giữ chi phí AI cho cả nhóm); bộ đếm về 0 lúc 0 giờ. Xoá chat không trả lại lượt đã dùng. Tin nhắn bị lỗi mạng không tính lượt. Mục tiêu học là ít nhất 2 lượt mỗi tuần; không có giới hạn theo tuần.</div></details></div>
      ${capped ? `<div class="banner warn" style="margin:12px;box-shadow:none"><div class="body small"><b>Bạn đã dùng hết ${cap} lượt chat hôm nay.</b> Ô nhập mở lại vào ngày mai. Trong lúc chờ, bạn có thể ôn bài tuần này.</div></div>` : ''}
      <div class="chat" id="chat" style="padding:16px;background:var(--bg)">${renderChat(s, u)}<div id="chat-typing" hidden class="msg ai"><span class="spinner"></span> Season đang nghĩ…</div></div>
      <div id="coach-vocab" style="padding:8px 16px 0">${vocabSlots(s, u)}</div>
      <form id="coach-form" class="row" style="padding:12px 16px 16px;gap:10px;flex-wrap:nowrap" onsubmit="return false">
        <input id="coach-input" placeholder="${vi ? 'Viết câu trả lời bằng tiếng Anh…' : 'Type your reply in English…'}" autocomplete="off" style="border-radius:999px;flex:1;min-width:0" ${ai.hasKey() && !capped ? '' : 'disabled'}>
        ${speech.canListen() ? `<button type="button" data-action="coach-mic" id="coach-mic" title="Nói" style="width:48px;height:48px;padding:0;justify-content:center">${ICONS.mic}</button>` : ''}
        <button type="button" class="btn-primary" data-action="coach-send" id="coach-send" style="width:48px;height:48px;padding:0;justify-content:center" ${ai.hasKey() ? '' : 'disabled'} aria-label="Gửi">${ICONS.send}</button>
      </form>
    </div>
    <p class="xs muted" style="margin-top:10px">${vi ? 'Mỗi lượt Season trả lời, chấm 3 tiêu chí (đúng ý · từ vựng · ngữ pháp) và gợi ý tối đa 3 chỗ sửa. Mục tiêu: ≥2 lượt mỗi tuần.' : 'Each turn Season replies, scores meaning · vocabulary · grammar (0–5) and suggests up to 3 fixes. Goal: at least 2 practice turns a week.'}</p>`, {title: 'Luyện với Season'});
  const c = $('#chat'); c.scrollTop = c.scrollHeight;
  $('#coach-input')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); actions['coach-send'](); } });
});
/** Level-up challenge: 6 turns with Season at the target level (same chat widget, separate session). */
route('#/challenge', () => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  const st = levelUpState(u); if (st.phase !== 'challenge') { toast('Không có thử thách nào đang mở', ''); go('#/home'); return; }
  const s = challengeSession(u, st.test); const used = coachTurnsToday(u), cap = coachDailyLimit(), capped = used >= cap; const sc = challengeScore(s);
  shell(`<div class="card" style="padding:0;overflow:hidden">
      <div class="row" style="padding:14px 16px;border-bottom:var(--bw) solid var(--border);gap:12px">${baoAvatar(48)}<div style="flex:1"><div class="display" style="font-size:1.2rem;line-height:1.2">Thử thách lên mức ${st.target}</div><div class="small muted" style="font-weight:700">Season nói ở mức ${st.target} · lượt ${s.turns.length}/${CHALLENGE_TURNS}</div></div><span class="badge ${sc.mean >= 3.5 && sc.off <= 1 ? 'ok' : 'warn'}">TB ${sc.mean}/5 · lạc đề ${sc.off}</span></div>
      <div class="banner info" style="margin:12px;box-shadow:none"><div class="body small">Đạt khi điểm trung bình (ý · từ · ngữ pháp) ≥ <b>3.5/5</b> sau ${CHALLENGE_TURNS} lượt và tối đa <b>1</b> lượt lạc đề. Trả lời đủ ý, bằng tiếng Anh, đúng câu hỏi. Các lượt này tính vào giới hạn ${cap} lượt/ngày (hôm nay ${used}/${cap}) nhưng không tính điểm thưởng hay mục tiêu tuần.</div></div>
      ${!ai.hasKey() ? `<div class="banner warn" style="margin:12px;box-shadow:none">${bao('oops', 48, true)}<div class="body small">Chưa kết nối AI nên Season chưa trả lời được. Báo người vận hành nhập API key trong Cài đặt.</div></div>` : ''}
      ${capped ? `<div class="banner warn" style="margin:12px;box-shadow:none"><div class="body small"><b>Bạn đã dùng hết ${cap} lượt chat hôm nay.</b> Thử thách được lưu, mai làm tiếp.</div></div>` : ''}
      <div class="chat" id="chat" style="padding:16px;background:var(--bg)">${renderChat(s, u)}<div id="chat-typing" hidden class="msg ai"><span class="spinner"></span> Season đang nghĩ…</div></div>
      <form id="coach-form" class="row" style="padding:12px 16px 16px;gap:10px;flex-wrap:nowrap" onsubmit="return false">
        <input id="coach-input" placeholder="Answer in English…" autocomplete="off" style="border-radius:999px;flex:1;min-width:0" ${ai.hasKey() && !capped ? '' : 'disabled'}>
        ${speech.canListen() ? `<button type="button" data-action="coach-mic" id="coach-mic" title="Nói" style="width:48px;height:48px;padding:0;justify-content:center">${ICONS.mic}</button>` : ''}
        <button type="button" class="btn-primary" data-action="coach-send" id="coach-send" style="width:48px;height:48px;padding:0;justify-content:center" ${ai.hasKey() ? '' : 'disabled'} aria-label="Gửi">${ICONS.send}</button>
      </form>
    </div>
    <p class="xs muted" style="margin-top:10px"><a href="#/home">← Trang chủ</a> · Thử thách được lưu lại: thoát ra rồi vào làm tiếp cũng được.</p>`, {title: 'Thử thách lên mức'});
  const c = $('#chat'); c.scrollTop = c.scrollHeight;
  $('#coach-input')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); actions['coach-send'](); } });
});
/** Words of this week the learner has already used in this chat. */
const foundWords = (s, u) => { const pairs = weekVocabPairs(u); const found = new Set(); // a slot opens only for a word the AI confirmed was used correctly in context (turns from before that check fall back to a word match)
  s.turns.forEach(t => { if (t.offTopic) return; if (Array.isArray(t.usedWords)) t.usedWords.forEach(w => { const p = pairs.find(p => p.e.toLowerCase() === String(w).toLowerCase()); if (p) found.add(p.e); }); else pairs.forEach(p => { if (usesWord(t.userText, p.e)) found.add(p.e); }); });
  return pairs.filter(p => found.has(p.e)).map(p => p.e); };
/** A message that is not even one real sentence (one word, a bare keyword, "ok"…) is impolite: answered locally, no AI call, no slot opens. */
const isCurt = text => { const words = String(text || '').trim().split(/\s+/).filter(Boolean); return words.length < 3 || !/[a-zA-Z]{2,}.*\s.*[a-zA-Z]{2,}/.test(text); };
const curtReply = (p, vi, pairs) => { const ex = pairs[0] ? (vi ? `I work in a small ${pairs[0].e === 'team' ? 'team' : 'office'}.` : `This week I am working on a new ${pairs[0].e === 'release' ? 'release' : 'report'}.`) : 'I work as a tester at GFT.';
  return {reply: p === 'formal' ? `That is rather brief. In a work conversation, please answer in a full sentence, for example: "${ex}" Could you try again?` : `Hmm, that's a bit short 😊 Give me a full sentence, not just a word – for example: "${ex}" Try again?`,
    note: vi ? 'Trả lời cộc lốc (một từ, không thành câu) là thiếu lịch sự trong giao tiếp công việc – không phải "thân mật". Hãy viết ít nhất một câu đầy đủ.' : 'A one-word or bare-keyword answer is impolite in a work conversation, not "informal". Write at least one full sentence.'}; };
/** Hidden slots: each shows only the Vietnamese clue until the learner uses the English word in a message. */
function vocabSlots(s, u, fresh = []) {
  const vi = isLow(u.cefr); const pairs = weekVocabPairs(u); const found = foundWords(s, u);
  if (!pairs.length) return `<span class="xs muted" style="font-weight:800">${vi ? 'Từ tuần này: chưa có bộ bài được duyệt cho tuần này' : 'This week: no approved lessons yet'}</span>`;
  return `<div class="row between" style="margin-bottom:6px"><span class="xs muted" style="font-weight:800">${vi ? 'Ô từ bí mật: dùng đúng từ trong một câu đúng ngữ cảnh để mở ô (gõ mỗi từ khoá thì không tính)' : 'Secret words: use the word correctly in a full sentence to open a slot (a bare keyword does not count)'}</span><span class="badge ${found.length === pairs.length ? 'ok' : ''}">${found.length}/${pairs.length}</span></div>
    <div class="vslots">${pairs.map(p => found.includes(p.e) ? `<button type="button" class="vslot found ${fresh.includes(p.e) ? 'pop' : ''}" data-action="say" data-text="${esc(p.e)}" title="${esc(p.v)}">✓ ${esc(p.e)}</button>` : `<span class="vslot" title="${vi ? 'Chưa mở' : 'Locked'}">? ${esc(p.v || p.e[0].toUpperCase() + ' ' + '_ '.repeat(Math.max(1, p.e.length - 1)).trim())}</span>`).join('')}</div>`;
}
actions['coach-mic'] = t => { const i = $('#coach-input'); if (speech.rec) { speech.stop(); t.classList.remove('btn-danger'); return; } const ok = speech.listen(txt => { i.value = (i.value + ' ' + txt).trim(); }, () => t.classList.remove('btn-danger')); if (ok) t.classList.add('btn-danger'); };
actions['coach-send'] = async () => {
  if (coachBusy) return; const u = me(); const inp = $('#coach-input'); const text = inp.value.trim(); if (!text) return;
  if (coachTurnsToday(u) >= coachDailyLimit()) { toast(`Đã hết ${coachDailyLimit()} lượt chat hôm nay – mai quay lại nhé`, 'err'); render(); return; }
  const chal = location.hash === '#/challenge' ? levelUpState(u) : null; if (chal && chal.phase !== 'challenge') { go('#/home'); return; }
  const s = chal ? challengeSession(u, chal.test) : coachSession(u); coachBusy = true; inp.value = ''; speech.stop();
  const before = s.challenge ? [] : foundWords(s, u); let fresh = [];
  s.messages.push({role: 'user', content: text}); save();
  const chat = $('#chat'); chat.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(text)}</div>`); const typing = $('#chat-typing'); typing.hidden = false; chat.appendChild(typing); chat.scrollTop = chat.scrollHeight; $('#coach-send').disabled = true;
  try {
    const pz = personaOf(u); let r, off;
    if (isCurt(text)) { // one word / bare keyword: impolite, answered locally – no AI call, no slot opens, still uses a daily turn
      const c = curtReply(pz, learnerWantsVi(u), weekVocabPairs(u)); r = {reply: c.reply, relevant: false, relevanceNote: c.note, rubric: {meaning: 0, vocab: 0, grammar: 0}, suggestions: [], correctedText: '', usedWords: []}; off = true;
    } else {
      const vocab = weekVocab(u);
      r = await ai.coachTurn(s, u, vocab);
      r.reply = personaText(r.reply, pz); (r.suggestions || []).forEach(g => { g.explanation = personaText(g.explanation, pz); });
      off = r.relevant === false; // the message did not answer the question: it is flagged, scored low on meaning and does not count as a practice turn
    }
    const usedWords = off ? [] : (Array.isArray(r.usedWords) ? r.usedWords : []).map(w => String(w).trim()).filter(w => w && usesWord(text, w)); // only words that really appear in the message
    const turn = {at: new Date().toISOString(), userText: text, reply: r.reply, rubric: {meaning: clamp(off ? Math.min(r.rubric.meaning, 1) : r.rubric.meaning, 0, 5), vocab: clamp(r.rubric.vocab, 0, 5), grammar: clamp(r.rubric.grammar, 0, 5)}, suggestions: (r.suggestions || []).slice(0, 3), correctedText: r.correctedText || '', offTopic: off, relevanceNote: off ? personaText(r.relevanceNote || '', pz) : '', persona: pz, usedWords};
    s.turns.push(turn); s.messages.push({role: 'assistant', content: r.reply});
    logActivity(u.id, 'coach', 4); save(true);
    typing.hidden = true; chat.innerHTML = renderChat(s, u); chat.appendChild(typing); chat.scrollTop = chat.scrollHeight;
    fresh = s.challenge ? [] : foundWords(s, u).filter(w => !before.includes(w)); // slots open only after the AI confirmed correct use in context
    if (fresh.length) { const cv = $('#coach-vocab'); if (cv) cv.innerHTML = vocabSlots(s, u, fresh); beep(); buzz(); toast(`Mở ô từ: ${fresh.join(', ')}`, 'ok'); }
    if (s.challenge && s.turns.length >= CHALLENGE_TURNS) { const res = finishChallenge(u, s); toast(res.pass ? 'Thử thách đạt! Yêu cầu lên mức đã gửi cho vận hành.' : `Thử thách chưa đạt (TB ${res.mean}/5, ${res.off} lượt lạc đề) – xem chi tiết ở Trang chủ`, res.pass ? 'ok' : 'err'); go('#/home'); return; }
    if (off) { const cv = $('#coach-vocab'); if (cv) cv.innerHTML = vocabSlots(s, u); toast(isCurt(text) ? 'Trả lời cộc lốc là thiếu lịch sự – viết ít nhất một câu đầy đủ nhé (lượt này không tính luyện)' : s.challenge ? 'Câu vừa rồi chưa trả lời đúng câu hỏi – tính là lạc đề' : 'Câu vừa rồi chưa trả lời đúng câu hỏi nên không tính lượt luyện và không mở ô từ', 'err'); }
    if (S.settings.coachVoice !== false) speech.speak(r.reply);
    const usedNow = coachTurnsToday(u), capNow = coachDailyLimit(); const cb = $('#coach-cap'); if (cb) cb.textContent = `Hôm nay ${usedNow}/${capNow} lượt`;
    if (usedNow >= capNow) { render(); return; } // limit reached: redraw with the input closed
  } catch (e) {
    s.messages.pop(); save(); typing.hidden = true; inp.value = text; toast(e.message, 'err'); const cv = $('#coach-vocab'); if (cv) cv.innerHTML = vocabSlots(s, u);
  } finally { coachBusy = false; const b = $('#coach-send'); if (b) b.disabled = false; $('#coach-input')?.focus(); }
};
actions['coach-new'] = async () => { const u = me(); const s = coachSession(u); if (!(await confirmDlg('Xoá đoạn chat này và bắt đầu hội thoại mới?\nTin nhắn và các ô từ đã mở sẽ biến mất khỏi màn hình, không khôi phục lại được. Số lượt luyện tuần này vẫn được tính.', {okLabel: 'Xoá chat', danger: true}))) return; s.week = -s.week; /* archive by negating week */ save(true); render(); };

// ---- Friday practice ----
function practiceTask(u, week) {
  const w = weekInfo(week); const t = w.topic || 'your work';
  return isLow(u.cefr) ? {type: 'writing', task: `Write 3–5 sentences about "${t}". Use at least 3 words from this week's lessons.`, vi: `Viết 3–5 câu tiếng Anh về chủ đề "${t}". Dùng ít nhất 3 từ trong bài học tuần này.`}
    : u.cefr === 'B1' ? {type: 'writing', task: `Write a short paragraph or email (80–120 words) about "${t}", including one problem and one suggestion.`, vi: ''}
    : {type: 'dialogue', task: `Write a short dialogue (8–12 lines) or a 120–180-word reflection on "${t}". Show a disagreement or a negotiation and how it is resolved.`, vi: ''};
}
route('#/practice', () => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  const wk = currentWeek(); const w = weekInfo(wk); const sub = weekSubmission(u, wk); const task = practiceTask(u, wk); const vi = isLow(u.cefr);
  const past = S.submissions.filter(s => s.userId === u.id && s.week !== wk).sort((a, b) => b.week - a.week);
  const wl = u.cefrApproved ? approvedLessons(wk, u.cefr) : []; const wdone = doneCount(u, wl); // weekend practice opens only after all the week's lessons are done
  const subView = s => `<div class="card"><div class="row between"><h3>Tuần ${s.week} · ${fmtDateTime(s.submittedAt)}</h3>${s.total != null ? `<span class="badge ${s.total >= 70 ? 'ok' : s.total >= 50 ? 'warn' : 'danger'}">${s.total}/100</span>` : '<span class="badge warn">Chờ chấm</span>'}</div>
      <div class="card soft small" style="white-space:pre-wrap;margin-top:8px">${esc(s.text)}</div>
      ${s.total != null ? `<div class="rubric" style="margin-top:10px"><div class="r"><b>${s.rubric.meaning}</b><span>${vi ? 'Đúng ý' : 'Meaning'}</span></div><div class="r"><b>${s.rubric.vocab}</b><span>${vi ? 'Từ vựng' : 'Vocabulary'}</span></div><div class="r"><b>${s.rubric.grammar}</b><span>${vi ? 'Ngữ pháp' : 'Grammar'}</span></div></div>
        <div class="bao-row" style="margin-top:10px">${bao(s.total >= 70 ? 'praise' : 'hello', 60, true)}<div class="small" style="flex:1">${nl2br(s.feedback || '')}</div></div>
        ${(s.suggestions || []).length ? `<ul class="sugg">${s.suggestions.map(g => `<li><s class="muted">${esc(g.original)}</s> → <b>${esc(g.corrected)}</b><br><span class="muted">${esc(g.explanation)}</span></li>`).join('')}</ul>` : ''}
        ${s.correctedText ? `<details style="margin-top:6px"><summary class="small">${vi ? 'Bản sửa hoàn chỉnh' : 'Corrected version'}</summary><div class="small" style="white-space:pre-wrap">${esc(s.correctedText)}</div></details>` : ''}` : ''}</div>`;
  shell(`<div class="page-title"><div><div class="eyebrow">Tuần ${wk}${w.topic ? ' · ' + esc(w.topic) : ''}</div><h1>Bài thực hành cuối tuần</h1></div></div>
    ${!u.cefrApproved ? `<div class="card"><p class="muted">Bạn cần được duyệt trình độ trước.</p></div>` : sub ? subView(sub) + (sub.total != null ? `<div class="card" style="margin-top:-4px">${appealLine('sub', sub.id, 'appeal-sub', !sub.manualReview) || '<span class="small muted">Điểm này đã được Người vận hành chấm lại bằng tay.</span>'}</div>` : '') : wl.length && wdone < wl.length ? `<div class="card" style="border-color:#6E3B32"><div class="bao-row">${bao('think', 80, true)}<div style="flex:1"><div class="banner danger" style="margin-bottom:10px"><div class="body"><b style="font-family:var(--font-display);font-size:1.15rem">🔒 Bạn chưa mở khoá bài Tuần ${wk} – Chủ đề "${esc(w.topic || '—')}"</b></div></div><h3>Xong đủ ${wl.length} bài T2–T6 trước đã nhé</h3><p class="small">Bài thực hành cuối tuần dùng lại mẫu câu và từ vựng của cả tuần, nên chỉ mở khi bạn hoàn thành đủ các bài trong tuần. Bạn đã xong <b>${wdone}/${wl.length}</b> bài, còn thiếu <b>${wl.length - wdone}</b> bài.</p><div class="progress" style="margin:8px 0 12px"><i style="width:${pct(wdone, wl.length)}%"></i></div><a class="btn btn-primary" href="#/home">Về trang chủ học tiếp</a></div></div></div>` : `
    <div class="card"><div class="bao-row">${bao('hello', 72, true)}<div class="bubble" style="flex:1">${esc(task.task)}</div></div>${task.vi ? `<p class="small muted" style="margin-top:8px">${esc(task.vi)}</p>` : ''}
      <textarea id="pr-text" style="min-height:160px;margin-top:10px" placeholder="${vi ? 'Viết bằng tiếng Anh…' : 'Write in English…'}"></textarea>
      <div class="row between" style="margin-top:8px"><span class="xs muted" id="pr-wc">0 từ</span><div class="row">${speech.canListen() ? `<button data-action="pr-mic" id="pr-mic">${ICONS.mic} Nói</button>` : ''}<button class="btn-primary" data-action="pr-submit" id="pr-submit">Nộp bài</button></div></div>
      <div id="pr-status" class="small muted" style="margin-top:6px"></div>
      <p class="xs muted" style="margin-top:10px">${ai.hasKey() ? (vi ? 'AI chấm theo rubric (đúng ý · từ vựng · ngữ pháp) và gợi ý tối đa 3 chỗ sửa ngay sau khi nộp.' : 'AI grades with the rubric (meaning · vocabulary · grammar) and gives up to 3 suggestions right after you submit.') : (vi ? 'Chưa kết nối AI – người vận hành sẽ chấm tay.' : 'AI is not connected – the operator will grade manually.')}</p></div>`}
    ${past.length ? `<section class="section"><h3>Các tuần trước</h3>${past.map(subView).join('')}</section>` : ''}`, {title: 'Bài thực hành cuối tuần'});
  $('#pr-text')?.addEventListener('input', e => $('#pr-wc').textContent = wordCount(e.target.value) + ' từ');
});
actions['pr-mic'] = t => { const i = $('#pr-text'); if (speech.rec) { speech.stop(); t.classList.remove('btn-danger'); return; } if (speech.listen(txt => { i.value = (i.value + ' ' + txt).trim(); i.dispatchEvent(new Event('input')); }, () => t.classList.remove('btn-danger'))) t.classList.add('btn-danger'); };
actions['pr-submit'] = async t => {
  const u = me(); const text = $('#pr-text').value.trim(); if (wordCount(text) < 8) { toast('Bài quá ngắn (tối thiểu 8 từ)', 'err'); return; }
  const wk = currentWeek(); const task = practiceTask(u, wk);
  const sub = {id: uid('sub'), userId: u.id, week: wk, type: task.type, task: task.task, text, rubric: null, total: null, feedback: '', suggestions: [], correctedText: '', aiGraded: false, operatorChecked: false, submittedAt: new Date().toISOString()};
  t.disabled = true; speech.stop();
  if (ai.hasKey()) { $('#pr-status').innerHTML = '<span class="spinner"></span> Season đang chấm bài…'; try { await (async () => { const r = await ai.gradeSubmission(sub, u); sub.rubric = r.rubric; sub.total = clamp(r.total, 0, 100); sub.feedback = r.feedback; sub.suggestions = (r.suggestions || []).slice(0, 3); sub.correctedText = r.correctedText; sub.aiGraded = true; sub.gradedAt = new Date().toISOString(); })(); } catch (e) { toast('AI chưa chấm được: ' + e.message + '. Bài đã lưu, vận hành sẽ chấm.', 'err'); } }
  S.submissions.push(sub); logActivity(u.id, 'practice', 10); save(true); toast('Đã nộp bài', 'ok'); render();
};

// ---- survey ----
route('#/survey', () => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  const done = S.surveys.find(s => s.userId === u.id);
  shell(`<div class="page-title"><h1>Khảo sát cuối pilot</h1></div>
    ${done ? `<div class="card"><div class="bao-row">${bao('praise', 80, true)}<div><h3>Cảm ơn bạn!</h3><p class="small">Bạn đã đánh giá ${done.rating}/5. ${done.comment ? '“' + esc(done.comment) + '”' : ''}</p><a class="btn" href="#/profile">Xem tiến độ</a></div></div></div>`
    : `<div class="card"><div class="bao-row">${bao('hello', 80, true)}<div class="bubble" style="flex:1">Học với mình 2 tuần qua có hữu ích không?</div></div>
      <div class="row" style="margin:16px 0;justify-content:center;gap:10px">${[1, 2, 3, 4, 5].map(n => `<button class="btn-lg sv-star" data-action="sv-pick" data-n="${n}" style="width:56px;padding:0;justify-content:center;font-size:1.4rem">${n}</button>`).join('')}</div>
      <p class="xs muted" style="text-align:center;margin-top:-8px">1 = không hữu ích · 5 = rất hữu ích</p>
      <label class="field"><span>Điều gì hữu ích nhất? Điều gì nên đổi?</span><textarea id="sv-comment"></textarea></label>
      <label class="field"><span>Bạn học chủ yếu lúc nào?</span><select id="sv-when"><option>Trong giờ làm</option><option>Ngoài giờ</option><option>Cả hai</option></select></label>
      <button class="btn-primary" data-action="sv-submit" id="sv-submit" disabled>Gửi khảo sát</button></div>`}`, {title: 'Khảo sát'});
});
actions['sv-pick'] = t => { $$('.sv-star').forEach(b => b.style.background = ''); t.style.background = 'var(--butter)'; $('#sv-submit').disabled = false; $('#sv-submit').dataset.n = t.dataset.n; };
actions['sv-submit'] = t => { S.surveys.push({userId: me().id, rating: +t.dataset.n, comment: $('#sv-comment').value.trim(), when: $('#sv-when').value, at: new Date().toISOString()}); save(true); toast('Cảm ơn bạn!', 'ok'); render(); };

// ---- profile / progress ----
route('#/profile', () => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  const pt = userTest(u.id, 'placement'); const ft = userTest(u.id, 'final');
  const weeks = Array.from({length: S.settings.pilotWeeks}, (_, i) => i + 1);
  shell(`<div class="page-title"><div><div class="eyebrow">Tiến độ & hồ sơ</div><h1 style="margin:2px 0 0"><span class="name">${esc(u.name)}</span></h1><p class="muted" style="margin:2px 0 0">${u.cefrApproved ? `Trình độ ${LEVEL_NAMES[u.cefr]}` : 'Chưa duyệt trình độ'}${u.monthlyGoal ? ' · ' + esc(u.monthlyGoal) : ''}</p></div>${u.cefrApproved ? lvlChip(u.cefr) + ' ' + pendingLevelBadge(u) : ''}</div>
    <div class="card"><div class="row" style="gap:16px;align-items:center;flex-wrap:wrap"><button class="btn-ghost" data-action="avatar-pick" title="Đổi avatar" style="padding:0;border:0;background:transparent">${userAvatar(u, 88)}</button>
      <div style="flex:1;min-width:200px"><b style="font-family:var(--font-display);font-size:1.1rem">Avatar của bạn</b><div class="small muted">${u.avatar ? `${(AVATAR_ACC.find(a => a[0] === u.avatar.acc) || AVATAR_ACC[0])[1]} · nét ${(AVATAR_COLORS.find(c => c[0] === u.avatar.color) || AVATAR_COLORS[0])[2].toLowerCase()}` : 'Chưa chọn – đang hiện chữ cái đầu'}</div></div>
      <div class="row"><button class="btn-primary" data-action="avatar-pick">Đổi avatar</button><a class="btn" href="#/onboard">Sửa hồ sơ</a></div></div></div>
    ${profileCard(u, {editable: true})}
    ${u.cefrApproved ? rewardCard(u) + levelSignalCard(u) : ''}
    <div class="grid cols-3" style="margin-top:12px">
      <div class="card kpi"><span class="val">${S.progress.filter(p => p.userId === u.id).length}</span><span class="lbl">bài đã học</span></div>
      <div class="card kpi"><span class="val">${practiceSessions(u).reduce((n, c) => n + goodTurns(c).length, 0)}</span><span class="lbl">lượt luyện với Season</span></div>
      <div class="card kpi"><span class="val">${activeDays(u.id, S.settings.pilotStartDate, todayStr()).size}</span><span class="lbl">ngày có học</span></div>
    </div>
    ${weeks.map(wk => `<div class="card" style="margin-top:12px"><div class="row between"><h3>Tuần ${wk} <span class="small muted">${esc(weekInfo(wk).topic || '')}</span></h3><span class="small muted" style="font-weight:800">${cefrAt(u, wk) !== u.cefr ? lvlChip(cefrAt(u, wk)) + ' ' : ''}${sessionsThisWeek(u.id, wk)} buổi · ${approvedLessons(wk, cefrAt(u, wk)).filter(l => userProgress(u.id, l.id)).length}/${approvedLessons(wk, cefrAt(u, wk)).length || '–'} bài</span></div>${weekDots(u.id, wk)}</div>`).join('')}
    <div class="card" style="margin-top:12px"><h3>Điểm đầu vào → cuối kỳ</h3>
      ${pt ? `<div class="grid cols-2"><div><div class="eyebrow">Đầu vào · ${fmtDate(pt.submittedAt)}</div><div class="score-big">${pt.total}</div><div class="stack" style="gap:4px">${sectionBars(pt.sectionScores)}</div></div>
        <div><div class="eyebrow">Cuối kỳ ${ft ? '· ' + fmtDate(ft.submittedAt) : ''}</div>${ft ? `<div class="score-big">${ft.total} <span class="badge ${ft.total > pt.total ? 'ok' : 'warn'}" style="vertical-align:middle">${ft.total - pt.total >= 0 ? '+' : ''}${ft.total - pt.total}</span></div><div class="stack" style="gap:4px">${sectionBars(ft.sectionScores)}</div>` : `<p class="small muted">${isLastWeek() ? '<a href="#/test/final">Làm bài cuối kỳ →</a>' : 'Mở ở tuần cuối pilot.'}</p>`}</div></div>` : '<p class="muted small">Chưa có bài test.</p>'}
    </div>
    ${S.surveys.find(s => s.userId === u.id) ? '' : (ft ? `<div class="card" style="margin-top:12px"><a class="btn btn-primary" href="#/survey">Trả lời khảo sát cuối pilot</a></div>` : '')}`, {title: 'Tiến độ & hồ sơ'});
});

// =====================================================================
// Manager screens
// =====================================================================
function weekCompleted(u, wk) {
  const ls = approvedLessons(wk, cefrAt(u, wk));
  return ls.length ? ls.every(l => userProgress(u.id, l.id)?.completedAt) : sessionsThisWeek(u.id, wk) >= 3;
}
function kpis() {
  const L = activeLearners(), wk = currentWeek(), n = L.length;
  const weeksSoFar = Array.from({length: wk}, (_, i) => i + 1);
  const regular = L.filter(u => sessionsThisWeek(u.id, wk) >= 3).length;
  const byWeek = weeksSoFar.map(w => ({w, pct: pct(L.filter(u => sessionsThisWeek(u.id, w) >= 3).length, n)}));
  const completed = L.filter(u => weeksSoFar.every(w => weekCompleted(u, w))).length;
  const both = L.map(u => ({p: userTest(u.id, 'placement'), f: userTest(u.id, 'final')})).filter(x => x.p && x.f);
  const improved = both.filter(x => x.f.total > x.p.total).length;
  const ratings = S.surveys.map(s => s.rating);
  return {n, wk, regular, regularPct: pct(regular, n), byWeek, completed, completedPct: pct(completed, n), both: both.length, improved, improvedPct: pct(improved, both.length), surveys: ratings.length, satisfaction: ratings.length ? Math.round(avg(ratings) * 10) / 10 : null};
}
function learnerRow(u) {
  const wk = currentWeek(), ls = approvedLessons(wk, u.cefr);
  const miss = missedDays(u.id), sessions = sessionsThisWeek(u.id);
  return {u, wk, lessons: ls.length, done: ls.filter(l => userProgress(u.id, l.id)?.completedAt).length, turns: coachTurnsThisWeek(u), sessions, last: lastActiveDate(u.id), miss, rw: rewards(u),
    sub: weekSubmission(u, wk), p: userTest(u.id, 'placement'), f: userTest(u.id, 'final'), risk: miss >= 2 ? 2 : (sessions === 0 && dowIndex(todayStr()) >= 2 ? 1 : 0)};
}
const kpiTile = (label, val, sub, ok) => `<div class="card kpi" style="background:${ok === null ? 'var(--surface)' : ok ? 'var(--mint)' : 'var(--peach)'}"><span class="val">${val}</span><span class="lbl" style="color:var(--text);font-weight:800">${label}</span><span class="xs" style="font-weight:700">${sub}</span></div>`;
const weekDotsMini = (uid, wk) => { const s = weekStart(wk), act = activeDays(uid, s, addDays(s, 6)), t = todayStr(); return DOW.map((d, i) => { const ds = addDays(s, i); return `<span class="dot ${act.has(ds) ? 'on' : ds < t ? 'off' : ''} ${ds === t ? 'today' : ''}" title="${d}"></span>`; }).join(''); };

route('#/mgr', () => {
  const u = me(); if (u.role === 'learner') { go('#/home'); return; }
  const k = kpis(); const rows = activeLearners().map(learnerRow).sort((a, b) => b.risk - a.risk || a.sessions - b.sessions);
  const pendingRem = S.reminders.filter(r => r.status === 'pending').length;
  const waiting = learners().filter(x => !x.cefrApproved);
  shell(`<div class="page-title"><div><h1>Tiến độ nhóm</h1><p class="muted">Tuần ${k.wk}/${S.settings.pilotWeeks} · ${k.n} người học đang hoạt động · ${waiting.length} chưa vào học</p></div>
      <div class="row">${pendingRem ? `<a class="btn" href="#/mgr/reminders" style="background:var(--butter)">${ICONS.bell} ${pendingRem} cần nhắc</a>` : ''}<a class="btn" href="#/mgr/rewards">Giả lập phần thưởng</a><button data-action="export-csv">Xuất CSV</button></div></div>
    ${pinCard(u)}${delReqCard(u)}${trashCard(u)}
    <div class="grid cols-4">
      ${kpiTile('Học đều (≥3 buổi/tuần)', k.regularPct + '%', `${k.regular}/${k.n} người · ngưỡng 70%`, k.n ? k.regularPct >= 70 : null)}
      ${kpiTile('Học đến cuối', k.completedPct + '%', `${k.completed}/${k.n} hoàn thành các tuần đã qua · ngưỡng 60%`, k.n ? k.completedPct >= 60 : null)}
      ${kpiTile('Có tiến bộ', k.both ? k.improvedPct + '%' : '—', k.both ? `${k.improved}/${k.both} tăng điểm · ngưỡng 70%` : 'Chưa có bài cuối kỳ', k.both ? k.improvedPct >= 70 : null)}
      ${kpiTile('Hài lòng', k.satisfaction != null ? k.satisfaction + '/5' : '—', k.surveys ? `${k.surveys} phản hồi · ngưỡng 4/5` : 'Chưa có khảo sát', k.surveys ? k.satisfaction >= 4 : null)}
    </div>
    <div class="card" style="margin-top:12px"><div class="row between"><h3>Từng người học</h3><span class="xs muted">Sắp theo rủi ro bỏ học</span></div>
      <div class="table-wrap"><table><thead><tr><th>Người học</th><th>Mức</th><th>Tuần này</th><th>Bài</th><th>Coach</th><th>Bài T6</th><th>Điểm thưởng</th><th>Gần nhất</th><th>Đầu vào → cuối</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${esc(r.u.name)}</b></td><td>${lvlChip(r.u.cefr)}</td><td>${weekDotsMini(r.u.id, r.wk)} <span class="xs muted">${r.sessions}</span></td>
        <td>${r.lessons ? `${r.done}/${r.lessons}` : '<span class="muted">—</span>'}</td><td>${r.turns}${r.turns >= 2 ? ' ✓' : ' <span class="xs muted">/2</span>'}</td>
        <td>${r.sub ? (r.sub.total != null ? `<span class="badge ${r.sub.total >= 70 ? 'ok' : r.sub.total >= 50 ? 'warn' : 'danger'}">${r.sub.total}</span>` : '<span class="badge warn">chờ chấm</span>') : '<span class="muted">chưa</span>'}</td>
        <td><span title="Cấp ${r.rw.lv.index + 1}: ${r.rw.lv.name}">${r.rw.lv.icon}</span> <b>★ ${r.rw.points}</b> <span class="xs muted" title="${esc(r.rw.badges.filter(b => b.earned).map(b => b.name).join(', ') || 'chưa có huy hiệu')}">${r.rw.badges.filter(b => b.earned).map(b => b.icon).join('')}</span></td>
        <td class="small">${r.last ? fmtDate(r.last) + (r.miss ? ` <span class="muted">(${r.miss} ngày)</span>` : '') : '<span class="muted">chưa học</span>'}</td>
        <td class="small">${r.p ? r.p.total : '—'} → ${r.f ? `${r.f.total} <span class="badge ${r.f.total > (r.p?.total ?? 0) ? 'ok' : 'warn'}">${r.f.total - (r.p?.total || 0) >= 0 ? '+' : ''}${r.f.total - (r.p?.total || 0)}</span>` : '<span class="muted">—</span>'}</td>
        <td>${r.risk === 2 ? `<span class="badge danger">Bỏ ${r.miss} ngày</span>` : r.risk === 1 ? '<span class="badge warn">Chưa học tuần này</span>' : '<span class="badge ok">Đang học</span>'}</td>
        <td class="row" style="flex-wrap:nowrap"><button class="btn-sm" data-action="op-view-profile" data-id="${r.u.id}" title="Hồ sơ cá nhân">Hồ sơ</button><button class="btn-sm btn-danger" data-action="del-user" data-id="${r.u.id}" title="Xoá học viên và toàn bộ dữ liệu học">Xoá</button></td></tr>`).join('') || '<tr><td colspan="10" class="muted">Chưa có người học được duyệt mức.</td></tr>'}
      </tbody></table></div></div>
    ${waiting.length ? `<div class="card" style="margin-top:12px"><h3>Chưa vào học</h3><div class="list">${waiting.map(x => `<div class="item"><div class="body"><div class="title">${esc(x.name)}</div><div class="xs muted">${userTest(x.id, 'placement') ? 'Đã làm test, chờ vận hành duyệt mức' : x.profile ? 'Đã điền hồ sơ, chưa làm test' : 'Chưa điền hồ sơ'}</div></div><button class="btn-sm btn-danger" data-action="del-user" data-id="${x.id}">Xoá</button></div>`).join('')}</div></div>` : ''}`, {title: 'Tiến độ nhóm'});
});
function exportCSV() {
  const rows = activeLearners().map(learnerRow);
  const head = ['Ten', 'Phong ban', 'Vi tri', 'Muc', 'Buoi tuan nay', 'Bai xong', 'Tong bai', 'Luot coach', 'Hoat dong gan nhat', 'Ngay bo', 'Diem T6', 'Dau vao', 'Cuoi ky', 'Hai long', 'Diem thuong', 'Huy hieu', 'Cap ngong'];
  const lines = rows.map(r => [r.u.name, r.u.profile?.department || '', r.u.profile?.position || '', r.u.cefr, r.sessions, r.done, r.lessons, r.turns, r.last || '', r.miss, r.sub?.total ?? '', r.p?.total ?? '', r.f?.total ?? '', S.surveys.find(s => s.userId === r.u.id)?.rating ?? '', r.rw.points, r.rw.badges.filter(b => b.earned).length, `${r.rw.lv.index + 1} - ${r.rw.lv.name}`]);
  const csv = [head, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(`aec-tien-do-${todayStr()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}
actions['export-csv'] = () => exportCSV();

// ---- manager: operator performance (lessons prepared per week + quality seen through learner results) ----
function opStats(op) {
  const weeks = Array.from({length: S.settings.pilotWeeks}, (_, i) => i + 1);
  const mine = S.lessonSets.filter(ls => (ls.generatedBy || ls.approvedBy) === op.id || ls.approvedBy === op.id);
  const byWeek = weeks.map(w => { const sets = mine.filter(ls => ls.week === w); return {w, sets: sets.length, lessons: sum(sets.map(s => s.lessons.length)), approved: sets.filter(s => s.status === 'approved').length}; });
  const lessons = mine.flatMap(ls => ls.lessons);
  const full = lessons.filter(l => isMicroLesson(l) && lessonParts(l).length === 4 && l.pron && (l.vocab || []).length).length;
  const ids = lessons.map(l => l.id); const idSet = new Set(ids);
  const prog = S.progress.filter(p => idSet.has(p.lessonId) && p.completedAt);
  let parts = 0, first = 0, failed = 0, attempts = 0;
  Object.entries(S.practiceResults || {}).forEach(([k, r]) => { if (!ids.some(id => k.endsWith('_' + id) || k.includes('_' + id + '~'))) return; const st = resState(r); if (!st.attempts) return; parts++; attempts += st.attempts; if (st.ok && st.attempts === 1) first++; if (st.done && !st.ok) failed++; });
  const approvals = learners().filter(x => x.approvedBy === op.id);
  const waits = approvals.map(x => { const t = userTest(x.id, 'placement'); return t && x.approvedAt ? (new Date(x.approvedAt) - new Date(t.submittedAt)) / 3600000 : null; }).filter(v => v != null && v >= 0);
  const avgScore = prog.length ? Math.round(avg(prog.map(p => p.score ?? 0))) : null; const failPct = parts ? pct(failed, parts) : null;
  const verdict = avgScore == null && !parts ? ['', 'Chưa đủ dữ liệu'] : ((avgScore ?? 100) < 60 || (failPct ?? 0) > 20) ? ['danger', 'Cần xem lại'] : ((avgScore ?? 100) >= 75 && (failPct ?? 0) <= 10) ? ['ok', 'Tốt'] : ['warn', 'Ổn'];
  return {byWeek, sets: mine.length, lessons: lessons.length, full, edited: lessons.filter(l => l.editedBy === op.id).length, completions: prog.length, avgScore, parts, firstPct: parts ? pct(first, parts) : null, failPct, avgAttempts: parts ? Math.round(attempts / parts * 10) / 10 : null,
    approvals: approvals.length, waitH: waits.length ? Math.round(avg(waits) * 10) / 10 : null, subsRead: S.submissions.filter(s => s.operatorChecked && s.checkedBy === op.id).length, turnsRead: S.coachSessions.reduce((n, c) => n + c.turns.filter(t => t.checked && t.checkedBy === op.id).length, 0), delReqs: delReqs().filter(r => r.by === op.id).length, verdict};
}
route('#/mgr/ops', () => {
  const u = me(); if (u.role !== 'manager') { go('#/'); return; }
  const ops = S.users.filter(x => x.role === 'operator'); const wk = currentWeek(); const lv = levelsInUse();
  const need = []; for (let w = 1; w <= Math.min(wk, S.settings.pilotWeeks); w++) lv.forEach(l => need.push({w, l, set: lessonSet(w, l)}));
  const ready = need.filter(n => n.set?.status === 'approved').length; const missing = need.filter(n => n.set?.status !== 'approved');
  const orphan = S.lessonSets.filter(ls => !ls.generatedBy && !ls.approvedBy).length;
  const v = (val, suffix = '') => val == null ? '<span class="muted">—</span>' : `<b>${val}${suffix}</b>`;
  const line = (label, val) => `<div class="row between small" style="padding:3px 0;border-bottom:1px dashed var(--line)"><span>${label}</span><span>${val}</span></div>`;
  shell(`<div class="page-title"><div><h1>Hiệu suất vận hành</h1><p class="muted">Tuần ${wk}/${S.settings.pilotWeeks} · ${ops.length} người vận hành. Số bài soạn theo tuần và chất lượng bài nhìn qua kết quả của học viên.</p></div></div>
    ${pinCard(u)}${delReqCard(u)}${trashCard(u)}
    <div class="card"><h3>Xem màn hình của Người vận hành</h3><p class="small muted" style="margin:2px 0 8px">Bạn thấy đúng những gì vận hành thấy, ở chế độ chỉ xem.</p><div class="row"><a class="btn" href="#/op">Duyệt mức</a><a class="btn" href="#/op/weeks">Chủ đề tuần</a><a class="btn" href="#/op/lessons">Bài học</a><a class="btn" href="#/op/review">Đọc mẫu</a><a class="btn" href="#/op/prompts">Prompt</a><a class="btn" href="#/op/levelforms">Đề lên mức</a></div></div>
    <div class="card" style="margin-top:12px;background:${!need.length ? 'var(--surface)' : missing.length ? 'var(--butter)' : 'var(--mint)'}"><div class="row between"><h3>Bộ bài đã sẵn sàng đến tuần ${wk}</h3><span class="badge">${ready}/${need.length || 0} bộ đã duyệt</span></div>
      <p class="small" style="margin:4px 0 0">${!need.length ? 'Chưa có học viên được duyệt mức nên chưa cần bộ bài nào.' : missing.length ? 'Còn thiếu: ' + missing.map(n => `Tuần ${n.w} · ${n.l} (${n.set ? 'bản nháp chưa duyệt' : 'chưa sinh'})`).join('; ') + '.' : 'Mọi mức đang có học viên đều đã có bộ bài được duyệt.'}</p></div>
    ${ops.map(op => { const s = opStats(op); return `<div class="card" style="margin-top:12px"><div class="row between"><div class="row" style="gap:10px">${userAvatar(op, 44)}<div><b style="font-family:var(--font-display);font-size:1.15rem">${esc(op.name)}</b><div class="xs muted">${s.sets} bộ bài · ${s.lessons} bài</div></div></div><span class="badge ${s.verdict[0]}" title="Tốt: điểm TB ≥75 và ≤10% phần hết lượt · Cần xem lại: điểm TB <60 hoặc >20% phần hết lượt">Chất lượng: ${s.verdict[1]}</span></div>
      <div class="grid cols-2" style="margin-top:10px">
        <div><div class="eyebrow" style="margin-bottom:4px">Số bài soạn theo tuần</div><div class="table-wrap"><table><thead><tr><th>Tuần</th><th>Bộ bài</th><th>Số bài</th><th>Đã duyệt</th></tr></thead><tbody>${s.byWeek.map(b => `<tr style="${b.w === wk ? 'font-weight:800' : ''}"><td>Tuần ${b.w}${b.w === wk ? ' (hiện tại)' : ''}</td><td>${b.sets}</td><td>${b.lessons}</td><td>${b.sets ? `${b.approved}/${b.sets}` : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>
          ${line('Bài đủ cấu trúc chuẩn (4 kỹ năng + 3 thành phần)', s.lessons ? `<b>${s.full}/${s.lessons}</b>` : v(null))}${line('Bài đã sửa tay sau khi AI sinh', v(s.edited))}</div>
        <div><div class="eyebrow" style="margin-bottom:4px">Chất lượng qua kết quả học viên</div>
          ${line('Lượt hoàn thành bài', v(s.completions))}${line('Điểm trung bình của bài', v(s.avgScore, '%'))}${line('Phần làm đúng ngay lần đầu', v(s.firstPct, '%'))}${line(`Phần hết ${MAX_ATTEMPTS} lượt vẫn sai`, v(s.failPct, '%'))}${line('Số lần làm trung bình mỗi phần', v(s.avgAttempts))}
          <div class="eyebrow" style="margin:10px 0 4px">Việc duyệt và kiểm tra</div>
          ${line('Học viên đã duyệt mức', v(s.approvals))}${line('Thời gian chờ duyệt mức trung bình', v(s.waitH, ' giờ'))}${line('Bài nộp đã đọc mẫu', v(s.subsRead))}${line('Phản hồi coach đã kiểm', v(s.turnsRead))}${line('Yêu cầu xoá tài khoản đã gửi', v(s.delReqs))}</div>
      </div></div>`; }).join('') || '<div class="empty">Chưa có tài khoản Người vận hành.</div>'}
    <p class="xs muted" style="margin-top:10px">Người soạn được ghi nhận từ bản này trở đi (người bấm Sinh / Duyệt). ${orphan ? `${orphan} bộ bài cũ chưa có thông tin người soạn nên không tính cho ai. ` : ''}Chỉ số chất lượng cần có học viên làm bài mới có số liệu.</p>`, {title: 'Hiệu suất vận hành'});
});

route('#/mgr/reminders', () => {
  const u = me(); if (u.role === 'learner') { go('#/home'); return; }
  computeReminders();
  const pending = S.reminders.filter(r => r.status === 'pending').map(r => ({r, u: userById(r.userId)})).filter(x => x.u);
  const history = S.reminders.filter(r => r.status !== 'pending').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const hasWh = !!S.settings.webhookUrl;
  const statusLabel = {sent: 'Đã gửi webhook', copied: 'Đã copy', dismissed: 'Nhắc tay', resolved: 'Đã quay lại học'};
  shell(`<div class="page-title"><div><h1>Nhắc học</h1><p class="muted">Tự phát hiện người bỏ ≥2 ngày liên tiếp. Gửi qua Base Message webhook hoặc copy tin nhắn để gửi tay.</p></div>
      ${pending.length ? `<button class="btn-primary" data-action="rem-send-all" ${hasWh ? '' : 'disabled title="Chưa cấu hình webhook"'}>${ICONS.bell} Gửi tất cả (${pending.length})</button>` : ''}</div>
    ${hasWh ? '' : `<div class="banner info" style="margin-bottom:12px">${bao('think', 48, true)}<div class="body small">Chưa có webhook Base.vn. Dán URL incoming webhook của nhóm chat trong <a href="#/settings">Cài đặt</a>, hoặc dùng nút Copy để gửi tay.</div></div>`}
    ${pending.length ? pending.map(({r, u: x}) => `<div class="card"><div class="row between"><div><b class="name" style="font-family:var(--font-display);font-size:1.05rem">${esc(x.name)}</b> ${lvlChip(x.cefr)} <span class="badge danger">bỏ ${r.missedDays} ngày</span></div><span class="xs muted">${fmtDate(r.date)}</span></div>
      <div class="card soft small" style="margin-top:8px;white-space:pre-wrap">${esc(reminderMessage(x))}</div>
      <div class="row" style="margin-top:8px"><button class="btn-sm" data-action="rem-copy" data-id="${r.id}">Copy tin nhắn</button><button class="btn-sm btn-primary" data-action="rem-send" data-id="${r.id}" ${hasWh ? '' : 'disabled'}>Gửi qua Base.vn</button><button class="btn-sm btn-ghost" data-action="rem-dismiss" data-id="${r.id}">Đã nhắc cách khác</button></div></div>`).join('')
    : `<div class="card"><div class="bao-row">${bao('praise', 72, true)}<div><h3>Không ai cần nhắc hôm nay</h3><p class="small muted" style="margin:0">Mọi người học đều có hoạt động trong 2 ngày gần đây.</p></div></div></div>`}
    ${history.length ? `<section class="section"><h3>Lịch sử nhắc</h3><div class="card"><div class="table-wrap"><table><thead><tr><th>Ngày</th><th>Người học</th><th>Bỏ</th><th>Kết quả</th></tr></thead><tbody>${history.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(userById(r.userId)?.name || '—')}</td><td>${r.missedDays} ngày</td><td><span class="badge ${r.status === 'sent' ? 'ok' : r.status === 'resolved' ? 'primary' : ''}">${statusLabel[r.status] || r.status}</span></td></tr>`).join('')}</tbody></table></div></div></section>` : ''}`, {title: 'Nhắc học'});
});
const remById = id => S.reminders.find(r => r.id === id);
async function sendReminder(r) { const x = userById(r.userId); await sendWebhook(reminderMessage(x), x); r.status = 'sent'; r.handledAt = new Date().toISOString(); save(true); }
actions['rem-copy'] = t => { const r = remById(t.dataset.id); copyText(reminderMessage(userById(r.userId))); r.status = 'copied'; r.handledAt = new Date().toISOString(); save(true); setTimeout(render, 400); };
actions['rem-dismiss'] = t => { const r = remById(t.dataset.id); r.status = 'dismissed'; r.handledAt = new Date().toISOString(); save(true); render(); };
actions['rem-send'] = async t => { try { await sendReminder(remById(t.dataset.id)); toast('Đã gửi request tới Base.vn', 'ok'); render(); } catch (e) { toast(e.message, 'err'); } };
actions['rem-send-all'] = async t => { t.disabled = true; let n = 0; for (const r of S.reminders.filter(r => r.status === 'pending')) { try { await sendReminder(r); n++; } catch (e) { toast(e.message, 'err'); break; } } toast(`Đã gửi ${n} tin nhắc`, 'ok'); render(); };

route('#/mgr/report', () => {
  const u = me(); if (u.role === 'learner') { go('#/home'); return; }
  const k = kpis(); const rows = activeLearners().map(learnerRow);
  const verdict = (has, ok) => has ? (ok ? '✅ Đạt' : '❌ Chưa đạt') : 'chưa có dữ liệu';
  const text = [
    `BÁO CÁO PILOT CHIPPI – GFT ENGLISH COACH – ${S.settings.orgName} – ${new Date().toLocaleDateString('vi-VN')}`,
    `Tuần ${k.wk}/${S.settings.pilotWeeks} · ${k.n} người học hoạt động (${learners().length} đăng ký)`, '',
    'BỐN CHỈ SỐ',
    `1. Học đều (≥3 buổi/tuần): ${k.regularPct}% (${k.regular}/${k.n}) – ngưỡng 70% – ${verdict(k.n, k.regularPct >= 70)}`,
    `   Theo tuần: ${k.byWeek.map(x => `T${x.w}: ${x.pct}%`).join(', ')}`,
    `2. Học đến cuối: ${k.completedPct}% (${k.completed}/${k.n}) – ngưỡng 60% – ${verdict(k.n, k.completedPct >= 60)}`,
    `3. Có tiến bộ (điểm cuối > đầu vào, cùng rubric): ${k.both ? `${k.improvedPct}% (${k.improved}/${k.both}) – ngưỡng 70% – ${verdict(true, k.improvedPct >= 70)}` : 'chưa có bài cuối kỳ'}`,
    `4. Hài lòng: ${k.surveys ? `${k.satisfaction}/5 (${k.surveys} phản hồi) – ngưỡng 4/5 – ${verdict(true, k.satisfaction >= 4)}` : 'chưa có khảo sát'}`, '',
    `PHÂN BỐ TRÌNH ĐỘ: ${LEVELS.map(l => [l, activeLearners().filter(x => x.cefr === l).length]).filter(x => x[1]).map(x => `${x[0]}: ${x[1]}`).join(' · ') || '—'}`,
    `BỘ BÀI ĐÃ DUYỆT: ${S.lessonSets.filter(s => s.status === 'approved').map(s => `T${s.week}-${s.cefr} (${s.lessons.length} bài)`).join(', ') || 'chưa có'}`,
    `LƯỢT COACH: ${S.coachSessions.reduce((n, c) => n + goodTurns(c).length, 0)} · BÀI NỘP: ${S.submissions.length} (${S.submissions.filter(s => s.operatorChecked).length} đã đọc mẫu) · NHẮC HỌC: ${S.reminders.length}`, '',
    'TỪNG NGƯỜI',
    ...(rows.map(r => `- ${r.u.name} (${r.u.cefr}): ${r.sessions} buổi tuần này, ${r.done}/${r.lessons || '–'} bài, ${r.turns} lượt coach, bài T6: ${r.sub ? (r.sub.total ?? 'chờ chấm') : 'chưa'}, đầu vào ${r.p?.total ?? '–'}${r.f ? ` → cuối ${r.f.total}` : ''}${r.miss >= 2 ? ` ⚠ bỏ ${r.miss} ngày` : ''}`).length ? rows.map(r => `- ${r.u.name} (${r.u.cefr}): ${r.sessions} buổi tuần này, ${r.done}/${r.lessons || '–'} bài, ${r.turns} lượt coach, bài T6: ${r.sub ? (r.sub.total ?? 'chờ chấm') : 'chưa'}, đầu vào ${r.p?.total ?? '–'}${r.f ? ` → cuối ${r.f.total}` : ''}${r.miss >= 2 ? ` ⚠ bỏ ${r.miss} ngày` : ''}`) : ['- (chưa có)']), '',
    'PHẢN HỒI KHẢO SÁT',
    ...(S.surveys.length ? S.surveys.map(s => `- ${userById(s.userId)?.name}: ${s.rating}/5${s.comment ? ' – "' + s.comment + '"' : ''}${s.when ? ' (' + s.when + ')' : ''}`) : ['- (chưa có)'])
  ].join('\n');
  // formatted report (screen + print); the plain-text version above stays for Copy / .txt
  const kp = [
    {name: 'Học đều', def: '≥3 buổi mỗi tuần', has: k.n > 0, val: k.regularPct, unit: '%', detail: `${k.regular}/${k.n} người`, thr: '≥ 70%', ok: k.regularPct >= 70, bar: k.regularPct},
    {name: 'Học đến cuối', def: 'hoàn thành các tuần đã qua', has: k.n > 0, val: k.completedPct, unit: '%', detail: `${k.completed}/${k.n} người`, thr: '≥ 60%', ok: k.completedPct >= 60, bar: k.completedPct},
    {name: 'Có tiến bộ', def: 'điểm cuối kỳ cao hơn đầu vào', has: k.both > 0, val: k.improvedPct, unit: '%', detail: `${k.improved}/${k.both} người có đủ 2 bài`, thr: '≥ 70%', ok: k.improvedPct >= 70, bar: k.improvedPct},
    {name: 'Hài lòng', def: 'điểm khảo sát trung bình', has: k.surveys > 0, val: k.satisfaction, unit: '/5', detail: `${k.surveys} phản hồi`, thr: '≥ 4/5', ok: k.satisfaction >= 4, bar: (k.satisfaction || 0) * 20}
  ];
  const measured = kp.filter(x => x.has), passed = measured.filter(x => x.ok);
  const pill = x => !x.has ? '<span class="pill na">Chưa có dữ liệu</span>' : x.ok ? '<span class="pill ok">Đạt</span>' : '<span class="pill no">Chưa đạt</span>';
  const atRisk = rows.filter(r => r.risk === 2), notStarted = rows.filter(r => r.risk === 1);
  const lvDist = LEVELS.map(l => [l, activeLearners().filter(x => x.cefr === l).length]).filter(x => x[1]);
  const approvedSets = S.lessonSets.filter(s => s.status === 'approved');
  const turnsAll = S.coachSessions.reduce((n, c) => n + goodTurns(c).length, 0);
  const summary = !k.n ? 'Chưa có học viên nào được duyệt mức, nên chưa có số liệu để đánh giá.'
    : `Đến tuần ${k.wk}/${S.settings.pilotWeeks}, pilot đạt <b>${passed.length}/${measured.length}</b> chỉ số đã đo được${measured.length < 4 ? ` (${4 - measured.length} chỉ số chưa có dữ liệu)` : ''}. ${passed.length ? 'Đạt: ' + passed.map(x => x.name.toLowerCase()).join(', ') + '. ' : ''}${measured.length - passed.length ? 'Chưa đạt: ' + measured.filter(x => !x.ok).map(x => `${x.name.toLowerCase()} (${x.val}${x.unit}, ngưỡng ${x.thr})`).join(', ') + '. ' : ''}${atRisk.length ? `<b>${atRisk.length} học viên đã bỏ từ 2 ngày trở lên</b> và cần được nhắc.` : 'Không có học viên nào bỏ quá 2 ngày.'}`;
  shell(`<div class="page-title no-print"><div><h1>Báo cáo tổng kết</h1><p class="muted">Tổng hợp tự động theo bốn chỉ số của PRD. Bấm In để in hoặc lưu thành PDF.</p></div><div class="row"><button class="btn-primary" data-action="rep-print">🖨 In / Lưu PDF</button><button data-action="rep-copy">Copy bản chữ</button><button data-action="rep-download">Tải .txt</button></div></div>
    <article class="report">
      <div class="rhead"><div><div class="eyebrow">Báo cáo pilot</div><h2>Season English · ${esc(S.settings.orgName)}</h2><div class="small" style="font-weight:700">Chủ đề khoá: ${esc(courseTheme())}</div></div>
        <div class="meta">Ngày lập: ${new Date().toLocaleDateString('vi-VN')}<br>Giai đoạn: tuần ${k.wk}/${S.settings.pilotWeeks} (từ ${fmtDate(S.settings.pilotStartDate)})<br>Học viên: ${k.n} đang học · ${learners().length} đăng ký<br>Người lập: ${esc(u.name)}</div></div>
      <div class="summary" style="background:${!measured.length ? 'var(--surface-2)' : passed.length === measured.length ? 'var(--mint)' : passed.length ? 'var(--butter)' : 'var(--peach)'}"><div class="eyebrow" style="color:var(--text);margin-bottom:2px">Tóm tắt</div>${summary}</div>
      <h3>1. Bốn chỉ số của pilot</h3>
      <table><thead><tr><th>Chỉ số</th><th>Kết quả</th><th style="width:28%">Mức đạt</th><th>Ngưỡng</th><th>Đánh giá</th></tr></thead><tbody>
        ${kp.map(x => `<tr><td><b>${x.name}</b><div class="xs muted">${x.def}</div></td><td>${x.has ? `<b style="font-family:var(--font-display);font-size:1.25rem">${x.val}${x.unit}</b><div class="xs muted">${x.detail}</div>` : '<span class="muted">—</span>'}</td><td>${x.has ? `<div class="progress ${x.ok ? 'ok' : 'danger'}"><i style="width:${clamp(x.bar, 0, 100)}%"></i></div>` : ''}</td><td>${x.thr}</td><td>${pill(x)}</td></tr>`).join('')}
      </tbody></table>
      ${k.byWeek.length ? `<div style="margin-top:10px"><div class="xs muted" style="font-weight:800;text-transform:uppercase;letter-spacing:.05em">Tỉ lệ học đều theo tuần</div>${k.byWeek.map(x => `<div class="barrow"><span style="width:64px">Tuần ${x.w}</span><div class="progress ${x.pct >= 70 ? 'ok' : 'warn'}"><i style="width:${x.pct}%"></i></div><span style="width:44px;text-align:right">${x.pct}%</span></div>`).join('')}</div>` : ''}
      <h3>2. Quy mô và hoạt động</h3>
      <div class="grid cols-2"><div><div class="xs muted" style="font-weight:800;text-transform:uppercase;letter-spacing:.05em">Phân bố trình độ</div>${lvDist.length ? lvDist.map(([l, n]) => `<div class="barrow"><span style="width:64px">${lvlChip(l)}</span><div class="progress"><i style="width:${pct(n, k.n)}%"></i></div><span style="width:60px;text-align:right">${n} người</span></div>`).join('') : '<div class="small muted">Chưa có học viên được duyệt mức.</div>'}</div>
        <table><tbody><tr><td>Bộ bài đã duyệt</td><td><b>${approvedSets.length}</b> bộ · ${sum(approvedSets.map(s => s.lessons.length))} bài</td></tr><tr><td>Lượt luyện với Season</td><td><b>${turnsAll}</b></td></tr><tr><td>Bài thực hành cuối tuần</td><td><b>${S.submissions.length}</b> đã nộp · ${S.submissions.filter(s => s.operatorChecked).length} đã đọc mẫu</td></tr><tr><td>Lượt nhắc học</td><td><b>${S.reminders.length}</b></td></tr><tr><td>Kháng nghị chấm điểm</td><td><b>${appeals().length}</b> · ${appeals().filter(a => a.status === 'pending').length} chờ xử lý</td></tr></tbody></table></div>
      <h3>3. Từng học viên</h3>
      ${rows.length ? `<table><thead><tr><th>Học viên</th><th>Mức</th><th>Buổi tuần này</th><th>Bài</th><th>Lượt coach</th><th>Bài cuối tuần</th><th>Đầu vào → cuối kỳ</th><th>Cấp ngỗng</th><th>Tình trạng</th></tr></thead><tbody>${rows.slice().sort((a, b) => b.risk - a.risk || a.u.name.localeCompare(b.u.name)).map(r => `<tr><td><b>${esc(r.u.name)}</b></td><td>${lvlChip(r.u.cefr)}</td><td>${r.sessions}/5</td><td>${r.lessons ? `${r.done}/${r.lessons}` : '—'}</td><td>${r.turns}</td><td>${r.sub ? (r.sub.total ?? 'chờ chấm') : 'chưa nộp'}</td><td>${r.p?.total ?? '—'}${r.f ? ` → ${r.f.total} (${r.f.total - (r.p?.total || 0) >= 0 ? '+' : ''}${r.f.total - (r.p?.total || 0)})` : ''}</td><td>${r.rw.lv.icon} ${r.rw.lv.index + 1} · ★${r.rw.points}</td><td>${r.risk === 2 ? `<span class="pill no">Bỏ ${r.miss} ngày</span>` : r.risk === 1 ? '<span class="pill na">Chưa học tuần này</span>' : '<span class="pill ok">Đang học</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="small muted">Chưa có học viên được duyệt mức.</div>'}
      <h3>4. Phản hồi khảo sát</h3>
      ${S.surveys.length ? S.surveys.map(s => `<div class="barrow" style="align-items:flex-start"><span class="pill ${s.rating >= 4 ? 'ok' : s.rating >= 3 ? 'na' : 'no'}">${s.rating}/5</span><span style="flex:1;font-weight:600"><b>${esc(userById(s.userId)?.name || '—')}</b>${s.comment ? `: “${esc(s.comment)}”` : ''}${s.when ? ` <span class="muted">(${esc(s.when)})</span>` : ''}</span></div>`).join('') : '<div class="small muted">Chưa có phản hồi. Khảo sát mở sau bài kiểm tra cuối kỳ.</div>'}
      <h3>5. Việc cần làm tiếp</h3>
      <ul class="small" style="margin:0;padding-left:20px;font-weight:700;line-height:1.6">${[atRisk.length && `Nhắc ${atRisk.length} học viên đã bỏ từ 2 ngày: ${atRisk.map(r => esc(r.u.name)).join(', ')}.`, notStarted.length && `${notStarted.length} học viên chưa học buổi nào trong tuần này: ${notStarted.map(r => esc(r.u.name)).join(', ')}.`, learners().filter(x => !x.cefrApproved).length && `${learners().filter(x => !x.cefrApproved).length} người đăng ký chưa được duyệt mức.`, appeals().filter(a => a.status === 'pending').length && `${appeals().filter(a => a.status === 'pending').length} kháng nghị chấm điểm chờ Vận hành xử lý.`, !k.both && 'Chưa có bài kiểm tra cuối kỳ nên chưa đo được tiến bộ.', !k.surveys && 'Chưa có khảo sát hài lòng.'].filter(Boolean).map(x => `<li>${x}</li>`).join('') || '<li>Không có việc tồn đọng.</li>'}</ul>
      <div class="foot">Số liệu tính tự động từ dữ liệu trên trình duyệt này tại thời điểm lập báo cáo. Ngưỡng theo PRD: học đều ≥70%, học đến cuối ≥60%, có tiến bộ ≥70%, hài lòng ≥4/5.</div>
    </article>
    <pre id="rep-text" hidden>${esc(text)}</pre>
    <div class="card no-print" style="max-width:960px;margin:12px auto 0"><h3>Câu hỏi mở từ PRD</h3><ul class="small"><li>Kênh chat gửi nhắc học: Base Message webhook ${S.settings.webhookUrl ? 'đã cấu hình ✓' : 'chưa cấu hình'}.</li><li>Học trong giờ hay ngoài giờ: ${S.surveys.length ? S.surveys.map(s => s.when).filter(Boolean).join(', ') : 'thu qua khảo sát cuối pilot'}.</li><li>Quy định dùng AI bên ngoài: bài làm của học viên được gửi tới API Claude để chấm/sinh bài.</li><li>Ngân sách công cụ: đang dùng <code>${esc(ai.modelName())}</code> (${esc(ai.providerLabel())}).</li></ul></div>`, {title: 'Báo cáo'});
});
actions['rep-print'] = () => window.print();
actions['rep-copy'] = () => copyText($('#rep-text').textContent);
actions['rep-download'] = () => download(`aec-bao-cao-${todayStr()}.txt`, $('#rep-text').textContent, 'text/plain;charset=utf-8');

// =====================================================================
// Demo seed (small, generic sample data – lets every screen be explored without an API key)
// =====================================================================
// ---- demo lessons in the standard structure: 5 days per level, each with vocabulary (+3 phrases), grammar, pronunciation and the 4 skills ----
// Compact rows: t title, o objective, g grammar, ex example sentences, v [word, ipa, meaning, 3 phrases], s [sound, name, tip],
// L / R [passage, question, options, index of the answer], W [type, task, answer, options], S [instruction, model sentence], tr [L q, L a, R q, R a, W q, W a, S q, S a]
const DEMO_LESSONS = {
  A1: [
    {t: "I am + name / job", o: "Nói được tên và nghề của mình bằng 2 câu.", g: "1) Công thức: I am + tên / I am a + nghề (am = là; a = một). 2) Dùng khi tự giới thiệu. 3) Ví dụ: My name is Lan. (Tên tôi là Lan.) I am a tester. (Tôi là nhân viên kiểm thử.) This is my job. (Đây là công việc của tôi.)", ex: ["My name is Lan.", "I am a tester.", "This is my job."],
      v: [["job", "/dʒɒb/", "công việc", "my job", "a new job", "a good job", "noun", "work", "work, position", "", "jobless|adjective|thất nghiệp"], ["name", "/neɪm/", "tên", "my name", "first name", "your name", "noun", "word", "first name", "", "name|verb|đặt tên;nameless|adjective|không tên"], ["tester", "/ˈtestə/", "nhân viên kiểm thử", "a software tester", "a new tester", "work as a tester", "noun", "job", "QA engineer", "", "test|verb|kiểm thử;test|noun|bài kiểm thử"]], s: ["eɪ", "âm /eɪ/ như trong 'name'", "Mở miệng nói 'e' rồi lướt nhanh sang 'i'."],
      L: ["Hello. My name is Lan. I am a tester at GFT.", "What is Lan's job?", ["tester", "driver", "teacher", "designer"], 0], R: ["Hi, I am Nam. I am a designer. My job is fun.", "What is Nam's job?", ["designer", "tester", "manager", "driver"], 0], W: ["fill", "My ___ (tên) is Lan.", "name"], S: ["Nói to câu sau:", "My name is Lan and I am a tester."], U: ["job", "I have a new job.", "I job at GFT.", "I have a new jobs.", "She is a very job.", "Tôi có một công việc mới."],
      tr: ["Lan làm nghề gì?", "nhân viên kiểm thử", "Nam làm nghề gì?", "nhà thiết kế", "Tên tôi là Lan.", "tên", "Nói to câu sau.", "Tên tôi là Lan và tôi là nhân viên kiểm thử."]},
    {t: "I am from + place", o: "Hỏi và trả lời được mình đến từ đâu.", g: "1) Công thức: Where are you from? – I am from + nơi (from = từ, đến từ). 2) Dùng khi làm quen. 3) Ví dụ: I am from Hue. (Tôi đến từ Huế.) Nice to meet you. (Rất vui được gặp bạn.) I am new here. (Tôi là người mới ở đây.)", ex: ["I am from Hue.", "Nice to meet you.", "I am new here."],
      v: [["new", "/njuː/", "mới", "new here", "a new job", "a new team", "adjective", "time", "fresh", "old", "newly|adverb|vừa mới;news|noun|tin tức"], ["nice", "/naɪs/", "vui, dễ chịu", "nice to meet you", "a nice team", "a nice day", "adjective", "good", "good, kind", "bad", "nicely|adverb|một cách dễ chịu"], ["from", "/frɒm/", "từ, đến từ", "from Hue", "from Vietnam", "from my team", "preposition", "", "out of", "to", ""]], s: ["aɪ", "âm /aɪ/ như trong 'nice'", "Mở rộng miệng nói 'a' rồi lướt sang 'i'."],
      L: ["Hi, I am Mai. I am from a small town. I am new here and I am a tester.", "What is Mai's job?", ["She is a tester.", "She is a manager.", "She is a designer.", "She is a driver."], 0], R: ["Tom is new here. He is from a big city. He is nice to everyone.", "What is Tom like?", ["nice", "angry", "busy", "old"], 0], W: ["mcq", "Chọn câu đúng:", "I am from a small town.", ["I am from a small town.", "I from am a small town.", "I am a small town from.", "I am from in a small town."]], S: ["Nói to câu sau:", "I am new here. Nice to meet you."], U: ["new", "I am new here.", "I am a new.", "I new here.", "I am new to here work.", "Tôi là người mới ở đây."],
      tr: ["Mai làm nghề gì?", "Cô ấy là nhân viên kiểm thử.", "Tom là người thế nào?", "dễ chịu, tốt bụng", "Chọn câu đúng.", "Tôi đến từ một thị trấn nhỏ.", "Nói to câu sau.", "Tôi là người mới ở đây. Rất vui được gặp bạn."]},
    {t: "I work at / in", o: "Nói được mình làm ở đâu và trong nhóm nào.", g: "1) Công thức: I work at + công ty / I work in + phòng ban (work = làm việc). 2) Dùng khi nói nơi làm việc. 3) Ví dụ: I work at GFT. (Tôi làm ở GFT.) I work in the sales team. (Tôi làm trong nhóm bán hàng.) My office is big. (Văn phòng của tôi lớn.)", ex: ["I work at GFT.", "I work in the sales team.", "My office is big."],
      v: [["work", "/wɜːk/", "làm việc", "work at GFT", "work in a team", "work with you", "verb", "activity", "do a job", "rest", "worker|noun|người lao động;work|noun|công việc"], ["team", "/tiːm/", "nhóm", "my team", "the sales team", "a small team", "noun", "group", "group", "", "teammate|noun|đồng đội;teamwork|noun|làm việc nhóm"], ["office", "/ˈɒfɪs/", "văn phòng", "my office", "in the office", "a big office", "noun", "place", "workplace", "", "officer|noun|viên chức"]], s: ["ɜː", "âm /ɜː/ như trong 'work'", "Môi thả lỏng, kéo dài âm 'ơ', không cong lưỡi."],
      L: ["I work at GFT. I work in the test team. My team is small.", "Which team does the speaker work in?", ["the test team", "the sales team", "the design team", "the support team"], 0], R: ["Hoa works at GFT. She works in the sales team. Her office is big.", "What is Hoa's office like?", ["big", "small", "new", "old"], 0], W: ["fill", "I ___ (làm việc) at GFT.", "work"], S: ["Nói to câu sau:", "I work at GFT in the test team."], U: ["work", "I work at GFT.", "I am work at GFT.", "I work a GFT.", "I works at GFT.", "Tôi làm việc ở GFT."],
      tr: ["Người nói làm trong nhóm nào?", "nhóm kiểm thử", "Văn phòng của Hoa thế nào?", "lớn", "Tôi làm việc ở GFT.", "làm việc", "Nói to câu sau.", "Tôi làm ở GFT trong nhóm kiểm thử."]},
    {t: "on + day, at + time", o: "Nói được lịch làm việc với thứ và giờ.", g: "1) Công thức: on + thứ, at + giờ (on Monday = vào thứ Hai; at 9 = lúc 9 giờ). 2) Dùng khi nói lịch làm việc. 3) Ví dụ: I start at 8. (Tôi bắt đầu lúc 8 giờ.) We have a meeting on Monday. (Chúng tôi có cuộc họp vào thứ Hai.) I write a report on Friday. (Tôi viết báo cáo vào thứ Sáu.)", ex: ["I start at 8.", "We have a meeting on Monday.", "I write a report on Friday."],
      v: [["meeting", "/ˈmiːtɪŋ/", "cuộc họp", "have a meeting", "a team meeting", "a short meeting", "noun", "event", "call", "", "meet|verb|gặp"], ["start", "/stɑːt/", "bắt đầu", "start work", "start at 8", "start a meeting", "verb", "action", "begin", "stop, finish", "start|noun|sự bắt đầu;starter|noun|người khởi đầu"], ["report", "/rɪˈpɔːt/", "báo cáo", "write a report", "a short report", "send a report", "noun", "document", "update", "", "report|verb|báo cáo;reporter|noun|phóng viên"]], s: ["iː", "âm /iː/ như trong 'meeting'", "Kéo dài âm 'i', môi căng sang hai bên như đang cười."],
      L: ["We have a team meeting on Monday at 9.", "What time is the meeting?", ["at 9", "at 8", "at 10", "at 11"], 0], R: ["Work starts at 8. On Friday I write a short report.", "What does the writer do on Friday?", ["write a report", "have a meeting", "start a new job", "send an email"], 0], W: ["fill", "We have a meeting ___ (vào) Monday.", "on"], S: ["Nói to câu sau:", "We have a meeting on Monday at nine."], U: ["meeting", "We have a meeting on Monday.", "We meeting on Monday.", "We have a meet on Monday.", "We have meeting at on Monday.", "Chúng tôi có cuộc họp vào thứ Hai."],
      tr: ["Cuộc họp vào lúc mấy giờ?", "lúc 9 giờ", "Người viết làm gì vào thứ Sáu?", "viết báo cáo", "Chúng tôi có cuộc họp vào thứ Hai.", "vào", "Nói to câu sau.", "Chúng tôi có cuộc họp vào thứ Hai lúc chín giờ."]},
    {t: "I can / Can you…?", o: "Đề nghị giúp đỡ và nhờ người khác làm một việc.", g: "1) Công thức: I can + động từ / Can you + động từ? (can = có thể). 2) Dùng khi nói việc mình làm được hoặc nhờ ai đó. 3) Ví dụ: I can help you. (Tôi có thể giúp bạn.) Can you send the email? (Bạn gửi email được không?) I can check it today. (Tôi có thể kiểm tra nó hôm nay.)", ex: ["I can help you.", "Can you send the email?", "I can check it today."],
      v: [["help", "/help/", "giúp đỡ", "help you", "help the team", "need help", "verb", "action", "support", "", "helper|noun|người giúp;helpful|adjective|hữu ích"], ["send", "/send/", "gửi", "send an email", "send a report", "send it today", "verb", "action", "email", "receive", "sender|noun|người gửi"], ["check", "/tʃek/", "kiểm tra", "check the email", "check it today", "check the report", "verb", "action", "look at", "", "check|noun|sự kiểm tra;checklist|noun|danh sách kiểm tra"]], s: ["e", "âm /e/ như trong 'help'", "Miệng mở vừa, nói âm 'e' ngắn và dứt khoát."],
      L: ["Hi Lan. Can you send the report today? Thank you.", "What does the speaker ask Lan to do?", ["send the report", "check the email", "start a meeting", "help a customer"], 0], R: ["I am busy today. Can you help me? Can you check the email?", "What does the writer ask you to check?", ["the email", "the report", "the office", "the meeting"], 0], W: ["mcq", "Chọn câu đúng:", "I can help you.", ["I can help you.", "I can helps you.", "I can to help you.", "I can helping you."]], S: ["Nói to câu sau:", "I can help you with the report."], U: ["help", "Can you help me?", "Can you helps me?", "Can you help to me?", "Can you me help?", "Bạn giúp tôi được không?"],
      tr: ["Người nói nhờ Lan làm gì?", "gửi báo cáo", "Người viết nhờ kiểm tra cái gì?", "email", "Chọn câu đúng.", "Tôi có thể giúp bạn.", "Nói to câu sau.", "Tôi có thể giúp bạn làm báo cáo."]}
  ],
  A2: [
    {t: "I work in… as…", o: "Giới thiệu vai trò của mình bằng 3–4 câu.", g: "1) Công thức: I work in + phòng ban + as + a/an + nghề; I am in charge of + việc (in charge of = phụ trách). 2) Dùng khi giới thiệu vai trò với người mới. 3) Ví dụ: I work in sales as an executive. (Tôi làm ở phòng kinh doanh, vị trí chuyên viên.) I am in charge of customer emails. (Tôi phụ trách email khách hàng.) This is my colleague, Mai. (Đây là đồng nghiệp của tôi, Mai.)", ex: ["I work in sales as an executive.", "I am in charge of customer emails.", "This is my colleague, Mai."],
      v: [["colleague", "/ˈkɒliːɡ/", "đồng nghiệp", "a new colleague", "my colleague", "help a colleague", "noun", "person", "co-worker", "", "collegial|adjective|thân thiện như đồng nghiệp"], ["in charge of", "/ɪn tʃɑːdʒ əv/", "phụ trách", "in charge of testing", "in charge of the team", "in charge of sales", "phrase", "", "responsible for", "", ""], ["customer", "/ˈkʌstəmə/", "khách hàng", "a new customer", "customer emails", "help a customer", "noun", "person", "client", "seller", ""]], s: ["tʃ", "âm /tʃ/ như trong 'charge'", "Đặt lưỡi như âm 't' rồi bật hơi thành 'ch'."],
      L: ["Good morning. I am Binh. I work in sales and I am in charge of customer emails.", "What is Binh in charge of?", ["customer emails", "the budget", "testing", "the website"], 0], R: ["This is my colleague, Mai. She works in marketing as a designer. She is in charge of our website.", "What is Mai in charge of?", ["the website", "customer emails", "the sales team", "the budget"], 0], W: ["fill", "I am in ___ (phụ trách) of testing.", "charge"], S: ["Nói to câu sau:", "I work in sales and I am in charge of customer emails."], U: ["colleague", "This is my colleague, Mai.", "This is my colleague Mai is.", "I colleague with Mai.", "Mai is very colleague.", "Đây là đồng nghiệp của tôi, Mai."],
      tr: ["Bình phụ trách việc gì?", "email khách hàng", "Mai phụ trách cái gì?", "trang web", "Tôi phụ trách việc kiểm thử.", "phụ trách", "Nói to câu sau.", "Tôi làm ở phòng kinh doanh và phụ trách email khách hàng."]},
    {t: "Past simple: I joined…", o: "Kể ngắn về quá trình làm việc bằng thì quá khứ đơn.", g: "1) Công thức: chủ ngữ + động từ thêm -ed + thời gian (joined = đã gia nhập; worked = đã làm). 2) Dùng cho việc đã xong trong quá khứ. 3) Ví dụ: I joined GFT in 2024. (Tôi vào GFT năm 2024.) I worked on a big project last year. (Năm ngoái tôi làm một dự án lớn.) We finished it in May. (Chúng tôi hoàn thành nó vào tháng Năm.)", ex: ["I joined GFT in 2024.", "I worked on a big project last year.", "We finished it in May."],
      v: [["join", "/dʒɔɪn/", "gia nhập", "join the team", "join a meeting", "join the company", "verb", "action", "become part of", "leave", ""], ["project", "/ˈprɒdʒekt/", "dự án", "a big project", "a new project", "work on a project", "noun", "work", "assignment", "", "projector|noun|máy chiếu"], ["finish", "/ˈfɪnɪʃ/", "hoàn thành", "finish the project", "finish a report", "finish on time", "verb", "action", "complete", "start", "finished|adjective|đã xong"]], s: ["dʒ", "âm /dʒ/ như trong 'join'", "Giống âm 'ch' nhưng rung cổ họng."],
      L: ["I joined GFT in 2023. Last year I worked on a banking project.", "When did the speaker join GFT?", ["in 2023", "in 2022", "in 2024", "in 2021"], 0], R: ["Hoa joined the team in March. She worked on a new project and finished it in June.", "When did Hoa finish the project?", ["in June", "in March", "in May", "in April"], 0], W: ["fill", "I ___ (đã gia nhập) GFT in 2024.", "joined"], S: ["Nói to câu sau:", "I joined GFT in 2024 and worked on a big project."], U: ["join", "I joined the team in May.", "I joined in the team in May.", "I was join the team in May.", "The team joined me very.", "Tôi gia nhập nhóm vào tháng Năm."],
      tr: ["Người nói vào GFT năm nào?", "năm 2023", "Hoa hoàn thành dự án khi nào?", "vào tháng Sáu", "Tôi đã vào GFT năm 2024.", "đã gia nhập", "Nói to câu sau.", "Tôi vào GFT năm 2024 và đã làm một dự án lớn."]},
    {t: "What do you do?", o: "Hỏi được về công việc của người khác.", g: "1) Công thức: What do you do? / Do you + động từ? / Who do you report to? (report to = báo cáo cho). 2) Dùng khi hỏi về công việc của người khác. 3) Ví dụ: What do you do? (Bạn làm nghề gì?) I report to the sales manager. (Tôi báo cáo cho trưởng phòng kinh doanh.) The deadline is Friday. (Hạn chót là thứ Sáu.)", ex: ["What do you do?", "I report to the sales manager.", "The deadline is Friday."],
      v: [["deadline", "/ˈdedlaɪn/", "hạn chót", "meet the deadline", "a tight deadline", "miss a deadline", "noun", "time", "due date", "", ""], ["manager", "/ˈmænɪdʒə/", "quản lý, trưởng phòng", "the sales manager", "a new manager", "ask the manager", "noun", "job", "boss", "employee", "manage|verb|quản lý;management|noun|ban quản lý"], ["report to", "/rɪˈpɔːt tuː/", "báo cáo cho", "report to the manager", "report to her", "report to the team lead", "phrase", "", "work under", "", ""]], s: ["æ", "âm /æ/ như trong 'manager'", "Mở miệng rộng, nói âm lai giữa 'a' và 'e'."],
      L: ["What do you do? I am in sales. I report to the sales manager.", "Who does the speaker report to?", ["the sales manager", "the customer", "the tester", "the designer"], 0], R: ["Minh is a tester. He reports to the QA manager. His deadline is Friday.", "When is Minh's deadline?", ["Friday", "Monday", "Sunday", "Wednesday"], 0], W: ["mcq", "Chọn câu hỏi đúng:", "What do you do?", ["What do you do?", "What you do?", "What does you do?", "What do you does?"]], S: ["Nói to câu sau:", "I report to the sales manager."], U: ["deadline", "The deadline is Friday.", "The deadline are Friday.", "We deadline on Friday.", "Friday is very deadline.", "Hạn chót là thứ Sáu."],
      tr: ["Người nói báo cáo cho ai?", "trưởng phòng kinh doanh", "Hạn chót của Minh là khi nào?", "thứ Sáu", "Chọn câu hỏi đúng.", "Bạn làm nghề gì?", "Nói to câu sau.", "Tôi báo cáo cho trưởng phòng kinh doanh."]},
    {t: "I am working on…", o: "Nói được việc mình đang làm lúc này.", g: "1) Công thức: am/is/are + động từ thêm -ing (am working = đang làm). 2) Dùng cho việc đang diễn ra lúc này hoặc trong giai đoạn này. 3) Ví dụ: I am working on a new website. (Tôi đang làm một trang web mới.) We are testing the app this week. (Tuần này chúng tôi đang kiểm thử ứng dụng.) She is writing an update. (Cô ấy đang viết bản cập nhật.)", ex: ["I am working on a new website.", "We are testing the app this week.", "She is writing an update."],
      v: [["update", "/ˈʌpdeɪt/", "bản cập nhật", "a short update", "send an update", "a weekly update", "noun", "document", "status report", "", "update|verb|cập nhật;updated|adjective|đã cập nhật"], ["website", "/ˈwebsaɪt/", "trang web", "a new website", "our website", "update the website", "noun", "product", "site", "", ""], ["app", "/æp/", "ứng dụng", "a mobile app", "test the app", "a new app", "noun", "product", "application", "", ""]], s: ["ŋ", "âm /ŋ/ ở cuối 'working'", "Âm 'ng' phát ra từ mũi, không bật âm 'g' ở cuối."],
      L: ["Hi team. This week I am testing the mobile app. Nam is writing the update.", "Who is writing the update?", ["Nam", "Lan", "the manager", "Mai"], 0], R: ["We are working on a new website. This week Mai is testing it.", "What is Mai doing this week?", ["testing the website", "writing an update", "joining a meeting", "calling a client"], 0], W: ["fill", "I am ___ (đang làm) on a new website.", "working"], S: ["Nói to câu sau:", "I am working on a new website this week."], U: ["update", "She is writing a short update.", "She is update a short.", "She updates is short.", "She is writing an update short very.", "Cô ấy đang viết một bản cập nhật ngắn."],
      tr: ["Ai đang viết bản cập nhật?", "Nam", "Tuần này Mai đang làm gì?", "kiểm thử trang web", "Tôi đang làm một trang web mới.", "đang làm", "Nói to câu sau.", "Tuần này tôi đang làm một trang web mới."]},
    {t: "be going to + verb", o: "Nói được kế hoạch công việc sắp tới.", g: "1) Công thức: am/is/are going to + động từ (going to = sẽ, dự định). 2) Dùng cho kế hoạch đã định. 3) Ví dụ: I am going to call the client tomorrow. (Ngày mai tôi sẽ gọi cho khách hàng.) We are going to plan the next week. (Chúng tôi sẽ lên kế hoạch cho tuần tới.) She is going to visit the office. (Cô ấy sẽ đến thăm văn phòng.)", ex: ["I am going to call the client tomorrow.", "We are going to plan the next week.", "She is going to visit the office."],
      v: [["client", "/ˈklaɪənt/", "khách hàng (doanh nghiệp)", "call the client", "a new client", "meet the client", "noun", "person", "customer", "supplier", ""], ["plan", "/plæn/", "lên kế hoạch", "plan the week", "plan a meeting", "a good plan", "verb", "action", "prepare", "", "plan|noun|kế hoạch;planner|noun|người lập kế hoạch"], ["visit", "/ˈvɪzɪt/", "đến thăm", "visit the office", "visit a client", "a short visit", "verb", "action", "go to", "leave", "visitor|noun|khách đến thăm;visit|noun|chuyến thăm"]], s: ["əʊ", "âm /əʊ/ như trong 'going'", "Bắt đầu bằng 'ơ' rồi tròn môi lướt sang 'u'."],
      L: ["Tomorrow I am going to call the client. Then we are going to plan the week.", "Who is the speaker going to call tomorrow?", ["the client", "the manager", "the tester", "the designer"], 0], R: ["Next week our client is going to visit the office. We are going to plan a short meeting.", "Who is going to visit the office next week?", ["the client", "the manager", "a new colleague", "the tester"], 0], W: ["mcq", "Chọn câu đúng:", "I am going to call the client.", ["I am going to call the client.", "I going to call the client.", "I am going call the client.", "I am go to call the client."]], S: ["Nói to câu sau:", "I am going to call the client tomorrow."], U: ["client", "I am going to meet the client tomorrow.", "I am going to client tomorrow.", "The client is very clienting.", "I am going to meet to the client tomorrow.", "Ngày mai tôi sẽ gặp khách hàng."],
      tr: ["Ngày mai người nói sẽ gọi cho ai?", "khách hàng", "Tuần tới ai sẽ đến văn phòng?", "khách hàng", "Chọn câu đúng.", "Tôi sẽ gọi cho khách hàng.", "Nói to câu sau.", "Ngày mai tôi sẽ gọi cho khách hàng."]}
  ],
  B1: [
    {t: "I have worked… since / for", o: "Say how long you have been in your role, using since and for.", g: "1) Pattern: have/has + past participle + since (a starting point) / for (a period). 2) Use it for a situation that started in the past and is still true. 3) Examples: I have worked at GFT since 2022. I have had this role for two years. My background is in accounting, and I have experience with banks.", ex: ["I have worked at GFT since 2022.", "I have had this role for two years.", "My background is in accounting."],
      v: [["role", "/rəʊl/", "vai trò", "my current role", "a new role", "a key role", "noun", "job", "position, duty", "", "role model|noun|hình mẫu", "job:A1;position:B1;function:B2;capacity:C1", "gig", ""], ["background", "/ˈbækɡraʊnd/", "nền tảng học vấn, kinh nghiệm", "a background in accounting", "my professional background", "a technical background", "noun", "experience", "history, training", "", "", "past:A2;history:B1;track record:B2;pedigree:C1", "", ""], ["experience", "/ɪkˈspɪəriəns/", "kinh nghiệm", "work experience", "three years of experience", "gain experience", "noun", "knowledge", "practice, skill", "inexperience", "experienced|adjective|có kinh nghiệm;experience|verb|trải qua", "practice:A2;know-how:B2;expertise:C1", "chops", ""]], s: ["əʊ", "the /əʊ/ sound in 'role'", "Start with a relaxed 'uh' and glide to a rounded 'oo'."],
      L: ["Hi, I am Chi. I have worked at GFT since 2022, and I have had my current role for one year.", "What can we infer about Chi's time at GFT?", ["She changed roles after joining the company.", "She joined GFT one year ago.", "She has had the same role since 2022.", "She has left GFT."], 0], R: ["Dung has a background in accounting. He has worked in software for five years and has a lot of experience with banks.", "What most likely explains Dung's experience with banks?", ["His accounting background suits banking clients.", "He studied software at a bank.", "He has worked in software for only one year.", "He has never worked with clients."], 0], W: ["fill", "I have worked here ___ (từ mốc thời gian) 2022.", "since"], S: ["Say this sentence aloud:", "I have worked at GFT since 2022."], U: ["role", "I have a new role in the team.", "I role the team now.", "My role is very roled.", "I have a new role of at the team.", "Tôi có vai trò mới trong nhóm."],
      tr: ["Có thể suy ra điều gì về thời gian Chi ở GFT?", "Cô ấy đã đổi vai trò sau khi vào công ty.", "Điều gì giải thích hợp lý nhất kinh nghiệm với ngân hàng của Dũng?", "Nền tảng kế toán của anh ấy hợp với khách hàng ngân hàng.", "Tôi đã làm ở đây từ năm 2022.", "từ (một mốc thời gian)", "Nói to câu sau.", "Tôi đã làm ở GFT từ năm 2022."]},
    {t: "I am responsible for…", o: "Describe your responsibilities clearly in a first meeting.", g: "1) Pattern: be responsible for + noun / verb-ing; deal with + noun. 2) Use it to explain what you take care of at work. 3) Examples: I am responsible for planning the tests. I deal with client questions every day. I keep every stakeholder informed.", ex: ["I am responsible for planning the tests.", "I deal with client questions every day.", "I keep every stakeholder informed."],
      v: [["responsible", "/rɪˈspɒnsəbl/", "chịu trách nhiệm", "responsible for testing", "responsible for the budget", "the person responsible", "adjective", "duty", "in charge, accountable", "irresponsible", "responsibility|noun|trách nhiệm;responsibly|adverb|một cách có trách nhiệm", "in charge:A2;accountable:B2;answerable:C1", "", ""], ["stakeholder", "/ˈsteɪkhəʊldə/", "bên liên quan", "a key stakeholder", "update every stakeholder", "a stakeholder meeting", "noun", "person", "partner, party", "", "", "partner:A2;party:B2;interested party:C1", "", ""], ["deal with", "/diːl wɪð/", "xử lý, giải quyết", "deal with questions", "deal with a problem", "deal with clients", "phrasal verb", "action", "handle, manage", "ignore", "", "handle:A2;manage:B1;tackle:B2;address:C1", "sort out", ""]], s: ["ɒ", "the /ɒ/ sound in 'responsible'", "Open your mouth and make a short, rounded 'o'."],
      L: ["I am the QA lead. I am responsible for planning the tests, and I deal with questions from the client.", "What can we infer about the speaker's job?", ["The client contacts the speaker directly.", "The speaker writes the application code.", "The speaker reports to the client's manager.", "The speaker never talks to the client."], 0], R: ["Hanh is responsible for the budget. She deals with suppliers and keeps the stakeholders informed every Friday.", "Why most likely does Hanh contact the stakeholders on Fridays?", ["To give a weekly update on spending.", "To hire new suppliers every week.", "Because she is a supplier herself.", "Because the budget changes daily."], 0], W: ["fill", "I am responsible ___ (về, cho) planning the tests.", "for"], S: ["Say this sentence aloud:", "I am responsible for planning the tests."], U: ["responsible", "She is responsible for the budget.", "She responsible the budget.", "She is responsible of the budget.", "She is responsibility for the budget.", "Cô ấy chịu trách nhiệm về ngân sách."],
      tr: ["Có thể suy ra điều gì về công việc của người nói?", "Khách hàng liên hệ trực tiếp với người nói.", "Vì sao Hạnh thường liên hệ các bên liên quan vào thứ Sáu?", "Để cập nhật hằng tuần về chi tiêu.", "Tôi chịu trách nhiệm lên kế hoạch kiểm thử.", "về, cho", "Nói to câu sau.", "Tôi chịu trách nhiệm lên kế hoạch kiểm thử."]},
    {t: "How is… going?", o: "Open and keep a short small-talk conversation going before a meeting.", g: "1) Pattern: How is + noun + going? / How was + noun? Then add a follow-up question. 2) Use it as a friendly opener before the meeting starts. 3) Examples: How is the new project going? It has been a hectic week since the launch. We can catch up after the call.", ex: ["How is the new project going?", "It has been a hectic week since the launch.", "We can catch up after the call."],
      v: [["hectic", "/ˈhektɪk/", "bận rộn, tất bật", "a hectic week", "a hectic schedule", "pretty hectic", "adjective", "busy", "busy, frantic", "calm, quiet", "", "busy:A1;full-on:B2;frenetic:C1", "crazy", ""], ["catch up", "/kætʃ ʌp/", "trò chuyện cập nhật", "catch up after the call", "catch up with a colleague", "catch up on emails", "phrasal verb", "talk", "chat, update each other", "", "", "talk:A1;chat:A2;touch base:B2", "hang out", ""], ["launch", "/lɔːntʃ/", "ra mắt", "launch a product", "a product launch", "launch the first version", "verb", "action", "release, start", "cancel", "launch|noun|buổi ra mắt", "start:A1;release:B1;roll out:B2;unveil:C1", "", ""]], s: ["ʌ", "the /ʌ/ sound in 'up'", "Keep your mouth relaxed and make a short 'uh'."],
      L: ["How is the new project going? Pretty hectic. We launched the first version on Monday.", "What can we infer about the speaker's week?", ["The launch made the week very busy.", "The project has not started yet.", "The team is on holiday.", "The launch was cancelled."], 0], R: ["It has been a hectic week for Chi. Her team launched a new app, so she wants to catch up with Dung after the call.", "Why most likely does Chi want to talk to Dung after the call?", ["She has had no time to update him during the launch.", "She wants to cancel the app.", "Dung launched the app without her.", "She is leaving the team."], 0], W: ["mcq", "Choose the correct question:", "How is the project going?", ["How is the project going?", "How the project is going?", "How does the project going?", "How is going the project?"]], S: ["Say this sentence aloud:", "How is the new project going?"], U: ["hectic", "It has been a hectic week.", "It has been a hectic.", "I hectic every day.", "The week was very hecticly.", "Tuần vừa rồi thật bận rộn."],
      tr: ["Có thể suy ra điều gì về tuần của người nói?", "Buổi ra mắt khiến tuần rất bận.", "Vì sao Chi muốn nói chuyện với Dũng sau cuộc gọi?", "Cô ấy chưa có thời gian cập nhật cho anh ấy trong lúc ra mắt.", "Chọn câu hỏi đúng.", "Dự án tiến triển thế nào rồi?", "Nói to câu sau.", "Dự án mới tiến triển thế nào rồi?"]},
    {t: "If…, I will…", o: "Make a clear commitment that depends on a condition.", g: "1) Pattern: If + present simple, will + verb. 2) Use it for a real possibility and what you will do about it. 3) Examples: If the client agrees, we will start on Monday. If there is a delay, I will let you know. We will confirm the schedule tomorrow.", ex: ["If the client agrees, we will start on Monday.", "If there is a delay, I will let you know.", "We will confirm the schedule tomorrow."],
      v: [["confirm", "/kənˈfɜːm/", "xác nhận", "confirm the schedule", "confirm a meeting", "confirm by email", "verb", "action", "verify, check", "cancel, deny", "confirmation|noun|sự xác nhận;confirmed|adjective|đã xác nhận", "check:A1;verify:B2;corroborate:C1", "", ""], ["delay", "/dɪˈleɪ/", "sự chậm trễ", "a short delay", "cause a delay", "without delay", "noun", "problem", "hold-up, postponement", "", "delay|verb|làm chậm;delayed|adjective|bị trễ", "wait:A1;hold-up:B2;setback:C1", "", ""], ["schedule", "/ˈʃedjuːl/", "lịch trình", "a tight schedule", "on schedule", "change the schedule", "noun", "plan", "timetable, plan", "", "schedule|verb|lên lịch;scheduled|adjective|đã lên lịch", "plan:A1;timetable:A2;agenda:B2;itinerary:C1", "", ""]], s: ["eɪ", "the /eɪ/ sound in 'delay'", "Start with 'e' and glide quickly to 'i'."],
      L: ["If there is a delay, I will let you know. We will confirm the schedule tomorrow.", "What can we infer about the schedule?", ["It is not final yet.", "It was confirmed yesterday.", "There has already been a delay.", "The speaker will not share any news."], 0], R: ["If the client agrees, the team will start on Monday. If there is a delay, Chi will confirm a new schedule by email.", "What does the start date depend on?", ["the client's decision", "Chi's email", "the weather on Monday", "the team's holiday"], 0], W: ["fill", "If there is a delay, I ___ (sẽ) let you know.", "will"], S: ["Say this sentence aloud:", "If there is a delay, I will let you know."], U: ["confirm", "Please confirm the meeting by email.", "Please confirmation the meeting.", "Please confirm to the meeting.", "The meeting is confirm by email.", "Vui lòng xác nhận cuộc họp qua email."],
      tr: ["Có thể suy ra điều gì về lịch trình?", "Lịch chưa chốt.", "Ngày bắt đầu phụ thuộc vào điều gì?", "quyết định của khách hàng", "Nếu có chậm trễ, tôi sẽ báo cho bạn.", "sẽ", "Nói to câu sau.", "Nếu có chậm trễ, tôi sẽ báo cho bạn."]},
    {t: "Passive: The report is sent…", o: "Describe a process without saying who does each step.", g: "1) Pattern: is/are + past participle (present simple passive). 2) Use it when the action matters more than the person. 3) Examples: The report is sent every Friday. Bugs are found in the review. The release is approved by the manager, so nobody else can approve it.", ex: ["The report is sent every Friday.", "Bugs are found in the review.", "The release is approved by the manager."],
      v: [["approve", "/əˈpruːv/", "phê duyệt", "approve the release", "approve a request", "approve the budget", "verb", "action", "accept, agree to", "reject", "approval|noun|sự phê duyệt;approved|adjective|đã duyệt", "agree:A1;accept:A2;sign off:B2;sanction:C1", "give the green light", ""], ["review", "/rɪˈvjuː/", "rà soát, xem xét", "review the report", "a code review", "review a request", "verb", "action", "check, examine", "ignore", "review|noun|bài đánh giá;reviewer|noun|người rà soát", "check:A1;examine:B2;scrutinise:C1", "", ""], ["release", "/rɪˈliːs/", "bản phát hành", "a new release", "the next release", "release notes", "noun", "product", "version, launch", "", "release|verb|phát hành", "version:A2;launch:B1;rollout:B2;deployment:C1", "", ""]], s: ["uː", "the /uː/ sound in 'review'", "Round your lips and hold a long 'oo'."],
      L: ["Every bug is reviewed by the QA team. Then the release is approved by the manager.", "What can we infer about the release process?", ["Nothing is released before the manager agrees.", "The QA team approves the release.", "Bugs are fixed after the release.", "The client reviews every bug."], 0], R: ["The weekly report is sent every Friday. It is reviewed by the team lead before it goes to the client.", "Why most likely does the team lead review the report first?", ["To check it before the client sees it.", "Because the client does not read reports.", "Because the report is sent on Monday.", "To write the report himself."], 0], W: ["mcq", "Choose the correct sentence:", "The report is sent every Friday.", ["The report is sent every Friday.", "The report is send every Friday.", "The report sent is every Friday.", "The report is sending every Friday."]], S: ["Say this sentence aloud:", "The release is approved by the manager."], U: ["approve", "The manager approved the release.", "The manager approval the release.", "The manager approved to the release.", "The release was approve by the manager.", "Người quản lý đã phê duyệt bản phát hành."],
      tr: ["Có thể suy ra điều gì về quy trình phát hành?", "Không có gì được phát hành trước khi quản lý đồng ý.", "Vì sao trưởng nhóm rà soát báo cáo trước?", "Để kiểm tra trước khi khách hàng xem.", "Chọn câu đúng.", "Báo cáo được gửi mỗi thứ Sáu.", "Nói to câu sau.", "Bản phát hành được người quản lý phê duyệt."]}
  ],
  B2: [
    {t: "I oversee… / I liaise with…", o: "Position your role and set expectations with a new client.", g: "1) Pattern: I oversee + noun; I liaise with + person + on + topic. 2) Use these verbs to describe senior coordination work precisely. 3) Examples: I oversee the delivery of three products. I liaise with your IT team on infrastructure. The scope covers web and mobile.", ex: ["I oversee the delivery of three products.", "I liaise with your IT team on infrastructure.", "The scope covers web and mobile."],
      v: [["oversee", "/ˌəʊvəˈsiː/", "giám sát, phụ trách chung", "oversee the delivery", "oversee a team", "oversee the budget", "verb", "manage", "supervise, manage", "", "oversight|noun|sự giám sát;overseer|noun|người giám sát", "lead:A2;supervise:B2;superintend:C1", "run the show", ""], ["liaise with", "/liˈeɪz wɪð/", "làm đầu mối trao đổi với", "liaise with the client", "liaise with suppliers", "liaise with your IT team", "phrasal verb", "communicate", "coordinate with, work with", "", "liaison|noun|đầu mối liên lạc", "talk to:A1;coordinate with:B2;interface with:C1", "", ""], ["scope", "/skəʊp/", "phạm vi", "the project scope", "within the scope", "out of scope", "noun", "plan", "range, extent", "", "scope|verb|xác định phạm vi", "size:A1;range:B1;extent:B2;remit:C1", "", "compass"]], s: ["iː", "the /iː/ sound in 'oversee'", "Stretch your lips and hold a long 'ee'."],
      L: ["Thanks for joining. I am Duc, and I will oversee this project. I liaise with your IT team every week.", "What can we infer about Duc's role?", ["He coordinates the project rather than doing every task himself.", "He is a member of the client's IT team.", "He joined the project only this week.", "He writes the code for the IT team."], 0], R: ["Duc oversees the delivery of three products. The scope of this project covers the web and mobile apps, but not the data migration.", "What can we infer about the data migration?", ["Someone else, or a later project, will handle it.", "It is the main deliverable of this project.", "Duc has already finished it.", "It is part of the mobile app."], 0], W: ["fill", "I liaise ___ (với) your IT team on infrastructure.", "with"], S: ["Say this sentence aloud:", "I will oversee this project from start to finish."], U: ["oversee", "She oversees the delivery of three products.", "She oversees to the delivery.", "She is oversee the delivery.", "The delivery oversees her.", "Cô ấy giám sát việc bàn giao ba sản phẩm."],
      tr: ["Có thể suy ra điều gì về vai trò của Đức?", "Anh ấy điều phối dự án chứ không tự làm mọi việc.", "Có thể suy ra điều gì về việc chuyển đổi dữ liệu?", "Người khác, hoặc một dự án sau, sẽ lo việc đó.", "Tôi là đầu mối trao đổi với nhóm IT của bạn về hạ tầng.", "với", "Nói to câu sau.", "Tôi sẽ phụ trách dự án này từ đầu đến cuối."]},
    {t: "If we had…, we would…", o: "Discuss a hypothetical option and its consequence.", g: "1) Pattern: If + past simple, would + verb. 2) Use it for an unlikely or imagined situation. 3) Examples: If we had a bigger budget, we would add a feature. If we had more testers, we would finish earlier. That would reduce the risk.", ex: ["If we had a bigger budget, we would add a feature.", "If we had more testers, we would finish earlier.", "That would reduce the risk."],
      v: [["risk", "/rɪsk/", "rủi ro", "reduce the risk", "a high risk", "take a risk", "noun", "danger", "danger, threat", "safety", "risky|adjective|rủi ro;risk|verb|liều", "danger:A2;threat:B2;hazard:B2;exposure:C1", "", "peril"], ["budget", "/ˈbʌdʒɪt/", "ngân sách", "a bigger budget", "within budget", "over budget", "noun", "money", "funds, allocation", "", "budget|verb|lập ngân sách;budgetary|adjective|thuộc ngân sách", "money:A1;funds:B1;allocation:B2;appropriation:C1", "", ""], ["feature", "/ˈfiːtʃə/", "tính năng", "add a feature", "a key feature", "a new feature", "noun", "function", "function, capability", "", "feature|verb|có (tính năng);featured|adjective|nổi bật", "part:A1;function:B1;capability:B2;functionality:C1", "", ""]], s: ["ʌ", "the /ʌ/ sound in 'budget'", "Keep your mouth relaxed and make a short 'uh'."],
      L: ["If we had two more testers, we would finish a week earlier. That would reduce the risk.", "What can we infer about the current situation?", ["The team does not have enough testers.", "The team has already finished.", "Two testers joined last week.", "There is no risk in the project."], 0], R: ["If the budget were bigger, the team would add a payment feature. For now, it stays out of scope to keep the risk low.", "What can we infer about the budget?", ["It is not big enough for the payment feature.", "It was increased last month.", "It only covers testing.", "It was spent on the payment feature."], 0], W: ["mcq", "Choose the correct sentence:", "If we had more time, we would test it again.", ["If we had more time, we would test it again.", "If we have more time, we would test it again.", "If we had more time, we will test it again.", "If we would have more time, we tested it again."]], S: ["Say this sentence aloud:", "If we had more testers, we would finish earlier."], U: ["risk", "That would reduce the risk.", "That would risk the reduce.", "That would reduce the risky.", "That is very risk.", "Điều đó sẽ giảm rủi ro."],
      tr: ["Có thể suy ra điều gì về tình hình hiện tại?", "Nhóm không có đủ kiểm thử viên.", "Có thể suy ra điều gì về ngân sách?", "Ngân sách không đủ cho tính năng thanh toán.", "Chọn câu đúng.", "Nếu có thêm thời gian, chúng tôi sẽ kiểm thử lại.", "Nói to câu sau.", "Nếu có thêm kiểm thử viên, chúng tôi sẽ xong sớm hơn."]},
    {t: "The client said that…", o: "Report what a client said accurately in a status update.", g: "1) Pattern: said (that) + clause, with the verb moved one step back in time. 2) Use it to pass on what someone told you. 3) Examples: The client said that the deadline was fixed. She told us that the feedback was positive. They said they would raise a concern on Friday.", ex: ["The client said that the deadline was fixed.", "She told us that the feedback was positive.", "They said they would raise a concern on Friday."],
      v: [["concern", "/kənˈsɜːn/", "mối lo ngại", "raise a concern", "a major concern", "address a concern", "noun", "problem", "worry, issue", "confidence", "concerned|adjective|lo lắng;concerning|adjective|đáng lo", "worry:A2;issue:B1;reservation:B2;apprehension:C1", "", "disquiet"], ["feedback", "/ˈfiːdbæk/", "phản hồi", "positive feedback", "give feedback", "client feedback", "noun", "information", "comments, response", "", "", "comments:A2;response:B1;input:B2;critique:C1", "", ""], ["deadline", "/ˈdedlaɪn/", "hạn chót", "a fixed deadline", "meet the deadline", "extend the deadline", "noun", "time", "due date, cut-off", "", "", "date:A1;due date:B1;cut-off:B2;time limit:B2", "crunch time", ""]], s: ["ɜː", "the /ɜː/ sound in 'concern'", "Relax your lips and hold a long 'er' without curling your tongue."],
      L: ["The client said that the feedback was positive. However, she told us that the deadline was fixed.", "What does the word 'however' suggest about the deadline?", ["The team had hoped to move it.", "The client extended it.", "The feedback was negative.", "The deadline was missed."], 0], R: ["In the call, the product owner said they had one concern: the checkout page was too slow. She said they would send detailed feedback by Friday.", "What can we infer about the product owner's overall view?", ["She is mostly satisfied apart from one issue.", "She wants to cancel the project.", "She has many serious complaints.", "She has not tested the checkout page."], 0], W: ["fill", "The client said that the deadline ___ (dạng quá khứ của 'is') fixed.", "was"], S: ["Say this sentence aloud:", "The client said that the feedback was positive."], U: ["concern", "She raised a concern about the deadline.", "She concerned a raise about the deadline.", "She is very concern about it.", "She raised concern a deadline.", "Cô ấy nêu một mối lo ngại về hạn chót."],
      tr: ["Từ 'however' gợi ý điều gì về hạn chót?", "Nhóm đã hy vọng dời được hạn.", "Có thể suy ra điều gì về cái nhìn chung của chủ sản phẩm?", "Cô ấy khá hài lòng, chỉ trừ một vấn đề.", "Khách hàng nói rằng hạn chót là cố định.", "là (ở thì quá khứ)", "Nói to câu sau.", "Khách hàng nói rằng phản hồi là tích cực."]},
    {t: "I would suggest + -ing", o: "Make a diplomatic recommendation and justify it.", g: "1) Pattern: I would suggest + verb-ing; I recommend that we + verb. 2) Use it to propose a change politely. 3) Examples: I would suggest that we postpone the release. I recommend that we prioritise the login fix. That is the safest alternative.", ex: ["I would suggest that we postpone the release.", "I recommend that we prioritise the login fix.", "That is the safest alternative."],
      v: [["postpone", "/pəʊstˈpəʊn/", "hoãn lại", "postpone the release", "postpone a meeting", "postpone until Monday", "verb", "action", "delay, put off", "bring forward", "postponement|noun|sự trì hoãn", "move:A1;delay:A2;put off:B1;defer:C1", "push back", ""], ["prioritise", "/praɪˈɒrɪtaɪz/", "ưu tiên", "prioritise the fix", "prioritise tasks", "prioritise quality", "verb", "action", "rank, put first", "neglect", "priority|noun|ưu tiên;prioritisation|noun|việc sắp xếp ưu tiên", "choose:A1;put first:B1;rank:B2;triage:C1", "", ""], ["alternative", "/ɔːlˈtɜːnətɪv/", "phương án thay thế", "a safer alternative", "an alternative plan", "no alternative", "noun", "option", "option, choice", "", "alternative|adjective|thay thế;alternatively|adverb|hoặc là", "choice:A1;option:A2;substitute:B2;fallback:C1", "plan B", ""]], s: ["aɪ", "the /aɪ/ sound in 'prioritise'", "Open your mouth for 'a' and glide to 'i'."],
      L: ["I would suggest postponing the release by one week. I recommend that we prioritise the login fix first.", "What can we infer about the login fix?", ["It is not ready yet and blocks the release.", "It was finished last week.", "It is not important to the speaker.", "The client asked to remove it."], 0], R: ["Releasing on Friday is risky. A safer alternative is to postpone the release until Monday and prioritise the two critical bugs.", "What can we infer about the two critical bugs?", ["They are not fixed yet.", "They were fixed on Friday.", "They are not related to the release.", "They were reported by the client on Monday."], 0], W: ["mcq", "Choose the correct sentence:", "I would suggest postponing the release.", ["I would suggest postponing the release.", "I would suggest to postpone the release.", "I would suggest postpone the release.", "I would suggest that postponing the release."]], S: ["Say this sentence aloud:", "I would suggest postponing the release by one week."], U: ["postpone", "We decided to postpone the release.", "We decided to postpone to the release.", "We decided the release postpone.", "The release was postponement by us.", "Chúng tôi quyết định hoãn bản phát hành."],
      tr: ["Có thể suy ra điều gì về bản sửa lỗi đăng nhập?", "Nó chưa xong và đang chặn bản phát hành.", "Có thể suy ra điều gì về hai lỗi nghiêm trọng?", "Chúng chưa được sửa.", "Chọn câu đúng.", "Tôi đề nghị hoãn bản phát hành.", "Nói to câu sau.", "Tôi đề nghị hoãn bản phát hành một tuần."]},
    {t: "We have been working on…", o: "Summarise ongoing work and its current status.", g: "1) Pattern: have/has been + verb-ing + for/since. 2) Use it for an activity that started earlier and is still in progress. 3) Examples: We have been working on the migration for three weeks. The team has been tracking a performance issue. We have reached the first milestone.", ex: ["We have been working on the migration for three weeks.", "The team has been tracking a performance issue.", "We have reached the first milestone."],
      v: [["issue", "/ˈɪʃuː/", "vấn đề", "a performance issue", "track an issue", "resolve the issue", "noun", "problem", "problem, bug", "solution", "issue|verb|phát hành, đưa ra", "problem:A1;bug:B1;defect:B2;anomaly:C1", "glitch", ""], ["migration", "/maɪˈɡreɪʃn/", "việc chuyển đổi (dữ liệu, hệ thống)", "data migration", "the migration plan", "complete the migration", "noun", "process", "transfer, move", "", "migrate|verb|chuyển đổi;migrated|adjective|đã chuyển", "move:A1;transfer:B1;transition:B2;porting:C1", "", ""], ["milestone", "/ˈmaɪlstəʊn/", "cột mốc", "reach a milestone", "the first milestone", "a key milestone", "noun", "goal", "target, checkpoint", "", "", "goal:A2;target:B1;checkpoint:B2;landmark:C1", "", ""]], s: ["ʃ", "the /ʃ/ sound in 'issue'", "Round your lips slightly and push air out: 'sh'."],
      L: ["We have been working on the data migration for three weeks. Yesterday we reached the first milestone.", "What can we infer about the migration?", ["It is still in progress with more milestones ahead.", "It was completed yesterday.", "It started yesterday.", "It has been cancelled."], 0], R: ["The team has been tracking a performance issue since Monday. It does not block the next milestone, but it needs to be resolved before the release.", "What can we infer about the performance issue?", ["It is important but not urgent for the next milestone.", "It has already been resolved.", "It will delay the next milestone.", "It was found after the release."], 0], W: ["fill", "We have been ___ (làm việc, dạng -ing) on the migration for three weeks.", "working"], S: ["Say this sentence aloud:", "We have been working on the migration for three weeks."], U: ["issue", "We are tracking a performance issue.", "We are issue a performance tracking.", "The performance is very issue.", "We are tracking an issue performance.", "Chúng tôi đang theo dõi một vấn đề về hiệu năng."],
      tr: ["Có thể suy ra điều gì về việc chuyển đổi?", "Nó vẫn đang tiến hành, còn các cột mốc phía trước.", "Có thể suy ra điều gì về vấn đề hiệu năng?", "Quan trọng nhưng chưa gấp với cột mốc tiếp theo.", "Chúng tôi đã làm việc chuyển đổi được ba tuần.", "làm việc", "Nói to câu sau.", "Chúng tôi đã làm việc chuyển đổi được ba tuần."]}
  ]
};
// Vietnamese meanings of the synonyms / antonyms used in the demo lessons
const DEMO_VI = {work: 'làm việc', position: 'vị trí', 'first name': 'tên', 'QA engineer': 'kỹ sư kiểm thử', fresh: 'mới mẻ', good: 'tốt', kind: 'tử tế', 'out of': 'từ, ra khỏi', 'do a job': 'làm một công việc', group: 'nhóm', workplace: 'nơi làm việc', call: 'gọi, cuộc gọi', begin: 'bắt đầu', update: 'cập nhật', support: 'hỗ trợ', email: 'thư điện tử', 'look at': 'xem xét', 'co-worker': 'đồng nghiệp', 'responsible for': 'chịu trách nhiệm về', client: 'khách hàng', 'become part of': 'trở thành một phần của', assignment: 'nhiệm vụ được giao', complete: 'hoàn thành', 'due date': 'ngày đến hạn', boss: 'sếp', 'work under': 'làm việc dưới quyền', 'status report': 'báo cáo tiến độ', site: 'địa điểm', application: 'ứng dụng', customer: 'khách hàng', prepare: 'chuẩn bị', 'go to': 'đi đến, tham dự', duty: 'nhiệm vụ', history: 'quá trình, lịch sử', training: 'đào tạo', practice: 'thực hành', skill: 'kỹ năng', 'in charge': 'phụ trách', accountable: 'chịu trách nhiệm', partner: 'đối tác', party: 'bên tham gia', handle: 'xử lý', manage: 'quản lý', busy: 'bận', frantic: 'tất bật', chat: 'trò chuyện', 'update each other': 'cập nhật cho nhau', release: 'phát hành', start: 'bắt đầu', verify: 'xác minh', check: 'kiểm tra', 'hold-up': 'sự trì hoãn', postponement: 'sự hoãn lại', timetable: 'thời gian biểu', plan: 'kế hoạch', accept: 'chấp nhận', 'agree to': 'đồng ý với', examine: 'xem xét kỹ', version: 'phiên bản', launch: 'ra mắt', supervise: 'giám sát', 'coordinate with': 'phối hợp với', 'work with': 'làm việc cùng', range: 'phạm vi', extent: 'mức độ', danger: 'nguy hiểm', threat: 'mối đe doạ', funds: 'nguồn tiền', allocation: 'khoản phân bổ', function: 'chức năng', capability: 'khả năng', worry: 'lo lắng', issue: 'vấn đề', comments: 'nhận xét', response: 'phản hồi', 'cut-off': 'hạn chót', delay: 'trì hoãn', 'put off': 'hoãn lại', rank: 'xếp hạng', 'put first': 'ưu tiên', option: 'lựa chọn', choice: 'sự lựa chọn', problem: 'vấn đề', bug: 'lỗi', transfer: 'chuyển', move: 'di chuyển', target: 'mục tiêu', checkpoint: 'điểm kiểm tra',
  old: 'cũ', bad: 'xấu', to: 'đến', rest: 'nghỉ ngơi', stop: 'dừng', finish: 'kết thúc', receive: 'nhận', seller: 'người bán', leave: 'rời đi', employee: 'nhân viên', supplier: 'nhà cung cấp', inexperience: 'thiếu kinh nghiệm', irresponsible: 'vô trách nhiệm', ignore: 'bỏ qua', calm: 'bình tĩnh', quiet: 'yên tĩnh', cancel: 'huỷ', deny: 'từ chối', reject: 'bác bỏ', safety: 'an toàn', confidence: 'sự tự tin', 'bring forward': 'dời sớm lên', neglect: 'bỏ bê', solution: 'giải pháp'};
// umbrella words of the demo lessons: meaning + a few other words under the same umbrella
const DEMO_UMB = {work: ['công việc, việc làm', [['job', 'công việc'], ['task', 'nhiệm vụ'], ['career', 'sự nghiệp']]], word: ['từ', [['name', 'tên'], ['term', 'thuật ngữ'], ['phrase', 'cụm từ']]], job: ['nghề nghiệp', [['developer', 'lập trình viên'], ['designer', 'nhà thiết kế'], ['manager', 'quản lý']]], time: ['thời gian', [['morning', 'buổi sáng'], ['week', 'tuần'], ['deadline', 'hạn chót']]], good: ['tốt', [['nice', 'dễ chịu'], ['kind', 'tử tế'], ['great', 'tuyệt vời']]], activity: ['hoạt động', [['study', 'học'], ['exercise', 'tập luyện'], ['travel', 'đi lại']]], group: ['nhóm', [['team', 'đội'], ['department', 'phòng ban'], ['committee', 'uỷ ban']]], place: ['nơi chốn', [['office', 'văn phòng'], ['room', 'phòng'], ['site', 'địa điểm']]], event: ['sự kiện', [['meeting', 'cuộc họp'], ['call', 'cuộc gọi'], ['workshop', 'buổi thực hành']]], action: ['hành động', [['send', 'gửi'], ['check', 'kiểm tra'], ['report', 'báo cáo']]], document: ['tài liệu', [['email', 'thư điện tử'], ['report', 'báo cáo'], ['contract', 'hợp đồng']]], person: ['người', [['colleague', 'đồng nghiệp'], ['manager', 'quản lý'], ['client', 'khách hàng']]], product: ['sản phẩm', [['app', 'ứng dụng'], ['website', 'trang web'], ['feature', 'tính năng']]], experience: ['kinh nghiệm', [['skill', 'kỹ năng'], ['background', 'nền tảng'], ['expertise', 'chuyên môn']]], knowledge: ['kiến thức', [['skill', 'kỹ năng'], ['experience', 'kinh nghiệm'], ['training', 'đào tạo']]], duty: ['nhiệm vụ', [['responsibility', 'trách nhiệm'], ['task', 'nhiệm vụ'], ['role', 'vai trò']]], busy: ['bận', [['hectic', 'bận rộn'], ['packed', 'kín lịch'], ['overloaded', 'quá tải']]], talk: ['nói chuyện', [['chat', 'trò chuyện'], ['discuss', 'thảo luận'], ['call', 'gọi điện']]], problem: ['vấn đề', [['bug', 'lỗi'], ['issue', 'vấn đề'], ['delay', 'chậm trễ']]], plan: ['kế hoạch', [['schedule', 'lịch trình'], ['roadmap', 'lộ trình'], ['agenda', 'chương trình họp']]], manage: ['quản lý', [['oversee', 'giám sát'], ['coordinate', 'điều phối'], ['lead', 'dẫn dắt']]], communicate: ['giao tiếp', [['update', 'cập nhật'], ['inform', 'thông báo'], ['reply', 'trả lời']]], danger: ['nguy hiểm', [['risk', 'rủi ro'], ['threat', 'mối đe doạ'], ['hazard', 'mối nguy']]], money: ['tiền', [['budget', 'ngân sách'], ['cost', 'chi phí'], ['salary', 'lương']]], function: ['chức năng', [['feature', 'tính năng'], ['option', 'tuỳ chọn'], ['tool', 'công cụ']]], information: ['thông tin', [['feedback', 'phản hồi'], ['data', 'dữ liệu'], ['update', 'cập nhật']]], option: ['lựa chọn', [['alternative', 'phương án thay thế'], ['choice', 'sự lựa chọn'], ['plan B', 'phương án dự phòng']]], process: ['quy trình', [['step', 'bước'], ['stage', 'giai đoạn'], ['workflow', 'luồng công việc']]], goal: ['mục tiêu', [['milestone', 'cột mốc'], ['target', 'chỉ tiêu'], ['objective', 'mục tiêu cụ thể']]]};
// slang / poetic words of the demo lessons with their definition, example and context / source
const DEMO_LEX = {
  gig: {w: 'gig', def: 'a job, especially a temporary or freelance one', example: 'I got a new gig as a tester at a startup.', context: 'Chat với đồng nghiệp, mạng xã hội. Không dùng trong email khách hàng, CV hay họp chính thức.', note: 'Gốc từ giới nhạc sĩ (buổi diễn); nghe trẻ trung, hơi tạm bợ.'},
  chops: {w: 'chops', def: 'real skill or ability in a field', example: 'She has serious coding chops.', context: 'Khen năng lực đồng nghiệp một cách thân mật; Mỹ nhiều hơn Anh.', note: 'Gần như luôn đi kèm lĩnh vực: coding chops, design chops.'},
  'sort out': {w: 'sort out', def: 'to deal with a problem successfully', example: 'Can you sort out the login bug today?', context: 'Rất phổ biến ở Anh, từ thân mật đến trung tính; dùng được trong email nội bộ.', note: 'Tránh trong văn bản chính thức với khách hàng – dùng resolve / handle.'},
  crazy: {w: 'crazy', def: 'extremely busy or chaotic (of a period of time)', example: 'This week has been crazy – three releases.', context: 'Than thở với đồng nghiệp về lịch làm việc.', note: 'Chỉ dùng cho tuần, ngày, lịch; không mô tả người là crazy ở nơi làm việc.'},
  'hang out': {w: 'hang out', def: 'to spend relaxed time together', example: "Let's hang out after work and catch up.", context: 'Ngoài giờ, với bạn bè hoặc đồng nghiệp thân.', note: 'Khác catch up: hang out không hàm ý cập nhật công việc.'},
  'give the green light': {w: 'give the green light', def: 'to approve something so that it can start', example: 'The client gave the green light for phase two.', context: 'Thân mật đến trung tính; nói được trong họp nhóm.', note: 'Thường nói về sếp hoặc khách hàng duyệt kế hoạch / ngân sách.'},
  'run the show': {w: 'run the show', def: 'to be in charge of everything', example: 'Minh runs the show on that project.', context: 'Nói về người đang điều hành, giọng ngưỡng mộ hoặc châm biếm nhẹ.', note: 'Có thể hàm ý người đó kiểm soát quá nhiều – cân nhắc khi nói trước mặt họ.'},
  'crunch time': {w: 'crunch time', def: 'the short, intense period just before a deadline', example: "It's crunch time – the release is on Friday.", context: 'Giới công nghệ, game, báo chí.', note: '"Crunch" một mình cũng ám chỉ làm thêm giờ liên tục trước hạn chót.'},
  'push back': {w: 'push back', def: 'to move something to a later time', example: 'Can we push back the demo to Monday?', context: 'Trung tính, dùng được trong email nội bộ.', note: 'Nghĩa thứ hai: push back on a request = phản đối; nhìn ngữ cảnh để hiểu đúng.'},
  'plan B': {w: 'plan B', def: 'an alternative plan to use if the first one fails', example: 'If the API is down, plan B is the mock server.', context: 'Thân mật đến trung tính.', note: 'Viết hoa B; trong câu thường không nhắc tới plan A.'},
  glitch: {w: 'glitch', def: 'a small, sudden technical problem', example: 'There was a glitch on the payment page this morning.', context: 'Thân mật; với khách hàng nên dùng issue hoặc bug.', note: 'Hàm ý nhỏ và tạm thời – không dùng cho lỗi nghiêm trọng.'},
  compass: {w: 'compass', def: 'the range or extent of something (literary)', example: 'The request lies beyond the compass of a single team.', source: 'Shakespeare, Sonnet 116: "Within his bending sickle\'s compass come" – compass = tầm với, phạm vi.'},
  peril: {w: 'peril', def: 'serious danger (literary, formal)', example: 'They launched without testing, at their peril.', source: 'Kinh Thánh bản King James, Romans 8:35: "…or peril, or sword?"; cụm cố định ngày nay: "at your peril".'},
  disquiet: {w: 'disquiet', def: 'a feeling of worry or unease (literary)', example: 'The delay caused some disquiet among the clients.', source: 'Kinh Thánh bản King James, Psalm 42:5: "why art thou disquieted within me?"; danh từ "disquiet" phổ biến trong văn xuôi thế kỷ 19.'}
};
/** Build the 5 demo lessons of a level as stored lesson objects. */
function demoLessons(cefr, week = 1) {
  const vi = isLow(cefr); const mc = (key, a) => ({[key]: a[0], prompt: a[1], options: a[2], answer: a[2][a[3]]});
  // vocabulary entry: [word, ipa, meaning, phrase×3, pos, umbrella, "syn, syn", "ant", "w|pos|v;…" family, "w:level;…" synonyms of every level, slang, poetic]
  const split = s => s ? String(s).split(/\s*,\s*/).filter(Boolean).map(w => ({w, v: DEMO_VI[w] || ''})) : []; const fam = s => s ? String(s).split(';').map(x => { const [w, pos, v] = x.split('|'); return {w, pos: pos || '', v: v || ''}; }) : [];
  const synAll = s => s ? String(s).split(';').map(x => { const k = x.lastIndexOf(':'); return {w: x.slice(0, k), level: x.slice(k + 1), note: ''}; }) : [];
  const umb = w => w ? {w, v: (DEMO_UMB[w] || [''])[0], words: ((DEMO_UMB[w] || [])[1] || []).map(([mw, mv]) => ({w: mw, v: mv}))} : '';
  const lexd = w => w ? (DEMO_LEX[w] || {w}) : '';
  const POS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'phrase']; const rot = (a, k) => a.slice(k % a.length).concat(a.slice(0, k % a.length));
  return (DEMO_LESSONS[cefr] || []).map((o, i) => { const cw = o.v[0]; const pos = cw[6] || 'noun'; const sent = (o.ex || []).find(s => new RegExp('\\b' + cw[0].split(' ')[0], 'i').test(s)) || (o.ex || [])[0] || ''; const U = o.U;
    return {id: uid('l'), day: i + 1, order: i + 1, micro: true, demo: true, durationMin: 10, cefr, week, explanationLang: vi ? 'vi' : 'en', explainLang: vi ? 'tiếng Việt' : 'English',
    title: o.t, objective: o.o, theory: o.g, examples: o.ex, vocab: o.v.map(x => ({e: x[0], ipa: x[1], v: x[2], phrases: x.slice(3, 6), pos: x[6] || '', umbrella: umb(x[7]), syn: split(x[8]), ant: split(x[9]), family: fam(x[10]), ...(vi ? {} : {synAll: synAll(x[11]), slang: lexd(x[12]), poetic: lexd(x[13])})})), pron: parsePron({sound: o.s[0], focus: o.s[1], tip: o.s[2], words: []}),
    listening: mc('audio', o.L), reading: mc('text', o.R), practice: {type: o.W[0], prompt: o.W[1], answer: o.W[2], options: o.W[3] || []}, speaking: {prompt: o.S[0], answer: o.S[1]},
    wordclass: cw[6] ? {prompt: `"${sent}" – What part of speech is "${cw[0]}" in this sentence?`, options: rot([pos, ...POS.filter(p => p !== pos).slice(0, 3)], i), answer: pos} : null,
    worduse: U ? {prompt: `Which sentence uses "${U[0]}" correctly?`, options: rot([U[1], U[2], U[3], U[4]], i), answer: U[1]} : null,
    trans: {L: {q: o.tr[0], a: o.tr[1]}, R: {q: o.tr[2], a: o.tr[3]}, W: {q: o.tr[4], a: o.tr[5]}, S: {q: o.tr[6], a: o.tr[7]}, ...(cw[6] ? {C: {q: `Từ "${cw[0]}" trong câu này thuộc từ loại nào?`, a: POS_VI[pos] || pos}} : {}), ...(U ? {U: {q: `Câu nào dùng từ "${U[0]}" đúng?`, a: U[5]}} : {})}}; });
}
/** Sets created by the old demo data (titles below, old lesson format) are replaced by the standard-structure demo lessons; ids of the first lessons are kept so recorded progress still points at a lesson. */
const OLD_DEMO_TITLES = ['My name, my job', 'Where are you from?', 'My working week', 'Introducing yourself at work', "Asking about someone's job", 'A short introduction email', 'Introducing yourself with impact', 'Small talk before a meeting', 'Positioning yourself in a kickoff'];
function upgradeOldDemoSets() {
  let n = 0;
  (S.lessonSets || []).forEach(ls => {
    if (!ls.lessons.length || !DEMO_LESSONS[ls.cefr] || !ls.lessons.every(l => !isMicroLesson(l) && OLD_DEMO_TITLES.includes(l.title))) return;
    const fresh = demoLessons(ls.cefr, ls.week); fresh.forEach((l, i) => { if (ls.lessons[i]) l.id = ls.lessons[i].id; }); ls.lessons = fresh; n++;
  });
  return n;
}
function seedDemo() {
  const T = todayStr(); const ago = n => addDays(T, -n); const iso = n => new Date(Date.now() - n * 86400000).toISOString();
  const keepSettings = S.settings; // keep API keys, webhook, PIN… when loading demo data
  S = defaultState(); S.settings = Object.assign(S.settings, keepSettings, {pilotStartDate: mondayOf(T), pilotWeeks: 2, weekOverride: 0});
  const mk = (name, role, cefr, goal='') => ({id: uid('u'), name, role, cefr, cefrSuggested: cefr, cefrApproved: !!cefr, sectionScores: null, monthlyGoal: goal, createdAt: iso(10), approvedAt: cefr ? iso(8) : null});
  const [l1, l2, l3, l4, l5, l6, l7] = [mk('Học viên A', 'learner', 'A1', 'Tự giới thiệu bằng 5 câu đơn giản.'), mk('Học viên B', 'learner', 'A2', 'Viết email ngắn xin dời lịch họp.'), mk('Học viên C', 'learner', 'B1', 'Trình bày một vấn đề và đề xuất giải pháp.'), mk('Học viên D', 'learner', 'B2', 'Dẫn dắt một cuộc họp ngắn.'), mk('Học viên E', 'learner', 'A2', 'Trả lời 3 câu hỏi của khách.'), mk('Học viên F', 'learner', null), mk('Học viên G', 'learner', null)];
  S.users = [l1, l2, l3, l4, l5, l6, l7, mk('Vận hành', 'operator', null), mk('Quản lý', 'manager', null)];
  [l1, l2, l3, l4, l5, l6, l7].forEach(x => x.pin = '1234'); // demo PIN for every sample learner
  S.users.forEach((x, i) => x.avatar = {color: AVATAR_COLORS[i % AVATAR_COLORS.length][0], acc: AVATAR_ACC[i % AVATAR_ACC.length][0], bg: i % AVATAR_BG.length});
  const prof = (u, department, position, goals, styles, selfLevel, situations, concerns) => { u.profile = {department, position, email: u.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.').replace(/đ/g, 'd') + '@gft.example', contact: '', goals, envUse: 'weekly', habits: ['movies', 'social'], situations, styles, explain: 'auto', timeOfDay: 'noon', duration: '10', sessionsPerWeek: 3, device: 'phone', selfLevel, experience: 'Học ở trường', concerns, completedAt: iso(10)}; };
  prof(l1, 'QA', 'Tester', ['email', 'confidence'], ['quiz', 'examples'], 'A1', 'Đọc ticket và trả lời ngắn cho dev nước ngoài', 'Sợ nói sai');
  prof(l2, 'Sales', 'Sales executive', ['customer', 'email'], ['speaking', 'examples'], 'A2', 'Email báo giá, chat với khách', 'Không nhớ từ');
  prof(l3, 'QA', 'QA lead', ['meeting', 'docs'], ['reading', 'writing'], 'B1', 'Họp daily với team Singapore', 'Muốn nói trôi chảy hơn'); l3.profile.certs = [{type: 'toeic', score: '650', year: '2023'}];
  prof(l4, 'Delivery', 'Delivery manager', ['meeting', 'career'], ['speaking', 'listening'], 'B2', 'Kickoff với khách', 'Diễn đạt ý phức tạp');
  prof(l5, 'Sales', 'Sales executive', ['customer'], ['listening', 'games'], 'unknown', 'Trả lời câu hỏi về sản phẩm', 'Nghe không kịp');
  prof(l6, 'Marketing', 'Content', ['email', 'docs'], ['reading', 'quiz'], 'B1', 'Đọc tài liệu marketing', '');
  S.weeks[0] = {n: 1, topic: 'Introducing yourself & your job', description: 'Tự giới thiệu trong buổi họp đầu với khách hoặc đồng nghiệp mới.', objectives: 'Nói/viết 4–6 câu về bản thân và công việc.', keyVocabHint: 'colleague, in charge of, department, deadline'};
  S.weeks[1] = {n: 2, topic: 'Emails & rescheduling meetings', description: 'Viết email ngắn xin dời lịch và xác nhận lịch mới.', objectives: 'Viết email 60–100 từ xin dời lịch.', keyVocabHint: 'reschedule, postpone, available, confirm'};
  // points per skill given out of 25 and scaled to the refined test's weights (listening 20, reading 40, writing 20, speaking 20) – total /100 and CEFR follow the test's conversion table
  const mkTest = (u, pts25, note) => { const maxes = [20, 40, 20, 20]; const pts = pts25.map((p, i) => Math.round(p / 25 * maxes[i])); const sectionScores = Object.fromEntries(SECTIONS.map((s, i) => [s, secScore(pts[i], maxes[i])])); const total = sum(pts); const t = {id: uid('t'), userId: u.id, kind: 'placement', form: 'A', answers: {}, sectionScores, total, rawLevel: totalCefr(total), aiSuggestedCefr: totalCefr(total), rationale: note, aiScored: true, warnings: [], timing: {}, submittedAt: iso(9)}; S.tests.push(t); u.sectionScores = sectionScores; };
  mkTest(l1, [5, 6, 4, 4], 'Hiểu thông tin cơ bản phần A nghe/đọc; bài viết rất ngắn, thiếu động từ to be.');
  mkTest(l2, [9, 10, 8, 8], 'Nắm hiện tại đơn; nhầm thì khi kể chuyện quá khứ. Viết được tin nhắn ngắn đúng ý.');
  mkTest(l3, [14, 15, 13, 12], 'Hiểu ý chính bài đọc; bài viết nêu được vấn đề và giải pháp nhưng câu nối còn vụng.');
  mkTest(l4, [19, 20, 18, 17], 'Hiểu ý ngầm trong hội thoại; viết mạch lạc, còn vài lỗi mạo từ.');
  mkTest(l5, [7, 9, 7, 6], 'Phần nghe yếu hơn các phần khác; câu viết đúng nhưng ngắn.');
  mkTest(l6, [13, 14, 11, 10], 'Ngữ pháp khá; bài viết hơi ngắn so với yêu cầu 150 từ.');
  // one approved lesson set per level in week 1, in the standard structure (5 days, 4 skills + vocabulary, grammar, pronunciation)
  const mkSet = (cefr, lessons) => S.lessonSets.push({id: uid('ls'), week: 1, cefr, status: 'approved', lessons, generatedAt: iso(7), approvedAt: iso(7)});
  ['A1', 'A2', 'B1', 'B2'].forEach(c => mkSet(c, demoLessons(c)));
  // activity, progress, coach turns, submissions
  const act = (u, daysAgo, type='lesson', minutes=12) => { if (ago(daysAgo) >= S.settings.pilotStartDate || type === 'test') S.activity.push({userId: u.id, date: ago(daysAgo), type, minutes, at: new Date(Date.now() - daysAgo * 86400000).toISOString()}); };
  [l1, l2, l3, l4, l5, l6].forEach(u => act(u, 9, 'test', 20));
  const dow = dowIndex(T); // days since Monday
  for (let d = 0; d <= dow; d++) { if (d % 2 === 0) act(l1, d); act(l3, d); if (d !== 1) act(l4, d, d % 2 ? 'coach' : 'lesson'); if (d % 3 === 0) act(l2, d); }
  if (dow >= 3) act(l5, dow); else act(l5, 3); // l5 last active ≥3 days ago → reminder
  const done = (u, n, score) => approvedLessons(1, u.cefr).slice(0, n).forEach((l, i) => S.progress.push({userId: u.id, lessonId: l.id, week: 1, completedAt: iso(Math.max(0, dow - i)), score, minutes: 11}));
  done(l1, 1, 80); done(l2, 2, 70); done(l3, 5, 90); done(l4, 1, 100); // C has finished the whole week: the "ready to move up" demo learner
  approvedLessons(1, 'B1').forEach(l => ['L', 'R', 'W', 'S'].forEach(c => { S.practiceResults[l3.id + '_' + partKey(l.id, c)] = {answer: 'ok', ok: true, localOk: true, attempts: 1, done: true, at: iso(1)}; }));
  const turn = (userText, reply, m, v, g, sugg) => ({at: iso(1), userText, reply, rubric: {meaning: m, vocab: v, grammar: g}, suggestions: sugg, correctedText: sugg.length ? sugg[0].corrected : ''});
  S.coachSessions.push({id: uid('cs'), userId: l2.id, week: 1, startedAt: iso(1), messages: [{role: 'assistant', content: 'Hi B! I\'m Season. What do you do at work?'}, {role: 'user', content: 'My name is B. I work at marketing.'}, {role: 'assistant', content: 'Nice to meet you, B! What do you do in marketing every day?'}], turns: [turn('My name is B. I work at marketing.', 'Nice to meet you, B! What do you do in marketing every day?', 4, 3, 3, [{original: 'I work at marketing', corrected: 'I work in marketing', explanation: 'Dùng "in" trước tên phòng ban.'}])]});
  S.coachSessions.push({id: uid('cs'), userId: l3.id, week: 1, startedAt: iso(2), messages: [{role: 'assistant', content: 'Hi C, what does a typical day look like for you?'}, {role: 'user', content: 'I have been working as QA lead since two years. Most days I review test plans and talk with the client.'}, {role: 'assistant', content: 'That sounds busy! Which part of the day do you enjoy most?'}], turns: [turn('I have been working as QA lead since two years.', 'That sounds busy! Which part of the day do you enjoy most?', 5, 4, 3, [{original: 'since two years', corrected: 'for two years', explanation: 'Use "for" with a period of time and "since" with a starting point.'}])]});
  S.submissions.push({id: uid('sub'), userId: l3.id, week: 1, type: 'writing', task: practiceTask(l3, 1).task, text: 'Dear team,\nI am writing to introduce myself. I have been working at GFT since 2022 as QA lead. On this project I am responsible for test planning and I will join your weekly call. One problem I see is that bug reports often miss steps to reproduce. I suggest we use a short template for every report.\nBest regards, C', rubric: {meaning: 5, vocab: 4, grammar: 4}, total: 86, feedback: 'Clear structure and a concrete suggestion. Watch article use ("a short template" is right; "the weekly call" needs "your").', suggestions: [{original: 'I will join your weekly call', corrected: 'I will join your weekly call', explanation: 'Correct as written – good use of "will" for a commitment.'}], correctedText: '', aiGraded: true, operatorChecked: false, submittedAt: iso(0)});
  // level-up flow demo: approved short forms for B2 and C1; C (B1) is ready to move up (6 good coach turns); D (B2) has an open request to C1 (test passed + challenge passed)
  const [fB2, fC1] = ['B2', 'C1'].map(t => { const f = {id: uid('lf'), target: t, status: 'approved', form: demoLevelForm(t), createdAt: iso(5), approvedAt: iso(5), by: null, byName: 'Đề mẫu'}; S.levelForms.push(f); return f; });
  const cs3 = S.coachSessions.find(c => c.userId === l3.id); [['Most days I start with a stand-up, then I review the test plans that the team wrote the day before.', 'Sounds structured. What do you do when a plan has gaps?', 5, 4, 4], ['I write comments in the document and discuss them with the tester in a short call, because written feedback alone can sound harsh.', 'Good point. How does the client react to delays?', 4, 4, 4], ['They are usually fine if we tell them early and explain the reason, so I send a short update as soon as I know.', 'That is a good habit. Which part of your job is the most difficult?', 5, 4, 5], ['Estimating how long testing will take, because the requirements often change in the middle of the sprint.', 'That is common. How do you handle the changes?', 4, 5, 4], ['We keep a list of changes and re-estimate every Friday, then I show the client what moved and why.', 'Clear process. What would you improve first?', 5, 4, 4], ['I would like a better template for bug reports so that developers get the steps to reproduce without asking us.', 'Great idea – thanks for the conversation!', 4, 5, 4]].forEach(([q, a, m, v, g]) => { cs3.messages.push({role: 'user', content: q}, {role: 'assistant', content: a}); cs3.turns.push(turn(q, a, m, v, g, [])); });
  const luScores = Object.fromEntries(SECTIONS.map((s, i) => [s, secScore([20, 19, 18, 17][i], 25)]));
  const luTest = {id: uid('t'), userId: l4.id, kind: 'levelup', form: fC1.id, target: 'C1', answers: {}, sectionScores: luScores, total: 74, rawLevel: totalCefr(74), aiSuggestedCefr: 'B2', rationale: 'Bài viết mạch lạc, lập luận rõ; phần nói còn vài lỗi mạo từ.', aiScored: true, gradedBy: 'ai', warnings: [], timing: {}, submittedAt: iso(2), outcome: 'requested', weakest: 'speaking'};
  S.tests.push(luTest);
  const chal = {id: uid('cs'), userId: l4.id, week: 1, startedAt: iso(1), challenge: {target: 'C1', testId: luTest.id, result: 'pass', mean: 4.2, off: 0, finishedAt: iso(1)}, messages: [{role: 'assistant', content: 'Hi D, this is your C1 challenge. Tell me about a recent problem at work and how you dealt with it.'}], turns: []};
  [['Last month a client changed the scope two days before the kickoff, which meant our estimates were no longer realistic. I asked for a short call, laid out the trade-offs and we agreed to move one feature to phase two.', 'Sensible. Had you anticipated the change?', 4, 4, 4], ['Partly – we had flagged the risk in the proposal, but I underestimated how late the request would come. In hindsight I should have confirmed the scope in writing a week earlier.', 'What would you do differently with a new client?', 4, 5, 4], ['I would set a scope freeze date and explain why it protects both sides; most clients accept it once they understand the cost of late changes.', 'How do you handle a client who refuses?', 5, 4, 4], ['I would separate what is negotiable from what is not, offer options with their consequences, and escalate only if the delivery date itself is at risk.', 'Do you think remote kickoffs make this harder?', 4, 4, 5], ['Somewhat, because you lose the informal signals; so I schedule a shorter follow-up two days later to catch anything that was not said in the meeting.', 'Last question: what makes a good delivery manager?', 4, 4, 4], ['Someone who keeps the team calm under pressure, communicates bad news early, and treats the client as a partner rather than an opponent.', 'Well put – thank you!', 5, 4, 4]].forEach(([q, a, m, v, g]) => { chal.messages.push({role: 'user', content: q}, {role: 'assistant', content: a}); chal.turns.push(turn(q, a, m, v, g, [])); });
  S.coachSessions.push(chal);
  S.levelRequests.push({id: uid('lr'), userId: l4.id, from: 'B2', to: 'C1', testId: luTest.id, sessionId: chal.id, status: 'pending', at: iso(1)});
  // badges that come with the seeded progress count as already announced: a demo learner should not get a burst of "new badge" toasts on first login
  learners().filter(x => x.cefrApproved).forEach(x => { const r = rewards(x); x.badgesSeen = r.badges.filter(b => b.earned).map(b => b.id); x.levelSeen = r.lv.index; });
  save(true);
}
/** Hand-written short level-up forms for the demo (same shape as the AI output). */
function demoLevelForm(target) {
  const q5 = arr => arr.map(([q, o, a]) => mcq(q, o, a, 5));
  const F = target === 'C1' ? {
    title: 'Level-up test C1 – Đề mẫu',
    L: {title: 'Part A – Two managers discuss a tight deadline', instruction: 'Listen to the discussion and answer questions 1–5.', audio: [['Lan', 'The client wants the whole platform migrated by the end of the quarter. Honestly, I think we should decline unless they drop the reporting module.'], ['Peter', 'Declining outright could cost us the account. What if we accept the deadline for the core migration and treat reporting as a separate phase with its own timeline?'], ['Lan', 'That only works if they understand that "separate phase" means it will not be ready in March. Last time, phased delivery was interpreted as everything being slightly late.'], ['Peter', 'Then we put it in writing: a one-page summary of what is in scope for March, what is not, and the risks if they insist on both. I would rather lose a day drafting that than lose the client to a misunderstanding.'], ['Lan', 'Agreed. And let us propose a weekly checkpoint so that scope changes surface early instead of at the end.']],
      qs: q5([['What does Lan initially suggest?', ['Accepting the full scope', 'Declining unless the scope is reduced', 'Asking for more staff', 'Delaying the start'], 1], ['What is Peter\'s main concern about declining?', ['The team would be idle', 'The company might lose the client', 'The reporting module is too hard', 'The deadline is unrealistic'], 1], ['Why is Lan cautious about "phased delivery"?', ['It is more expensive', 'The client previously misunderstood it', 'The team dislikes it', 'It is against company policy'], 1], ['What does Peter propose to prevent misunderstandings?', ['A longer contract', 'A written one-page scope summary', 'A larger team', 'Daily meetings with the client'], 1], ['What can be inferred about the two managers by the end?', ['They still disagree', 'They agree on a plan with clear scope and regular checkpoints', 'They decide to decline the project', 'They postpone the decision'], 1]])},
    R: {title: 'Part A – Giving feedback across cultures', instruction: 'Read the article and answer questions 1–5.', text: 'Feedback that works in one office can misfire in another. In some teams, a direct "this does not work" is heard as efficient and respectful of everyone\'s time; in others, the same sentence is heard as a personal attack, and the recipient quietly stops contributing. Multinational teams therefore need an explicit agreement about how feedback is given, rather than assuming that good intentions will translate by themselves.\n\nOne practical approach is to separate the observation from the judgement. "The report was sent two days after the deadline" is a fact that can be discussed; "you are unreliable" is a verdict that invites defensiveness. A second habit is to ask before telling: a colleague who is invited to assess their own work usually identifies most of the problems themselves, and the remaining points land more softly. Finally, feedback should be timely but not public. Praise can be shared in a meeting; corrections belong in a one-to-one conversation, ideally on the same day.\n\nNone of this means lowering standards. It means recognising that the goal of feedback is a change in behaviour, and that a message which is technically accurate but never acted upon has failed.',
      qs: q5([['According to the text, why can direct feedback be a problem?', ['It takes too much time', 'It may be interpreted differently across cultures', 'It is always rude', 'Managers are not trained to give it'], 1], ['What does the author recommend instead of assuming good intentions are enough?', ['Avoiding feedback', 'An explicit team agreement on how feedback is given', 'Giving feedback only in writing', 'Letting HR handle feedback'], 1], ['Which sentence is an example of an observation rather than a judgement?', ['"You are unreliable."', '"The report was sent two days after the deadline."', '"You never meet deadlines."', '"This is unacceptable."'], 1], ['Why does the author suggest asking before telling?', ['It saves the manager time', 'People often identify their own problems, so the rest is easier to accept', 'It avoids giving any criticism', 'It is required by policy'], 1], ['What is the author\'s view of standards?', ['They should be lowered to avoid conflict', 'They remain high; the aim is feedback that leads to change', 'They matter less than politeness', 'They should be set by the team'], 1]])},
    W: {task: 'Your company runs performance reviews once a year, and several colleagues say the feedback arrives too late to be useful. Your manager has sent you this message:', message: 'Hi,\nI would like to change how we give feedback, but I need a concrete proposal. Could you write a short message describing one problem with the current yearly review and proposing one change, with its main advantage and one possible risk?'},
    S: {title: 'Task 1 – Discussion (3 phút)', prompt: 'Your company is considering a four-day working week with the same salary and the same targets. Argue for or against the idea, considering the effects on productivity, clients and the team.', hint: 'Nêu lập trường rõ, 2–3 lý do có ví dụ, và nhắc một ý phản biện.'}
  } : {
    title: 'Level-up test B2 – Đề mẫu',
    L: {title: 'Part A – A presentation is moved earlier', instruction: 'Listen to the conversation and answer questions 1–5.', audio: [['Team leader', 'Hi Nam, I have just heard that the client wants our presentation on Wednesday instead of Friday. Can the slides be ready two days early?'], ['Nam', 'The slides are nearly finished, but the cost section depends on numbers from finance, and they promised them for Thursday.'], ['Team leader', 'Could you ask them for a draft version by Tuesday? Even rough figures would be better than an empty slide.'], ['Nam', 'I will call them now. If they cannot do it, I suggest we present the costs as a range and send the final figures on Friday as planned.'], ['Team leader', 'That works. Please also shorten the demo to ten minutes, because the client has only forty-five minutes on Wednesday.'], ['Nam', 'Understood. I will send you the updated version tomorrow afternoon.']],
      qs: q5([['Why does the team leader talk to Nam?', ['The client cancelled the presentation', 'The presentation has been moved earlier', 'The slides have mistakes', 'Finance has changed the numbers'], 1], ['What is the problem with the cost section?', ['It is too long', 'The numbers from finance are not ready yet', 'The client does not want it', 'Nam has not started it'], 1], ['What does the team leader suggest?', ['Removing the cost section', 'Asking finance for rough figures earlier', 'Postponing the presentation', 'Presenting without slides'], 1], ['What is Nam\'s alternative plan?', ['Cancel the demo', 'Present costs as a range and send final figures later', 'Ask the client for more time', 'Let finance present the costs'], 1], ['Why should the demo be shortened?', ['The client has limited time', 'The demo is not working', 'The team leader dislikes demos', 'The slides are too many'], 0]])},
    R: {title: 'Part A – New expense policy', instruction: 'Read the email and answer questions 1–5.', text: 'Subject: Changes to the expense policy from 1 November\n\nHi everyone,\n\nFrom 1 November, all expenses must be submitted through the new online form within 14 days of the purchase date. Claims submitted later than that will only be approved in exceptional cases, with a written explanation from your manager.\n\nFor meals with clients, the limit is now 600,000 VND per person, and the names of the guests must be included. Taxi rides are reimbursed only when public transport is not practical, for example late in the evening or when carrying equipment.\n\nPlease attach a photo of the receipt to every claim. Claims without a receipt will be returned, which delays payment for everyone, so please check before you submit. If you are unsure whether something can be claimed, ask the finance team before you spend the money rather than afterwards.\n\nThanks for your cooperation,\nFinance team',
      qs: q5([['What is the deadline for submitting an expense claim?', ['7 days after purchase', '14 days after purchase', 'The end of the month', '1 November'], 1], ['What happens to a claim submitted after the deadline?', ['It is rejected automatically', 'It needs a written explanation from the manager', 'It is paid with a penalty', 'It is paid the following month'], 1], ['When are taxi rides reimbursed?', ['Always', 'Only when public transport is not practical', 'Only for managers', 'Only for client visits'], 1], ['Why does finance ask people to attach receipts?', ['To check the names of guests', 'Because claims without receipts are returned and delay payment', 'Because the form requires a photo', 'To calculate tax'], 1], ['What advice is given about unclear cases?', ['Submit the claim anyway', 'Ask finance before spending the money', 'Ask your manager afterwards', 'Pay it yourself'], 1]])},
    W: {task: 'Your team uses many different tools for messages, tasks and documents, and new colleagues find it confusing. Your manager has sent you this message:', message: 'Hi,\nA new colleague told me it took her a week to understand which tool we use for what. Could you write a short message describing one problem this causes for the team and suggesting one change that would make it easier for new people?'},
    S: {title: 'Task 1 – Scenario (3 phút)', prompt: 'A new colleague has to handle an urgent client request for the first time while you are away tomorrow. Explain to them, step by step, what to do, who to contact and what to avoid.', hint: 'Nêu các bước theo thứ tự, lý do của từng bước và một lỗi thường gặp.'}
  };
  return {title: F.title, listening: {intro: 'Đoạn nghe được phát tối đa 2 lần (giọng đọc của trình duyệt). Nghe xong chọn đáp án.', parts: [{key: 'L1', title: F.L.title, instruction: F.L.instruction, audio: F.L.audio, questions: F.L.qs}]}, reading: {parts: [{key: 'R1', title: F.R.title, instruction: F.R.instruction, text: F.R.text, questions: F.R.qs}]}, writing: {task: F.W.task, message: F.W.message, requirement: 'Please write 80–120 words.', minWords: 80, maxWords: 120}, speaking: {tasks: [{key: 'S1', title: F.S.title, prompt: F.S.prompt, hint: F.S.hint}]}};
}

// =====================================================================
// Mini games: free-text topic → validated → AI vocabulary set at the learner's level → 6 games
// =====================================================================
const gameSets = () => (S.gameSets = S.gameSets || []);
const gameResults = () => (S.gameResults = S.gameResults || []);
const GAME_LIST = [
  {id: 'scramble', icon: '🔤', name: 'Word scramble', desc: 'Các chữ cái bị xáo trộn, xếp lại thành đúng từ', bg: 'butter', goal: 'Xếp đúng càng nhiều từ càng tốt (8 từ).', how: ['Đọc gợi ý (nghĩa tiếng Việt / định nghĩa) và các ô chữ cái bị xáo trộn.', 'Bấm từng chữ cái theo đúng thứ tự (hoặc gõ phím) để xếp vào ô trống; ⌫ để bỏ chữ cuối.', 'Xếp đủ chữ mà sai thì ô rung và xoá để xếp lại; mỗi từ được 2 lần sai.', 'Bí quá thì bấm Gợi ý: mở chữ cái tiếp theo (trừ nửa điểm của từ đó).'], score: '+2 điểm mỗi từ xếp đúng ngay, +1 nếu dùng gợi ý hoặc sai một lần.'},
  {id: 'crossword', icon: '🧩', name: 'Crosswords', desc: 'Điền lưới ô chữ theo gợi ý dọc / ngang', bg: 'mint', goal: 'Điền đúng toàn bộ lưới ô chữ.', how: ['Mỗi số trên lưới ứng với một gợi ý Ngang → hoặc Dọc ↓ bên dưới.', 'Bấm vào ô và gõ chữ; gõ xong tự nhảy sang ô kế, phím mũi tên để di chuyển.', 'Bấm Kiểm tra: ô đúng xanh, ô sai đỏ, sửa rồi kiểm tra lại.', 'Bí quá thì bấm Gợi ý 1 chữ (mỗi lần trừ 1 điểm).'], score: 'Điểm = số từ trong lưới trừ số gợi ý đã dùng.'},
  {id: 'eggs', icon: '🧺', name: 'Season catch', desc: 'Đưa rổ hứng vật phẩm theo mùa mang đúng từ: lá (thu), hoa (xuân), kem (hè), tuyết (đông), lì xì (Tết), quà (Giáng sinh)', bg: 'peach', goal: 'Hứng đúng vật phẩm khớp với gợi ý, 10 lượt.', how: ['Gợi ý (nghĩa / định nghĩa) hiện to ở phía trên màn chơi.', '4 vật phẩm của mùa mang 4 từ rơi xuống; kéo chuột / chạm để di chuyển nhân vật (hoặc phím ← →) và đặt rổ dưới vật phẩm đúng.', 'Hứng đúng: +1 điểm, lượt mới. Hứng nhầm: mất 1 ❤️ (tim vỡ); hết mạng thì khủng long xuất hiện. Tốc độ rơi theo mức CEFR: A1 ×1, mỗi mức cao hơn cộng thêm ×0,5 (C1 ×3).', 'Để vật phẩm đúng rơi xuống đất cũng mất 1 ❤️. Hết 3 ❤️ là kết thúc.'], score: '+1 điểm mỗi vật phẩm hứng đúng, tối đa 10.'},
  {id: 'mario', icon: '🍄', name: 'Season-rio', desc: 'Qua từng cổng hộp quà (chắn kín, không nhảy qua được), ăn hết món khoái khẩu khổng lồ trong 10 giây rồi lấy cờ! Nhân vật đổi theo mùa: thỏ, dế, sóc, cánh cụt, én, tuần lộc', bg: 'lav', goal: 'Trả lời đủ 8 hộp quà chắn đường, ăn hết món khổng lồ trong 10 giây và chạm cờ.', how: ['Chạy bằng phím ← →, nhảy bằng Space hoặc ↑ (điện thoại: 3 nút dưới màn hình).', 'Mỗi hộp quà ? đứng trên một cột gỗ chắn ngang đường: chạm vào hộp hoặc cột → câu hỏi từ vựng, chọn 1 trong 4. Đúng: 🍄 (+1). Sai: mất 1 ❤️. Trả lời xong (đúng hay sai) cổng mới mở, nên không bỏ qua hộp nào được.', 'Đường khúc khuỷu: có hộp đặt trên bục gỗ, có hộp trên bục cao phải leo bậc. Cuối màn là món ăn khoái khẩu KHỔNG LỒ của nhân vật (thỏ – cà rốt, sóc – hạt dẻ, cánh cụt – cá…): chạm vào là đồng hồ 10 giây chạy; mỗi câu đúng ăn 1 miếng (3 miếng), sai mất 1 ❤️; quá 10 giây món ăn bị hỏng → thua.', 'Ăn hết món khổng lồ rồi chạm cờ để về đích. Hết 3 ❤️ hoặc để món ăn hỏng là thua.'], score: '+1 điểm mỗi hộp quà đúng, +1 mỗi miếng ăn đúng ở Boss (tối đa 11).'},
  {id: 'sort', icon: '🗂️', name: 'Word sort', desc: 'Xếp từng từ vào đúng nhóm từ loại', bg: 'butter', goal: 'Phân loại đúng càng nhiều từ càng tốt.', how: ['Mỗi lượt hiện một từ (kèm nghĩa) và các nhóm: Noun, Verb, Adjective, Adverb, Preposition, Phrase…', 'Bấm vào nhóm bạn cho là đúng từ loại của từ đó.', 'Đúng: +1 và chuỗi tăng; sai: app hiện nhóm đúng, chuỗi về 0.', 'Mẹo: nhìn hậu tố (-tion → noun, -ly → adverb) và cách dùng trong cụm từ.'], score: '+1 điểm mỗi từ đúng; chuỗi đúng liên tiếp dài nhất được ghi lại.'},
  {id: 'typing', icon: '⌨️', name: 'Typing race', desc: 'Type đúng từ trước khi thanh thời gian cạn!', bg: 'mint', goal: 'Gõ đúng 10 từ thật nhanh, giữ chuỗi combo càng dài càng nhiều điểm.', how: ['Mỗi từ có gợi ý: nghĩa tiếng Việt, định nghĩa tiếng Anh và hình minh hoạ (nếu có).', 'Thanh thời gian chạy rất nhanh – gõ từ bằng bàn phím ảo (hoặc bàn phím thật) rồi bấm ↵; phím vừa gõ sáng lên.', 'Đúng: +10 điểm × combo (combo tăng mỗi từ đúng liên tiếp, tối đa ×5). Sai hoặc hết giờ: combo về 1.', 'Chữ đã gõ đúng hiện xanh, sai hiện đỏ – sửa ngay bằng ⌫.'], score: '10 điểm × combo cho mỗi từ đúng; tối đa 10 từ.'}
];
const POS_GROUPS = [['noun', 'Noun'], ['verb', 'Verb'], ['adjective', 'Adjective'], ['adverb', 'Adverb'], ['preposition', 'Preposition'], ['phrase', 'Phrase']];
const posGroup = p => { p = String(p || '').toLowerCase(); if (!p) return ''; if (/phrasal|phrase|idiom|expression/.test(p)) return 'phrase'; const g = POS_GROUPS.find(([k]) => p.startsWith(k)); return g ? g[0] : 'phrase'; };
/* unrelated words for "odd one out" when a set has none (e.g. built from this week's lessons) */
const GAME_POOL = {low: [['window', 'cửa sổ'], ['banana', 'quả chuối'], ['bicycle', 'xe đạp'], ['rain', 'mưa'], ['doctor', 'bác sĩ'], ['kitchen', 'bếp'], ['mountain', 'núi'], ['ticket', 'vé'], ['garden', 'vườn'], ['pencil', 'bút chì']],
  high: [['volcano', 'núi lửa'], ['orchestra', 'dàn nhạc'], ['harvest', 'mùa gặt'], ['passport', 'hộ chiếu'], ['sculpture', 'điêu khắc'], ['glacier', 'sông băng'], ['recipe', 'công thức nấu ăn'], ['umbrella', 'cái ô'], ['planet', 'hành tinh'], ['vaccine', 'vắc-xin']]};
const BANNED_TOPIC = ['sex', 'porn', 'xxx', 'fuck', 'shit', 'bitch', 'dick', 'drugs', 'cocaine', 'heroin', 'weed', 'weapon', 'guns', 'kill', 'murder', 'suicide', 'bomb', 'terror', 'nazi', 'địt', 'đụ', 'lồn', 'cặc', 'buồi', 'đéo', 'đĩ', 'cứt', 'ma túy', 'ma tuý', 'giết', 'tự tử', 'súng', 'bom', 'khủng bố', 'khiêu dâm', 'cờ bạc', 'cá độ', 'chính trị', 'đảng'];
/** Topic input check before any AI call: length, characters, obvious nonsense, banned words. */
/* identity / group topics are never treated as a sexual or community violation: a soft "not for this context" message, no strike */
const GROUP_TERMS = ['lgbt', 'lgbtq', 'gay', 'lesbian', 'bisexual', 'transgender', 'queer', 'đồng tính', 'chuyển giới', 'song tính', 'tôn giáo', 'religion', 'muslim', 'islam', 'christian', 'buddhist', 'phật giáo', 'thiên chúa', 'công giáo', 'đạo hồi', 'ethnic', 'ethnicity', 'dân tộc', 'race', 'chủng tộc', 'disability', 'disabled', 'khuyết tật', 'feminism', 'nữ quyền', 'gender', 'giới tính'];
const hasTerm = (low, list) => list.find(w => new RegExp('(^|[^\\p{L}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\p{L}]|$)', 'u').test(low));
/** Topic input check before any AI call. kind: short | long | chars | nonsense | banned | group. Only nonsense and banned count as a strike. */
function validateTopic(raw) {
  const t = String(raw || '').trim().replace(/\s+/g, ' ');
  if (t.length < 3) return {ok: false, kind: 'short', reason: 'Chủ đề quá ngắn (ít nhất 3 ký tự)'};
  if (t.length > 60) return {ok: false, kind: 'long', reason: 'Chủ đề quá dài (tối đa 60 ký tự)'};
  if (!/^[\p{L}\p{M}\d' &,/-]+$/u.test(t)) return {ok: false, kind: 'chars', reason: 'Chỉ dùng chữ, số và dấu cách'};
  if (!/\p{L}/u.test(t) || t.split(' ').length > 6) return {ok: false, kind: 'nonsense', reason: 'Chủ đề cần là 1–6 từ có nghĩa'};
  const low = t.toLowerCase();
  if (hasTerm(low, GROUP_TERMS)) return {ok: false, kind: 'group', reason: 'Chủ đề chưa hợp bối cảnh đời sống / học tập ở đây – bạn chọn chủ đề khác nhé'}; // checked before the nonsense rule: "LGBT" has no vowel but is a real word
  const letters = low.replace(/[^\p{L}]/gu, '');
  if (/(.)\1{3,}/.test(letters) || !/[aeiouyàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/.test(letters)) return {ok: false, kind: 'nonsense', reason: 'Chủ đề trông không có nghĩa – nhập lại nhé'};
  if (hasTerm(low, BANNED_TOPIC)) return {ok: false, kind: 'banned', reason: 'Chủ đề không phù hợp để học tiếng Anh công sở'};
  return {ok: true, topic: t};
}
const topicReports = () => (S.topicReports = S.topicReports || []);
/** A wrong / violating topic counts as a strike; every third strike is reported to the operator (visible on Duyệt mức). */
function topicStrike(u, input, reason) {
  u.topicStrikes = [...(u.topicStrikes || []), {input, reason, at: new Date().toISOString()}]; const n = u.topicStrikes.length;
  if (n % 3 === 0) { topicReports().push({id: uid('tr'), userId: u.id, at: new Date().toISOString(), inputs: u.topicStrikes.slice(-3), status: 'open'}); save(true); toast('Nhập chủ đề sai / vi phạm 3 lần – đã báo cho Người vận hành', 'err'); return true; }
  save(true); toast(`Chủ đề không hợp lệ (lần ${n % 3}/3). Đủ 3 lần sẽ báo cho Người vận hành.`, 'err'); return false;
}
/** A set from this week's approved lessons (works without an API key). */
function weekGameSet(u) {
  const words = []; const seen = new Set();
  learnerLessons(u).forEach(l => (l.vocab || []).forEach(v => { const e = String(v.e || v.word || '').toLowerCase().trim(); if (e && !seen.has(e)) { seen.add(e); words.push({e, v: String(v.v || v.meaning || '').trim(), def: (v.phrases || [])[0] || '', ipa: v.ipa || '', pos: v.pos || ''}); } }));
  return {topic: weekInfo(currentWeek()).topic || 'Tuần này', words, others: []};
}
const gameOthers = (set, cefr) => set.others && set.others.length ? set.others : GAME_POOL[isLow(cefr) ? 'low' : 'high'].map(([e, v]) => ({e, v}));
const gshuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const gletters = w => w.toUpperCase().replace(/[^A-Z]/g, '');
const myGameSets = u => gameSets().filter(s => s.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const currentGameSet = u => { const sets = myGameSets(u); return sets.find(s => s.id === u.gameSetId) || sets[0] || null; };
const bestGame = (u, setId, game) => gameResults().filter(r => r.userId === u.id && r.setId === setId && r.game === game).sort((a, b) => b.score - a.score)[0];
let GS = {cleanup: null, busy: false};
route('#/games', () => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  const sets = myGameSets(u); const cur = currentGameSet(u);
  shell(`<div class="page-title"><div><div class="eyebrow">Mini game</div><h1>Game từ vựng</h1><p class="muted">Nhập chủ đề bạn thích, Season tạo bộ từ đúng level ${u.cefr || ''}, rồi bắt đầu chơi thôi!</p></div></div>
    <div class="card"><h3>1. Chủ đề</h3>
      <form class="row" onsubmit="return false" style="gap:8px"><input id="gm-topic" placeholder="VD: coffee shop, sprint planning, du lịch, bóng đá…" maxlength="60" style="flex:1;min-width:200px" autocomplete="off"><button class="btn-primary" data-action="gm-make" id="gm-make" ${ai.hasKey() && !GS.busy ? '' : 'disabled'}>${GS.busy ? '<span class="spinner"></span> Đang tạo…' : 'Tạo bộ từ'}</button><button data-action="gm-week" ${u.cefrApproved ? '' : 'disabled'}>Dùng từ vựng tuần này</button></form>
      <div id="gm-status" class="xs muted" style="margin-top:6px">${ai.hasKey() ? 'AI tạo 12 từ hợp chủ đề và đúng mức của bạn; chủ đề vô nghĩa hoặc không phù hợp sẽ bị từ chối.' : 'Chưa có API key nên chỉ dùng được từ vựng tuần này – báo vận hành nhập key trong Cài đặt.'}</div>
      ${sets.length ? `<div class="chips" style="margin-top:10px">${sets.map(s => `<button class="chip ${cur && s.id === cur.id ? 'good' : ''}" data-action="gm-pick" data-id="${s.id}">${esc(s.topic)} · ${s.words.length} từ</button>`).join('')}${cur ? `<button class="chip" data-action="gm-del" data-id="${cur.id}" title="Xoá bộ từ đang chọn">🗑 Xoá bộ này</button>` : ''}</div>` : ''}
    </div>
    ${cur ? `<div class="card"><div class="row between" style="align-items:baseline"><h3>2. Bộ từ: ${esc(cur.topic)} ${lvlChip(cur.cefr)}</h3><span class="small muted">${cur.words.length} từ · bấm để nghe</span></div><div class="chips">${cur.words.map(w => `<button class="chip" data-action="say" data-text="${esc(w.e)}" title="${esc(w.def || '')}" style="cursor:pointer">${ICONS.sound} ${esc(w.e)} <span class="muted" style="font-weight:600">– ${esc(w.v)}</span></button>`).join('')}</div></div>
    <div class="card"><h3>3. Chọn trò chơi</h3><div class="grid cols-3 games">${GAME_LIST.map(g => { const b = bestGame(u, cur.id, g.id); return `<a class="tile ${g.bg}" href="#/games/${g.id}"><span style="font-size:1.8rem;line-height:1">${g.icon}</span><span class="t">${g.name}</span><span class="s">${g.desc}</span>${b ? `<span class="badge" style="margin-top:4px">Tốt nhất: ${b.score}/${b.max}</span>` : ''}</a>`; }).join('')}</div></div>` : '<div class="card soft"><p class="small" style="margin:0">Tạo bộ từ ở bước 1 để mở 6 trò chơi.</p></div>'}
    <a class="card" href="#/arena" style="display:block;text-decoration:none;color:inherit;background:${arenaOpen(u) ? 'var(--primary-soft)' : 'var(--surface-2)'}"><div class="row between"><div><div class="eyebrow">${arenaOpen(u) ? 'Đấu trường nội bộ' : '🔒 Đấu trường nội bộ · mở từ B1'}</div><div class="small">${arenaOpen(u) ? `Bảng xếp hạng công ty và thách đấu 1-1 · bạn đang có <b>${arenaPoints(u).total}</b> điểm${duels().some(d => d.toId === u.id && d.status !== 'done' && !(d.scores || {})[u.id]) ? ' · <b style="color:#6E3B32">có lời thách đấu đang chờ bạn ⚔️</b>' : ''}` : 'Xếp hạng và thi đấu với đồng nghiệp từ mức B1 trở lên.'}</div></div><span class="badge primary">${arenaOpen(u) ? 'Vào →' : 'B1+'}</span></div></a>`, {title: 'Mini game'});
  $('#gm-topic')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); actions['gm-make'](); } });
});
actions['gm-make'] = async () => {
  const u = me(); const inp = $('#gm-topic'); const st = $('#gm-status'); if (!inp || GS.busy) return;
  const v = validateTopic(inp.value); if (!v.ok) { st.innerHTML = `<span style="color:#6E3B32;font-weight:800">✗ ${esc(v.reason)}</span>`; if (v.kind === 'nonsense' || v.kind === 'banned') topicStrike(u, inp.value.trim(), v.reason); inp.focus(); return; }
  if (!ai.hasKey()) { toast('Chưa có API key', 'err'); return; }
  GS.busy = true; const topic = v.topic; render(); const st2 = $('#gm-status'); if (st2) st2.innerHTML = `<span class="spinner"></span> Season đang chọn từ cho "${esc(topic)}"…`;
  try { const r = await ai.gameVocab(topic, u.cefr || 'A2'); const set = {id: uid('gs'), userId: u.id, topic: r.topic, input: topic, cefr: u.cefr || 'A2', words: r.words, others: r.others, createdAt: new Date().toISOString()}; gameSets().push(set); u.gameSetId = set.id; save(true); toast(`Đã tạo ${set.words.length} từ cho "${set.topic}"`, 'ok'); }
  catch (e) { toast(e.message, 'err'); if (e.rejected && !e.soft) topicStrike(u, topic, e.message); }
  finally { GS.busy = false; render(); if (!currentGameSet(u) || !gameSets().some(s => s.userId === u.id && s.input === topic)) { const i2 = $('#gm-topic'); if (i2) i2.value = topic; } }
};
actions['gm-week'] = () => { const u = me(); const w = weekGameSet(u); if (w.words.length < 4) { toast('Tuần này chưa có đủ từ vựng được duyệt', 'err'); return; } let set = gameSets().find(s => s.userId === u.id && s.week === currentWeek()); if (set) set.words = w.words; else { set = {id: uid('gs'), userId: u.id, topic: 'Tuần ' + currentWeek() + ': ' + w.topic, week: currentWeek(), cefr: u.cefr, words: w.words, others: [], createdAt: new Date().toISOString()}; gameSets().push(set); } u.gameSetId = set.id; save(true); render(); };
actions['gm-pick'] = t => { const u = me(); u.gameSetId = t.dataset.id; save(true); render(); };
actions['gm-del'] = async t => { const u = me(); const s = gameSets().find(x => x.id === t.dataset.id && x.userId === u.id); if (!s) return; if (await confirmDlg(`Xoá bộ từ "${s.topic}"?`, {danger: true, okLabel: 'Xoá'})) { S.gameSets = gameSets().filter(x => x !== s); u.gameSetId = null; save(true); render(); } };
/** Game page (tutorial first, then the game). `duel` = a PvP duel: both players play the duel's own word set and the result is written to the duel. */
function gamePage(game, set, duel) {
  const u = me(); const g = GAME_LIST.find(x => x.id === game); if (!set || !g || !GAMES[game]) { go('#/games'); return; }
  const best = bestGame(u, set.id, game); GS.set = set; GS.duel = duel || null; const back = duel ? '#/arena' : '#/games';
  const opp = duel ? userById(duel.fromId === u.id ? duel.toId : duel.fromId) : null;
  shell(`<div class="page-title"><div><h1>${g.icon} ${g.name}${duel ? ' <span class="badge danger">⚔️ Thách đấu</span>' : ''}</h1><p class="muted" style="margin:2px 0 0">${esc(set.topic)} · ${set.words.length} từ${opp ? ` · đối thủ: <b>${esc(opp.name)}</b>` : ''}</p><span class="badge warn" id="gm-best" style="margin-top:6px">Kỷ lục: ${best ? `${best.score}/${best.max}` : 'chưa có'}</span></div><div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end"><span class="row" id="gm-hud" style="gap:6px"></span><button class="btn-sm btn-x" data-action="gm-exit" title="Dừng trò này">Thoát game</button></div></div><div class="card" id="gm-board" style="position:relative"></div>`, {title: g.name});
  if (GS.cleanup) { try { GS.cleanup(); } catch {} GS.cleanup = null; }
  // tutorial first, every time: the game starts only after "Bắt đầu"
  $('#gm-board').innerHTML = `<div class="bao-row" style="align-items:flex-start">${bao('hello', 64, true)}<div style="flex:1"><div class="eyebrow">Hướng dẫn chơi</div><h3 style="margin:2px 0 6px">${g.icon} ${g.name} – ${esc(g.goal)}</h3><ol class="small" style="margin:0;padding-left:20px;font-weight:700;line-height:1.6">${g.how.map(h => `<li>${h}</li>`).join('')}</ol><p class="small" style="margin:8px 0 0"><b>Tính điểm:</b> ${esc(g.score)}</p>${duel ? `<p class="small" style="margin:6px 0 0;font-weight:800;color:#6E3B32">⚔️ Ván thách đấu chỉ tính <b>một lần chơi</b>: kết quả lần đầu là kết quả cuối. Thoát giữa chừng = chưa chơi.</p>` : ''}<p class="xs muted" style="margin:4px 0 0">Bộ từ: ${esc(set.topic)} · ${set.words.length} từ. Nút <b>Thoát game</b> ở góc trên dừng trò bất cứ lúc nào (lượt chơi dở không được tính).</p><div class="row" style="margin-top:12px"><button class="btn-primary btn-lg" data-action="gm-start" data-game="${game}">▶ Bắt đầu chơi</button><a class="btn" href="${back}">← Quay lại</a></div></div></div>`;
}
route('#/games/:game', game => { const u = me(); if (u.role !== 'learner') { go('#/'); return; } gamePage(game, currentGameSet(u), null); });
actions['gm-start'] = t => { const u = me(); const set = GS.set || currentGameSet(u); const game = t.dataset.game; if (!set || !GAMES[game]) return; if (GS.duel && GS.duel.scores && GS.duel.scores[u.id]) { toast('Bạn đã chơi ván thách đấu này rồi', 'err'); return; } if (GS.cleanup) { try { GS.cleanup(); } catch {} } $('#gm-board').innerHTML = ''; GS.cleanup = GAMES[game].start(set, $('#gm-board'), $('#gm-hud'), u); };
actions['gm-exit'] = () => { if (GS.cleanup) { try { GS.cleanup(); } catch {} GS.cleanup = null; } speech.stop(); toast('Đã thoát trò chơi', ''); go(GS.duel ? '#/arena' : '#/games'); };
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/games/') && !location.hash.startsWith('#/duel/') && GS.cleanup) { try { GS.cleanup(); } catch {} GS.cleanup = null; } if (!location.hash.startsWith('#/duel/')) GS.duel = null; });
// ---- Arena (B1+): internal leaderboard and one-to-one duels ----
const duels = () => (S.duels = S.duels || []);
const arenaOpen = u => !!u && u.role === 'learner' && u.cefrApproved && !isLow(u.cefr);
const arenaPlayers = () => learners().filter(arenaOpen);
/** Arena points: best result per game (as % of the maximum, so every game weighs the same) + 50 per duel won. */
function arenaPoints(u) {
  const byGame = {}; gameResults().filter(r => r.userId === u.id && r.max).forEach(r => { const p = Math.round(100 * r.score / r.max); if (!byGame[r.game] || p > byGame[r.game]) byGame[r.game] = p; });
  const games = GAME_LIST.reduce((s, g) => s + (byGame[g.id] || 0), 0); const won = duels().filter(d => d.status === 'done' && d.winnerId === u.id).length, lost = duels().filter(d => d.status === 'done' && d.winnerId && d.winnerId !== u.id && (d.fromId === u.id || d.toId === u.id)).length;
  return {total: games + won * 50, games, won, lost, played: Object.keys(byGame).length};
}
route('#/arena', () => {
  const u = me(); if (u.role !== 'learner') { go('#/'); return; }
  if (!arenaOpen(u)) { shell(`<div class="card"><div class="bao-row">${bao('think', 80, true)}<div><div class="eyebrow">🔒 Đấu trường nội bộ</div><h3>Mở khoá từ mức B1</h3><p class="small">Bảng xếp hạng và thách đấu 1-1 chỉ dành cho học viên từ B1 trở lên. Bạn đang ở mức ${u.cefr || '—'} – học và thi lên mức rồi quay lại nhé.</p><a class="btn btn-primary" href="#/games">← Mini game</a></div></div></div>`, {title: 'Đấu trường'}); return; }
  const players = arenaPlayers().map(x => ({x, p: arenaPoints(x)})).sort((a, b) => b.p.total - a.p.total); const mine = duels().filter(d => d.fromId === u.id || d.toId === u.id).sort((a, b) => b.at.localeCompare(a.at));
  const sets = myGameSets(u); const cur = currentGameSet(u); const others = arenaPlayers().filter(x => x.id !== u.id);
  const duelRow = d => { const opp = userById(d.fromId === u.id ? d.toId : d.fromId); const g = GAME_LIST.find(x => x.id === d.game); const my = (d.scores || {})[u.id], his = opp && (d.scores || {})[opp.id]; const pct = s => s ? Math.round(100 * s.score / s.max) : null;
    const state = d.status === 'done' ? (d.winnerId === u.id ? '<span class="badge ok">Thắng</span>' : d.winnerId ? '<span class="badge danger">Thua</span>' : '<span class="badge">Hoà</span>') : my ? '<span class="badge warn">Chờ đối thủ</span>' : '<span class="badge primary">Đến lượt bạn</span>';
    return `<div class="item"><div class="body"><div class="title">${g ? g.icon + ' ' + g.name : d.game} · với <b>${esc(opp ? opp.name : '?')}</b> ${state}</div><div class="xs muted">${esc(d.set.topic)} · ${fmtDateTime(d.at)} · bạn: ${my ? `${my.score}/${my.max} (${pct(my)}%)` : '—'} · ${esc(opp ? opp.name.split(' ').pop() : '')}: ${his ? `${his.score}/${his.max} (${pct(his)}%)` : '—'}</div></div>${!my && d.status !== 'done' ? `<a class="btn btn-sm btn-primary" href="#/duel/${d.id}">${d.toId === u.id ? 'Nhận lời ⚔️' : 'Chơi ván của bạn'}</a>` : ''}</div>`; };
  shell(`<div class="page-title"><div><div class="eyebrow">Đấu trường nội bộ · B1+</div><h1>Xếp hạng & thách đấu</h1><p class="muted" style="margin:2px 0 0">Điểm = tổng % kỷ lục của từng trò (tối đa ${GAME_LIST.length * 100}) + 50 mỗi trận thắng.</p></div><a class="btn btn-sm" href="#/games">← Mini game</a></div>
    <div class="card"><h3>Bảng xếp hạng (${players.length} người)</h3>${players.map((r, i) => `<div class="arena-row ${r.x.id === u.id ? 'me' : ''}"><span class="rank ${i < 3 ? 'top' : ''}">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>${userAvatar(r.x, 34)}<div style="flex:1;min-width:0"><b>${esc(r.x.name)}</b> ${lvlChip(r.x.cefr)}<div class="xs muted">${r.p.played}/${GAME_LIST.length} trò · thắng ${r.p.won} / thua ${r.p.lost} trận</div></div><b style="font-family:var(--font-display);font-size:1.2rem">${r.p.total}</b></div>`).join('') || '<p class="small muted">Chưa có ai.</p>'}</div>
    <div class="card"><h3>⚔️ Thách đấu 1-1</h3><p class="small muted" style="margin:2px 0 8px">Cả hai chơi cùng một trò với cùng bộ từ của bạn; mỗi người một lượt, điểm % cao hơn thắng. Lời thách đấu nằm ở trang này của đối thủ.</p>
      ${others.length && cur ? `<form class="row" onsubmit="return false" style="gap:8px"><select id="du-to" style="width:auto">${others.map(x => `<option value="${x.id}">${esc(x.name)} (${x.cefr})</option>`).join('')}</select><select id="du-game" style="width:auto">${GAME_LIST.filter(g => g.id !== 'crossword').map(g => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('')}</select><span class="small muted">bộ từ: <b>${esc(cur.topic)}</b></span><button class="btn-primary" data-action="du-new">Gửi lời thách đấu</button></form>` : `<p class="small muted">${!cur ? 'Tạo một bộ từ ở Mini game trước.' : 'Chưa có học viên B1+ nào khác để thách đấu.'}</p>`}
      ${mine.length ? `<div class="list" style="margin-top:10px">${mine.slice(0, 12).map(duelRow).join('')}</div>` : '<p class="small muted" style="margin-top:8px">Chưa có trận nào.</p>'}</div>`, {title: 'Đấu trường'});
});
actions['du-new'] = () => { const u = me(); const to = userById($('#du-to').value); const game = $('#du-game').value; const cur = currentGameSet(u); if (!to || !cur || !GAMES[game]) return;
  if (duels().some(d => d.status !== 'done' && d.game === game && ((d.fromId === u.id && d.toId === to.id) || (d.fromId === to.id && d.toId === u.id)))) { toast('Hai bạn đã có một trận trò này đang chờ', 'err'); return; }
  const d = {id: uid('du'), fromId: u.id, toId: to.id, game, set: {id: uid('gs'), topic: cur.topic, cefr: cur.cefr, words: cur.words, others: cur.others || []}, scores: {}, status: 'open', at: new Date().toISOString()}; duels().push(d); save(true); toast(`Đã gửi lời thách đấu cho ${to.name}. Chơi ván của bạn ngay nhé!`, 'ok'); go('#/duel/' + d.id); };
route('#/duel/:id', id => { const u = me(); if (u.role !== 'learner') { go('#/'); return; } const d = duels().find(x => x.id === id); if (!d || (d.fromId !== u.id && d.toId !== u.id)) { go('#/arena'); return; } if (!arenaOpen(u)) { go('#/arena'); return; } if ((d.scores || {})[u.id]) { toast('Bạn đã chơi ván này rồi', ''); go('#/arena'); return; } gamePage(d.game, d.set, d); });
/** Writes a finished game into the duel; when both have played, decides the winner (higher %, tie = draw). */
function recordDuel(d, u, score, max) {
  d.scores = d.scores || {}; d.scores[u.id] = {score, max, at: new Date().toISOString()}; const ids = [d.fromId, d.toId];
  if (ids.every(i => d.scores[i])) { const p = i => d.scores[i].score / (d.scores[i].max || 1); d.status = 'done'; d.winnerId = p(d.fromId) > p(d.toId) ? d.fromId : p(d.toId) > p(d.fromId) ? d.toId : null; d.doneAt = new Date().toISOString(); }
  save(true); return d.status === 'done' ? (d.winnerId === u.id ? 'win' : d.winnerId ? 'lose' : 'draw') : 'wait';
}
/** Record a finished game and show the Game Over screen: detailed result table, high score, replay. Fireworks when the old record is beaten. */
function finishGame(game, set, score, max, note = '', details = []) {
  const u = me(); if (!u) return; const best = bestGame(u, set.id, game); const record = score > 0 && (!best || score > best.score);
  gameResults().push({id: uid('gr'), userId: u.id, setId: set.id, game, score, max, at: new Date().toISOString(), duelId: GS.duel ? GS.duel.id : undefined}); logActivity(u.id, 'game', 5); save(true);
  const duelRes = GS.duel ? recordDuel(GS.duel, u, score, max) : null;
  const b = $('#gm-board'); if (!b) return; const pct = max ? Math.round(100 * score / max) : 0; const g = GAME_LIST.find(x => x.id === game);
  const rows = [['Điểm', `<b>${score}</b> / ${max}`], ...details, ['Kỷ lục trước', best ? `${best.score} / ${best.max}` : '—'], ['Bộ từ', esc(set.topic)], ...(duelRes ? [['Thách đấu', {win: '<b>Bạn thắng.</b> +50 điểm đấu trường', lose: 'Bạn thua ván này', draw: 'Hoà', wait: 'Đã ghi kết quả – chờ đối thủ chơi'}[duelRes] + ` · <a href="#/arena">Xem đấu trường</a>`]] : [])];
  b.insertAdjacentHTML('beforeend', `<div class="card" style="margin-top:12px;background:${record ? 'var(--mint)' : pct >= 70 ? 'var(--butter)' : 'var(--surface-2)'}"><div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">${bao(record || pct >= 70 ? 'praise' : 'think', 72, true)}<div style="flex:1;min-width:220px"><div class="eyebrow">${g ? g.icon + ' ' + g.name : ''}</div><h2 style="margin:2px 0 4px;font-size:1.6rem">GAME OVER</h2><div style="font-weight:800;margin-bottom:8px">${record ? 'Kỷ lục mới!' : best && best.score >= score ? `Chưa phá được kỷ lục ${best.score}/${best.max} – thử lại nhé!` : 'Hãy thử lại để lập kỷ lục!'}${note ? ` <span class="small muted">(${esc(note)})</span>` : ''}</div>
    <div class="table-wrap"><table style="max-width:420px"><tbody>${rows.map(([k, v]) => `<tr><td class="xs muted" style="width:45%">${k}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>
    <div class="row" style="margin-top:10px">${duelRes ? `<a class="btn btn-primary btn-lg" href="#/arena">Về đấu trường</a>` : `<button class="btn-primary btn-lg" data-action="gm-replay">▶ Chơi lại</button>`}<a class="btn" href="#/games">Chọn trò khác</a></div></div></div></div>`);
  const hb = $('#gm-best'); if (hb && record) hb.textContent = `Kỷ lục: ${score}/${max}`;
  const lost = /hết mạng|hỏng/i.test(note); // ran out of lives: no fireworks even for a record, a sad "teo tèo teo" instead
  if (lost) sadTone(); else if (record || duelRes === 'win') { fireworks(4500); beep(2); buzz(); } else if (pct >= 70) beep(2);
}
/** Descending "teo tèo teo" for a game lost on lives (SFX switch applies). */
function sadTone() { if (!audio.sfxOn()) return; try { const ctx = audio.context(); if (!ctx) return; const t0 = ctx.currentTime; [[392, 0, .28], [311, .3, .28], [247, .6, .6]].forEach(([f, at, dur], i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.connect(g); g.connect(ctx.destination); o.frequency.setValueAtTime(f, t0 + at); if (i === 2) o.frequency.exponentialRampToValueAtTime(f * 0.6, t0 + at + dur); g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.14, t0 + at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur); o.start(t0 + at); o.stop(t0 + at + dur + 0.05); }); } catch {} }
/** Dinosaur that pops up on game over – the last life lost (flat SVG, chomping). */
const DINO_SVG = '<svg viewBox="0 0 160 120" width="150" height="112" aria-hidden="true"><path d="M30 112c-6-16-4-36 10-50 10-10 24-12 36-8l10-30c2-8 12-10 22-10h34c8 0 10 8 4 12l-16 8 6 10c4 8-2 14-10 14h-20l-6 22c-2 10 4 18 14 22l-8 8c-12-2-20-10-24-22l-6-2-4 26H52l2-24c-6 4-10 12-10 24z" fill="#4B6120"/><path d="M64 60c8-4 20-4 28 2-8 2-20 2-28-2z" fill="#A8BF55"/><circle cx="118" cy="30" r="6" fill="#fff"/><circle cx="120" cy="30" r="3" fill="#1E1E1E"/><path class="jaw" d="M126 44h20l-6 8h-20z" fill="#C8102E"/><path d="M126 44l4-6 4 6 4-6 4 6 4-6 4 6z" fill="#fff"/><path d="M40 70l6-10 6 10M52 64l6-10 6 10" fill="none" stroke="#A8BF55" stroke-width="3" stroke-linecap="round"/></svg>';
function lifePop(lives) {
  const b = $('#gm-board'); if (!b) return; b.querySelector('.life-pop')?.remove();
  // losing a life: broken heart; losing the LAST life (game over): the dinosaur
  b.insertAdjacentHTML('beforeend', lives > 0 ? `<div class="life-pop"><div class="heart">💔</div><div class="txt">Còn ${lives} mạng ${'❤️'.repeat(lives)}</div></div>` : `<div class="life-pop over"><div class="dino">${DINO_SVG}</div><div class="txt">Hết mạng!</div></div>`);
  const el = b.querySelector('.life-pop'); setTimeout(() => el && el.remove(), lives > 0 ? 1500 : 2200);
}
/** Falling speed of the catch game by CEFR level: beginners get slower items, advanced learners faster ones. */
const LEVEL_SPEED = {A1: 1, A2: 1.5, B1: 2, B2: 2.5, C1: 3}; // +0.5 per level
const levelSpeed = u => LEVEL_SPEED[u?.cefr] || 1;
actions['gm-replay'] = () => { const game = location.hash.split('/')[2]; actions['gm-start']({dataset: {game}}); };
const gameHint = (w, u) => isLow(u.cefr) ? esc(w.v) + (w.def ? ` <span class="muted">· ${esc(w.def)}</span>` : '') : (w.def ? esc(w.def) + ` <span class="muted">· ${esc(w.v)}</span>` : esc(w.v));
const GAMES = {};
// ---- 1. Word scramble: shuffled letter tiles, tap them in order ----
GAMES.scramble = {start(set, board, hud, u) {
  const words = gshuffle(set.words.filter(w => gletters(w.e).length >= 3)).slice(0, 8); let i = 0, score = 0, over = false, tiles = [], picked = [], wrong = 0, hints = 0, best = 0, streak = 0, totalWrong = 0, totalHints = 0;
  const setup = () => { const L = gletters(words[i].e).split(''); let sh = gshuffle(L); if (L.length > 2 && sh.join('') === L.join('')) sh = [...L.slice(1), L[0]]; tiles = sh.map((ch, k) => ({ch, k, used: false})); picked = []; wrong = 0; hints = 0; };
  const draw = (msg = '') => { const w = words[i]; const L = gletters(w.e);
    hud.innerHTML = `<span class="badge primary">Từ ${i + 1}/${words.length}</span><span class="badge ok">Điểm ${score}</span><span class="badge ${wrong ? 'danger' : 'warn'}">Sai ${wrong}/2</span>`;
    board.innerHTML = `<div class="eyebrow">Gợi ý</div><div style="font-weight:700;line-height:1.4">${gameHint(w, u)} <span class="xs muted">· ${L.length} chữ cái</span></div>
      <div class="sc-slots" id="sc-slots">${L.split('').map((ch, k) => `<span class="sc-slot ${picked[k] ? 'on' : ''}">${picked[k] ? picked[k].ch : ''}</span>`).join('')}</div>${msg ? `<div class="small" style="font-weight:800;text-align:center">${msg}</div>` : ''}
      <div class="sc-tiles">${tiles.map(t => `<button data-k="${t.k}" ${t.used || over ? 'disabled' : ''}>${t.ch}</button>`).join('')}</div>
      <div class="row" style="justify-content:center;margin-top:10px"><button data-act="bs" ${over ? 'disabled' : ''}>⌫ Bỏ chữ cuối</button><button data-act="hint" ${over ? 'disabled' : ''}>Gợi ý</button></div>`; };
  const next = () => { i++; over = false; if (i >= words.length) { hud.innerHTML = `<span class="badge ok">Điểm ${score}/${words.length * 2}</span>`; board.innerHTML = ''; finishGame('scramble', set, score, words.length * 2, '', [['Từ xếp đúng', `${words.filter((w, k) => k < i).length - 0} / ${words.length}`], ['Lần xếp sai', `${totalWrong}`], ['Gợi ý đã dùng', `${totalHints}`], ['Chuỗi đúng dài nhất', `${best}`]]); return; } setup(); draw(); };
  const check = () => { const w = words[i]; const L = gletters(w.e); if (picked.length < L.length) return; const got = picked.map(p => p.ch).join('');
    if (got === L) { const pts = (wrong || hints) ? 1 : 2; score += pts; streak++; best = Math.max(best, streak); over = true; speech.speak(w.e); draw(`✅ ${esc(w.e)} +${pts}`); setTimeout(next, 1200); }
    else { wrong++; totalWrong++; streak = 0; const el = $('#sc-slots'); if (el) el.classList.add('shake'); if (wrong >= 2) { over = true; speech.speak(w.e); picked = L.split('').map(ch => ({ch})); draw(`❌ Từ đúng: <b>${esc(w.e)}</b>`); setTimeout(next, 1800); } else setTimeout(() => { picked.forEach(p => { if (p.t) p.t.used = false; }); picked = []; draw('Chưa đúng – xếp lại nhé'); }, 450); } };
  const pick = k => { if (over) return; const t = tiles.find(t => t.k === k); if (!t || t.used) return; t.used = true; picked.push({ch: t.ch, t}); draw(); check(); };
  const bs = () => { if (over || !picked.length) return; const p = picked.pop(); if (p.t) p.t.used = false; draw(); };
  const hint = () => { if (over) return; const L = gletters(words[i].e); const want = L[picked.length]; const t = tiles.find(t => !t.used && t.ch === want); if (!t) return; hints++; totalHints++; pick(t.k); };
  board.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.k !== undefined) pick(+b.dataset.k); else if (b.dataset.act === 'bs') bs(); else if (b.dataset.act === 'hint') hint(); });
  const onKey = e => { if (e.ctrlKey || e.metaKey) return; if (e.key === 'Backspace') { e.preventDefault(); bs(); } else if (/^[a-zA-Z]$/.test(e.key)) { const t = tiles.find(t => !t.used && t.ch === e.key.toUpperCase()); if (t) pick(t.k); } }; document.addEventListener('keydown', onKey);
  if (!words.length) { board.innerHTML = '<p class="muted">Bộ từ này không có từ đủ dài.</p>'; return () => {}; }
  setup(); draw(); return () => document.removeEventListener('keydown', onKey);
}};
// ---- 2. Crossword: words are woven into a grid, each new word must cross an existing one ----
function buildCrossword(entries) {
  const N = 17; const grid = Array.from({length: N}, () => Array(N).fill(null)); const placed = [];
  const canPlace = (w, r, c, dir) => { const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0; if (r < 0 || c < 0 || r + dr * (w.length - 1) >= N || c + dc * (w.length - 1) >= N) return -1;
    const br = r - dr, bc = c - dc, ar = r + dr * w.length, ac = c + dc * w.length; if ((br >= 0 && bc >= 0 && grid[br][bc]) || (ar < N && ac < N && grid[ar][ac])) return -1;
    let cross = 0; for (let k = 0; k < w.length; k++) { const rr = r + dr * k, cc = c + dc * k; const g = grid[rr][cc];
      if (g) { if (g !== w[k]) return -1; cross++; }
      else { const s1 = dir === 'across' ? [rr - 1, cc] : [rr, cc - 1], s2 = dir === 'across' ? [rr + 1, cc] : [rr, cc + 1]; if ((s1[0] >= 0 && s1[1] >= 0 && grid[s1[0]][s1[1]]) || (s2[0] < N && s2[1] < N && grid[s2[0]][s2[1]])) return -1; } }
    return cross; };
  const put = (e, r, c, dir) => { const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0; for (let k = 0; k < e.w.length; k++) grid[r + dr * k][c + dc * k] = e.w[k]; placed.push({...e, r, c, dir}); };
  const list = entries.filter(e => e.w.length >= 3).sort((a, b) => b.w.length - a.w.length).slice(0, 10);
  list.forEach((e, idx) => { if (!idx) { put(e, Math.floor(N / 2), Math.floor((N - e.w.length) / 2), 'across'); return; }
    let best = null; placed.forEach(p => { const pdr = p.dir === 'down' ? 1 : 0, pdc = p.dir === 'across' ? 1 : 0; for (let k = 0; k < p.w.length; k++) for (let m = 0; m < e.w.length; m++) { if (p.w[k] !== e.w[m]) continue; const dir = p.dir === 'across' ? 'down' : 'across'; const r = p.r + pdr * k - (dir === 'down' ? m : 0), c = p.c + pdc * k - (dir === 'across' ? m : 0); const cr = canPlace(e.w, r, c, dir); if (cr > 0 && (!best || cr > best.cr)) best = {r, c, dir, cr}; } });
    if (best) put(e, best.r, best.c, best.dir); });
  let r0 = N, r1 = -1, c0 = N, c1 = -1; placed.forEach(p => { const dr = p.dir === 'down' ? 1 : 0, dc = p.dir === 'across' ? 1 : 0; r0 = Math.min(r0, p.r); c0 = Math.min(c0, p.c); r1 = Math.max(r1, p.r + dr * (p.w.length - 1)); c1 = Math.max(c1, p.c + dc * (p.w.length - 1)); });
  const cells = grid.slice(r0, r1 + 1).map(row => row.slice(c0, c1 + 1)); placed.forEach(p => { p.r -= r0; p.c -= c0; });
  let n = 0; const nums = {}; cells.forEach((row, r) => row.forEach((ch, c) => { if (ch && placed.some(p => p.r === r && p.c === c)) { nums[r + ',' + c] = ++n; } })); placed.forEach(p => { p.n = nums[p.r + ',' + p.c]; });
  return {cells, placed, nums};
}
GAMES.crossword = {start(set, board, hud, u) {
  const cw = buildCrossword(set.words.map(w => ({w: gletters(w.e), word: w})).filter(e => e.w.length >= 3)); if (cw.placed.length < 3) { board.innerHTML = '<p class="muted">Không đan được lưới từ bộ này (cần ≥3 từ có chữ cái chung).</p>'; return () => {}; }
  let hints = 0, done = false, checks = 0;
  hud.innerHTML = `<span class="badge primary">${cw.placed.length} từ</span><span class="badge warn" id="xw-h">Gợi ý 0</span>`;
  const clue = dir => cw.placed.filter(p => p.dir === dir).sort((a, b) => a.n - b.n).map(p => `<li><b>${p.n}.</b> ${gameHint(p.word, u)} <span class="xs muted">(${p.w.length})</span></li>`).join('');
  board.innerHTML = `<div class="xw"><table>${cw.cells.map((row, r) => `<tr>${row.map((ch, c) => ch ? `<td class="cell">${cw.nums[r + ',' + c] ? `<span class="n">${cw.nums[r + ',' + c]}</span>` : ''}<input maxlength="1" data-r="${r}" data-c="${c}" autocomplete="off" autocapitalize="characters"></td>` : '<td></td>').join('')}</tr>`).join('')}</table></div>
    <div class="row" style="margin-top:10px"><button class="btn-primary" id="xw-check">Kiểm tra</button><button id="xw-hint">Gợi ý 1 chữ</button><span class="xs muted">Gõ xong ô này tự nhảy sang ô bên cạnh. Mỗi gợi ý trừ 1 điểm.</span></div>
    <div class="grid cols-2" style="margin-top:10px"><div><div class="eyebrow">Ngang →</div><ol class="small" style="list-style:none;padding:0;margin:4px 0 0;line-height:1.5">${clue('across')}</ol></div><div><div class="eyebrow">Dọc ↓</div><ol class="small" style="list-style:none;padding:0;margin:4px 0 0;line-height:1.5">${clue('down')}</ol></div></div>`;
  const inputs = [...board.querySelectorAll('input')]; const at = (r, c) => board.querySelector(`input[data-r="${r}"][data-c="${c}"]`);
  board.addEventListener('input', e => { const i = e.target; if (i.tagName !== 'INPUT') return; i.value = i.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(-1); i.classList.remove('ok', 'bad'); if (!i.value) return; const r = +i.dataset.r, c = +i.dataset.c; const nx = at(r, c + 1) || at(r + 1, c); if (nx && !nx.value) nx.focus(); });
  board.addEventListener('keydown', e => { const i = e.target; if (i.tagName !== 'INPUT') return; const r = +i.dataset.r, c = +i.dataset.c; const mv = {ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0]}[e.key]; if (mv) { const n = at(r + mv[0], c + mv[1]); if (n) { n.focus(); e.preventDefault(); } } if (e.key === 'Backspace' && !i.value) { const p = at(r, c - 1) || at(r - 1, c); if (p) { p.focus(); e.preventDefault(); } } });
  $('#xw-check').addEventListener('click', () => { if (done) return; let ok = 0; inputs.forEach(i => { const want = cw.cells[+i.dataset.r][+i.dataset.c]; const good = i.value === want; i.classList.toggle('ok', good); i.classList.toggle('bad', !!i.value && !good); if (good) ok++; });
    const wordsOk = cw.placed.filter(p => { const dr = p.dir === 'down' ? 1 : 0, dc = p.dir === 'across' ? 1 : 0; return p.w.split('').every((ch, k) => at(p.r + dr * k, p.c + dc * k).value === ch); }).length;
    if (ok === inputs.length) { done = true; inputs.forEach(i => { i.disabled = true; }); finishGame('crossword', set, Math.max(0, cw.placed.length - hints), cw.placed.length, '', [['Từ trong lưới', `${cw.placed.length}`], ['Crosswords', `${inputs.length}`], ['Gợi ý đã dùng', `${hints}`], ['Lần kiểm tra', `${++checks}`]]); } else { checks++; toast(`${wordsOk}/${cw.placed.length} từ đúng, ${ok}/${inputs.length} ô đúng`, ''); } });
  $('#xw-hint').addEventListener('click', () => { if (done) return; const empty = inputs.filter(i => i.value !== cw.cells[+i.dataset.r][+i.dataset.c]); if (!empty.length) return; const i = empty[Math.floor(Math.random() * empty.length)]; i.value = cw.cells[+i.dataset.r][+i.dataset.c]; i.classList.add('ok'); hints++; $('#xw-h').textContent = 'Gợi ý ' + hints; });
  inputs[0]?.focus(); return () => {};
}};
/* Game art (SVG from the sunny-game-assets pack, inlined so the app stays one file). Loaded as images on first use. */
/* Season as a game sprite (viewBox 0 0 256 256, feet on the bottom edge): rays, a sun body with a face, two legs. Frames differ by the legs and the tilt of the rays. */
const SUN_LEGS = (l, r) => `<g fill="none" stroke="#1E1E1E" stroke-width="11" stroke-linecap="round"><path d="${l}"/><path d="${r}"/></g>`;
const SUN_SPRITE = (legs, rot = 0, face = 'smile') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g transform="rotate(${rot} 128 118)" fill="none" stroke="#F28C28" stroke-width="13" stroke-linecap="round"><path d="M128 18v24M128 194v24M28 118h24M204 118h24M57 47l17 17M182 172l17 17M57 189l17-17M182 64l17-17"/></g>${legs}<circle cx="128" cy="118" r="60" fill="#FBB829"/>${face === 'smile' ? '<circle cx="106" cy="110" r="7" fill="#1E1E1E"/><circle cx="150" cy="110" r="7" fill="#1E1E1E"/><path d="M104 134 Q128 154 152 134" fill="none" stroke="#1E1E1E" stroke-width="7" stroke-linecap="round"/>' : face === 'joy' ? '<path d="M96 110 Q106 98 116 110" fill="none" stroke="#1E1E1E" stroke-width="7" stroke-linecap="round"/><path d="M140 110 Q150 98 160 110" fill="none" stroke="#1E1E1E" stroke-width="7" stroke-linecap="round"/><path d="M100 132 Q128 164 156 132 Z" fill="#1E1E1E"/>' : '<circle cx="106" cy="110" r="7" fill="#1E1E1E"/><circle cx="150" cy="110" r="7" fill="#1E1E1E"/><path d="M96 92 L116 100 M160 92 L140 100" fill="none" stroke="#1E1E1E" stroke-width="7" stroke-linecap="round"/><path d="M108 138 H148" fill="none" stroke="#1E1E1E" stroke-width="7" stroke-linecap="round"/>'}</svg>`;
const GAME_ART = {
  idle: SUN_SPRITE(SUN_LEGS('M110 170 V236 M96 240 H124', 'M146 170 V236 M132 240 H160')),
  run1: SUN_SPRITE(SUN_LEGS('M110 170 L88 230 M76 236 L100 232', 'M146 170 L170 226 M160 234 L186 228'), -6),
  run2: SUN_SPRITE(SUN_LEGS('M110 170 L104 232 M92 238 L118 236', 'M146 170 L160 222 M150 230 L176 226'), 4),
  jump: SUN_SPRITE(SUN_LEGS('M110 170 L98 202 M86 210 L108 206', 'M146 170 L158 202 M148 210 L170 206'), 18, 'joy'),
  giftbox: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="40" y="112" width="176" height="120" rx="16" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="110" y="112" width="36" height="120" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/><circle cx="128" cy="178" r="36" fill="#FFFFFF" stroke="#1E1E1E" stroke-width="7"/><path d="M114 168 C114 152 142 152 142 168 C142 178 128 179 128 190" fill="none" stroke="#1E1E1E" stroke-width="9" stroke-linecap="round"/><circle cx="128" cy="204" r="5.5" fill="#1E1E1E"/><path d="M128 78 C108 42 68 42 70 64 C71 82 104 84 128 78 Z" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7" stroke-linejoin="round"/><path d="M128 78 C148 42 188 42 186 64 C185 82 152 84 128 78 Z" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7" stroke-linejoin="round"/><rect x="28" y="78" width="200" height="44" rx="14" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="110" y="78" width="36" height="44" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/><circle cx="128" cy="76" r="12" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/></svg>',
  giftopen: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="40" y="132" width="176" height="104" rx="16" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="54" y="132" width="148" height="18" rx="6" fill="#1E1E1E"/><rect x="110" y="150" width="36" height="86" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/><path d="M185.8 94.3 L189.4 110.8 L203.7 119.8 L187.2 123.4 L178.2 137.7 L174.6 121.2 L160.3 112.2 L176.8 108.6 Z" fill="#FBB829" stroke="#1E1E1E" stroke-width="6" stroke-linejoin="round"/><g transform="translate(10 -6) rotate(-16 128 100)"><path d="M128 78 C108 42 68 42 70 64 C71 82 104 84 128 78 Z" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7" stroke-linejoin="round"/><path d="M128 78 C148 42 188 42 186 64 C185 82 152 84 128 78 Z" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7" stroke-linejoin="round"/><rect x="28" y="78" width="200" height="44" rx="14" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="110" y="78" width="36" height="44" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/><circle cx="128" cy="76" r="12" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/></g><path d="M233.7 137.2 L239.2 145.5 L248.8 147.7 L240.5 153.2 L238.3 162.8 L232.8 154.5 L223.2 152.3 L231.5 146.8 Z" fill="#A8BF55" stroke="#1E1E1E" stroke-width="5" stroke-linejoin="round"/></svg>',
  mushroom: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M88 150 C86 180 80 196 84 214 C88 234 168 234 172 214 C176 196 170 180 168 150 Z" fill="#FFFFFF" stroke="#1E1E1E" stroke-width="8" stroke-linejoin="round"/><clipPath id="cap"><path d="M32 136 C32 72 78 34 128 34 C178 34 224 72 224 136 C224 154 198 160 128 160 C58 160 32 154 32 136 Z"/></clipPath><path d="M32 136 C32 72 78 34 128 34 C178 34 224 72 224 136 C224 154 198 160 128 160 C58 160 32 154 32 136 Z" fill="#A8BF55"/><g clip-path="url(#cap)" fill="#FBB829" stroke="#1E1E1E" stroke-width="6"><circle cx="84" cy="88" r="22"/><circle cx="158" cy="70" r="16"/><circle cx="196" cy="126" r="20"/><circle cx="126" cy="132" r="13"/><circle cx="40" cy="140" r="14"/></g><path d="M32 136 C32 72 78 34 128 34 C178 34 224 72 224 136 C224 154 198 160 128 160 C58 160 32 154 32 136 Z" fill="none" stroke="#1E1E1E" stroke-width="8" stroke-linejoin="round"/></svg>',
  bomb: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M180 92 C188 70 206 74 206 50" fill="none" stroke="#1E1E1E" stroke-width="13" stroke-linecap="round"/><path d="M180 92 C188 70 206 74 206 50" fill="none" stroke="#FBB829" stroke-width="5" stroke-linecap="round"/><rect x="150" y="80" width="48" height="30" rx="7" transform="rotate(45 174 95)" fill="#77736C" stroke="#1E1E1E" stroke-width="8"/><circle cx="118" cy="156" r="78" fill="#1E1E1E"/><path d="M66 140 C70 112 92 96 120 94" fill="none" stroke="#7A7064" stroke-width="11" stroke-linecap="round"/><circle cx="68" cy="166" r="6" fill="#7A7064"/><path d="M214.7 18.9 L215.8 36.2 L233.1 37.3 L218.6 46.8 L226.4 62.4 L210.8 54.6 L201.3 69.1 L200.2 51.8 L182.9 50.7 L197.4 41.2 L189.6 25.6 L205.2 33.4 Z" fill="#FBB829" stroke="#1E1E1E" stroke-width="6" stroke-linejoin="round"/><circle cx="208" cy="44" r="6" fill="#F6D3CB"/></svg>',
  /* determined Season (kept for the cannon layout) and the barrel alone (viewBox 0 0 220 68, base at the left) */
  cannon: SUN_SPRITE(SUN_LEGS('M110 170 V236 M96 240 H124', 'M146 170 V236 M132 240 H160'), 0, 'set'),
  barrel: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 68"><g transform="translate(140 -114) scale(-2 2)"><rect x="-30" y="62" width="100" height="24" rx="9" fill="#7A7064" stroke="#1E1E1E" stroke-width="4"/><rect x="6" y="62" width="9" height="24" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="3.5"/><rect x="-40" y="57" width="14" height="34" rx="5" fill="#FBB829" stroke="#1E1E1E" stroke-width="4"/><path d="M-22 68 L-2 68" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.7"/></g></svg>',
  ball: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="50" fill="#1E1E1E"/><path d="M30 54 C34 38 46 28 62 26" fill="none" stroke="#7A7064" stroke-width="9" stroke-linecap="round"/><circle cx="32" cy="72" r="5" fill="#7A7064"/></svg>'
};
// ---- seasonal game heroes (platformer + catch game): one simple flat sprite per theme, four poses (idle / run1 / run2 / jump), facing right ----
const SEASON_HERO = {spring: 'rabbit', summer: 'cricket', autumn: 'squirrel', winter: 'penguin', tet: 'swallow', midautumn: 'rabbit', christmas: 'reindeer'};
const HERO_NAMES = {rabbit: 'Thỏ', cricket: 'Dế', squirrel: 'Sóc', penguin: 'Cánh cụt', swallow: 'Én', reindeer: 'Tuần lộc'};
/** Each hero's favourite food – the giant "Boss" at the end of Season-rio. */
const HERO_FOOD = {rabbit: {emoji: '🥕', name: 'củ cà rốt'}, cricket: {emoji: '🌿', name: 'lá cỏ'}, squirrel: {emoji: '🌰', name: 'hạt dẻ'}, penguin: {emoji: '🐟', name: 'con cá'}, swallow: {emoji: '🐛', name: 'con sâu'}, reindeer: {emoji: '🍎', name: 'quả táo'}};
const BOSS_SECONDS = 10; // time to finish the Boss after the first touch, or the food goes bad
function heroSprite(kind, pose) {
  const legs = {idle: ['M108 196 V236 M96 240 H120', 'M148 196 V236 M136 240 H160'], run1: ['M108 196 L90 232 M78 238 L102 234', 'M148 196 L170 228 M160 236 L186 230'], run2: ['M108 196 L104 234 M92 240 L118 238', 'M148 196 L162 226 M152 234 L178 230'], jump: ['M108 196 L98 214 M86 220 L108 218', 'M148 196 L158 214 M148 220 L170 218']}[pose] || [];
  const rot = pose === 'jump' ? -10 : pose === 'run1' ? -4 : pose === 'run2' ? 3 : 0; const ink = '#1E1E1E';
  const legCol = {rabbit: '#D6CCBF', cricket: '#4B6120', squirrel: '#8C3F22', penguin: '#F28C28', swallow: '#B5532B', reindeer: '#5B3F2A'}[kind] || ink;
  const eye = (x, y, r = 5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${ink}"/><circle cx="${x + 1.5}" cy="${y - 1.5}" r="1.6" fill="#fff"/>`;
  const smile = (x, y) => `<path d="M${x - 8} ${y} Q${x} ${y + 7} ${x + 8} ${y}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
  const body = {
    rabbit: `<ellipse cx="88" cy="150" rx="16" ry="14" fill="#fff"/><ellipse cx="128" cy="152" rx="50" ry="44" fill="#EDE9E3"/><ellipse cx="128" cy="166" rx="26" ry="22" fill="#fff"/><ellipse cx="112" cy="38" rx="12" ry="34" fill="#EDE9E3"/><ellipse cx="112" cy="40" rx="6" ry="24" fill="#F6D3CB"/><ellipse cx="146" cy="40" rx="12" ry="34" transform="rotate(14 146 40)" fill="#EDE9E3"/><ellipse cx="146" cy="42" rx="6" ry="24" transform="rotate(14 146 42)" fill="#F6D3CB"/><circle cx="128" cy="96" r="40" fill="#EDE9E3"/>${eye(142, 90)}${eye(118, 90, 4)}<ellipse cx="146" cy="106" rx="5" ry="3.5" fill="#E58BA6"/>${smile(146, 112)}`,
    cricket: `<path d="M74 108 C60 80 48 72 40 60" fill="none" stroke="#4B6120" stroke-width="4" stroke-linecap="round"/><path d="M96 92 C80 70 70 56 56 44" fill="none" stroke="#4B6120" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="58" r="5" fill="#4B6120"/><circle cx="56" cy="42" r="5" fill="#4B6120"/><ellipse cx="124" cy="156" rx="54" ry="40" fill="#8BA33A"/><path d="M80 150 C96 128 138 128 160 150" fill="none" stroke="#4B6120" stroke-width="4"/><path d="M90 160 C104 142 134 142 154 160" fill="none" stroke="#4B6120" stroke-width="3"/><circle cx="138" cy="104" r="36" fill="#9CCB5A"/>${eye(156, 98, 7)}${smile(154, 118)}`,
    squirrel: `<path d="M76 190 C30 190 26 110 70 96 C108 84 110 150 80 150 C60 150 60 180 76 190 Z" fill="#B5532B"/><path d="M58 150 C50 120 72 104 86 112" fill="none" stroke="#D77A4B" stroke-width="5" stroke-linecap="round"/><ellipse cx="132" cy="154" rx="46" ry="42" fill="#B5532B"/><ellipse cx="134" cy="164" rx="24" ry="24" fill="#F3D9C1"/><path d="M104 68 L112 40 L126 64 Z M158 64 L170 40 L178 68 Z" fill="#B5532B"/><circle cx="140" cy="96" r="38" fill="#B5532B"/>${eye(154, 90)}${eye(128, 90, 4)}<ellipse cx="158" cy="106" rx="5" ry="3.5" fill="${ink}"/>${smile(158, 112)}`,
    penguin: `<ellipse cx="128" cy="150" rx="52" ry="50" fill="${ink}"/><ellipse cx="130" cy="158" rx="34" ry="38" fill="#fff"/><path d="M78 126 C58 146 60 176 74 190 C90 178 92 146 78 126 Z" fill="${ink}"/><path d="M178 126 C198 146 196 176 182 190 C166 178 164 146 178 126 Z" fill="${ink}"/><circle cx="128" cy="96" r="40" fill="${ink}"/><ellipse cx="136" cy="100" rx="24" ry="20" fill="#fff"/>${eye(146, 92)}${eye(126, 92, 4)}<path d="M150 104 L172 110 L150 116 Z" fill="#F28C28"/>`,
    swallow: `<path d="M60 150 L24 126 L54 166 L18 196 Z" fill="#2C3E6B"/><ellipse cx="128" cy="152" rx="52" ry="40" fill="#2C3E6B"/><ellipse cx="136" cy="164" rx="30" ry="24" fill="#fff"/><path d="M96 128 C76 108 116 92 150 118 C136 124 116 134 96 128 Z" fill="#1E2C4F"/><circle cx="140" cy="98" r="36" fill="#2C3E6B"/><ellipse cx="146" cy="116" rx="18" ry="9" fill="#C8102E"/>${eye(154, 92)}<path d="M172 100 L196 106 L172 112 Z" fill="#F2C14E"/>`,
    reindeer: `<path d="M106 62 L98 30 M98 46 L84 40 M98 36 L110 24 M150 62 L158 30 M158 46 L172 40 M158 36 L146 24" fill="none" stroke="#5B3F2A" stroke-width="6" stroke-linecap="round"/><ellipse cx="128" cy="154" rx="50" ry="42" fill="#7A5A3A"/><ellipse cx="130" cy="168" rx="24" ry="20" fill="#D6B894"/><path d="M96 86 L88 70 L108 78 Z M160 86 L168 70 L148 78 Z" fill="#7A5A3A"/><circle cx="128" cy="98" r="38" fill="#7A5A3A"/><ellipse cx="146" cy="110" rx="18" ry="13" fill="#D6B894"/>${eye(144, 92)}${eye(120, 92, 4)}<circle cx="160" cy="112" r="8" fill="#C62828"/><path d="M80 110 C68 102 70 86 84 84 M176 110 C188 102 186 86 172 84" fill="none" stroke="#7A5A3A" stroke-width="5" stroke-linecap="round"/>`
  }[kind] || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g fill="none" stroke="${legCol}" stroke-width="11" stroke-linecap="round">${legs.map(d => `<path d="${d}"/>`).join('')}</g><g transform="rotate(${rot} 128 150)">${body}</g></svg>`;
}
Object.keys(HERO_NAMES).forEach(k => ['idle', 'run1', 'run2', 'jump'].forEach(p => { GAME_ART[`hero_${k}_${p}`] = heroSprite(k, p); }));
const heroKind = () => SEASON_HERO[currentTheme()] || 'rabbit';
const heroArt = pose => `hero_${heroKind()}_${pose}`;
// what the catch game drops, per theme
const SEASON_CATCH = {spring: {name: 'bông hoa', label: 'Hoa', emoji: '🌸'}, summer: {name: 'cây kem', label: 'Kem', emoji: '🍦'}, autumn: {name: 'chiếc lá', label: 'Lá', emoji: '🍂'}, winter: {name: 'bông tuyết', label: 'Tuyết', emoji: '❄️'}, tet: {name: 'bao lì xì', label: 'Lì xì', emoji: '🧧'}, midautumn: {name: 'đèn lồng', label: 'Đèn lồng', emoji: '🏮'}, christmas: {name: 'hộp quà', label: 'Quà', emoji: '🎁'}};
const seasonCatch = () => SEASON_CATCH[currentTheme()] || SEASON_CATCH.summer;
/** Draws the falling item of the current theme centred at (x, y), about 60 px tall. */
function drawCatchItem(ctx, x, y) {
  const t = currentTheme(); ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round';
  if (t === 'autumn') { ctx.rotate(0.5); ctx.fillStyle = '#E9963E'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 32, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#B5532B'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, 34); ctx.moveTo(0, -8); ctx.lineTo(12, -18); ctx.moveTo(0, 8); ctx.lineTo(-12, -2); ctx.moveTo(0, 20); ctx.lineTo(10, 10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(4, 44); ctx.stroke(); }
  else if (t === 'spring') { ctx.fillStyle = '#E58BA6'; for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 17, Math.sin(a) * 17, 13, 10, a, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#FBB829'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); }
  else if (t === 'summer') { ctx.fillStyle = '#E9B46A'; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(0, 40); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#B5532B'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-12, 6); ctx.lineTo(6, 28); ctx.moveTo(-4, 2); ctx.lineTo(12, 18); ctx.moveTo(12, 6); ctx.lineTo(-6, 28); ctx.stroke(); ctx.fillStyle = '#F6D3CB'; ctx.beginPath(); ctx.arc(-8, -12, 15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#FFF4D9'; ctx.beginPath(); ctx.arc(10, -10, 14, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#C62828'; ctx.beginPath(); ctx.arc(2, -28, 5, 0, Math.PI * 2); ctx.fill(); }
  else if (t === 'winter') { ctx.strokeStyle = '#6FA8DC'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.stroke(); [10, 18].forEach(r => { ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a + 0.6) * (r + 8), Math.sin(a + 0.6) * (r + 8)); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a - 0.6) * (r + 8), Math.sin(a - 0.6) * (r + 8)); ctx.stroke(); }); } }
  else if (t === 'tet') { ctx.fillStyle = '#C8102E'; ctx.beginPath(); ctx.roundRect(-18, -30, 36, 60, 6); ctx.fill(); ctx.fillStyle = '#F2C14E'; ctx.fillRect(-18, -8, 36, 6); ctx.beginPath(); ctx.arc(0, 8, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#C8102E'; ctx.font = '700 11px Be Vietnam Pro, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('福', 0, 8); }
  else if (t === 'midautumn') { ctx.fillStyle = '#B23A48'; ctx.fillRect(-10, -34, 20, 6); ctx.fillRect(-10, 28, 20, 6); ctx.fillStyle = '#F4A261'; ctx.beginPath(); ctx.ellipse(0, 0, 22, 30, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#B23A48'; ctx.lineWidth = 1.5; [-10, 0, 10].forEach(dx => { ctx.beginPath(); ctx.ellipse(dx, 0, 4, 30, 0, 0, Math.PI * 2); ctx.stroke(); }); ctx.beginPath(); ctx.moveTo(-4, 34); ctx.lineTo(-4, 44); ctx.moveTo(4, 34); ctx.lineTo(4, 44); ctx.stroke(); }
  else { ctx.fillStyle = '#1F6B44'; ctx.beginPath(); ctx.roundRect(-22, -14, 44, 42, 5); ctx.fill(); ctx.fillStyle = '#2E7D4F'; ctx.beginPath(); ctx.roundRect(-25, -22, 50, 12, 4); ctx.fill(); ctx.fillStyle = '#C62828'; ctx.fillRect(-4, -22, 8, 50); ctx.beginPath(); ctx.ellipse(-9, -28, 8, 5, -0.5, 0, Math.PI * 2); ctx.ellipse(9, -28, 8, 5, 0.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
const artCache = {};
const artSrc = name => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(GAME_ART[name]);
const art = name => { if (!artCache[name]) { const im = new Image(); im.src = artSrc(name); artCache[name] = im; } return artCache[name]; };
/** Draw a game image with its bottom-centre at (x, y), height h, flipped when face = -1; falls back to nothing until the image has decoded. */
const drawArt = (ctx, name, x, y, h, face = 1, ratio = 1) => { const im = art(name); if (!im.complete || !im.naturalWidth) return false; const w = h * ratio; ctx.save(); ctx.translate(x, y); ctx.scale(face, 1); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore(); return true; };
Object.keys(GAME_ART).forEach(art); /* start decoding early */
/** Season drawn with canvas primitives (fallback while the SVG art is still decoding). (x, y) = bottom-centre of the feet; s = body height; face = 1 right / -1 left. */
function drawGoose(ctx, x, y, s, face = 1) {
  const k = s / 40; ctx.save(); ctx.translate(x, y); ctx.scale(face * k, k); ctx.lineCap = 'round';
  ctx.strokeStyle = '#1E1E1E'; ctx.lineWidth = 2.4; [-5, 5].forEach(fx => { ctx.beginPath(); ctx.moveTo(fx, -14); ctx.lineTo(fx, -1); ctx.moveTo(fx - 3, 0); ctx.lineTo(fx + 3, 0); ctx.stroke(); }); /* legs */
  ctx.strokeStyle = '#F28C28'; ctx.lineWidth = 2.6; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 15, -26 + Math.sin(a) * 15); ctx.lineTo(Math.cos(a) * 20, -26 + Math.sin(a) * 20); ctx.stroke(); } /* rays */
  ctx.fillStyle = '#FBB829'; ctx.beginPath(); ctx.arc(0, -26, 12, 0, Math.PI * 2); ctx.fill(); /* body */
  ctx.fillStyle = '#1E1E1E'; [-4, 4].forEach(ex => { ctx.beginPath(); ctx.arc(ex, -28, 1.4, 0, Math.PI * 2); ctx.fill(); }); /* eyes */
  ctx.strokeStyle = '#1E1E1E'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4, -22); ctx.quadraticCurveTo(0, -18, 4, -22); ctx.stroke(); /* smile */
  ctx.restore();
}
// ---- 3. Season catch: move the season's hero so the basket catches the falling item (leaf / flower / ice cream / snowflake / lì xì / gift) that carries the right word ----
GAMES.eggs = {start(set, board, hud, u) {
  const item = seasonCatch(); const hero = HERO_NAMES[heroKind()];
  board.innerHTML = `<canvas class="game" id="eg-cv" height="440"></canvas><p class="xs muted" style="margin:6px 0 0">Kéo chuột / chạm trên màn chơi (hoặc phím ← →) để đưa ${hero} tới dưới ${item.name} mang từ đúng với gợi ý. Hứng nhầm hoặc để ${item.name} đúng rơi xuống đất: −1 ❤️. 10 lượt. Tốc độ rơi theo mức ${u.cefr || 'A2'} (×${levelSpeed(u)}).</p>`;
  const cv = $('#eg-cv'); const ctx = cv.getContext('2d'); const W = () => cv.width, H = () => cv.height; const fit = () => { cv.width = Math.max(320, Math.floor(cv.clientWidth)); }; fit();
  const words = gshuffle(set.words).slice(0, 10); const rounds = words.length; let round = 0, score = 0, lives = 3, eggs = [], raf = 0, over = false, lastT = 0, flash = 0, splats = [];
  const G = () => H() - 26; const C = {x: 0, tx: 0, face: 1}; C.x = C.tx = W() / 2; const keys = {}; const CHH = 78; const basketY = () => G() - CHH - 10;
  const drawHint = () => { const w = words[round]; if (!w) return; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 26px Be Vietnam Pro, sans-serif'; const tw = Math.max(ctx.measureText(w.v).width, w.def ? (ctx.font = '700 14px Be Vietnam Pro, sans-serif', ctx.measureText(w.def).width) : 0) + 36; const bw = Math.min(W() - 20, tw), bx = W() / 2 - bw / 2;
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.strokeStyle = '#1E1E1E'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(bx, 10, bw, w.def ? 62 : 44, 14); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1E1E1E'; ctx.font = '800 26px Be Vietnam Pro, sans-serif'; ctx.fillText(item.emoji + ' ' + w.v, W() / 2, 32); if (w.def) { ctx.font = '700 14px Be Vietnam Pro, sans-serif'; ctx.fillStyle = '#77736C'; ctx.fillText(w.def, W() / 2, 56); } };
  const hudDraw = () => { hud.innerHTML = `<span class="badge primary">Lượt ${Math.min(round + 1, rounds)}/${rounds}</span><span class="badge ok">Điểm ${score}</span><span class="badge ${lives <= 1 ? 'danger' : 'warn'}">${'❤️'.repeat(lives)}${'🖤'.repeat(3 - lives)}</span>`; };
  const newRound = () => { if (round >= rounds || lives <= 0) { end(); return; } const w = words[round]; const others = gshuffle(set.words.filter(x => x !== w)).slice(0, 3); const all = gshuffle([w, ...others]); const lane = (W() - 40) / all.length;
    eggs = all.map((x, i) => ({w: x, x: 20 + lane * i + lane / 2, y: 60 - Math.random() * 160, vy: (0.5 + Math.random() * 0.4 + round * 0.05) * levelSpeed(u), gone: false})); hudDraw(); }; // speed scales with the learner's level
  let wrongCatch = 0, dropped = 0;
  const end = () => { over = true; cancelAnimationFrame(raf); ctx.fillStyle = 'rgba(30,30,30,.75)'; ctx.fillRect(0, 0, W(), H()); ctx.fillStyle = '#fff'; ctx.font = '800 28px Be Vietnam Pro, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(lives > 0 ? 'Hết lượt!' : 'Hết mạng!', W() / 2, H() / 2); finishGame('eggs', set, score, rounds, lives > 0 ? 'hết lượt' : 'hết mạng', [[`${item.label} hứng đúng`, `${score} / ${rounds}`], ['Hứng nhầm', `${wrongCatch}`], [`${item.label} rơi xuống đất`, `${dropped}`], ['Mạng còn lại', '❤️'.repeat(lives) || '0']]); };
  const drawEgg = e => { drawCatchItem(ctx, e.x, e.y); ctx.save(); ctx.font = '700 14px Be Vietnam Pro, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const tw = ctx.measureText(e.w.e).width; ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.roundRect(e.x - tw / 2 - 8, e.y + 40, tw + 16, 24, 8); ctx.fill(); ctx.strokeStyle = '#1E1E1E'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#1E1E1E'; ctx.fillText(e.w.e, e.x, e.y + 52); ctx.restore(); };
  const step = ts => { if (over) return; const dt = Math.min(2, (ts - lastT) / 16.7 || 1); lastT = ts; ctx.clearRect(0, 0, W(), H());
    ctx.fillStyle = '#A8BF55'; ctx.fillRect(0, G(), W(), 26);
    if (keys.ArrowLeft) C.tx -= 9 * dt; if (keys.ArrowRight) C.tx += 9 * dt; C.tx = Math.max(40, Math.min(W() - 40, C.tx)); const dx = C.tx - C.x; if (Math.abs(dx) > 1) { C.x += Math.sign(dx) * Math.min(Math.abs(dx), 10 * dt); C.face = Math.sign(dx); }
    splats = splats.filter(s => s.t < 25); splats.forEach(s => { s.t += dt; ctx.fillStyle = `rgba(251,184,41,${1 - s.t / 25})`; ctx.beginPath(); ctx.ellipse(s.x, G() - 4, 30 + s.t, 8, 0, 0, Math.PI * 2); ctx.fill(); });
    if (!drawArt(ctx, heroArt(Math.abs(C.tx - C.x) > 1 ? (Math.floor(ts / 120) % 2 ? 'run1' : 'run2') : 'idle'), C.x, G() + 2, CHH, C.face)) drawGoose(ctx, C.x, G(), 56, C.face);
    ctx.fillStyle = '#b48a5a'; ctx.strokeStyle = '#1E1E1E'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(C.x, basketY(), 40, 10, 0, 0, Math.PI, false); ctx.lineTo(C.x - 40, basketY()); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(C.x, basketY(), 40, 10, 0, 0, Math.PI * 2); ctx.stroke(); /* basket held above the head */
    let missed = false, caught = null; eggs.forEach(e => { if (e.gone) return; e.y += e.vy * dt; drawEgg(e); const bottom = e.y + 36; if (bottom >= basketY() - 4 && bottom <= basketY() + 16 && Math.abs(e.x - C.x) < 42) caught = e; else if (e.y > G() - 20) { e.gone = true; splats.push({x: e.x, t: 0}); if (e.w === words[round]) missed = true; } });
    drawHint();
    if (flash > 0) { flash -= dt; ctx.fillStyle = `rgba(168,191,85,${flash / 10})`; ctx.fillRect(0, 0, W(), H()); }
    if (caught) { caught.gone = true; if (caught.w === words[round]) { score++; flash = 10; beep(); speech.speak(caught.w.e); round++; newRound(); if (over) return; } else { lives--; wrongCatch++; hudDraw(); lifePop(lives); toast(`"${caught.w.e}" = ${caught.w.v} – không phải ${item.name} cần hứng`, 'err'); if (lives <= 0) { setTimeout(end, 900); over = true; return; } } }
    else if (missed) { lives--; dropped++; lifePop(lives); toast(`${item.label} "${words[round].e}" rơi xuống đất rồi`, 'err'); round++; newRound(); if (over) return; }
    raf = requestAnimationFrame(step); };
  const onMove = e => { if (over) return; const rect = cv.getBoundingClientRect(); C.tx = (e.clientX - rect.left) * W() / rect.width; };
  const kd = e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); keys[e.key] = true; } }, ku = e => { keys[e.key] = false; };
  cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerdown', onMove); document.addEventListener('keydown', kd); document.addEventListener('keyup', ku); window.addEventListener('resize', fit);
  newRound(); raf = requestAnimationFrame(step);
  return () => { over = true; cancelAnimationFrame(raf); window.removeEventListener('resize', fit); document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); };
}};
// ---- 4. Platformer: run, jump into "?" blocks, answer a vocabulary question ----
GAMES.mario = {start(set, board, hud, u) {
  board.innerHTML = `<div style="position:relative"><canvas class="game" id="mr-cv" height="320"></canvas>
      <div class="mr-pad"><div class="dpad"><button id="mr-l" aria-label="Sang trái"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><button id="mr-r" aria-label="Sang phải"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button></div><button id="mr-j" class="jump" aria-label="Nhảy"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 12l6-6 6 6"/></svg><span>Nhảy</span></button></div>
      <div id="mr-quiz" hidden style="position:absolute;inset:0;display:grid;place-items:center;padding:12px;background:rgba(30,30,30,.35);border-radius:16px;z-index:3"></div></div><p class="xs muted" style="margin:6px 0 0">Phím ← → di chuyển, Space / ↑ nhảy, hoặc dùng bộ nút trên màn chơi. Mỗi hộp quà là một cổng chắn ngang đường: chạm vào hộp (hoặc cột gỗ dưới hộp) để trả lời, trả lời xong cổng mới mở. Hộp trên bục thì nhảy lên bục trước; cổng chắn kín từ trên xuống nên không nhảy qua được. Đúng được nấm 🍄, sai mất ❤️. Cuối màn là ${HERO_FOOD[heroKind()].emoji} ${HERO_FOOD[heroKind()].name} khổng lồ – món khoái khẩu của ${HERO_NAMES[heroKind()]}: trả lời đúng 3 câu trong <b>${BOSS_SECONDS} giây</b> kể từ lúc chạm vào, quá giờ món ăn bị hỏng và thua. Xong thì chạm cờ để về đích.</p>`;
  const cv = $('#mr-cv'); const ctx = cv.getContext('2d'); const fit = () => { cv.width = Math.max(320, Math.floor(cv.clientWidth)); }; fit(); const H = 320, G = H - 40;
  // level design: every gift box sits on the path as a GATE – a wooden post under the box blocks the way until the box is answered, so no box can be skipped.
  // Three patterns make the road wind: box on the ground, box on a ledge (jump up first), box on a high ledge reached by a step. Jump rise ≈ 110 px.
  const TIERS = [{h: 0, p: []}, {h: 60, p: [[-10, 60, 150]]}, {h: 110, p: [[-150, 55, 90], [-10, 110, 150]]}]; const order = [0, 1, 0, 2, 1, 0, 2, 1];
  const qs = gshuffle(set.words).slice(0, 8); const blocks = [], plats = []; qs.forEach((w, i) => { const t = TIERS[order[i % order.length]]; const bx = 360 + i * 330; blocks.push({x: bx, y: G - t.h - 36 - 44, w, state: 'q', base: G - t.h}); t.p.forEach(([dx, h, pw]) => plats.push({x: bx + dx, y: G - h, w: pw, h})); });
  // a ledge is a solid wooden block from its top down to the ground; a gate is the post between an unanswered box and the surface it stands on
  // the gate is a full-height wall: the post under the box AND a beam from the box up to the sky, so the box cannot be jumped over – the only way past is to answer it
  const gates = () => blocks.filter(b => b.state === 'q').map(b => ({x: b.x + 10, y: 0, w: 16, h: b.base, b}));
  // the Boss stands before the flag: the hero's favourite food, giant size. It blocks the way until its 3 HP are gone (one correct answer = one hit) and must be beaten within BOSS_SECONDS of the first touch, or the food goes bad (game lost).
  const food = HERO_FOOD[heroKind()]; const bossX = 360 + qs.length * 330 + 60; const boss = {hp: 3, max: 3, busy: false, hitFlash: 0, startedAt: 0, rotten: false}; const flagX = bossX + 220; const worldW = flagX + 200;
  const bossLeft = () => boss.startedAt ? Math.max(0, BOSS_SECONDS - (Date.now() - boss.startedAt) / 1000) : BOSS_SECONDS;
  const P = {x: 40, y: G - 40, w: 30, h: 40, vx: 0, vy: 0, ground: true, face: 1}; const keys = {}; let score = 0, lives = 3, raf = 0, over = false, paused = false, camX = 0, lastT = 0, frame = 0, flagWarnAt = 0;
  const unopened = () => blocks.filter(b => b.state === 'q').length;
  GS.dbg = {P, blocks, boss, bossX, flagX}; // test hook: lets a tester teleport the hero (no effect on normal play)
  const hudDraw = () => { hud.innerHTML = `<span class="badge ok">🍄 ${score}/${qs.length + boss.max}</span><span class="badge">Quà ${qs.length - unopened()}/${qs.length}</span><span class="badge ${boss.hp ? 'warn' : 'ok'}">${food.emoji} ${boss.rotten ? 'hỏng' : boss.hp ? '❤'.repeat(boss.hp) + (boss.startedAt ? ` · ⏱ ${Math.ceil(bossLeft())}s` : '') : 'xong'}</span><span class="badge ${lives <= 1 ? 'danger' : 'warn'}">${'❤️'.repeat(lives)}${'🖤'.repeat(Math.max(0, 3 - lives))}</span>`; }; hudDraw();
  let wrongAns = 0; const t0 = Date.now(); let bossTick = 0;
  const end = (win, why) => { over = true; cancelAnimationFrame(raf); clearInterval(bossTick); finishGame('mario', set, score, qs.length + boss.max, win ? 'về đích' : why || 'hết mạng', [['Hộp quà đúng 🍄', `${blocks.filter(b => b.state === 'm').length} / ${qs.length}`], [`Đòn trúng ${food.name}`, `${boss.max - boss.hp} / ${boss.max}${boss.rotten ? ' – món ăn bị hỏng' : ''}`], ['Trả lời sai', `${wrongAns}`], ['Mạng còn lại', '❤️'.repeat(Math.max(0, lives)) || '0'], ['Về đích', win ? 'Có 🏁' : 'Chưa'], ['Thời gian', `${Math.round((Date.now() - t0) / 1000)} giây`]]); };
  // Boss clock: starts at the first touch, runs even while a question is open; when it runs out the food goes bad and the game is lost
  const bossTimeout = () => { if (over || boss.rotten || boss.hp <= 0) return; boss.rotten = true; clearInterval(bossTick); paused = true; const q = $('#mr-quiz'); if (q) { q.hidden = true; q.innerHTML = ''; } hudDraw(); toast(`⏱ Quá ${BOSS_SECONDS} giây – ${food.name} bị hỏng rồi!`, 'err'); lifePop(0); setTimeout(() => end(false, `thua – ${food.name} bị hỏng vì quá ${BOSS_SECONDS} giây`), 1400); };
  const startBossClock = () => { if (boss.startedAt) return; boss.startedAt = Date.now(); toast(`⏱ Hạ ${food.name} trong ${BOSS_SECONDS} giây!`, ''); bossTick = setInterval(() => { if (over) { clearInterval(bossTick); return; } hudDraw(); if (bossLeft() <= 0) bossTimeout(); }, 250); };
  let bossPool = gshuffle(set.words);
  const ask = (title, w, onAnswer) => { paused = true; const opts = gshuffle([w, ...gshuffle(set.words.filter(x => x !== w)).slice(0, 3)]); const q = $('#mr-quiz'); q.hidden = false;
    q.innerHTML = `<div class="card" style="background:var(--butter);max-width:520px;width:100%"><div class="eyebrow">${title}</div><div style="font-weight:800;font-size:1.05rem;line-height:1.4">${gameHint(w, u)}</div><div class="odd4" style="margin-top:8px">${opts.map(o => `<button data-e="${esc(o.e)}" style="padding:12px 8px;font-size:1rem">${esc(o.e)}</button>`).join('')}</div></div>`;
    q.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => { const ok = btn.dataset.e === w.e; q.querySelectorAll('button').forEach(x => { x.disabled = true; if (x.dataset.e === w.e) x.classList.add('ok'); }); if (!ok) btn.classList.add('bad');
      onAnswer(ok); hudDraw();
      setTimeout(() => { q.hidden = true; q.innerHTML = ''; if (!ok) lifePop(lives); if (lives <= 0) { setTimeout(() => end(false), 1200); } else paused = false; }, ok ? 700 : 1200); })); };
  const quiz = b => ask('Hộp quà ? hỏi', b.w, ok => { if (ok) { score++; b.state = 'm'; beep(); speech.speak(b.w.e); } else { lives--; wrongAns++; b.state = 'x'; } });
  const bossQuiz = () => { if (boss.busy || boss.hp <= 0 || boss.rotten) return; boss.busy = true; startBossClock(); const w = bossPool.shift() || gshuffle(set.words)[0]; if (!bossPool.length) bossPool = gshuffle(set.words);
    ask(`${food.emoji} ${food.name.toUpperCase()} KHỔNG LỒ hỏi (còn ${boss.hp}/${boss.max} miếng · ⏱ ${Math.ceil(bossLeft())}s)`, w, ok => { if (boss.rotten) return; if (ok) { boss.hp--; score++; boss.hitFlash = 12; beep(2); speech.speak(w.e); if (boss.hp <= 0) { clearInterval(bossTick); toast(`😋 ${HERO_NAMES[heroKind()]} đã ăn hết ${food.name}! Chạy tới cờ nào`, 'ok'); } } else { lives--; wrongAns++; } setTimeout(() => { boss.busy = false; }, 300); }); };
  const step = ts => { if (over) return; raf = requestAnimationFrame(step); if (paused) return; const dt = Math.min(2, (ts - lastT) / 16.7 || 1); lastT = ts;
    const left = keys.ArrowLeft || keys.a, right = keys.ArrowRight || keys.d; P.vx = right ? 4 : left ? -4 : 0; if (P.vx) P.face = Math.sign(P.vx);
    if ((keys.ArrowUp || keys[' '] || keys.w || keys.jump) && P.ground) { P.vy = -11.5; P.ground = false; }
    P.vy += 0.6 * dt; P.x = Math.max(0, Math.min(worldW - P.w, P.x + P.vx * dt)); P.y += P.vy * dt;
    P.ground = false; if (P.y + P.h >= G) { P.y = G - P.h; P.vy = 0; P.ground = true; }
    const solids = [...blocks.map(b => ({x: b.x, y: b.y, w: 36, h: 36, b})), ...gates(), ...plats.map(p => ({x: p.x, y: p.y, w: p.w, h: p.h}))];
    solids.forEach(s => { const ox = Math.min(P.x + P.w, s.x + s.w) - Math.max(P.x, s.x), oy = Math.min(P.y + P.h, s.y + s.h) - Math.max(P.y, s.y); if (ox <= 0 || oy <= 0) return;
      if (oy < ox) { if (P.vy > 0 && P.y + P.h - oy <= s.y + 2) { P.y = s.y - P.h; P.vy = 0; P.ground = true; } else if (P.vy < 0) { P.y = s.y + s.h; P.vy = 0; if (s.b && s.b.state === 'q') quiz(s.b); } }
      else { P.x += P.x + P.w / 2 < s.x + s.w / 2 ? -ox : ox; if (s.b && s.b.state === 'q' && !paused) quiz(s.b); } }); // touching an unanswered box or its gate from the side also opens the question: the gate cannot be passed otherwise
    if (boss.hp > 0 && P.x + P.w > bossX - 14) { P.x = bossX - 14 - P.w; P.vx = 0; if (!boss.busy && P.ground && !boss.rotten) bossQuiz(); } // the Boss is a wall until it is beaten
    if (P.x + P.w > flagX) { if (unopened()) { P.x = flagX - 70 - P.w; P.vx = 0; if (Date.now() - flagWarnAt > 2500) { flagWarnAt = Date.now(); toast(`Còn ${unopened()} hộp quà chưa mở – quay lại mở hết rồi mới qua cờ được`, 'err'); } } else { end(true); return; } }
    camX = Math.max(0, Math.min(worldW - cv.width, P.x - cv.width * 0.35));
    ctx.clearRect(0, 0, cv.width, H); ctx.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { const cx = ((i * 260 - camX * 0.3) % (worldW)) + 40; ctx.beginPath(); ctx.ellipse(cx, 50 + (i % 3) * 25, 34, 14, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.translate(-camX, 0); ctx.fillStyle = '#A8BF55'; ctx.fillRect(0, G, worldW, 40); ctx.fillStyle = '#7E9A35'; for (let x = 0; x < worldW; x += 40) ctx.fillRect(x, G, 20, 6);
    plats.forEach(p => { ctx.fillStyle = '#b48a5a'; ctx.strokeStyle = '#1E1E1E'; ctx.lineWidth = 2; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.strokeRect(p.x, p.y, p.w, p.h); ctx.fillStyle = '#8C6A42'; for (let x = p.x + 8; x < p.x + p.w - 8; x += 24) ctx.fillRect(x, p.y + 6, 12, 3); });
    gates().forEach(g => { const top = g.b.y + 36; ctx.fillStyle = '#8C6A42'; ctx.strokeStyle = '#1E1E1E'; ctx.lineWidth = 2; ctx.fillRect(g.x, top, g.w, g.h - top); ctx.strokeRect(g.x, top, g.w, g.h - top); ctx.fillStyle = '#F2C14E'; ctx.fillRect(g.x + 4, top + 6, 8, 3); ctx.fillRect(g.x + 4, g.h - 10, 8, 3); // wooden post under the box
      ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = '#F2C14E'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -frame; ctx.beginPath(); ctx.moveTo(g.x + 8, g.b.y - 2); ctx.lineTo(g.x + 8, 0); ctx.stroke(); ctx.restore(); }); // beam above the box: the gate reaches the sky, no jumping over
    // blocks are gift boxes (asset giftbox): closed = question, open + mushroom = answered right, bomb = answered wrong
    blocks.forEach(b => { const cx = b.x + 18, by = b.y + 36; const ok = b.state === 'q' ? drawArt(ctx, 'giftbox', cx, by + 2, 46) : b.state === 'm' ? (drawArt(ctx, 'giftopen', cx, by + 2, 46) && drawArt(ctx, 'mushroom', cx, b.y + 6, 34)) : drawArt(ctx, 'bomb', cx, by + 2, 42);
      if (!ok) { ctx.fillStyle = b.state === 'q' ? '#FBB829' : b.state === 'm' ? '#A8BF55' : '#ccc'; ctx.strokeStyle = '#1E1E1E'; ctx.lineWidth = 3; ctx.fillRect(b.x, b.y, 36, 36); ctx.strokeRect(b.x, b.y, 36, 36); ctx.fillStyle = '#1E1E1E'; ctx.font = '800 22px Be Vietnam Pro, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.state === 'q' ? '?' : b.state === 'm' ? '🍄' : '✗', b.x + 18, b.y + 19); } });
    ctx.fillStyle = unopened() ? '#A19D96' : '#1E1E1E'; ctx.fillRect(flagX, G - 110, 4, 110); ctx.fillStyle = unopened() ? '#D6CCBF' : '#F6D3CB'; ctx.beginPath(); ctx.moveTo(flagX + 4, G - 110); ctx.lineTo(flagX + 40, G - 96); ctx.lineTo(flagX + 4, G - 82); ctx.closePath(); ctx.fill();
    if (unopened()) { ctx.fillStyle = '#1E1E1E'; ctx.font = '800 13px Be Vietnam Pro, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`🔒 còn ${unopened()} hộp quà`, flagX + 20, G - 124); }
    // the Boss: the hero's favourite food, giant size, with "bites left" and the 10-second clock; shakes when bitten, grey + ✗ when it has gone bad, eaten up when beaten
    if (boss.hp > 0) { const bx = bossX + 40 + (boss.hitFlash > 0 ? (Math.random() - 0.5) * 8 : 0); if (boss.hitFlash > 0) boss.hitFlash -= dt; const sz = (boss.rotten ? 84 : 90 + Math.sin(frame / 10) * 4) * (0.7 + 0.3 * boss.hp / boss.max);
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = `${Math.round(sz)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`; if (boss.rotten) ctx.filter = 'grayscale(1) brightness(.7)'; ctx.fillText(food.emoji, bx, G - 2); ctx.restore();
      if (boss.rotten) { ctx.fillStyle = '#C8102E'; ctx.font = '800 30px Be Vietnam Pro, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✗ HỎNG', bx, G - 50); }
      const left = bossLeft(); ctx.fillStyle = '#1E1E1E'; ctx.font = '800 13px Be Vietnam Pro, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${food.name.toUpperCase()} KHỔNG LỒ · ${boss.startedAt ? '⏱ ' + Math.ceil(left) + 's' : BOSS_SECONDS + 's'}`, bx, G - 128);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1E1E1E'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(bx - 40, G - 118, 80, 12, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#F6D3CB'; ctx.beginPath(); ctx.roundRect(bx - 40, G - 118, 80 * boss.hp / boss.max, 12, 6); ctx.fill();
      if (boss.startedAt && !boss.rotten) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(bx - 40, G - 104, 80, 6, 3); ctx.fill(); ctx.fillStyle = left <= 3 ? '#C8102E' : '#A8BF55'; ctx.beginPath(); ctx.roundRect(bx - 40, G - 104, 80 * left / BOSS_SECONDS, 6, 3); ctx.fill(); } }
    else { ctx.font = '800 26px Be Vietnam Pro, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('😋', bossX + 40, G - 30); }
    // the season's hero: jump frame in the air, two run frames alternating while moving, idle otherwise (sprites face right; flipped when running left)
    frame += dt; const pose = !P.ground ? 'jump' : P.vx ? (Math.floor(frame / 7) % 2 ? 'run2' : 'run1') : 'idle';
    if (!drawArt(ctx, heroArt(pose), P.x + P.w / 2, P.y + P.h + 4, P.h + 16, P.face)) drawGoose(ctx, P.x + P.w / 2, P.y + P.h, P.h, P.face);
    ctx.restore(); };
  const kd = e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' '].includes(e.key)) e.preventDefault(); keys[e.key] = true; }, ku = e => { keys[e.key] = false; };
  document.addEventListener('keydown', kd); document.addEventListener('keyup', ku); window.addEventListener('resize', fit);
  const hold = (id, k) => { const b = $(id); const on = e => { e.preventDefault(); keys[k] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch {} }, off = () => { keys[k] = false; b.classList.remove('on'); }; b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off); b.addEventListener('contextmenu', e => e.preventDefault()); };
  hold('#mr-l', 'ArrowLeft'); hold('#mr-r', 'ArrowRight'); hold('#mr-j', 'jump');
  raf = requestAnimationFrame(step);
  return () => { over = true; cancelAnimationFrame(raf); clearInterval(bossTick); document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); window.removeEventListener('resize', fit); };
}};
// ---- 5. Word sorting: put each word into its part-of-speech group ----
GAMES.sort = {start(set, board, hud, u) {
  const words = gshuffle(set.words.filter(w => posGroup(w.pos))).slice(0, 12); const groups = POS_GROUPS.filter(([k]) => words.some(w => posGroup(w.pos) === k) || ['noun', 'verb', 'adjective'].includes(k));
  let i = 0, score = 0, streak = 0, best = 0, lock = false; const vi = isLow(u.cefr);
  if (words.length < 4) { board.innerHTML = '<p class="muted">Bộ từ này chưa có từ loại cho đủ từ. Tạo bộ từ mới bằng AI hoặc dùng từ vựng tuần này (bài đã có từ loại).</p>'; return () => {}; }
  const draw = () => { const w = words[i]; hud.innerHTML = `<span class="badge primary">Từ ${i + 1}/${words.length}</span><span class="badge ok">Điểm ${score}</span><span class="badge ${streak >= 3 ? 'warn' : ''}">Chuỗi ${streak}</span>`;
    board.innerHTML = `<div class="sort-word"><div class="eyebrow">${vi ? 'Từ này thuộc từ loại nào?' : 'Which part of speech is this word?'}</div><div class="big">${esc(w.e)} <button class="btn-sm btn-ghost" data-action="say" data-text="${esc(w.e)}">${ICONS.sound}</button></div><div class="small muted">${esc(w.v)}${w.def ? ' · ' + esc(w.def) : ''}</div></div>
      <div class="sort-groups">${groups.map(([k, lbl]) => `<button data-g="${k}"><b>${lbl}</b><span class="xs">${POS_VI[k] || ''}</span></button>`).join('')}</div><div id="sort-x" class="small" style="margin-top:10px;min-height:1.4em;text-align:center"></div>`; };
  const pick = g => { if (lock) return; const w = words[i]; const right = posGroup(w.pos); const ok = g === right; lock = true; board.querySelectorAll('.sort-groups button').forEach(b => { b.disabled = true; if (b.dataset.g === right) b.classList.add('ok'); if (b.dataset.g === g && !ok) b.classList.add('bad'); });
    if (ok) { score++; streak++; best = Math.max(best, streak); beep(); } else streak = 0;
    $('#sort-x').innerHTML = ok ? `✅ ${esc(w.e)} = <b>${esc(right)}</b>` : `❌ <b>${esc(w.e)}</b> là <b>${esc(right)}</b> (${POS_VI[right] || right})`;
    setTimeout(() => { lock = false; i++; if (i >= words.length) { board.innerHTML = ''; finishGame('sort', set, score, words.length, '', [['Phân loại đúng', `${score} / ${words.length}`], ['Chuỗi đúng dài nhất', `${best}`], ['Nhóm từ loại', groups.map(g => g[1]).join(', ')]]); } else draw(); }, ok ? 700 : 1500); };
  board.addEventListener('click', e => { const b = e.target.closest('.sort-groups button'); if (b) pick(b.dataset.g); });
  draw(); return () => {};
}};
// ---- 6. Time-attack typing: hint (meaning / definition / picture) + a fast countdown bar; type the word on the on-screen keyboard; combo multiplier ----
GAMES.typing = {start(set, board, hud, u) {
  const words = gshuffle(set.words.filter(w => /^[a-z][a-z\s'-]*$/i.test(w.e))).slice(0, 10); const total = words.length; let i = 0, score = 0, combo = 1, best = 1, typed = '', raf = 0, deadline = 0, over = false, locked = false, maxMs = 0;
  const timeFor = w => Math.max(4000, 900 * w.e.replace(/\s/g, '').length); /* ≈0.9 s per letter, at least 4 s */
  const KB = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  const draw = () => { const w = words[i]; const target = w.e.toLowerCase(); const cells = target.split('').map((ch, k) => { const t = typed[k]; const cls = t === undefined ? '' : t === ch ? 'ok' : 'bad'; return `<span class="tp-c ${cls}">${ch === ' ' ? '&nbsp;' : esc(t === undefined ? '' : t)}</span>`; }).join('');
    board.innerHTML = `<div class="row" style="gap:14px;align-items:center;flex-wrap:wrap"><span id="tp-img" class="vimg-slot" style="width:72px;height:72px"></span><div style="flex:1;min-width:200px"><div class="eyebrow">Gợi ý</div><div style="font-weight:800;font-size:1.1rem;line-height:1.35">${esc(w.v)}</div>${w.def ? `<div class="small muted">${esc(w.def)}</div>` : ''}<div class="xs muted">${target.replace(/\s/g, '').length} chữ cái${target.includes(' ') ? ', có dấu cách' : ''}</div></div></div>
      <div class="tp-bar"><i id="tp-fill"></i></div>
      <div class="tp-word" id="tp-word">${cells}</div>
      <div class="tp-kb">${KB.map(row => `<div class="tp-row">${row.split('').map(ch => `<button data-k="${ch.toLowerCase()}">${ch}</button>`).join('')}</div>`).join('')}<div class="tp-row"><button data-k=" " style="flex:3">␣</button><button data-k="bs" style="flex:1.5">⌫</button><button data-k="enter" class="btn-primary" style="flex:2">↵</button></div></div>
`;
    if (S.settings.imgSource !== 'none') vocabImage(w.e).then(url => { const el = $('#tp-img'); if (el && url && words[i] === w) el.innerHTML = `<img src="${esc(url)}" class="vimg" alt="" style="width:72px;height:72px;object-fit:cover">`; }).catch(() => {}); };
  const hudDraw = () => { hud.innerHTML = `<span class="badge primary">Từ ${Math.min(i + 1, total)}/${total}</span><span class="badge ok">Điểm ${score}</span><span class="badge ${combo >= 3 ? 'warn' : ''}">Combo ×${combo}</span>`; };
  let okWords = 0, timeouts = 0, wrongs = 0;
  const next = (msg) => { i++; typed = ''; if (i >= total) { over = true; cancelAnimationFrame(raf); board.innerHTML = ''; hudDraw(); finishGame('typing', set, score, total * 50, '', [['Từ gõ đúng', `${okWords} / ${total}`], ['Hết giờ', `${timeouts}`], ['Gõ sai', `${wrongs}`], ['Combo cao nhất', `×${best}`]]); return; } draw(); hudDraw(); maxMs = timeFor(words[i]); deadline = performance.now() + maxMs; };
  const check = () => { if (over || locked) return; const w = words[i]; if (typed.toLowerCase() === w.e.toLowerCase()) { score += 10 * combo; okWords++; best = Math.max(best, combo); combo = Math.min(5, combo + 1); locked = true; beep(); speech.speak(w.e); $('#tp-word').classList.add('good'); hudDraw(); setTimeout(() => { locked = false; next(); }, 500); }
    else { combo = 1; wrongs++; hudDraw(); const el = $('#tp-word'); el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); typed = ''; draw(); } };
  const tap = k => { const b = board.querySelector(`.tp-kb button[data-k="${CSS.escape(k)}"]`); if (b) { b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), 220); } }; /* the key lights up (no mascot) */
  const key = k => { if (over || locked) return; if (k === 'enter') { check(); tap('enter'); return; } if (k === 'bs') typed = typed.slice(0, -1); else if (typed.length < words[i].e.length) typed += k; draw(); tap(k); if (typed.length === words[i].e.length && k !== 'bs') check(); };
  const tick = now => { if (over) return; raf = requestAnimationFrame(tick); const left = Math.max(0, deadline - now); const f = $('#tp-fill'); if (f) { f.style.width = (100 * left / maxMs) + '%'; f.style.background = left < maxMs * 0.3 ? 'var(--peach)' : 'var(--mint)'; }
    if (left <= 0 && !locked) { locked = true; combo = 1; timeouts++; const w = words[i]; const el = $('#tp-word'); if (el) el.innerHTML = `<span class="muted small">Hết giờ – từ đúng:</span> <b>${esc(w.e)}</b>`; toast(`⏰ Hết giờ: ${w.e} = ${w.v}`, 'err'); setTimeout(() => { locked = false; next(); }, 1200); } };
  board.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) key(b.dataset.k); });
  const onKey = e => { if (e.ctrlKey || e.metaKey || e.altKey) return; if (e.key === 'Enter') { e.preventDefault(); key('enter'); } else if (e.key === 'Backspace') { e.preventDefault(); key('bs'); } else if (/^[a-zA-Z '-]$/.test(e.key)) { e.preventDefault(); key(e.key.toLowerCase()); } }; document.addEventListener('keydown', onKey);
  if (!total) { board.innerHTML = '<p class="muted">Bộ từ này không có từ phù hợp.</p>'; return () => {}; }
  draw(); hudDraw(); maxMs = timeFor(words[0]); deadline = performance.now() + maxMs; raf = requestAnimationFrame(tick);
  return () => { over = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); };
}};

/* __MODULES__ */

// ---------- boot ----------
// data migrations that need helpers defined above (never inside load(): a failure there would reset the state)
try { (S.microLessons || []).forEach(fixLessonPractice); (S.lessonSets || []).forEach(set => (set.lessons || []).forEach(fixLessonPractice)); } catch (e) { console.warn('migration skipped', e); }
// lessons saved before the sound check: re-check their drill words (e.g. "does" listed for /t/) and complete to 3 from the checked list
try { let fixed = 0; const fix = l => { if (l && l.pron && l.pron.verified === undefined) { const p = parsePron(l.pron); if (p) { l.pron = p; fixed++; } } }; (S.microLessons || []).forEach(fix); (S.lessonSets || []).forEach(set => (set.lessons || []).forEach(fix)); if (fixed) save(true); } catch (e) { console.warn('pron migration skipped', e); }
// demo data loaded with an older version had lessons in the old format (no listening / speaking / pronunciation): swap them for the standard-structure demo lessons
try { if (upgradeOldDemoSets()) save(true); } catch (e) { console.warn('demo upgrade skipped', e); }
// demo lessons saved before the vocabulary details / word-class exercises existed: refresh their content from DEMO_LESSONS (same title), keeping ids so progress still matches
try { let n = 0; (S.lessonSets || []).forEach(set => { if (!(set.lessons || []).some(l => l.demo && detailsMissing(l))) return; const fresh = demoLessons(set.cefr, set.week); set.lessons = set.lessons.map(l => { const f = l.demo ? fresh.find(x => x.title === l.title) : null; if (!f) return l; n++; return {...f, id: l.id, day: l.day || f.day, order: l.order || f.order}; }); }); if (n) save(true); } catch (e) { console.warn('demo refresh skipped', e); }
// level history: accounts approved before it existed get one entry for their first approval; deferred level changes whose Monday has come are applied
try { let n = 0; S.users.forEach(u => { if (u.role === 'learner' && u.cefrApproved && u.cefr && !(u.cefrHistory || []).length) { u.cefrHistory = [{from: null, to: u.cefr, at: dateStr(u.approvedAt || u.createdAt), by: u.approvedBy || null, reason: 'Duyệt mức đầu vào (ghi lại từ dữ liệu cũ)', evidence: ''}]; n++; } }); n += applyPendingLevels(); if (n) save(true); } catch (e) { console.warn('level history migration skipped', e); }
computeReminders();
render();
