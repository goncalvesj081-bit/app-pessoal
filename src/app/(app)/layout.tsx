import { LogOut } from "lucide-react";
import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-border md:bg-surface md:p-4 md:sticky md:top-0 md:h-screen">
        <div className="mb-6 px-3 text-lg font-semibold tracking-tight">Meu Sistema</div>
        <Nav variant="side" />
        <form action="/auth/sair" method="post" className="mt-auto">
          <p className="truncate px-3 pb-2 text-xs text-muted">{user?.email}</p>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">
            <LogOut size={18} /> Sair
          </button>
        </form>
      </aside>

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>

      <Nav variant="bottom" />
    </div>
  );
}
