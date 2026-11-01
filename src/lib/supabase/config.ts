// Endereço e chave PÚBLICA do Supabase. Essa chave foi feita pra ficar no navegador:
// quem protege os dados são as regras de segurança (RLS) do banco.
// Se as variáveis de ambiente existirem (ex.: na Vercel), elas têm prioridade.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://clsyncrukbnlicooehae.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_0SSLMH0Uf6bwS8iXWzGhTg_hm3c3Wbh";
