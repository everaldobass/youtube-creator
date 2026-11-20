'use client';

import { useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import {
  EFEITOS_ALTERNADOS,
  EFEITOS_CAMERA,
  efeitoDaCena,
  type EfeitoCamera,
  type ProjectDto,
  type SceneDto,
} from '@yt/shared';
import { ErrorBox } from '@/components/error-box';
import { Card } from '@/components/ui/card';
import { API_URL, patch } from '@/lib/client-api';
import { CLASSE_CAMERA, rotuloEfeito } from '@/lib/camera';
import { cn } from '@/lib/utils';

/**
 * Escolha do movimento de câmera (Ken Burns) aplicado às imagens na montagem.
 * A prévia usa CSS; o MP4 reproduz o mesmo movimento com filtros do FFmpeg.
 */
export function EfeitoCameraCard({
  projectId,
  valor,
  onChange,
  cena,
  vertical,
  usarSugerida,
  onUsarSugerida,
}: {
  projectId: string;
  valor: EfeitoCamera;
  onChange: (efeito: EfeitoCamera) => void;
  cena: SceneDto | undefined;
  vertical: boolean;
  usarSugerida: boolean;
  onUsarSugerida: (usar: boolean) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [salvandoSugerida, setSalvandoSugerida] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function escolher(slug: EfeitoCamera) {
    if (slug === valor || salvando) return;
    const anterior = valor;
    onChange(slug);
    setSalvando(true);
    setErro(null);
    try {
      await patch<ProjectDto>(`/projects/${projectId}`, { efeitoCamera: slug });
    } catch (e) {
      onChange(anterior);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o efeito.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarSugerida(ativo: boolean) {
    if (salvandoSugerida || ativo === usarSugerida) return;
    onUsarSugerida(ativo);
    setSalvandoSugerida(true);
    setErro(null);
    try {
      await patch<ProjectDto>(`/projects/${projectId}`, { usarCameraSugerida: ativo });
    } catch (e) {
      onUsarSugerida(!ativo);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a preferência.');
    } finally {
      setSalvandoSugerida(false);
    }
  }

  const previa = valor === 'alternado' ? efeitoDaCena('alternado', 1) : valor;
  const opcao = EFEITOS_CAMERA.find((e) => e.slug === valor);
  const classe = CLASSE_CAMERA[previa];

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Camera className="size-4 text-ai-soft" /> Movimento de câmera nas imagens
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Zoom, panorâmica, rotação e deslocamento 3D dão vida às imagens paradas. O efeito vale para a
            próxima montagem do MP4.
          </p>
        </div>
        {salvando && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Salvando
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[13rem_1fr]">
        <div
          className={cn(
            'relative overflow-hidden rounded-md border bg-black',
            vertical ? 'aspect-[9/16]' : 'aspect-video',
          )}
        >
          {cena?.temImagem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${previa}-${cena.id}`}
              src={`${API_URL}/scenes/${cena.id}/image?v=${cena.versaoMidia}`}
              alt={`Prévia do efeito ${rotuloEfeito(previa)}`}
              className={cn('kb-preview size-full', classe ? 'object-cover' : 'object-contain', classe)}
            />
          ) : (
            <div className="flex size-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
              A imagem da cena 1 aparece aqui para você ver o movimento.
            </div>
          )}
          <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
            {rotuloEfeito(previa)}
          </span>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {EFEITOS_CAMERA.map((e) => (
              <button
                key={e.slug}
                type="button"
                disabled={salvando}
                aria-pressed={valor === e.slug}
                onClick={() => escolher(e.slug)}
                className={cn(
                  'rounded-md border px-2 py-2 text-left text-xs font-medium transition-colors disabled:opacity-60',
                  valor === e.slug
                    ? 'border-brand bg-brand text-[#1a0505]'
                    : 'border-border bg-transparent hover:bg-panel',
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {opcao?.descricao}
            {valor === 'alternado' &&
              ` Sequência: ${EFEITOS_ALTERNADOS.map(rotuloEfeito).join(' → ')}.`}
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2 border-t pt-3 text-sm">
            <input
              type="checkbox"
              checked={usarSugerida}
              onChange={(e) => alternarSugerida(e.target.checked)}
              className="mt-0.5 size-4 accent-brand"
            />
            <span>
              Usar o movimento sugerido em cada cena
              <span className="mt-1 block text-xs text-muted-foreground">
                Quando a cena tem uma sugestão (criada no roteiro), ela substitui o efeito escolhido
                acima. Sem sugestão, vale este efeito.
              </span>
            </span>
          </label>
          {erro && (
            <div className="mt-2">
              <ErrorBox message={erro} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
