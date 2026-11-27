'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CircleSlash,
  FlaskConical,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { AiSettingsDto, ProvedorIaConfigDto } from '@yt/shared';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { toast } from '@/components/ui/toaster';
import { apiFetch, post, put } from '@/lib/client-api';
import { cn } from '@/lib/utils';

interface Rascunho {
  chave: string;
  modeloTexto: string;
  modeloImagem: string;
}

interface Teste {
  ok: boolean;
  texto: string;
}

type Flags = {
  salvando: boolean;
  testando: boolean;
  aviso?: { ok: boolean; texto: string };
  teste?: Teste;
};

interface Meta {
  prefixo: string;
  painel: string;
  exemploTexto: string;
  exemploImagem?: string;
}

/** Exemplo de modelo e formato de chave por provedor (aviso leve, não bloqueante). */
const META: Record<string, Meta> = {
  gemini: {
    prefixo: 'AIza',
    painel: 'Google AI Studio',
    exemploTexto: 'gemini-2.5-pro',
    exemploImagem: 'gemini-2.5-flash-image',
  },
  openai: { prefixo: 'sk-', painel: 'OpenAI Platform', exemploTexto: 'gpt-4.1' },
  anthropic: {
    prefixo: 'sk-ant-',
    painel: 'Anthropic Console',
    exemploTexto: 'claude-sonnet-4-5',
  },
  groq: { prefixo: 'gsk_', painel: 'Groq Console', exemploTexto: 'llama-3.3-70b-versatile' },
};

const ORIGEM: Record<string, string> = {
  env: 'do arquivo .env',
  salvo: 'salva aqui',
  nenhuma: 'não definida',
};

type EstadoProvedor = 'nao_configurado' | 'nao_testado' | 'ok' | 'falhou';

function situacao(
  p: ProvedorIaConfigDto,
  f: Flags,
): { estado: EstadoProvedor; rotulo: string; variant: 'default' | 'warning' | 'success' | 'danger' } {
  const configurado = p.campos.chave.origem !== 'nenhuma' && Boolean(p.campos.modeloTexto.valor);
  if (!configurado) return { estado: 'nao_configurado', rotulo: 'Não configurado', variant: 'default' };
  if (!f.teste) {
    return { estado: 'nao_testado', rotulo: 'Configurado, não testado', variant: 'warning' };
  }
  if (f.teste.ok) return { estado: 'ok', rotulo: 'Conexão OK', variant: 'success' };
  return { estado: 'falhou', rotulo: 'Falhou', variant: 'danger' };
}

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
  const [dialogo, setDialogo] = useState<{ tipo: 'remover' | 'restaurar'; p: ProvedorIaConfigDto } | null>(
    null,
  );

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

  const atualizarRascunho = (id: string, campo: keyof Rascunho, valor: string) => {
    setRascunhos((r) => ({ ...r, [id]: { ...r[id], [campo]: valor } }));
    // Alterou a configuração: o último teste deixa de valer.
    setFlags((f) => ({ ...f, [id]: { ...(f[id] ?? { salvando: false, testando: false }), teste: undefined } }));
  };

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
      await carregar();
      marcar(p.id, { salvando: false, teste: undefined, aviso: undefined });
      toast({ titulo: `${p.nome} salvo`, descricao: 'Teste a conexão para confirmar a chave.', tom: 'success' });
    } catch (e) {
      marcar(p.id, {
        salvando: false,
        aviso: { ok: false, texto: e instanceof Error ? e.message : 'Não foi possível salvar.' },
      });
    }
  }

  async function removerChave(p: ProvedorIaConfigDto) {
    setDialogo(null);
    marcar(p.id, { salvando: true, aviso: undefined });
    try {
      await put(`/settings/ai/${p.id}`, { limparChave: true });
      await carregar();
      marcar(p.id, { salvando: false, teste: undefined });
      toast({ titulo: 'Chave removida', descricao: `${p.nome} volta a usar o .env, se houver.` });
    } catch (e) {
      marcar(p.id, {
        salvando: false,
        aviso: { ok: false, texto: e instanceof Error ? e.message : 'Não foi possível remover.' },
      });
    }
  }

  async function restaurar(p: ProvedorIaConfigDto) {
    setDialogo(null);
    marcar(p.id, { salvando: true, aviso: undefined });
    try {
      await put(`/settings/ai/${p.id}`, { restaurarEnv: true });
      await carregar();
      marcar(p.id, { salvando: false, teste: undefined });
      toast({ titulo: 'Configuração restaurada', descricao: `${p.nome} usa novamente o arquivo .env.` });
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
      const r = await post<{ ok: boolean; detalhe?: string; erro?: string }>('/settings/ai/testar', {
        provedor: p.id,
      });
      marcar(p.id, {
        testando: false,
        teste: {
          ok: r.ok,
          texto: r.ok ? (r.detalhe ?? 'O provedor aceitou a chave e respondeu.') : (r.erro ?? 'O provedor não respondeu.'),
        },
      });
    } catch (e) {
      marcar(p.id, {
        testando: false,
        teste: {
          ok: false,
          texto: e instanceof Error ? e.message : 'Não foi possível testar a conexão.',
        },
      });
    }
  }

  if (erroGeral) {
    return (
      <Alert
        variant="error"
        className="mt-6"
        title="Não foi possível carregar as configurações"
        description={erroGeral}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              carregar().catch((e) =>
                setErroGeral(e instanceof Error ? e.message : 'Erro desconhecido'),
              )
            }
          >
            Tentar de novo
          </Button>
        }
      />
    );
  }

  if (!dados) {
    return (
      <div className="mt-6 grid gap-4" aria-busy="true">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl border border-border-soft bg-card/60" />
        ))}
      </div>
    );
  }

  const naFila = dados.provedores.filter(
    (p) => p.campos.chave.origem !== 'nenhuma' && Boolean(p.campos.modeloTexto.valor),
  ).length;

  return (
    <div className="mt-6">
      {/* Resumo da fila: quem é chamado primeiro, e quem assume se falhar. */}
      <section aria-labelledby="fila-titulo" className="rounded-xl border border-border-soft bg-panel/60 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="fila-titulo" className="text-sm font-semibold">
            Fila de fallback
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {naFila} de {dados.provedores.length} configurados
          </p>
        </div>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {dados.provedores.map((p, i) => {
            const f = flags[p.id] ?? { salvando: false, testando: false };
            const s = situacao(p, f);
            return (
              <li
                key={p.id}
                className="flex items-center gap-2.5 rounded-lg border border-border-soft bg-card/60 px-3 py-2"
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums',
                    s.estado === 'ok'
                      ? 'border-success/50 bg-success/10 text-success-soft'
                      : s.estado === 'falhou'
                        ? 'border-danger/50 bg-danger/10 text-danger'
                        : 'border-border bg-panel text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{p.nome}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{s.rotulo}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Se um provedor falhar, a geração passa automaticamente para o próximo. O que você salvar
          aqui vale mais que o arquivo <code className="text-foreground/80">.env</code>.
        </p>
      </section>

      <ul className="mt-5 grid gap-4">
        {dados.provedores.map((p, i) => {
          const r = rascunhos[p.id];
          const f = flags[p.id] ?? { salvando: false, testando: false };
          const s = situacao(p, f);
          const meta = META[p.id] ?? { prefixo: '', painel: 'painel do provedor', exemploTexto: '' };
          const semImagem = !p.campos.modeloImagem;
          const ocupado = f.salvando || f.testando;
          if (!r) return null;

          const chaveNova = r.chave.trim();
          const formatoSuspeito = Boolean(chaveNova) && !chaveNova.startsWith(meta.prefixo);

          return (
            <li key={p.id}>
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-soft bg-panel text-xs font-semibold tabular-nums text-muted-foreground">
                      {i + 1}º
                    </span>
                    <h3 className="text-base font-semibold tracking-tight">{p.nome}</h3>
                    <Badge variant={s.variant}>{s.rotulo}</Badge>
                  </div>

                  {/* Chave atual como chip de leitura; o valor completo nunca sai do servidor. */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-panel/60 px-3 py-2">
                    <span className="text-[11px] font-medium text-muted-foreground">Chave atual</span>
                    <code className="rounded border border-border-soft bg-background/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                      {p.campos.chave.resumo ?? 'sem chave'}
                    </code>
                    <span className="text-[11px] text-muted-foreground">
                      {ORIGEM[p.campos.chave.origem]}
                    </span>
                    {p.campos.chave.origem === 'salvo' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 px-2 text-[11px] text-danger hover:bg-danger/10 hover:text-danger"
                        onClick={() => setDialogo({ tipo: 'remover', p })}
                        disabled={ocupado}
                      >
                        <Trash2 className="size-3.5" /> Remover chave
                      </Button>
                    )}
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor={`chave-${p.id}`}>Nova chave de API</Label>
                      <PasswordInput
                        id={`chave-${p.id}`}
                        placeholder={
                          p.campos.chave.resumo
                            ? 'Cole uma nova chave apenas para trocar a atual'
                            : `Cole a chave do ${meta.painel}`
                        }
                        value={r.chave}
                        onChange={(e) => atualizarRascunho(p.id, 'chave', e.target.value)}
                      />
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        Formato esperado: começa com <code className="text-foreground/80">{meta.prefixo}</code>.
                        A chave fica só no servidor.
                      </p>
                      {formatoSuspeito && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-warning">
                          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                          A chave do {p.nome} normalmente começa com {meta.prefixo}. Você ainda pode
                          salvar.
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor={`texto-${p.id}`}>Modelo de texto</Label>
                      <Input
                        id={`texto-${p.id}`}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={`ex.: ${meta.exemploTexto}`}
                        value={r.modeloTexto}
                        onChange={(e) => atualizarRascunho(p.id, 'modeloTexto', e.target.value)}
                      />
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Origem: {ORIGEM[p.campos.modeloTexto.origem]}
                      </p>
                    </div>

                    {!semImagem && (
                      <div>
                        <Label htmlFor={`imagem-${p.id}`}>Modelo de imagem</Label>
                        <Input
                          id={`imagem-${p.id}`}
                          spellCheck={false}
                          autoComplete="off"
                          placeholder={`ex.: ${meta.exemploImagem ?? 'modelo de imagem'}`}
                          value={r.modeloImagem}
                          onChange={(e) => atualizarRascunho(p.id, 'modeloImagem', e.target.value)}
                        />
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          Origem: {ORIGEM[p.campos.modeloImagem!.origem]}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4" aria-live="polite">
                    {f.teste && (
                      <Alert
                        variant={f.teste.ok ? 'success' : 'error'}
                        title={f.teste.ok ? 'Conexão OK' : 'A conexão falhou'}
                        description={f.teste.texto}
                        className="mb-3"
                      >
                        {!f.teste.ok && (
                          <p className="text-foreground/70">
                            Gere uma nova chave no {meta.painel} e cole no campo acima. Se o modelo
                            estiver errado, confira o nome no mesmo painel.
                          </p>
                        )}
                      </Alert>
                    )}
                    {f.aviso && !f.aviso.ok && (
                      <Alert
                        variant="error"
                        title="Não foi possível salvar"
                        description={f.aviso.texto}
                        className="mb-3"
                      />
                    )}
                  </div>

                  {/* Um primário só: Salvar. Testar é secundário; restaurar é discreto. */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-soft pt-4">
                    <Button type="button" size="sm" onClick={() => salvar(p)} disabled={ocupado}>
                      {f.salvando ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      {f.salvando ? 'Salvando…' : 'Salvar'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => testar(p)}
                      disabled={ocupado || s.estado === 'nao_configurado'}
                    >
                      {f.testando ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <FlaskConical className="size-4" />
                      )}
                      {f.testando ? 'Testando…' : 'Testar conexão'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialogo({ tipo: 'restaurar', p })}
                      disabled={ocupado}
                    >
                      <RotateCcw className="size-4" /> Restaurar .env
                    </Button>
                    {s.estado === 'nao_configurado' && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CircleSlash className="size-3.5" aria-hidden /> Salve a chave e o modelo para
                        entrar na fila.
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={dialogo !== null}
        onClose={() => setDialogo(null)}
        tone="danger"
        title={dialogo?.tipo === 'remover' ? 'Remover a chave salva?' : 'Restaurar o arquivo .env?'}
        description={
          dialogo?.tipo === 'remover'
            ? `A chave salva do ${dialogo.p.nome} será apagada. Se existir uma chave no .env, ela volta a valer.`
            : dialogo
              ? `A chave e os modelos salvos do ${dialogo.p.nome} serão descartados. O provedor volta a usar o que está no arquivo .env.`
              : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button
              variant={dialogo?.tipo === 'remover' ? 'destructive-solid' : 'destructive'}
              onClick={() => {
                if (!dialogo) return;
                if (dialogo.tipo === 'remover') void removerChave(dialogo.p);
                else void restaurar(dialogo.p);
              }}
            >
              {dialogo?.tipo === 'remover' ? (
                <>
                  <Trash2 className="size-4" /> Remover chave
                </>
              ) : (
                <>
                  <Check className="size-4" /> Restaurar .env
                </>
              )}
            </Button>
          </>
        }
      />
    </div>
  );
}
