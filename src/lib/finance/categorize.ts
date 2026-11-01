import { normalizeKey, ruleKey } from "./text";

export type CategoryLite = { id: string; name: string; kind: "expense" | "income" };
export type Rule = { pattern: string; category_id: string };

// Palavras-chave iniciais (antes de o sistema aprender com você)
const BUILTIN: [RegExp, string][] = [
  [/\b(uber|99 ?(app|pop|taxi)?|cabify|posto|combust|shell|ipiranga|petrobras|br mania|estaciona|sem parar|conectcar|veloe|pedagio)\b/, "Transporte"],
  [/\b(ifood|rappi|restaurante|lanchonete|padaria|pizzaria|burger|mcdonald|bk |subway|cafe|bar |acai|sorvet|churrasc|delivery|ze delivery)\b/, "Alimentação"],
  [/\b(mercado|supermerc|atacad|assai|carrefour|extra|pao de acucar|hortifruti|sacolao|acougue|dia brasil)\b/, "Mercado"],
  [/\b(farmacia|drogaria|droga|raia|pacheco|panvel|pague menos|hospital|clinica|laborat|medic|odonto|dentista|unimed|hapvida|amil)\b/, "Saúde"],
  [/\b(netflix|spotify|disney|hbo|max|prime video|amazon prime|youtube|deezer|globoplay|apple com|google one|icloud|chatgpt|openai|claude|anthropic|canva|microsoft)\b/, "Assinaturas"],
  [/\b(energia|enel|cemig|copel|celesc|light|cpfl|equatorial|neoenergia|coelba|sabesp|sanepar|copasa|cedae|agua|esgoto|gas|comgas|vivo|claro|tim|oi |internet|telefon)\b/, "Contas da casa"],
  [/\b(aluguel|condominio|iptu|imobiliaria)\b/, "Moradia"],
  [/\b(iof|tarifa|anuidade|juros|multa|imposto|darf|ipva|licenciamento|detran|cesta de servicos)\b/, "Impostos e taxas"],
  [/\b(cinema|ingresso|show|steam|playstation|xbox|nintendo|viagem|hotel|airbnb|booking|decolar)\b/, "Lazer"],
  [/\b(escola|faculdade|curso|udemy|alura|livraria|livro)\b/, "Educação"],
  [/\b(amazon|mercado ?livre|mercadolivre|shopee|aliexpress|shein|magalu|magazine|americanas|casas bahia|renner|riachuelo|c a|zara|centauro|netshoes)\b/, "Compras"],
];
const BUILTIN_INCOME: [RegExp, string][] = [
  [/\b(salario|folha|pagamento de salario|proventos|remuneracao)\b/, "Salário"],
  [/\b(rendimento|rend pago|juros sobre|dividendo|cdb|poupanca)\b/, "Rendimentos"],
  [/\b(pix|ted|doc|transf)\b/, "Pix e transferências"],
];

export function suggestCategory(description: string, amount: number, rules: Rule[], categories: CategoryLite[]): string | null {
  // 1) Regras que você ensinou (a mais específica ganha)
  const key = ruleKey(description);
  const match = rules
    .filter((r) => key === r.pattern || key.startsWith(r.pattern + " "))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (match) return match.category_id;

  // 2) Palavras-chave padrão
  const text = " " + normalizeKey(description) + " ";
  const list = amount > 0 ? BUILTIN_INCOME : BUILTIN;
  const kind = amount > 0 ? "income" : "expense";
  for (const [re, name] of list) {
    if (re.test(text)) {
      const cat = categories.find((c) => c.name === name && c.kind === kind);
      if (cat) return cat.id;
    }
  }
  return null;
}
