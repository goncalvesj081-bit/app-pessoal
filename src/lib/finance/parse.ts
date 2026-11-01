// Lê extratos e faturas (OFX e CSV) e devolve uma lista padronizada de lançamentos.
import { parseCSV } from "./csv";
import { parseAmount, parseDate } from "./money";
import { detectInstallment, isCardPayment, normalizeKey } from "./text";

export type ParsedRow = {
  date: string; // aaaa-mm-dd
  description: string;
  amount: number; // < 0 saída, > 0 entrada
  externalId: string | null; // id do banco, quando existe
  installment: [number, number] | null;
  kind: "normal" | "card_payment";
};

export type ParseResult = {
  format: string; // ex.: "OFX", "Nubank (cartão)"
  isCard: boolean | null; // null = não dá pra saber pelo arquivo
  rows: ParsedRow[];
};

export class ParseError extends Error {}

// Lê o arquivo respeitando a codificação (muitos bancos usam Windows-1252)
export function decodeFile(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

export function parseStatement(text: string, filename = ""): ParseResult {
  const isOfx = /<OFX>/i.test(text) || /^OFXHEADER/m.test(text) || /\.ofx$/i.test(filename);
  const result = isOfx ? parseOFX(text) : parseCsvStatement(text);
  result.rows = result.rows.map(finish);
  if (result.rows.length === 0) throw new ParseError("Não encontrei nenhum lançamento nesse arquivo.");
  return result;
}

function finish(row: ParsedRow): ParsedRow {
  const description = row.description.replace(/\s+/g, " ").trim().slice(0, 300) || "(sem descrição)";
  return {
    ...row,
    description,
    installment: row.installment ?? detectInstallment(description),
    kind: isCardPayment(description) ? "card_payment" : row.kind,
  };
}

/* ---------------- OFX ---------------- */

function ofxTag(block: string, tag: string) {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
}

export function parseOFX(text: string): ParseResult {
  const isCard = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(text);
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const rows: ParsedRow[] = [];
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const date = parseDate(ofxTag(block, "DTPOSTED"));
    const amount = parseAmount(ofxTag(block, "TRNAMT"));
    if (!date || amount === null || amount === 0) continue;
    const memo = ofxTag(block, "MEMO");
    const name = ofxTag(block, "NAME");
    const description = memo && name && !memo.includes(name) ? `${name} ${memo}` : memo || name;
    const fitid = ofxTag(block, "FITID");
    rows.push({
      date,
      description: decodeEntities(description),
      amount,
      externalId: fitid ? `ofx:${fitid}` : null,
      installment: null,
      kind: "normal",
    });
  }
  return { format: isCard ? "OFX (cartão)" : "OFX", isCard, rows };
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

/* ---------------- CSV ---------------- */

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

type Columns = { date: number; desc: number[]; amount: number; id?: number; type?: number; category?: number };

function findCol(header: string[], tests: RegExp[], exclude: number[] = []) {
  for (const t of tests) {
    const i = header.findIndex((h, idx) => !exclude.includes(idx) && t.test(h));
    if (i > -1) return i;
  }
  return -1;
}

function guessColumns(header: string[]): Columns | null {
  const date = findCol(header, [/^data( lancamento| movimento| da compra| transacao)?$/, /^date$/, /release date/, /^data/, /date/]);
  const amount = findCol(header, [/^valor( r)?$/, /^amount$/, /transaction net amount/, /^valor/, /amount/], [date]);
  if (date < 0 || amount < 0) return null;
  const used = [date, amount];
  const desc: number[] = [];
  for (const re of [/^historico$/, /^lancamento$/, /^title$/, /^descricao$/, /transaction type/, /^estabelecimento$/, /descri|hist|lanc|title|memo/]) {
    const i = findCol(header, [re], [...used, ...desc]);
    if (i > -1 && !/saldo|balance/.test(header[i])) desc.push(i);
  }
  const id = findCol(header, [/^identificador$/, /reference id/, /^documento$/, /^id$/], [...used, ...desc]);
  const type = findCol(header, [/^tipo$/], [...used, ...desc]);
  const category = findCol(header, [/^categoria$/, /^category$/], [...used, ...desc]);
  if (desc.length === 0) return null;
  return { date, amount, desc: desc.slice(0, 2), id: id > -1 ? id : undefined, type: type > -1 ? type : undefined, category: category > -1 ? category : undefined };
}

export function parseCsvStatement(text: string): ParseResult {
  const table = parseCSV(text);
  // Procura a linha de cabeçalho (alguns bancos colocam um resumo antes)
  let headerIdx = -1;
  let cols: Columns | null = null;
  for (let i = 0; i < Math.min(table.length, 30); i++) {
    const c = guessColumns(table[i].map(norm));
    if (c) {
      headerIdx = i;
      cols = c;
      break;
    }
  }
  if (!cols) throw new ParseError("Não reconheci as colunas do arquivo (preciso de data, descrição e valor).");

  const header = table[headerIdx].map(norm);
  const has = (...names: string[]) => names.every((n) => header.includes(n));

  // Formatos conhecidos
  let format = "CSV";
  let isCard: boolean | null = null;
  let flipSign = false; // faturas costumam mostrar compras como valor positivo

  if (has("date", "title", "amount")) {
    format = "Nubank (cartão)";
    isCard = true;
    flipSign = true;
  } else if (has("data", "valor", "identificador", "descricao")) {
    format = "Nubank (conta)";
    isCard = false;
  } else if (header.includes("release date") && header.some((h) => h.includes("transaction net amount"))) {
    format = "Mercado Pago (conta)";
    isCard = false;
  } else if (has("data", "lancamento", "categoria", "tipo", "valor")) {
    format = "Inter (cartão)";
    isCard = true;
    flipSign = true;
  } else if (has("data lancamento", "historico", "descricao", "valor")) {
    format = "Inter (conta)";
    isCard = false;
  }

  const rows: ParsedRow[] = [];
  for (const line of table.slice(headerIdx + 1)) {
    const date = parseDate(line[cols.date] ?? "");
    let amount = parseAmount(line[cols.amount] ?? "");
    if (!date || amount === null || amount === 0) continue; // linhas de saldo, totais etc.
    if (flipSign) amount = -amount;

    const parts = cols.desc.map((i) => line[i] ?? "").filter(Boolean);
    let description = parts.filter((p, i) => parts.findIndex((q) => norm(q) === norm(p)) === i).join(" - ");
    if (/^(saldo|sdo|total|s a l d o)\b/i.test(norm(description))) continue; // linhas de saldo/total
    const typeText = cols.type !== undefined ? line[cols.type] ?? "" : "";
    if (/parcela/i.test(typeText) && !detectInstallment(description)) description += ` (${typeText})`;

    rows.push({
      date,
      description,
      amount,
      externalId: cols.id !== undefined && line[cols.id] ? `csv:${line[cols.id]}` : null,
      installment: null,
      kind: "normal",
    });
  }
  return { format, isCard, rows };
}

/* -------- Identificador para evitar duplicados -------- */

// Lançamentos sem id do banco ganham um id calculado (data + valor + descrição + ordem).
// Assim, importar o mesmo arquivo duas vezes não duplica nada.
export async function withExternalIds(rows: ParsedRow[]): Promise<(ParsedRow & { externalId: string })[]> {
  const seen = new Map<string, number>();
  const out = [];
  for (const r of rows) {
    if (r.externalId) {
      out.push({ ...r, externalId: r.externalId });
      continue;
    }
    const base = `${r.date}|${r.amount.toFixed(2)}|${normalizeKey(r.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ ...r, externalId: `h:${await sha256(`${base}|${n}`)}` });
  }
  return out;
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}
