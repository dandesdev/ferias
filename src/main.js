import "./index.css";
import "./styles.css";
import { DAY, num, dow, buildHolidayMap, LEVELS } from "./holidays.js";
import { mountDatePicker } from "./date-picker.tsx";

const $ = (s) => document.querySelector(s);
const p2 = (n) => String(n).padStart(2, "0");
const parts = (n) => { const d = new Date(n * DAY); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };
const ymd = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const fromYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return num(y, m - 1, d); };
const fmt = (n, year = true) => { const [y, m, d] = parts(n); return `${p2(d)}/${p2(m + 1)}${year ? "/" + y : ""}`; };
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const COLORS = ["#2563eb", "#7c3aed", "#0d9488", "#db2777", "#ea580c", "#4f46e5"];
const KEY = "ferias:v1";
const now = new Date();
const TODAY = num(now.getFullYear(), now.getMonth(), now.getDate());
const MIN_DATE = "2026-01-01";
const MAX_DATE = `${now.getFullYear() + 12}-12-31`;

const DEFAULTS = {
  uf: "SP", ibge: 3550308, vinculo: "privado", sabado: "1", fac: "nao",
  from: ymd(TODAY), to: `${now.getFullYear() + 2}-12-31`, total: 30, len: 30, periods: [], ovr: {}, bar: false,
};
// ---------- link compartilhável ----------
// O plano vai inteiro no fragmento (#...), que o navegador não envia a servidor nenhum.
// Ex.: #uf=SP&m=3550308&v=privado&sab=1&fac=nao&de=20261023&ate=20281231&t=30&p=20270104-10,20270712-20&o=20261224f
const compact = (s) => s.replaceAll("-", "");
const expand = (s) => {
  if (!/^\d{8}$/.test(s || "")) return null;
  const v = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
  return ymd(fromYmd(v)) === v ? v : null;
};

function encodeShare(st) {
  const q = { uf: st.uf, m: st.ibge, v: st.vinculo, sab: st.sabado, fac: st.fac, de: compact(st.from), ate: compact(st.to), t: st.total };
  const p = [...st.periods].sort((x, y) => (x.s < y.s ? -1 : 1)).map((x) => `${compact(x.s)}-${x.len}`);
  const o = Object.entries(st.ovr).sort().map(([k, v]) => compact(k) + (v === "off" ? "f" : "t"));
  if (p.length) q.p = p.join(",");
  if (o.length) q.o = o.join(",");
  return Object.entries(q).map(([k, v]) => `${k}=${v}`).join("&");
}

function decodeShare(hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  if (!q.has("uf")) return null;
  const st = { ...DEFAULTS, periods: [], ovr: {}, bar: S.bar };
  const one = (k, ok) => (ok.includes(q.get(k)) ? q.get(k) : undefined);
  st.uf = q.get("uf").toUpperCase();
  st.ibge = +q.get("m") || 0;
  st.vinculo = one("v", ["privado", "publico"]) ?? st.vinculo;
  st.sabado = one("sab", ["1", "0"]) ?? st.sabado;
  st.fac = one("fac", ["nao", "integrais", "todos"]) ?? st.fac;
  st.from = expand(q.get("de")) ?? st.from;
  st.to = expand(q.get("ate")) ?? st.to;
  const t = Math.round(+q.get("t"));
  if (t >= 1 && t <= 90) st.total = t;
  const taken = [];
  for (const x of (q.get("p") || "").split(",")) {
    const [, d, l] = x.match(/^(\d{8})-(\d{1,2})$/) || [];
    const s = expand(d), len = +l;
    if (!s || len < 1 || len > 90) continue;
    const a = fromYmd(s), b = a + len - 1;
    if (taken.some(([x0, x1]) => a <= x1 && b >= x0)) continue;
    taken.push([a, b]);
    st.periods.push({ s, len, c: st.periods.length });
  }
  for (const x of (q.get("o") || "").split(",")) {
    const [, d, k] = x.match(/^(\d{8})([ft])$/) || [];
    if (expand(d)) st.ovr[expand(d)] = k === "f" ? "off" : "work";
  }
  st.len = Math.max(0, st.total - st.periods.reduce((s, p) => s + p.len, 0)) || st.total;
  return st;
}

let S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch {}
// versões antigas guardavam só o mês ("AAAA-MM")
if (S.from.length === 7) S.from += "-01";
if (S.to.length === 7) { const [y, m] = S.to.split("-").map(Number); S.to = ymd(num(y, m, 0)); }
const shared = decodeShare(location.hash);
if (shared) {
  const mine = S.periods.length || Object.keys(S.ovr).length;
  if (!mine || encodeShare(S) === encodeShare(shared) ||
    confirm("Abrir o plano deste link? Ele substitui o plano salvo neste navegador.")) S = shared;
  history.replaceState(null, "", location.pathname + location.search);
}
// Colar outro link na mesma aba só troca o fragmento, sem recarregar.
addEventListener("hashchange", () => { if (decodeShare(location.hash)) location.reload(); });
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

let ufs = [], mun = [], city = null, hmap = new Map();
const munCache = {};
const infoCache = new Map();
const cells = new Map();
let range = { a: 0, b: 0 };
let placing = null; // { len, orig? }
let hover = null;
let sugg = { list: [], best: new Set() };

// ---------- classificação dos dias ----------
function info(n) {
  let i = infoCache.get(n);
  if (i) return i;
  const items = hmap.get(n) || [];
  const d = dow(n);
  const we = d === 0 || (S.sabado === "1" && d === 6);
  const hol = items.some((x) => x.lvl !== "F");
  const facs = hol ? [] : items.filter((x) => x.lvl === "F");
  const facOn = facs.some((x) => S.fac === "todos" || (S.fac === "integrais" && !x.half));
  const o = S.ovr[ymd(n)];
  const base = we || hol || facOn;
  i = {
    items, we, hol, fac: facs.length > 0, facOn, half: facs.some((x) => x.half), o,
    off: o === "off" ? true : o === "work" ? false : base,
    rest: o === "off" ? true : o === "work" ? false : we || hol,
  };
  infoCache.set(n, i);
  return i;
}
const off = (n) => info(n).off;

const periods = () =>
  S.periods.map((p) => ({ ...p, n: fromYmd(p.s), e: fromYmd(p.s) + p.len - 1 })).sort((x, y) => x.n - y.n);

function inPeriod(n, list = periods()) {
  return list.find((p) => n >= p.n && n <= p.e);
}

function stats(start, len, list = periods()) {
  const end = start + len - 1;
  const taken = (n) => list.some((p) => n >= p.n && n <= p.e);
  let lost = 0, overlap = false;
  for (let n = start; n <= end; n++) { if (off(n)) lost++; if (taken(n)) overlap = true; }
  let a = start, b = end;
  while (start - a < 60 && off(a - 1) && !taken(a - 1)) a--;
  while (b - end < 60 && off(b + 1) && !taken(b + 1)) b++;
  const gain = start - a + (b - end);
  return { start, end, len, lost, gain, work: len - lost, a, b, total: b - a + 1, overlap, warn: cltIssue(start) };
}

function cltIssue(n) {
  if (S.vinculo !== "privado") return "";
  if (info(n).rest) return "CLT: as férias devem começar em dia útil";
  if (info(n + 1).rest || info(n + 2).rest) return "CLT: início vedado nos 2 dias antes de feriado ou descanso semanal";
  return "";
}

const used = () => S.periods.reduce((s, p) => s + p.len, 0);
const remaining = () => Math.max(0, S.total - used());

// ---------- dados ----------
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url);
  return r.json();
}

async function loadUf() {
  mun = munCache[S.uf] ??= await getJSON(`data/mun/${S.uf}.json`);
  city = mun.find((m) => m[0] === S.ibge) || mun.find((m) => m[2]) || mun[0];
  S.ibge = city[0];
  $("#cities").innerHTML = mun.map((m) => `<option value="${m[1]}">`).join("");
  $("#city").value = city[1];
}

function rebuild() {
  const uf = ufs.find((u) => u.uf === S.uf);
  hmap = buildHolidayMap(parts(range.a)[0] - 1, parts(range.b)[0] + 1, {
    state: uf?.h || [], city: city?.[3] || [], publico: S.vinculo === "publico",
  });
  infoCache.clear();
}

// ---------- calendário ----------
function buildCalendar() {
  if (S.to < S.from) [S.from, S.to] = [S.to, S.from];
  range = { a: fromYmd(S.from), b: Math.min(fromYmd(S.to), fromYmd(S.from) + 3660) };
  const [fy, fm] = parts(range.a), [ty, tm] = parts(range.b);
  cells.clear();
  const cal = $("#cal");
  const html = [];
  for (let y = fy, m = fm; y * 12 + m <= ty * 12 + tm; m === 11 ? (y++, m = 0) : m++) {
    const first = num(y, m, 1), last = num(y, m + 1, 0);
    html.push(`<div class="mo${m === 0 ? " jan" : ""}"><h3>${MONTHS[m]}<span>${y}</span></h3>`,
      `<div class="wk"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div><div class="days">`);
    for (let k = 0; k < dow(first); k++) html.push(`<div class="d pad"></div>`);
    for (let n = first; n <= last; n++) html.push(`<div class="d" data-n="${n}">${n - first + 1}</div>`);
    html.push(`</div></div>`);
  }
  cal.innerHTML = html.join("");
  cal.querySelectorAll(".d[data-n]").forEach((el) => cells.set(+el.dataset.n, el));
}

function paint() {
  const list = periods();
  const over = new Map(); // n -> [classes, color]
  const mark = (n, cls, color) => over.set(n, [cls, color]);
  for (const p of list) {
    const st = stats(p.n, p.len, list.filter((q) => q !== p));
    const color = COLORS[p.c % COLORS.length];
    for (let n = st.a; n < st.start; n++) mark(n, "gain", color);
    for (let n = st.start; n <= st.end; n++) mark(n, off(n) ? "lost" : "per", color);
    for (let n = st.end + 1; n <= st.b; n++) mark(n, "gain", color);
  }
  if (placing && hover != null) {
    const st = stats(hover, placing.len, list);
    const extra = st.overlap ? " pv bad" : " pv";
    for (let n = st.a; n < st.start; n++) if (!over.has(n)) mark(n, "gain pv");
    for (let n = st.start; n <= st.end; n++) mark(n, (off(n) ? "lost" : "per") + extra);
    for (let n = st.end + 1; n <= st.b; n++) if (!over.has(n)) mark(n, "gain pv");
  }
  for (const [n, el] of cells) {
    if (n < range.a || n > range.b) { if (el.className !== "d out") el.className = "d out"; continue; }
    const i = info(n);
    let c = "d";
    if (n < TODAY) c += " past";
    if (n === TODAY) c += " today";
    if (i.o === "off") c += " own";
    else if (i.o === "work") c += " ign";
    else if (i.hol) c += " hol";
    else if (i.fac) c += i.facOn ? (i.half ? " fac half" : " fac") : " facoff";
    if (i.we && i.o !== "work") c += " we";
    if (placing && sugg.best.has(n)) c += " best";
    const ov = over.get(n);
    if (ov) {
      c += " " + ov[0];
      if (ov[1]) el.style.setProperty("--pc", ov[1]); else el.style.removeProperty("--pc");
    } else el.style.removeProperty("--pc");
    if (el.className !== c) el.className = c;
  }
}

// ---------- sugestões ----------
function computeSuggestions() {
  sugg = { list: [], best: new Set() };
  if (!placing) return;
  const list = periods();
  const len = placing.len;
  const cands = [];
  for (let n = Math.max(range.a, TODAY + 1); n <= range.b - len + 1; n++) {
    const st = stats(n, len, list);
    if (st.overlap || st.warn) continue;
    cands.push(st);
  }
  // As férias custam sempre os mesmos dias corridos: vale mais o maior descanso contínuo,
  // e, no empate, o que desperdiça menos folgas dentro do período.
  cands.sort((x, y) => y.total - x.total || x.lost - y.lost || x.start - y.start);
  const median = [...cands].sort((x, y) => x.total - y.total)[cands.length >> 1]?.total ?? 0;
  const cut = cands[Math.floor(cands.length * 0.05)]?.total ?? Infinity;
  for (const c of cands) if (c.total >= cut && c.total > median) sugg.best.add(c.start);
  for (const c of cands) {
    if (sugg.list.length >= 8) break;
    if (sugg.list.some((s) => c.a <= s.b + 3 && c.b >= s.a - 3)) continue;
    sugg.list.push(c);
  }
}

// ---------- barra lateral ----------
function setSeg(key) {
  document.querySelectorAll(`.seg[data-key="${key}"] button`).forEach((b) => b.classList.toggle("on", b.value === S[key]));
}

function workdaysBetween(a, b) {
  let k = 0;
  for (let n = a; n <= b; n++) if (!off(n)) k++;
  return k;
}

function renderSide() {
  const rem = remaining();
  $("#total").value = S.total;
  $("#len").max = Math.max(rem, 1);
  if (!placing) $("#len").value = S.len;
  $("#lock").textContent = placing ? "Soltar" : "Trancar";
  $("#lockBox").classList.toggle("on", !!placing);
  $("#lockBox").hidden = !placing && !rem;
  $("#remain").innerHTML = `saldo <b>${rem}</b>`;
  $("#clear").hidden = !S.periods.length;
  $("#cal").classList.toggle("placing", !!placing);

  const list = periods();
  const box = $("#periods");
  if (!list.length) box.innerHTML = "";
  else {
    const html = [];
    let tot = { total: 0, work: 0, gain: 0, lost: 0 };
    list.forEach((p, k) => {
      const st = stats(p.n, p.len, list.filter((q) => q !== p));
      for (const f in tot) tot[f] += st[f];
      if (k > 0) {
        const prev = list[k - 1];
        const gap = p.n - prev.e - 1;
        html.push(`<div class="gap" title="${gap} dias corridos entre os períodos"><span class="gt">↕ <b>${gap}</b> dias corridos entre os períodos · ${workdaysBetween(prev.e + 1, p.n - 1)} úteis</span><span class="gx">↔ <b>${gap}</b>d</span></div>`);
      }
      const title = `${fmt(p.n)} → ${fmt(p.e)} · ${p.len} dias · descanso de ${st.total} dias (+${st.gain} ganhos, −${st.lost} perdidos, ${st.work} úteis)`;
      html.push(`<div class="per" data-s="${p.s}" title="${title}" style="--pc:${COLORS[p.c % COLORS.length]}">
        <button class="x" title="Remover" data-del="${p.s}">×</button>
        <div class="cx">${fmt(p.n, false)}/${String(parts(p.n)[0]).slice(2)} → ${fmt(p.e, false)} · <b class="g">${st.total}</b> <span class="l">−${st.lost}</span></div>
        <div class="d1">${WD[dow(p.n)]} ${fmt(p.n)} → ${WD[dow(p.e)]} ${fmt(p.e)}</div>
        <div class="d2">${p.len} dias · descanso de <b>${st.total}</b> dias (${fmt(st.a, false)} → ${fmt(st.b, false)})</div>
        <div class="nums"><span class="g">+${st.gain} ganhos</span><span class="l">−${st.lost} perdidos</span><span>${st.work} úteis</span></div>
        ${st.warn ? `<div class="warn">⚠ ${st.warn}</div>` : ""}
      </div>`);
    });
    box.innerHTML = html.join("");
    const warns = [];
    if (S.vinculo === "privado") {
      if (list.length > 3) warns.push("CLT: no máximo 3 períodos");
      if (list.length > 1 && !list.some((p) => p.len >= 14)) warns.push("CLT: um dos períodos precisa ter 14 dias ou mais");
      if (list.length > 1 && list.some((p) => p.len < 5)) warns.push("CLT: nenhum período pode ter menos de 5 dias");
    } else if (list.length > 3) warns.push("Lei 8.112: até 3 etapas");
    $("#summary").innerHTML = list.length > 0
      ? `Descanso total <b>${tot.total}</b> dias com <b>${tot.work}</b> dias úteis · <span class="g">+${tot.gain}</span> <span class="l">−${tot.lost}</span>` +
        warns.map((w) => `<div class="warn">⚠ ${w}</div>`).join("")
      : "";
  }
  if (!list.length) $("#summary").innerHTML = "";

  const sg = $("#suggGrp");
  sg.hidden = !placing;
  if (placing) {
    $("#suggLen").textContent = placing.len;
    $("#sugg").innerHTML = sugg.list.length
      ? sugg.list.map((c) => `<div class="sg" data-n="${c.start}"><span>${WD[dow(c.start)]} ${fmt(c.start)}</span><span><b class="g">${c.total}</b> de descanso · +${c.gain} −${c.lost}</span></div>`).join("")
      : `<div class="empty">Sem opções livres no intervalo.</div>`;
  }
}

function refresh() {
  computeSuggestions();
  paint();
  renderSide();
  save();
}

// ---------- ações ----------
function startPlacing(len, orig) {
  len = Math.max(1, Math.min(90, Math.round(len) || 0));
  placing = { len, orig };
  refresh();
}
function stopPlacing(restore = true) {
  if (placing?.orig && restore) S.periods.push(placing.orig);
  placing = null;
  refresh();
}
function place(n) {
  const st = stats(n, placing.len);
  if (st.overlap) return;
  const usedC = new Set(S.periods.map((p) => p.c));
  let c = placing.orig?.c ?? 0;
  if (!placing.orig) while (usedC.has(c)) c++;
  S.periods.push({ s: ymd(n), len: placing.len, c });
  placing = null;
  S.len = remaining() || S.len;
  hideTip();
  refresh();
}

// ---------- dica flutuante ----------
const tip = $("#tip");
function hideTip() { tip.hidden = true; }
function showTip(n, ev) {
  const i = info(n);
  const [y, m, d] = parts(n);
  const lines = [`<div class="t">${WD[dow(n)]}, ${p2(d)}/${p2(m + 1)}/${y}</div>`];
  for (const it of i.items) {
    if (i.hol && it.lvl === "F") continue;
    const lvl = it.lvl === "F" && S.vinculo === "privado" ? "Ponto facultativo (depende do empregador)" : LEVELS[it.lvl];
    lines.push(`<div class="s">${lvl}: ${it.name}${it.lvl === "F" && !i.facOn && i.o !== "off" ? " · não contado" : ""}</div>`);
  }
  if (i.o === "off") lines.push(`<div class="s">Folga marcada por você</div>`);
  if (i.o === "work") lines.push(`<div class="s">Desconsiderado por você (dia de trabalho)</div>`);
  if (placing) {
    const st = stats(n, placing.len);
    if (st.overlap) lines.push(`<div class="l">Sobrepõe outro período</div>`);
    else {
      lines.push(`<div>${placing.len} dias: ${fmt(st.start, false)} → ${fmt(st.end, false)} (${WD[dow(st.end)]})</div>`,
        `<div>Descanso de <b>${st.total}</b> dias · ${fmt(st.a, false)} → ${fmt(st.b, false)}</div>`,
        `<div><span class="g">+${st.gain} ganhos</span> · <span class="l">−${st.lost} perdidos</span> · ${st.work} úteis</div>`);
      if (st.warn) lines.push(`<div class="warn">⚠ ${st.warn}</div>`);
    }
  }
  if (lines.length === 1) { hideTip(); return; }
  tip.innerHTML = lines.join("");
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 14, yy = ev.clientY + 16;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (yy + r.height > innerHeight - 8) yy = ev.clientY - r.height - 12;
  tip.style.left = `${x}px`;
  tip.style.top = `${yy}px`;
}

// ---------- eventos ----------
const inRange = (el) => (el && +el.dataset.n >= range.a && +el.dataset.n <= range.b ? el : null);

// No celular a barra flutuante é sempre usada; o botão abre e fecha os ajustes.
const mq = matchMedia("(max-width: 760px)");
function setMode() {
  const b = document.body.classList, mob = mq.matches;
  b.toggle("mob", mob);
  b.toggle("bar", S.bar || mob);
  const t = mob ? (b.contains("cfg") ? "Ocultar ajustes" : "Ajustes") : S.bar ? "Mostrar painel" : "Ocultar painel";
  $("#mode").title = t;
  $("#mode").setAttribute("aria-label", t);
}

function bind() {
  document.querySelectorAll(".seg").forEach((seg) => {
    const key = seg.dataset.key;
    setSeg(key);
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || S[key] === b.value) return;
      S[key] = b.value;
      if (key === "vinculo") { S.fac = b.value === "publico" ? "integrais" : "nao"; setSeg("fac"); }
      setSeg(key);
      rebuild();
      refresh();
    });
  });

  $("#uf").addEventListener("change", async (e) => {
    S.uf = e.target.value;
    S.ibge = 0;
    await loadUf();
    rebuild();
    refresh();
  });
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  $("#city").addEventListener("change", (e) => {
    const v = norm(e.target.value);
    const m = mun.find((x) => norm(x[1]) === v);
    if (!m) { e.target.value = city[1]; return; }
    city = m;
    S.ibge = m[0];
    e.target.value = m[1];
    rebuild();
    refresh();
  });
  $("#city").addEventListener("focus", (e) => e.target.select());

  const pickers = {};
  for (const id of ["from", "to"]) {
    pickers[id] = mountDatePicker($(`#${id}`), {
      value: S[id], min: MIN_DATE, max: MAX_DATE, label: id === "from" ? "Início do período" : "Fim do período",
      onChange: (v) => {
        S[id] = v;
        buildCalendar();
        pickers.from({ value: S.from });
        pickers.to({ value: S.to });
        rebuild();
        refresh();
      },
    });
  }

  setMode();
  mq.addEventListener("change", setMode);
  $("#mode").addEventListener("click", () => {
    if (mq.matches) document.body.classList.toggle("cfg");
    else { S.bar = !S.bar; save(); }
    setMode();
  });
  let shareT;
  $("#share").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}${location.search}#${encodeShare(S)}`;
    if (mq.matches && navigator.share) {
      try { await navigator.share({ title: "Férias · planejador", url }); } catch {}
      return;
    }
    try { await navigator.clipboard.writeText(url); }
    catch { prompt("Copie o link do plano:", url); return; }
    $("#share").classList.add("ok");
    $("#shareMsg").textContent = "link copiado";
    clearTimeout(shareT);
    shareT = setTimeout(() => { $("#share").classList.remove("ok"); $("#shareMsg").textContent = ""; }, 1800);
  });
  new ResizeObserver(([e]) => $("#cal").style.setProperty("--bar-h", `${e.borderBoxSize[0].blockSize}px`)).observe($("#side"));
  $("#total").addEventListener("change", (e) => {
    S.total = Math.max(1, Math.min(90, +e.target.value || 30));
    refresh();
  });
  $("#len").addEventListener("change", (e) => {
    S.len = Math.max(1, Math.min(90, +e.target.value || 1));
    if (placing) startPlacing(Math.min(S.len, remaining() + (placing.orig?.len || 0)), placing.orig);
    else refresh();
  });
  $("#len").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.target.blur(); if (!placing) $("#lock").click(); } });
  $("#lock").addEventListener("click", () => {
    if (placing) return stopPlacing();
    S.len = Math.max(1, Math.min(+$("#len").value || 1, remaining()));
    startPlacing(S.len);
  });
  $("#clear").addEventListener("click", () => {
    if (!S.periods.length || !confirm("Remover todos os períodos?")) return;
    S.periods = [];
    placing = null;
    S.len = S.total;
    refresh();
  });

  $("#periods").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      S.periods = S.periods.filter((p) => p.s !== del.dataset.del);
      if (!placing) S.len = remaining() || S.len;
      return refresh();
    }
    const card = e.target.closest(".per");
    if (card) cells.get(fromYmd(card.dataset.s))?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  $("#sugg").addEventListener("click", (e) => {
    const c = e.target.closest(".sg");
    if (!c) return;
    const n = +c.dataset.n;
    cells.get(n)?.scrollIntoView({ block: "center", behavior: "smooth" });
    place(n);
  });
  $("#sugg").addEventListener("mouseover", (e) => {
    const c = e.target.closest(".sg");
    if (!c || !placing) return;
    hover = +c.dataset.n;
    paint();
  });

  const cal = $("#cal");
  // Toque: o primeiro toque mostra a prévia, o segundo no mesmo dia confirma; segurar substitui o botão direito.
  let touch = false, tapped = null, press = null, pressed = false;
  const toggleOverride = (n, ev) => {
    const k = ymd(n);
    if (S.ovr[k]) delete S.ovr[k];
    else S.ovr[k] = info(n).off ? "work" : "off";
    infoCache.clear();
    refresh();
    showTip(n, ev);
  };
  const cancelPress = () => { clearTimeout(press?.t); press = null; };
  cal.addEventListener("pointerdown", (e) => {
    touch = e.pointerType !== "mouse";
    pressed = false;
    cancelPress();
    const el = touch && inRange(e.target.closest(".d[data-n]"));
    if (!el) return;
    press = {
      x: e.clientX, y: e.clientY,
      t: setTimeout(() => { pressed = true; tapped = null; navigator.vibrate?.(15); toggleOverride(+el.dataset.n, e); }, 550),
    };
  });
  cal.addEventListener("pointerup", cancelPress);
  cal.addEventListener("pointercancel", cancelPress);
  cal.addEventListener("pointermove", (e) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
  });
  addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" && !cal.contains(e.target) && !tip.contains(e.target)) { tapped = null; hideTip(); }
  });

  cal.addEventListener("mouseover", (e) => {
    if (touch) return;
    const el = inRange(e.target.closest(".d[data-n]"));
    if (!el) return;
    const n = +el.dataset.n;
    if (hover !== n) { hover = n; if (placing) paint(); }
    showTip(n, e);
  });
  cal.addEventListener("mousemove", (e) => {
    if (touch) return;
    const el = inRange(e.target.closest(".d[data-n]"));
    if (el && !tip.hidden) showTip(+el.dataset.n, e);
  });
  cal.addEventListener("mouseleave", () => { if (touch) return; hover = null; hideTip(); if (placing) paint(); });
  cal.addEventListener("click", (e) => {
    const el = inRange(e.target.closest(".d[data-n]"));
    if (!el) return;
    const n = +el.dataset.n;
    if (pressed) { pressed = false; return; }
    if (touch && tapped !== n) {
      tapped = n;
      hover = n;
      if (placing) paint();
      showTip(n, e);
      return;
    }
    tapped = null;
    if (placing) return place(n);
    const p = inPeriod(n);
    if (!p) return;
    const orig = S.periods.find((q) => q.s === p.s);
    S.periods = S.periods.filter((q) => q !== orig);
    hover = n;
    startPlacing(orig.len, orig);
    showTip(n, e);
  });
  cal.addEventListener("contextmenu", (e) => {
    const el = inRange(e.target.closest(".d[data-n]"));
    if (!el) return;
    e.preventDefault();
    if (!touch) toggleOverride(+el.dataset.n, e);
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && placing) { stopPlacing(); hideTip(); } });
}

// ---------- início ----------
async function init() {
  ufs = await getJSON("data/ufs.json");
  if (!ufs.some((u) => u.uf === S.uf)) S.uf = DEFAULTS.uf;
  $("#uf").innerHTML = ufs.map((u) => `<option value="${u.uf}" title="${u.nome}">${u.uf}</option>`).sort().join("");
  $("#uf").value = S.uf;
  await loadUf();
  buildCalendar();
  bind();
  rebuild();
  refresh();
  const mo = cells.get(Math.max(TODAY, range.a))?.closest(".mo");
  const cal = $("#cal");
  if (mo) cal.scrollTop = mo.offsetTop - parseFloat(getComputedStyle(cal).paddingTop);
}
init().catch((err) => {
  console.error(err);
  $("#cal").innerHTML = `<p style="padding:20px">Erro ao carregar dados: ${err.message}</p>`;
});
