import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Archive, Folder, Clock, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "R2 Arquivos — Catálogo de Clichês" },
      { name: "description", content: "Busque clientes, gavetas e pastas do arquivo de clichês R2 Flexo." },
    ],
  }),
  component: Index,
});

type Cliente = {
  id: string;
  codigo: number;
  nome: string;
  gaveta: string | null;
  pasta: string | null;
  obs: string | null;
};

type ConsultaRow = { cliente_id: string; consultado_em: string };

function Index() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Cliente | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["clientes", debounced],
    queryFn: async (): Promise<Cliente[]> => {
      let q = supabase.from("clientes").select("id,codigo,nome,gaveta,pasta,obs").order("nome").limit(50);
      const term = debounced;
      if (term) {
        // Se for número puro => busca por pasta exata + código
        if (/^\d+$/.test(term)) {
          q = q.or(`pasta.eq.${term},codigo.eq.${term}`);
        } else {
          q = q.ilike("nome", `%${term}%`);
        }
      } else {
        // sem busca: últimos consultados? mostrar nada para tela limpa
        return [];
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const ids = useMemo(() => results.map((c) => c.id), [results]);
  const { data: consultasByCliente = {} } = useQuery({
    queryKey: ["ultimas-consultas", ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase
        .from("consultas")
        .select("cliente_id,consultado_em")
        .in("cliente_id", ids)
        .order("consultado_em", { ascending: false });
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const row of (data ?? []) as ConsultaRow[]) {
        (map[row.cliente_id] ||= []).push(row.consultado_em);
      }
      // Manter só 5 por cliente
      for (const k of Object.keys(map)) map[k] = map[k].slice(0, 5);
      return map;
    },
  });

  const registrarConsulta = useMutation({
    mutationFn: async (cliente_id: string) => {
      const { error } = await supabase.from("consultas").insert({ cliente_id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ultimas-consultas"] }),
  });

  const handleOpen = (c: Cliente) => {
    if (openId === c.id) {
      setOpenId(null);
      return;
    }
    setOpenId(c.id);
    registrarConsulta.mutate(c.id);
  };

  const removerCliente = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente removido");
      qc.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
        <header className="flex items-center gap-3 pb-6">
          <img
            src="/r2-logo.png"
            width={48}
            height={48}
            alt="R2"
            className="h-12 w-12 rounded-2xl object-cover shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)]"
          />
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              R2 Flexo
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight leading-none">
              Arquivos
            </h1>
          </div>
          <Button
            onClick={() => setNewOpen(true)}
            className="gap-2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo cliente</span>
          </Button>
        </header>

        <div className="rounded-3xl bg-surface p-2 shadow-[0_1px_0_rgba(0,0,0,0.04),0_20px_40px_-30px_rgba(0,0,0,0.25)] ring-1 ring-border/60">
          <div className="flex items-center gap-2 px-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome do cliente ou nº da pasta…"
              className="border-0 bg-transparent text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="Limpar"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {debounced
            ? isFetching
              ? "Buscando…"
              : `${results.length} resultado${results.length === 1 ? "" : "s"}`
            : "Digite o nome ou o número da pasta para começar."}
        </p>

        <ul className="mt-4 space-y-3">
          {results.map((c) => {
            const isOpen = openId === c.id;
            const consultas = consultasByCliente[c.id] ?? [];
            const ultima = consultas[0];
            return (
              <li
                key={c.id}
                className="overflow-hidden rounded-3xl bg-surface shadow-[0_1px_0_rgba(0,0,0,0.04),0_20px_40px_-30px_rgba(0,0,0,0.25)] ring-1 ring-border/60 transition"
              >
                <button
                  onClick={() => handleOpen(c)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-muted/40"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-display text-base font-bold">
                    {c.gaveta?.replace(/^GAVETA\s*/i, "") ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold tracking-tight">{c.nome}</p>
                    <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Cód. {c.codigo}</span>
                      <span className="inline-flex items-center gap-1">
                        <Archive className="h-3 w-3" /> {c.gaveta ?? "—"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Folder className="h-3 w-3" /> Pasta {c.pasta ?? "—"}
                      </span>
                    </p>
                  </div>
                  {ultima && (
                    <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(ultima)}
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-border/60 bg-muted/30 px-5 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoBlock label="Gaveta" value={c.gaveta ?? "—"} />
                      <InfoBlock label="Pasta" value={c.pasta ?? "—"} />
                      <InfoBlock label="Código" value={String(c.codigo)} />
                      <InfoBlock label="Observação" value={c.obs?.trim() || "—"} />
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Últimas 5 consultas
                      </p>
                      {consultas.length === 0 ? (
                        <p className="mt-1 text-sm text-muted-foreground">Sem registros anteriores.</p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {consultas.map((d, i) => (
                            <li
                              key={d + i}
                              className="rounded-full bg-surface px-3 py-1 text-xs font-medium ring-1 ring-border"
                            >
                              {formatDateTime(d)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 rounded-full"
                        onClick={() => setEditTarget(c)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Remover "${c.nome}"?`)) removerCliente.mutate(c.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {debounced && !isFetching && results.length === 0 && (
          <div className="mt-10 rounded-3xl border border-dashed border-border bg-surface/50 p-8 text-center">
            <p className="font-display text-lg font-semibold">Nada encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Que tal cadastrar como novo cliente?
            </p>
            <Button
              onClick={() => setNewOpen(true)}
              className="mt-4 gap-2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
            >
              <Plus className="h-4 w-4" /> Cadastrar "{debounced}"
            </Button>
          </div>
        )}
      </div>

      <ClienteDialog
        open={newOpen}
        initial={null}
        defaultNome={results.length === 0 && /[a-zA-Z]/.test(debounced) ? debounced : ""}
        onClose={() => setNewOpen(false)}
        onSaved={() => {
          setNewOpen(false);
          qc.invalidateQueries({ queryKey: ["clientes"] });
        }}
      />
      <ClienteDialog
        open={!!editTarget}
        initial={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          qc.invalidateQueries({ queryKey: ["clientes"] });
        }}
      />
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ClienteDialog({
  open,
  initial,
  defaultNome = "",
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Cliente | null;
  defaultNome?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [gaveta, setGaveta] = useState("");
  const [pasta, setPasta] = useState("");
  const [codigo, setCodigo] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    setNome(initial?.nome ?? defaultNome);
    setGaveta(initial?.gaveta ?? "");
    setPasta(initial?.pasta ?? "");
    setCodigo(initial ? String(initial.codigo) : "");
    setObs(initial?.obs ?? "");
  }, [open, initial, defaultNome]);

  const save = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Nome é obrigatório");
      const payload = {
        nome: nome.trim().toUpperCase(),
        gaveta: gaveta.trim() ? gaveta.trim().toUpperCase() : null,
        pasta: pasta.trim() || null,
        obs: obs.trim() || null,
      };
      if (initial) {
        const { error } = await supabase.from("clientes").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        // gera próximo código
        let cod = codigo.trim() ? parseInt(codigo, 10) : NaN;
        if (!cod || Number.isNaN(cod)) {
          const { data } = await supabase
            .from("clientes")
            .select("codigo")
            .order("codigo", { ascending: false })
            .limit(1);
          cod = (data?.[0]?.codigo ?? 1000) + 1;
        }
        const { error } = await supabase.from("clientes").insert({ ...payload, codigo: cod });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(initial ? "Cliente atualizado" : "Cliente cadastrado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {initial ? "Editar cliente" : "Novo cliente"}
          </DialogTitle>
          <DialogDescription>
            Preencha o nome, a gaveta e o número da pasta.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Nome do cliente">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: PADARIA LORENA" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gaveta">
              <Input value={gaveta} onChange={(e) => setGaveta(e.target.value)} placeholder="Ex: GAVETA A" />
            </Field>
            <Field label="Pasta">
              <Input value={pasta} onChange={(e) => setPasta(e.target.value)} placeholder="Ex: 12" />
            </Field>
          </div>
          {!initial && (
            <Field label="Código (opcional)">
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Auto (próximo disponível)" inputMode="numeric" />
            </Field>
          )}
          <Field label="Observação (opcional)">
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
          >
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
