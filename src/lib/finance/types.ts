export type AccountKind = "checking" | "credit_card" | "wallet";
export type Bank = "sicoob" | "mercadopago" | "nubank" | "inter" | "outro";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  bank: Bank;
  initial_balance: number;
  closing_day: number | null;
  due_day: number | null;
  archived: boolean;
};

export type Category = { id: string; name: string; kind: "expense" | "income"; color: string };

export type TxKind = "normal" | "card_payment" | "transfer";

export type Transaction = {
  id: string;
  account_id: string;
  date: string;
  description: string;
  amount: number;
  category_id: string | null;
  kind: TxKind;
  bill_month: string | null;
  installment_current: number | null;
  installment_total: number | null;
  import_id: string | null;
  raw_description?: string | null;
  notes?: string | null;
};

export const BANKS: Record<Bank, string> = {
  sicoob: "Sicoob",
  mercadopago: "Mercado Pago",
  nubank: "Nubank",
  inter: "Inter",
  outro: "Outro",
};

export const KINDS: Record<AccountKind, string> = {
  checking: "Conta",
  credit_card: "Cartão de crédito",
  wallet: "Dinheiro / carteira",
};

export const TX_KINDS: Record<TxKind, string> = {
  normal: "Normal",
  card_payment: "Pagamento de fatura",
  transfer: "Transferência entre contas",
};
