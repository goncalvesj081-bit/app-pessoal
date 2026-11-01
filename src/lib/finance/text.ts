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
  return normalizeKey(description).split(" ").filter((w) => w.length > 1).slice(0, 3).join(" ");
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
