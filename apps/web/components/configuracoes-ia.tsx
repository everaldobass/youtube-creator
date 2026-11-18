'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, FlaskConical, RotateCcw, Save, Trash2, TriangleAlert } from 'lucide-react';
import type { AiSettingsDto, ProvedorIaConfigDto } from '@yt/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, post, put } from '@/lib/client-api';
import { cn } from '@/lib/utils';

interface Rascunho {
  chave: string;
  modeloTexto: string;
  modeloImagem: string;
}

interface Aviso {
  ok: boolean;
  texto: string;
}

type Flags = {
  salvando: boolean;
  testando: boolean;
  aviso?: Aviso;
};

const ORIGEM: Record<string, string> = {
  env: 'definido no arquivo .env',
  salvo: 'salvo nas configurações',
  nenhuma: 'não definido',
};

/** Campos editáveis por provedor: chave vazia = manter a atual. */
function rascunhosDe(d: AiSettingsDto | null): Record<string, Rascunho> {
  if (!d) return {};
  return Object.fromEntries(
    d.provedores.map((p) => [
      p.id,
      {
        chave: '',
        modeloTexto: p.campos.modeloTexto.valor,
        modeloImagem: p.campos.modeloImagem?.valor ?? '',
      },
    ]),
  );
}

function situacao(p: ProvedorIaConfigDto): { rotulo: string; ok: boolean } {
  if (p.ativo) return { rotulo: 'pronto', ok: true };
  if (p.campos.chave.origem === 'nenhuma') return { rotulo: 'sem chave', ok: false };
  if (!p.campos.modeloTexto.valor) return { rotulo: 'sem modelo', ok: false };
  return { rotulo: 'incompleto', ok: false };
}

/**
 * Configurações de IA: cada provedor ocupa uma posição na fila de fallback.
 * O valor salvo aqui substitui o do .env; apagar a linha volta ao .env.
 */
export function ConfiguracoesIa({
  inicial = null,
  erroInicial = '',
}: {
  inicial?: AiSettingsDto | null;
  erroInicial?: string;
}) {
  const [dados, setDados] = useState<AiSettingsDto | null>(inicial);
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>(() => rascunhosDe(inicial));
  const [flags, setFlags] = useState<Record<string, Flags>>({});
  const [erroGeral, setErroGeral] = useState(erroInicial);

  const carregar = useCallback(async () => {
    const d = await apiFetch<AiSettingsDto>('/settings/ai');
    setDados(d);
    setRascunhos(rascunhosDe(d));
    setErroGeral('');
    return d;
  }, []);

  useEffect(() => {
    // A página já buscou no servidor; só busca de novo se veio vazia.
    if (inicial) return;
    carregar().catch((e) => setErroGeral(e instanceof Error ? e.message : 'Erro desconhecido'));
  }, [carregar, inicial]);

  const atualizarRascunho = (id: string, campo: keyof Rascunho, valor: string) =>
    setRascunhos((r) => ({ ...r, [id]: { ...r[id], [campo]: valor } }));

  const marcar = (id: string, patch: Partial<Flags>) =>
    setFlags((f) => {
      const atual: Flags = f[id] ?? { salvando: false, testando: false };
      return { ...f, [id]: { ...atual, ...patch } };
    });

  async function salvar(p: ProvedorIaConfigDto) {
    const r = rascunhos[p.id];
    if (!r) return;
    marcar(p.id, { salvando: true, aviso: undefined });
    try {
      await put(`/settings/ai/${p.id}`, {
        modeloTexto: r.modeloTexto,
        ...(p.campos.modeloImagem ? { modeloImagem: r.modeloImagem } : {}),
        ...(r.chave.trim() ? { apiKey: r.chave.trim() } : {}),
      });
      const d = await carregar();
      const atual = d.provedores.find((x) => x.id === p.id);
      marcar(p.id, {
        salvando: false,
        aviso: { ok: true, texto: `Configuração do ${p.nome} salva.` },
      });
      // Só limpa o campo da chave se ela de fato foi gravada.
      if (atual?.campos.chave.origem === 'salvo') {
        setRascunhos((prev) => ({ ...prev, [p.id]: { ...prev[p.id], chave: '' } }));
      }
    } catch (e) {
      marcar(p.id, {
        salvando: false,
        aviso: { ok: false, texto: e instanceof Error ? e.message : 'Não foi possível salvar.' },
      });
    }
  }

  async function removerChave(p: ProvedorIaConfigDto) {
    if (!window.confirm(`Remover a chave salva do ${p.nome}? A configuração volta para o .env.`))
      return;
    marcar(p.id, { salvando: true, aviso: undefined });
    try {
      await put(`/settings/ai/${p.id}`, { limparChave: true });
      await carregar();
      marcar(p.id, { salvando: false, aviso: { ok: true, texto: 'Chave removida.' } });
    } catch (e) {
      marcar(p.id, {
        salvando: false,
        aviso: { ok: false, texto: e instanceof Error ? e.message : 'Não foi possível remover.' },
      });
    }
  }

  async function restaurar(p: ProvedorIaConfigDto) {
    if (!window.confirm(`Descartar o que foi salvo no ${p.nome} e voltar ao arquivo .env?`)) return;
    marcar(p.id, { salvando: true, aviso: undefined });
    try {
      await put(`/settings/ai/${p.id}`, { restaurarEnv: true });
      await carregar();
      marcar(p.id, { salvando: false, aviso: { ok: true, texto: 'Voltando ao .env.' } });
    } catch (e) {
      marcar(p.id, {
        salvando: false,
        aviso: { ok: false, texto: e instanceof Error ? e.message : 'Não foi possível restaurar.' },
      });
    }
  }

  async function testar(p: ProvedorIaConfigDto) {
    marcar(p.id, { testando: true, aviso: undefined });
    try {
      const r = await post<{ ok: boolean; detalhe?: string; erro?: string }>(
        '/settings/ai/testar',
        { provedor: p.id },
      );
      marcar(p.id, {
        testando: false,
        aviso: {
          ok: r.ok,
          texto: r.ok ? (r.detalhe ?? 'Conexão OK.') : (r.erro ?? 'O provedor não respondeu.'),
        },
      });
    } catch (e) {
      marcar(p.id, {
        testando: false,
        aviso: { ok: false, texto: e instanceof Error ? e.message : 'Não foi possível testar.' },
      });
    }
  }

  if (erroGeral) {
    return (
      <div role="alert" className="mt-8 rounded-xl border border-primary/50 bg-card p-4 text-sm">
        {erroGeral}
      </div>
    );
  }

  if (!dados) {
    return <p className="mt-8 text-sm text-muted-foreground">Carregando configurações…</p>;
  }

  return (
    <div className="mt-8">
      {/* Resumo da fila: quem é chamado primeiro, e quem assume se falhar. */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs" aria-label="Ordem de uso">
        {dados.provedores.map((p, i) => {
          const s = situacao(p);
          return (
            <li key={p.id} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden className="text-muted-foreground/60">
                  →
                </span>
              )}
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
                  s.ok
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-border bg-card text-muted-foreground',
                )}
              >
                <span className="tabular-nums">{p.ordem + 1}º</span> {p.nome}
                <span aria-hidden>·</span>
                <span>{s.rotulo}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
        Se um provedor falhar, a geração passa automaticamente para o próximo da fila. O que você
        salvar aqui vale mais que o arquivo <code className="text-foreground/80">.env</code> — para
        voltar ao valor original, use <em>Restaurar .env</em> no card.
      </p>

      <ul className="mt-6 grid gap-4">
        {dados.provedores.map((p, i) => {
          const r = rascunhos[p.id];
          const f = flags[p.id] ?? { salvando: false, testando: false };
          const s = situacao(p);
          const semImagem = !p.campos.modeloImagem;
          if (!r) return null;
          return (
            <li key={p.id} className="grid grid-cols-[2.5rem_1fr] gap-3 sm:gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold tabular-nums',
                    s.ok
                      ? 'border-success/40 bg-success/10 text-success'
                      : 'border-border bg-panel text-muted-foreground',
                  )}
                >
                  {String(p.ordem + 1).padStart(2, '0')}
                </span>
                {i < dados.provedores.length - 1 && (
                  <span aria-hidden className="mt-2 w-px flex-1 bg-border" />
                )}
              </div>

              <Card>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-base font-semibold tracking-tight">{p.nome}</h2>
                    <Badge
                      variant={s.ok ? 'success' : s.rotulo === 'sem chave' ? 'default' : 'warning'}
                    >
                      {s.rotulo}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {p.ordem + 1}º a ser chamado
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor={`chave-${p.id}`}>Chave de API</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`chave-${p.id}`}
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={
                            p.campos.chave.resumo
                              ? `Atual: ${p.campos.chave.resumo} — cole uma nova para trocar`
                              : 'Cole a chave do provedor'
                          }
                          value={r.chave}
                          onChange={(e) => atualizarRascunho(p.id, 'chave', e.target.value)}
                        />
                        {p.campos.chave.origem === 'salvo' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => removerChave(p)}
                            disabled={f.salvando}
                          >
                            <Trash2 className="size-4" /> Remover
                          </Button>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {ORIGEM[p.campos.chave.origem]}. A chave completa nunca é exibida na tela.
                      </p>
                    </div>

                    <div>
                      <Label htmlFor={`texto-${p.id}`}>Modelo de texto</Label>
                      <Input
                        id={`texto-${p.id}`}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="ex.: gpt-6.2-astra"
                        value={r.modeloTexto}
                        onChange={(e) => atualizarRascunho(p.id, 'modeloTexto', e.target.value)}
                      />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {ORIGEM[p.campos.modeloTexto.origem]}
                      </p>
                    </div>

                    {!semImagem && (
                      <div>
                        <Label htmlFor={`imagem-${p.id}`}>Modelo de imagem</Label>
                        <Input
                          id={`imagem-${p.id}`}
                          spellCheck={false}
                          autoComplete="off"
                          placeholder="ex.: gemini-3.1-flash-image"
                          value={r.modeloImagem}
                          onChange={(e) => atualizarRascunho(p.id, 'modeloImagem', e.target.value)}
                        />
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {ORIGEM[p.campos.modeloImagem!.origem]}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => salvar(p)}
                      disabled={f.salvando || f.testando}
                    >
                      <Save className="size-4" />
                      {f.salvando ? 'Salvando…' : 'Salvar'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ai"
                      onClick={() => testar(p)}
                      disabled={f.salvando || f.testando}
                    >
                      <FlaskConical className="size-4" />
                      {f.testando ? 'Testando…' : 'Testar conexão'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => restaurar(p)}
                      disabled={f.salvando || f.testando}
                    >
                      <RotateCcw className="size-4" /> Restaurar .env
                    </Button>
                  </div>

                  <div aria-live="polite">
                    {f.aviso && (
                      <p
                        className={cn(
                          'mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
                          f.aviso.ok
                            ? 'border-success/40 bg-success/10 text-success'
                            : 'border-primary/50 bg-card text-foreground',
                        )}
                      >
                        {f.aviso.ok ? (
                          <Check className="mt-0.5 size-3.5 shrink-0" />
                        ) : (
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                        )}
                        <span>{f.aviso.texto}</span>
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
