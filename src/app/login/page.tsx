"use client";

import { useActionState, useState } from "react";
import { authenticate } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [state, action, pending] = useActionState(authenticate, undefined);

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Meu Sistema</h1>
        <p className="text-sm text-muted mt-1">
          {mode === "login" ? "Entre para ver seu dia." : "Crie sua conta."}
        </p>

        <form action={action} className="mt-6 space-y-3">
          <input type="hidden" name="mode" value={mode} />
          <input name="email" type="email" required placeholder="seu@email.com" className="input" autoComplete="email" />
          <input
            name="password"
            type="password"
            required
            minLength={6}
            placeholder="Senha"
            className="input"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          {state?.message && <p className="text-sm text-success">{state.message}</p>}
          <button disabled={pending} className="btn-primary w-full">
            {pending ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 text-sm text-muted hover:text-fg"
        >
          {mode === "login" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
        </button>
      </div>
    </main>
  );
}
