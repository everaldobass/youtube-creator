import { EFEITOS_CAMERA, efeitoDaCena, type EfeitoCamera } from '@yt/shared';

/**
 * Classes CSS de movimento usadas nas prévias do navegador. A montagem final
 * reproduz os mesmos movimentos com filtros do FFmpeg (media/camera.ts na API).
 */
export const CLASSE_CAMERA: Record<EfeitoCamera, string> = {
  nenhum: '',
  'zoom-in': 'kb-zoom-in',
  'zoom-out': 'kb-zoom-out',
  'panoramica-esquerda': 'kb-pan-esquerda',
  'panoramica-direita': 'kb-pan-direita',
  'panoramica-cima': 'kb-pan-cima',
  'panoramica-baixo': 'kb-pan-baixo',
  rotacao: 'kb-rotacao',
  tridimensional: 'kb-tridimensional',
  alternado: 'kb-zoom-in',
};

export const classeDaCena = (efeito: EfeitoCamera, numero: number) =>
  CLASSE_CAMERA[efeitoDaCena(efeito, numero)];

export const rotuloEfeito = (efeito: EfeitoCamera) =>
  EFEITOS_CAMERA.find((e) => e.slug === efeito)?.label ?? 'Imagem parada';
