// Gera data/ufs.json e data/mun/{UF}.json a partir do dataset joaopbini/feriados-brasil (MIT).
// Uso: node scripts/build-data.mjs
// Regras geradas: "MM-DD" (data fixa), "E+n" (n dias após a Páscoa), "SMM-DD" (transferido p/ domingo seguinte).
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://raw.githubusercontent.com/joaopbini/feriados-brasil/master/dados";
const get = async (p) => {
  const r = await fetch(`${BASE}/${p}`);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.json();
};

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, mo - 1, da);
}
const parse = (s) => { const [d, m, y] = s.split("/").map(Number); return { d, m, y, t: Date.UTC(y, m - 1, d) }; };
const pad = (n) => String(n).padStart(2, "0");
const fixed = ({ d, m }) => `${pad(m)}-${pad(d)}`;
const offset = ({ t, y }) => Math.round((t - easter(y)) / 864e5);
const eRule = (n) => `E${n >= 0 ? "+" : ""}${n}`;

// Festas móveis reconhecidas pelo nome -> deslocamento em relação à Páscoa
const MOVEABLE = [
  [/segunda.*carnaval/i, -48],
  [/carnaval/i, -47],
  [/cinzas/i, -46],
  [/quinta.*santa|endoen/i, -3],
  [/paix[aã]o|sexta.*santa/i, -2],
  [/^p[aá]scoa/i, 0],
  [/ascens[aã]o/i, 39],
  [/corpus/i, 60],
  [/cora[cç][aã]o de jesus/i, 68],
];

const nat = new Set((await get("feriados/nacional/json/2026.json")).map((h) => h.data.slice(0, 5)));
const years = {};
for (const t of ["estadual", "municipal"])
  for (const y of [2024, 2025, 2026]) years[`${t}${y}`] = await get(`feriados/${t}/json/${y}.json`);
const estados = await get("localizacao/estados/estados.json");
const municipios = await get("localizacao/municipios/municipios.json");

function ruleFor(h, prev) {
  const p = parse(h.data);
  for (const [re, off] of MOVEABLE) if (re.test(h.nome)) return eRule(off);
  if (/divino|pentecost/i.test(h.nome)) {
    const old = prev.find((o) => o.nome === h.nome);
    return eRule(old ? offset(parse(old.data)) : 50);
  }
  if (prev.some((o) => o.data.slice(0, 5) === h.data.slice(0, 5))) return fixed(p);
  const off = offset(p);
  const e25 = easter(2025);
  if (prev.some((o) => parse(o.data).t === e25 + off * 864e5)) return eRule(off);
  return fixed(p);
}

const clean = (s) => (/^feriado municipal$/i.test(s) ? "Feriado municipal" : s.trim());

// ---- Estados
const STATE_FIX = {
  AC: { "Dia do Católico": "01-20" },
  ES: { "Aniversário do Estado": ["E+8", "Nossa Senhora da Penha (Data Magna)"] }, // Lei 11.010/2019
  SC: { "Dia de Santa Catarina": ["S08-11", "Data Magna de SC (domingo seguinte)"] }, // Lei 18.531/2022
};
const ufs = estados
  .map((e) => {
    const cur = years.estadual2026.filter((h) => h.uf === e.uf);
    const prev = years.estadual2025.filter((h) => h.uf === e.uf);
    const h = [];
    for (const x of cur) {
      if (nat.has(x.data.slice(0, 5)) && !/carnaval/i.test(x.nome)) continue;
      const fix = STATE_FIX[e.uf]?.[x.nome];
      if (Array.isArray(fix)) h.push(fix);
      else h.push([fix ?? ruleFor(x, prev), x.nome]);
    }
    return { uf: e.uf, nome: e.nome, h };
  })
  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

// ---- Municípios
const ufByCode = Object.fromEntries(estados.map((e) => [e.codigo_uf, e.uf]));
const group = (arr) => {
  const m = new Map();
  for (const h of arr) (m.get(h.codigo_ibge) ?? m.set(h.codigo_ibge, []).get(h.codigo_ibge)).push(h);
  return m;
};
const m26 = group(years.municipal2026), m25 = group(years.municipal2025);
const stateRules = Object.fromEntries(ufs.map((u) => [u.uf, new Set(u.h.map((r) => r[0]))]));

await mkdir("public/data/mun", { recursive: true });
const perUf = {};
for (const mu of municipios) {
  const uf = ufByCode[mu.codigo_uf];
  const seen = new Set();
  const h = [];
  for (const x of m26.get(mu.codigo_ibge) ?? []) {
    const r = ruleFor(x, m25.get(mu.codigo_ibge) ?? []);
    if (r === "E-2" || (!r.startsWith("E") && nat.has(`${r.slice(3)}/${r.slice(0, 2)}`))) continue;
    if (stateRules[uf]?.has(r) || seen.has(r)) continue;
    seen.add(r);
    h.push([r, clean(x.nome)]);
  }
  (perUf[uf] ??= []).push([mu.codigo_ibge, mu.nome, mu.capital ? 1 : 0, h]);
}
for (const [uf, list] of Object.entries(perUf)) {
  list.sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  await writeFile(`public/data/mun/${uf}.json`, JSON.stringify(list));
}
await writeFile("public/data/ufs.json", JSON.stringify(ufs));
console.log(`ufs: ${ufs.length}, municípios: ${municipios.length}`);
