// Em qual fatura cai uma compra no cartão: depois do dia de fechamento, vai pra fatura seguinte.
// Retorna o 1º dia do mês de vencimento da fatura ("aaaa-mm-01").
export function billMonthFor(date: string, closingDay: number | null, dueDay: number | null): string {
  const [y, m, d] = date.split("-").map(Number);
  let month = m; // mês do fechamento
  let year = y;
  if (closingDay && d >= closingDay) month += 1;
  // Se vence antes (ou no) dia do fechamento, o vencimento é no mês seguinte ao fechamento
  if (!dueDay || !closingDay || dueDay <= closingDay) month += 1;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthLabel(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
