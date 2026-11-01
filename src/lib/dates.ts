// Datas no fuso de Brasília, no formato "AAAA-MM-DD" (o mesmo do banco).
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function formatDueDate(iso: string) {
  const today = todayISO();
  if (iso === today) return "Hoje";
  const t = new Date(today + "T12:00:00");
  const d = new Date(iso + "T12:00:00");
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}
