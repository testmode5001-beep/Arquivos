import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Entrar — R2 Arquivos" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Toaster richColors position="top-center" />
      <div className="w-full max-w-sm rounded-3xl bg-surface p-8 shadow-[0_1px_0_rgba(0,0,0,0.04),0_30px_60px_-30px_rgba(0,0,0,0.3)] ring-1 ring-border/60">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Design Hub
          </p>
          <h1 className="font-display text-2xl font-bold leading-none tracking-tight mt-1">Arquivos</h1>
        </div>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              E-mail
            </Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Senha
            </Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
          >
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Acesso restrito à equipe R2 Flexo.
        </p>
      </div>
    </div>
  );
}
