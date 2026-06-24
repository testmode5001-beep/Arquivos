import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Archive,
  Folder,
  Clock,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  Download,
  LogOut,
  Filter,
} from "lucide-react";
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

const TWO_YEARS_MS = 1000 * 60 * 60 * 24 * 365 * 2;

function Index() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [gavetaFilter, setGavetaFilter] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Cliente | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Lista de gavetas distintas (para o filtro)
  const { data: gavetas = [] } = useQuery({
    queryKey: ["gavetas-distintas"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from("clientes").select("gaveta").not("gaveta", "is", null);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of data ?? []) {
        if (r.gaveta && !/bacalhau/i.test(r.gaveta)) set.add(r.gaveta);
      }
      return Array.from(set).sort();
    },
  });

  // Recentes (top 8 distintos por última consulta)
  const { data: recentes = [] } = useQuery({
    queryKey: ["recentes"],
    queryFn: async (): Promise<Cliente[]> => {
      const { data: cons, error } = await supabase
        .from("consultas")
        .select("cliente_id,consultado_em")
        .order("consultado_em", { ascending: false })
        .limit(80);
      if (error) throw error;
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const c of (cons ?? []) as ConsultaRow[]) {
        if (!seen.has(c.cliente_id)) {
          seen.add(c.cliente_id);
          ids.push(c.cliente_id);
        }
        if (ids.length >= 8) break;
      }
      if (ids.length === 0) return [];
      const { data: rows } = await supabase
        .from("clientes")
        .select("id,codigo,nome,gaveta,pasta,obs")
        .in("id", ids);
      const byId = new Map((rows ?? []).map((r) => [r.id, r as Cliente]));
      return ids.map((id) => byId.get(id)).filter(Boolean) as Cliente[];
    },
  });

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["clientes", debounced, gavetaFilter],
    queryFn: async (): Promise<Cliente[]> => {
      let q = supabase.from("clientes").select("id,codigo,nome,gaveta,pasta,obs").order("nome").limit(80);
      const term = debounced;
      if (term) {
        if (/^\d+$/.test(term)) {
          q = q.or(`pasta.eq.${term},codigo.eq.${term}`);
        } else {
          q = q.ilike("nome", `%${term}%`);
        }
      }
      if (gavetaFilter) q = q.eq("gaveta", gavetaFilter);
      if (!term && !gavetaFilter) return [];
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const showing = debounced || gavetaFilter ? results : recentes;

  const ids = useMemo(() => showing.map((c) => c.id), [showing]);
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
      for (const k of Object.keys(map)) map[k] = map[k].slice(0, 5);
      return map;
    },
  });

  const registrarConsulta = useMutation({
    mutationFn: async (cliente_id: string) => {
      const { error } = await supabase.from("consultas").insert({ cliente_id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ultimas-consultas"] });
      qc.invalidateQueries({ queryKey: ["recentes"] });
    },
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
      qc.invalidateQueries({ queryKey: ["recentes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportarInativos = async () => {
    toast.loading("Gerando lista…", { id: "exp" });
    const { data: clientes, error } = await supabase
      .from("clientes")
      .select("id,codigo,nome,gaveta,pasta")
      .order("nome");
    if (error) {
      toast.error(error.message, { id: "exp" });
      return;
    }
    const { data: cons } = await supabase
      .from("consultas")
      .select("cliente_id,consultado_em")
      .order("consultado_em", { ascending: false });
    const last = new Map<string, string>();
    for (const c of (cons ?? []) as ConsultaRow[]) {
      if (!last.has(c.cliente_id)) last.set(c.cliente_id, c.consultado_em);
    }
    const cutoff = Date.now() - TWO_YEARS_MS;
    const inativos = (clientes ?? []).filter((c) => {
      const u = last.get(c.id);
      return !u || new Date(u).getTime() < cutoff;
    });
    const csv = [
      "codigo;nome;gaveta;pasta;ultima_consulta",
      ...inativos.map((c) => {
        const u = last.get(c.id) ?? "";
        return [c.codigo, c.nome, c.gaveta ?? "", c.pasta ?? "", u].join(";");
      }),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-inativos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${inativos.length} clientes inativos exportados`, { id: "exp" });
  };

  const sair = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const isInactive = (id: string) => {
    const u = consultasByCliente[id]?.[0];
    if (!u) return true;
    return Date.now() - new Date(u).getTime() > TWO_YEARS_MS;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
        <header className="flex items-center gap-3 pb-6">
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Design Hub
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight leading-none">Arquivos</h1>
          </div>
          <Button
            onClick={() => setNewOpen(true)}
            className="gap-2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo cliente</span>
          </Button>
          <Button
            onClick={sair}
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3 w-3" /> Gaveta
          </span>
          <button
            onClick={() => setGavetaFilter("")}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
              gavetaFilter === ""
                ? "bg-primary text-primary-foreground ring-primary"
                : "bg-surface text-muted-foreground ring-border hover:bg-muted"
            }`}
          >
            Todas
          </button>
          {gavetas.map((g) => (
            <button
              key={g}
              onClick={() => setGavetaFilter(g === gavetaFilter ? "" : g)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                gavetaFilter === g
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-surface text-muted-foreground ring-border hover:bg-muted"
              }`}
            >
              {g.replace(/^GAVETA\s*/i, "").trim() || g}
            </button>
          ))}
          <span className="ml-auto" />
          <Button
            onClick={exportarInativos}
            variant="ghost"
            size="sm"
            className="gap-1 rounded-full text-xs"
            title="Exportar clientes sem consulta há +2 anos"
          >
            <Download className="h-3.5 w-3.5" /> Inativos (CSV)
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {debounced || gavetaFilter
            ? isFetching
              ? "Buscando…"
              : `${results.length} resultado${results.length === 1 ? "" : "s"}`
            : recentes.length > 0
              ? "Consultados recentemente"
              : "Digite o nome ou o número da pasta para começar."}
        </p>

        <ul className="mt-4 space-y-3">
          {showing.map((c) => {
            const isOpen = openId === c.id;
            const consultas = consultasByCliente[c.id] ?? [];
            const ultima = consultas[0];
            const inativo = isInactive(c.id);
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
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold tracking-tight">{c.nome}</p>
                      {inativo && (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive"
                          title="Sem consulta há mais de 2 anos — candidato a substituição"
                        >
                          <AlertTriangle className="h-3 w-3" /> Inativo
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Pasta {c.codigo}</span>
                      <span className="inline-flex items-center gap-1">
                        <Archive className="h-3 w-3" /> {c.gaveta ?? "—"}
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
                      <InfoBlock label="Pasta" value={String(c.codigo)} />
                      
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

        {(debounced || gavetaFilter) && !isFetching && results.length === 0 && (
          <div className="mt-10 rounded-3xl border border-dashed border-border bg-surface/50 p-8 text-center">
            <p className="font-display text-lg font-semibold">Nada encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">Que tal cadastrar como novo cliente?</p>
            <Button
              onClick={() => setNewOpen(true)}
              className="mt-4 gap-2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
            >
              <Plus className="h-4 w-4" /> Cadastrar {debounced ? `"${debounced}"` : "cliente"}
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
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
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
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
        <DialogDescription>Preencha o nome, a gaveta, a pasta e o código.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Nome do cliente">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: PADARIA LORENA" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gaveta">
              <Input value={gaveta} onChange={(e) => setGaveta(e.target.value)} placeholder="Ex: GAVETA A" />
            </Field>
            <Field label="Código">
              <Input value={pasta} onChange={(e) => setPasta(e.target.value)} placeholder="Ex: 12" />
            </Field>
          </div>
          {!initial && (
            <Field label="Pasta (opcional)">
              <Input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Auto (próximo disponível)"
                inputMode="numeric"
              />
            </Field>
          )}
          <Field label="Observação (opcional)">
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
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
