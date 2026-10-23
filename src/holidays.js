// Regras de feriados. Datas são representadas como número de dias desde 1970-01-01 (UTC).
export const DAY = 864e5;
export const num = (y, m, d) => Date.UTC(y, m, d) / DAY;
export const dow = (n) => (((n + 4) % 7) + 7) % 7; // 0 = domingo

export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return num(y, mo - 1, da);
}

// "MM-DD" fixa · "E+n" relativa à Páscoa · "SMM-DD" transferida para o domingo seguinte
export function resolve(rule, y) {
  if (rule[0] === "E") return easter(y) + Number(rule.slice(1));
  if (rule[0] === "S") {
    const n = resolve(rule.slice(1), y);
    return n + ((7 - dow(n)) % 7);
  }
  const [m, d] = rule.split("-").map(Number);
  return num(y, m - 1, d);
}

// [regra, nome, desde (ano)]
export const NACIONAIS = [
  ["01-01", "Confraternização Universal"],
  ["E-2", "Sexta-feira Santa"],
  ["04-21", "Tiradentes"],
  ["05-01", "Dia do Trabalho"],
  ["09-07", "Independência do Brasil"],
  ["10-12", "Nossa Senhora Aparecida"],
  ["11-02", "Finados"],
  ["11-15", "Proclamação da República"],
  ["11-20", "Zumbi e Consciência Negra", 2024],
  ["12-25", "Natal"],
];

// Pontos facultativos federais (portaria anual do MGI). half = meio expediente.
export const FACULTATIVOS = [
  ["E-48", "Carnaval (segunda)"],
  ["E-47", "Carnaval (terça)"],
  ["E-46", "Quarta-feira de Cinzas (até 14h)", true],
  ["E+60", "Corpus Christi"],
  ["12-24", "Véspera de Natal (após 14h)", true],
  ["12-31", "Véspera de Ano Novo (após 14h)", true],
];
export const SERVIDOR = ["10-28", "Dia do Servidor Público (a portaria pode transferir a data)"];

export const LEVELS = { N: "Feriado nacional", E: "Feriado estadual", M: "Feriado municipal", F: "Ponto facultativo" };

// Retorna Map<dia, [{name, lvl, half}]>, sem repetir o mesmo dia em níveis mais locais.
export function buildHolidayMap(y0, y1, { state = [], city = [], publico = false }) {
  const map = new Map();
  const add = (n, item) => {
    const list = map.get(n);
    if (!list) return void map.set(n, [item]);
    if (item.lvl !== "F" && list.some((i) => i.lvl !== "F")) return;
    list.push(item);
  };
  for (let y = y0; y <= y1; y++) {
    for (const [r, name, since] of NACIONAIS) if (!since || y >= since) add(resolve(r, y), { name, lvl: "N" });
    for (const [r, name] of state) add(resolve(r, y), { name, lvl: "E" });
    for (const [r, name] of city) add(resolve(r, y), { name, lvl: "M" });
    for (const [r, name, half] of FACULTATIVOS) add(resolve(r, y), { name, lvl: "F", half: !!half });
    if (publico) add(resolve(SERVIDOR[0], y), { name: SERVIDOR[1], lvl: "F" });
  }
  return map;
}
