import { describe, expect, it } from "vitest";
import { parseStatement, withExternalIds, decodeFile } from "../parse";
import { parseAmount, parseDate } from "../money";
import { billMonthFor } from "../billing";
import { suggestCategory } from "../categorize";
import { detectInstallment, ruleKey } from "../text";

describe("valores e datas", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["-50,00", -50],
    ["R$ 10,90", 10.9],
    ["-R$ 10,90", -10.9],
    ["150,00C", 150],
    ["150,00 D", -150],
    ["-12.5", -12.5],
    ["1,234.56", 1234.56],
    ["0", 0],
    ["abc", null],
  ])("%s", (raw, expected) => expect(parseAmount(raw)).toBe(expected));

  it("datas", () => {
    expect(parseDate("05/11/2026")).toBe("2026-11-05");
    expect(parseDate("2026-11-05")).toBe("2026-11-05");
    expect(parseDate("20261105120000[-3:BRT]")).toBe("2026-11-05");
    expect(parseDate("05-11-2026")).toBe("2026-11-05");
    expect(parseDate("31/02/2026")).toBeNull();
  });
});

describe("OFX", () => {
  const ofx = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261103000000[-3:BRT]
<TRNAMT>-45.90
<FITID>abc123
<MEMO>COMPRA CARTAO - IFOOD
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261105
<TRNAMT>3500.00
<FITID>abc124
<MEMO>PIX RECEBIDO SALARIO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261110
<TRNAMT>-820,15
<FITID>abc125
<MEMO>PAGAMENTO DE FATURA NUBANK
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

  it("lê lançamentos, ids e pagamento de fatura", () => {
    const r = parseStatement(ofx, "extrato.ofx");
    expect(r.format).toBe("OFX");
    expect(r.isCard).toBe(false);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ date: "2026-11-03", amount: -45.9, externalId: "ofx:abc123" });
    expect(r.rows[2]).toMatchObject({ amount: -820.15, kind: "card_payment" });
  });

  it("detecta OFX de cartão", () => {
    const card = ofx.replace("<BANKMSGSRSV1>", "<CREDITCARDMSGSRSV1>");
    expect(parseStatement(card).isCard).toBe(true);
  });
});

describe("CSV dos bancos", () => {
  it("Nubank conta", () => {
    const csv = `Data,Valor,Identificador,Descrição
01/11/2026,-25.50,6727a1b2-0001,Compra no débito - PADARIA DO ZE
02/11/2026,1500.00,6727a1b2-0002,Transferência recebida pelo Pix - FULANO
03/11/2026,-980.40,6727a1b2-0003,Pagamento de fatura`;
    const r = parseStatement(csv);
    expect(r.format).toBe("Nubank (conta)");
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ date: "2026-11-01", amount: -25.5, externalId: "csv:6727a1b2-0001" });
    expect(r.rows[2].kind).toBe("card_payment");
  });

  it("Nubank cartão (compras positivas viram saída)", () => {
    const csv = `date,title,amount
2026-10-12,Uber *Trip,23.45
2026-10-14,Magazine Luiza - Parcela 2/10,150.00
2026-10-20,Pagamento recebido,-900.00`;
    const r = parseStatement(csv);
    expect(r.format).toBe("Nubank (cartão)");
    expect(r.isCard).toBe(true);
    expect(r.rows[0].amount).toBe(-23.45);
    expect(r.rows[1].installment).toEqual([2, 10]);
    expect(r.rows[2]).toMatchObject({ amount: 900, kind: "card_payment" });
  });

  it("Inter conta (com resumo antes do cabeçalho)", () => {
    const csv = `Extrato Conta Corrente
Conta ;12345678
Período ;01/11/2026 a 30/11/2026
Saldo ;1.000,00

Data Lançamento;Histórico;Descrição;Valor;Saldo
04/11/2026;Pix enviado;Fulano de Tal;-1.200,00;-200,00
05/11/2026;Pix recebido;Ciclano;300,50;100,50`;
    const r = parseStatement(csv);
    expect(r.format).toBe("Inter (conta)");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ amount: -1200, description: "Pix enviado - Fulano de Tal" });
  });

  it("Inter cartão", () => {
    const csv = `"Data","Lançamento","Categoria","Tipo","Valor"
"10/10/2026","POSTO SHELL","TRANSPORTE","Compra à vista","R$ 200,00"
"11/10/2026","LOJA X","COMPRAS","Parcela 3/6","R$ 1.050,00"
"15/10/2026","PAGAMENTO ON LINE","OUTROS","Pagamento","-R$ 500,00"`;
    const r = parseStatement(csv);
    expect(r.format).toBe("Inter (cartão)");
    expect(r.rows[0].amount).toBe(-200);
    expect(r.rows[1]).toMatchObject({ amount: -1050, installment: [3, 6] });
    expect(r.rows[2]).toMatchObject({ amount: 500, kind: "card_payment" });
  });

  it("Mercado Pago", () => {
    const csv = `INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE
100,00;500,00;-150,00;450,00

RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
01-11-2026;Transferência Pix recebida Fulano;98765;500,00;600,00
02-11-2026;Pagamento Supermercado Bom Preço;98766;-150,00;450,00`;
    const r = parseStatement(csv);
    expect(r.format).toBe("Mercado Pago (conta)");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toMatchObject({ date: "2026-11-02", amount: -150, externalId: "csv:98766" });
  });

  it("Sicoob / genérico com C e D", () => {
    const csv = `Data;Documento;Histórico;Valor
03/11/2026;000123;DEB.CONV.ENERGIA;210,33D
04/11/2026;000124;CRED.PIX FULANO;80,00C
04/11/2026;;SALDO DO DIA;1.000,00C`;
    const r = parseStatement(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ amount: -210.33, description: "DEB.CONV.ENERGIA" });
    expect(r.rows[1].amount).toBe(80);
  });

  it("arquivo sem lançamentos dá erro claro", () => {
    expect(() => parseStatement("a,b,c\n1,2,3")).toThrow(/colunas/);
  });

  it("lê arquivo em Windows-1252", () => {
    const bytes = new Uint8Array([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f]); // "Descrição"
    expect(decodeFile(bytes.buffer)).toBe("Descrição");
  });
});

describe("duplicados", () => {
  it("compras iguais no mesmo dia ganham ids diferentes, e o mesmo arquivo gera os mesmos ids", async () => {
    const rows = parseStatement(`date,title,amount
2026-10-12,Cafe,5.00
2026-10-12,Cafe,5.00`).rows;
    const a = await withExternalIds(rows);
    const b = await withExternalIds(rows);
    expect(a[0].externalId).not.toBe(a[1].externalId);
    expect(a.map((x) => x.externalId)).toEqual(b.map((x) => x.externalId));
  });
});

describe("parcelas, fatura e categorias", () => {
  it("parcelas", () => {
    expect(detectInstallment("LOJA 02/10")).toEqual([2, 10]);
    expect(detectInstallment("Parcela 3 de 12")).toEqual([3, 12]);
    expect(detectInstallment("COMPRA 12/03/2026")).toBeNull();
  });

  it("mês da fatura", () => {
    // fecha dia 8, vence dia 15
    expect(billMonthFor("2026-11-05", 8, 15)).toBe("2026-11-01");
    expect(billMonthFor("2026-11-08", 8, 15)).toBe("2026-12-01");
    // fecha dia 28, vence dia 5 (mês seguinte)
    expect(billMonthFor("2026-11-10", 28, 5)).toBe("2026-12-01");
    expect(billMonthFor("2026-12-29", 28, 5)).toBe("2027-02-01");
  });

  const cats = [
    { id: "t", name: "Transporte", kind: "expense" as const },
    { id: "a", name: "Alimentação", kind: "expense" as const },
    { id: "s", name: "Salário", kind: "income" as const },
    { id: "m", name: "Mercado", kind: "expense" as const },
  ];

  it("palavras-chave padrão", () => {
    expect(suggestCategory("UBER *TRIP", -20, [], cats)).toBe("t");
    expect(suggestCategory("IFOOD *RESTAURANTE", -50, [], cats)).toBe("a");
    expect(suggestCategory("CRED SALARIO EMPRESA", 3000, [], cats)).toBe("s");
    expect(suggestCategory("XPTO LTDA", -10, [], cats)).toBeNull();
  });

  it("regra aprendida ganha da palavra-chave", () => {
    const rules = [{ pattern: ruleKey("UBER EATS 123"), category_id: "a" }];
    expect(suggestCategory("Uber Eats *Pedido", -30, rules, cats)).toBe("a");
    expect(suggestCategory("UBER *TRIP", -20, rules, cats)).toBe("t");
  });
});
