"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

export async function authenticate(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const mode = formData.get("mode");

  if (!email || password.length < 6) {
    return { error: "Informe e-mail e uma senha com pelo menos 6 caracteres." };
  }

  const supabase = await createClient();

  if (mode === "signup") {
    const origin = (await headers()).get("origin") ?? "";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) return { error: traduzir(error.message) };
    if (!data.session) {
      return { message: "Conta criada! Confirme pelo link que enviamos ao seu e-mail." };
    }
    redirect("/");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: traduzir(error.message) };
  redirect("/");
}

function traduzir(msg: string) {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (msg.includes("already registered")) return "Esse e-mail já tem conta. Use Entrar.";
  return msg;
}
