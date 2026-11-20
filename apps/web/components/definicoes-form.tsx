'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eraser, Mic, Sparkles } from 'lucide-react';
import {
  LIMITES_FORMATO,
  IDIOMAS,
  IDIOMA_INFO,
  type Formato,
  type Idioma,
  type ProjectDto,
} from '@yt/shared';
import { ErrorBox } from '@/components/error-box';
import { StepHeader } from '@/components/step-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { patch, post } from '@/lib/client-api';
import { cn } from '@/lib/utils';

type Estado = 'salvo' | 'salvando' | 'erro';

const FORMATO_INFO: Record<Formato, { titulo: string; detalhe: string }> = {
  longo: { titulo: 'Vídeo longo', detalhe: '16:9, até 30 minutos' },
  shorts: { titulo: 'Shorts', detalhe: '9:16, menos de 3 minutos' },
};

/** Marcador visual de opção selecionada (o input real fica invisível). */
function MarcaEscolha({ ativa }: { ativa: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
        ativa ? 'border-brand bg-brand text-[#1a0505]' : 'border-border',
      )}
    >
      {ativa && <Check className="size-3" />}
    </span>
  );
}

export function DefinicoesForm({ project }: { project: ProjectDto }) {
  const router = useRouter();
  const [form, setForm] = useState({
    formato: project.formato,
    idioma: project.idioma,
    ideia: project.ideia,
    tema: project.tema,
    publico: project.publico,
    duracaoMinutos: project.duracaoMinutos,
    vozNome: project.vozNome,
  });
  const [estado, setEstado] = useState<Estado>('salvo');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const primeira = useRef(true);

  const maxMinutos = form.formato === 'shorts' ? 2 : LIMITES_FORMATO.longo.maxMinutos;
  const presets = form.formato === 'shorts' ? [1, 2] : [5, 10, 15, 20, 30];

  function set<K extends keyof typeof form>(chave: K, valor: (typeof form)[K]) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  function escolherIdioma(idioma: Idioma) {
    set('idioma', idioma);
  }

  function escolherFormato(formato: Formato) {
    setForm((f) => ({
      ...f,
      formato,
      duracaoMinutos: formato === 'shorts' ? Math.min(f.duracaoMinutos, 1) : f.duracaoMinutos,
    }));
  }

  /** Limpa apenas o título/ideia e o tema; o resto da definição fica como está. */
  function limparCampos() {
    setForm((f) => ({ ...f, ideia: '', tema: '' }));
  }

  // Salvamento automático com pequena espera depois da última digitação.
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    setEstado('salvando');
    const t = setTimeout(async () => {
      try {
        await patch(`/projects/${project.id}`, form);
        setEstado('salvo');
      } catch {
        setEstado('erro');
      }
    }, 600);
    return () => clearTimeout(t);
  }, [form, project.id]);

  const podeContinuar = form.tema.trim().length > 0 || form.ideia.trim().length > 0;

  async function continuar() {
    setBusy(true);
    setErro(null);
    try {
      await patch(`/projects/${project.id}`, form);
      await post(`/projects/${project.id}/advance`, { etapa: 'definicoes' });
      // A etapa 2 gera os títulos ao abrir (ver TitulosView) — o botão faz o que promete.
      router.push(`/projetos/${project.id}/titulos?gerar=1`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full">
      <StepHeader
        etapa="Etapa 1 de 9"
        title="Crie seu próximo vídeo"
        description="Descreva o assunto, escolha o formato e defina a duração. O YouStudio transforma isso em títulos, roteiro, narração e imagens."
        meta={
          <span
            className={cn(
              'flex items-center gap-1.5 text-[11px]',
              estado === 'erro' ? 'text-danger' : 'text-muted-foreground',
            )}
            aria-live="polite"
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                estado === 'erro'
                  ? 'bg-danger'
                  : estado === 'salvando'
                    ? 'bg-warning'
                    : 'bg-success',
              )}
            />
            {estado === 'salvando' && 'Salvando...'}
            {estado === 'salvo' && 'Salvo automaticamente'}
            {estado === 'erro' && 'Não foi possível salvar'}
          </span>
        }
        actions={
          <Button size="lg" onClick={continuar} disabled={!podeContinuar || busy}>
            <Sparkles className="size-4" />
            {busy ? 'Salvando...' : 'Salvar e gerar títulos'}
          </Button>
        }
      />

      <div className="mt-5 space-y-5">
        <Card>
          <CardContent className="grid gap-6 p-4 sm:grid-cols-2 sm:p-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Idioma do vídeo</legend>
              <div className="grid gap-2">
                {IDIOMAS.map((i) => {
                  const ativa = form.idioma === i;
                  return (
                    <label
                      key={i}
                      className={cn(
                        'flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 transition-colors',
                        ativa
                          ? 'border-brand/70 bg-brand/[0.06]'
                          : 'border-border-soft hover:border-border',
                      )}
                    >
                      <input
                        type="radio"
                        name="idioma"
                        value={i}
                        checked={ativa}
                        onChange={() => escolherIdioma(i)}
                        className="sr-only"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{IDIOMA_INFO[i].rotulo}</span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                          {i === 'pt-BR'
                            ? 'Títulos, roteiro, narração e textos em português.'
                            : 'Titles, script, narration and texts in English.'}
                        </span>
                      </span>
                      <MarcaEscolha ativa={ativa} />
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Vale para títulos, roteiro, narração, tags, thumbnails e descrição. Mudar depois de
                gerar não refaz os textos automaticamente.
              </p>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Formato de publicação</legend>
              <div className="grid gap-2">
                {(Object.keys(FORMATO_INFO) as Formato[]).map((f) => {
                  const ativa = form.formato === f;
                  return (
                    <label
                      key={f}
                      className={cn(
                        'flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 transition-colors',
                        ativa
                          ? 'border-brand/70 bg-brand/[0.06]'
                          : 'border-border-soft hover:border-border',
                      )}
                    >
                      <input
                        type="radio"
                        name="formato"
                        value={f}
                        checked={ativa}
                        onChange={() => escolherFormato(f)}
                        className="sr-only"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{FORMATO_INFO[f].titulo}</span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                          {FORMATO_INFO[f].detalhe}
                        </span>
                      </span>
                      <MarcaEscolha ativa={ativa} />
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Assunto do vídeo</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Quanto mais específico o contexto, melhores os títulos e o roteiro.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={limparCampos}
                disabled={!form.ideia && !form.tema}
              >
                <Eraser className="size-4" /> Limpar campos
              </Button>
            </div>

            <div className="mt-4 grid gap-4">
              <div>
                <Label htmlFor="ideia">Título ou ideia (opcional)</Label>
                <Input
                  id="ideia"
                  value={form.ideia}
                  onChange={(e) => set('ideia', e.target.value)}
                  maxLength={200}
                  placeholder={IDIOMA_INFO[form.idioma].exemplo}
                />
              </div>

              <div>
                <Label htmlFor="tema">Tema e contexto</Label>
                <Textarea
                  id="tema"
                  value={form.tema}
                  onChange={(e) => set('tema', e.target.value)}
                  maxLength={1000}
                  rows={5}
                  className="min-h-32"
                  placeholder={
                    form.idioma === 'pt-BR'
                      ? 'Escreva de 3 a 4 linhas sobre o assunto: o que o vídeo mostra, qual é o ângulo e o que o espectador vai aprender.'
                      : 'Write 3–4 lines about the subject: what the video shows, its angle, and what the viewer will learn.'
                  }
                />
                <p className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>Um bom contexto deixa títulos e roteiro mais específicos.</span>
                  <span className="tabular-nums">{form.tema.length}/1000</span>
                </p>
              </div>

              <div>
                <Label htmlFor="publico">Público</Label>
                <Input
                  id="publico"
                  value={form.publico}
                  onChange={(e) => set('publico', e.target.value)}
                  placeholder="Ex.: curiosos, 15 a 40 anos"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-6 p-4 sm:p-5 lg:grid-cols-2">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="duracao" className="mb-0">
                  Duração: {form.duracaoMinutos}{' '}
                  {form.duracaoMinutos === 1 ? 'minuto' : 'minutos'}
                </Label>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {presets.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      variant={form.duracaoMinutos === m ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 px-2.5"
                      onClick={() => set('duracaoMinutos', m)}
                    >
                      {m} min
                    </Button>
                  ))}
                </div>
              </div>
              <input
                id="duracao"
                type="range"
                min={1}
                max={maxMinutos}
                value={form.duracaoMinutos}
                onChange={(e) => set('duracaoMinutos', Number(e.target.value))}
                className="mt-3 w-full accent-brand"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {form.formato === 'shorts'
                  ? 'Shorts têm menos de 3 minutos; o ideal é até 1 minuto.'
                  : 'Vídeos longos vão até 30 minutos.'}
              </p>
            </div>

            <div>
              <Label htmlFor="voz">Tipo de voz</Label>
              <div className="relative">
                <Mic className="pointer-events-none absolute left-3 top-3 size-4 text-ai-soft" />
                <select
                  id="voz"
                  value={form.vozNome}
                  onChange={(e) => set('vozNome', e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-panel pl-9 pr-3 text-sm"
                >
                  <option value="voz-masculina-1">Masculina, suave e didática</option>
                </select>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                A mesma voz é usada em todas as cenas. A amostra de voz entra na etapa de narração.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {erro && (
        <div className="mt-5">
          <ErrorBox message={erro} onRetry={continuar} />
        </div>
      )}
    </div>
  );
}
