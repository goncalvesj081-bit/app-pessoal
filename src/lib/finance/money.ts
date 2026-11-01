// Converte textos como "1.234,56", "-50,00", "R$ 10,90", "150,00C", "12.5" em número.
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/ /g, " ");
  if (!s) return null;

  let sign = 1;
  // Sufixo C/D (crédito/débito), comum no Sicoob e outros
  const cd = s.match(/\s*([CD])$/i);
  if (cd) {
    if (cd[1].toUpperCase() === "D") sign = -1;
    s = s.slice(0, cd.index).trim();
  }
  if (/^\(.*\)$/.test(s)) {
    sign *= -1;
    s = s.slice(1, -1);
  }
  s = s.replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (s.startsWith("-") || s.startsWith("−")) {
    sign *= -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.startsWith("R$")) s = s.slice(2);
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // O separador que aparece por último é o decimal
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1 && /^\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.234.567" = milhar
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(sign * n * 100) / 100;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatBRL(n: number) {
  return brl.format(n);
}

// "dd/mm/aaaa", "dd-mm-aaaa", "aaaa-mm-dd", "aaaammdd" -> "aaaa-mm-dd"
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return valid(m[3].length === 2 ? "20" + m[3] : m[3], m[2].padStart(2, "0"), m[1].padStart(2, "0"));
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return valid(m[1], m[2], m[3]);
  return null;
}

function valid(y: string, mo: string, d: string) {
  const date = new Date(`${y}-${mo}-${d}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d)) return null;
  return `${y}-${mo}-${d}`;
}
