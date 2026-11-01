// Tira acentos, números e símbolos: "UBER *TRIP 12/03" -> "uber trip"
export function normalizeKey(description: string) {
  return description
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(parcela|parc)\b.*$/, "")
    .replace(/\d+\s*\/\s*\d+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Chave usada pelas regras aprendidas: as 3 primeiras palavras
export function ruleKey(description: string) {
  const words = normalizeKey(description).split(" ").filter((w) => w.length > 1);
  // Pix/transferência: "pix enviado nome sobrenome" (4 palavras) para não juntar pessoas diferentes
  const n = /^(pix|transferencia|reembolso)$/.test(words[0] ?? "") ? 4 : 3;
  return words.slice(0, n).join(" ");
}

// "Parcela 2/10", "LOJA X 02/10", "Parc 3 de 12"
export function detectInstallment(text: string): [number, number] | null {
  const m =
    text.match(/parc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i) ??
    text.match(/(?:^|\s|-)(\d{1,2})\/(\d{1,2})\s*$/);
  if (!m) return null;
  const cur = Number(m[1]);
  const total = Number(m[2]);
  if (cur < 1 || total < 2 || cur > total || total > 48) return null;
  return [cur, total];
}

// Pagamento de fatura: não é gasto novo (o gasto já está nas compras do cartão)
const CARD_PAYMENT = [
  /pagamento\s+(de\s+)?fatura/i,
  /pgto\.?\s*(de\s+)?fatura/i,
  /pag(amento|to)?\.?\s*(de\s+)?cart(ao|ão)/i,
  /fatura\s+(do\s+)?cart(ao|ão)/i,
  /pagamento\s+recebido/i,
  /pagamento\s+efetuado/i,
  /pagamento\s+on\s*line/i,
];
export function isCardPayment(description: string) {
  return CARD_PAYMENT.some((r) => r.test(description));
}

/* ---------- Limpeza de descrições ---------- */

const SMALL = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "para", "por", "com"]);

function titleCase(s: string) {
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
  if (letters.length === 0 || upper / letters.length < 0.7) return s; // já está em formato normal
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/^([*(]?)(\p{L})/u, (_, p, c) => p + c.toUpperCase())))
    .join(" ");
}

// Remove CPF/CNPJ mascarado, dados de agência/conta, código do banco etc.
function stripNoise(s: string) {
  return s
    .replace(/\s*-?\s*[•*]{2,}[\d.•*\-/]*/g, "")
    .replace(/\b\d{2,3}\.\d{3}\.\d{3}[/-]?\d{0,4}-?\d{0,2}\b/g, "")
    .replace(/\bag[eê]ncia:?\s*\S+/gi, "")
    .replace(/\bconta:?\s*\S+/gi, "")
    .replace(/\(\d{3,4}\)/g, "")
    .replace(/\s+-\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const PREFIXES: [RegExp, string, boolean][] = [
  // [padrão, novo prefixo, manter só o 1º trecho (nome) depois do prefixo]
  [/^transfer[eê]ncia enviada pelo pix\s*-\s*/i, "Pix enviado · ", true],
  [/^transfer[eê]ncia recebida pelo pix\s*-\s*/i, "Pix recebido · ", true],
  [/^reembolso recebido pelo pix\s*-\s*/i, "Reembolso Pix · ", true],
  [/^pix enviado\s*-\s*/i, "Pix enviado · ", true],
  [/^pix recebido\s*-\s*/i, "Pix recebido · ", true],
  [/^transfer[eê]ncia enviada\s*-\s*/i, "Transferência enviada · ", true],
  [/^transfer[eê]ncia recebida\s*-\s*/i, "Transferência recebida · ", true],
  [/^pagamento de boleto efetuado\s*-\s*/i, "Boleto · ", false],
  [/^compra no d[eé]bito(\s+via\s+nupay)?\s*-\s*/i, "", false],
  [/^compra no cr[eé]dito\s*-\s*/i, "", false],
];

export function cleanDescription(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (PIX_CREDIT.test(s)) return "Pix no crédito (entrada do cartão)";
  for (const [re, prefix, firstOnly] of PREFIXES) {
    if (re.test(s)) {
      let rest = s.replace(re, "");
      if (firstOnly) rest = rest.split(/\s+-\s+/)[0];
      rest = titleCase(stripNoise(rest));
      return (prefix + rest).trim().replace(/·\s*$/, "").trim() || s;
    }
  }
  return titleCase(stripNoise(s)) || s;
}

/* ---------- Movimentos que não são gasto nem receita ---------- */

// Só a ENTRADA na conta. (Na fatura do cartão, "Pix no crédito" é o gasto real e conta normalmente.)
export const PIX_CREDIT = /valor adicionado na conta por cart[aã]o de cr[eé]dito/i;
const SAVINGS = /\b(aplica[cç][aã]o|resgate)\s+(rdb|cdb|em caixinha|da caixinha|caixinha)\b|dinheiro (guardado|resgatado)|\bcaixinha\b/i;

export type InternalReason = "pix_credito" | "caixinha" | "fatura";

export function internalReason(raw: string): InternalReason | null {
  if (PIX_CREDIT.test(raw)) return "pix_credito";
  if (SAVINGS.test(raw)) return "caixinha";
  if (isCardPayment(raw)) return "fatura";
  return null;
}

export const REASON_LABEL: Record<InternalReason, string> = {
  pix_credito: "Pix no crédito",
  caixinha: "Caixinha / investimento",
  fatura: "Pagamento de fatura",
};
