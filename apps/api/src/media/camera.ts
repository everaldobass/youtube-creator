import { EfeitoCamera } from '@yt/shared';

export const FPS_VIDEO = 30;

/** Fator de sobra em volta da imagem: evita bordas pretas quando a câmera se move. */
function comSobra(largura: number, altura: number, fator: number) {
  return {
    // Dimensões pares evitam erro no yuv420p.
    largura: Math.round((largura * fator) / 2) * 2,
    altura: Math.round((altura * fator) / 2) * 2,
  };
}

const escalaCobrindo = (l: number, a: number) =>
  `scale=${l}:${a}:force_original_aspect_ratio=increase,crop=${l}:${a}`;

/**
 * Cadeia de filtros do FFmpeg que simula movimento de câmera sobre a imagem
 * (zoom, panorâmica, rotação e um deslocamento com cara de 3D).
 * Devolve `null` para "imagem parada", quando a montagem usa o filtro simples.
 */
export function filtroCamera(
  efeito: EfeitoCamera,
  largura: number,
  altura: number,
  duracaoSegundos: number,
): string | null {
  if (efeito === 'nenhum') return null;

  const dur = Math.max(0.2, duracaoSegundos);
  const quadros = Math.max(1, Math.round(dur * FPS_VIDEO) - 1);

  if (efeito === 'alternado') return null;

  if (efeito === 'zoom-in' || efeito === 'zoom-out') {
    const { largura: l, altura: a } = comSobra(largura, altura, 1.6);
    const zoom =
      efeito === 'zoom-in' ? `1+0.16*on/${quadros}` : `1.16-0.16*on/${quadros}`;
    return (
      `${escalaCobrindo(l, a)},` +
      `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=1:s=${largura}x${altura}:fps=${FPS_VIDEO}`
    );
  }

  if (efeito.startsWith('panoramica-')) {
    const { largura: l, altura: a } = comSobra(largura, altura, 1.35);
    const avanco = `t/${dur.toFixed(3)}`;
    const recuo = `(1-t/${dur.toFixed(3)})`;
    const eixo: Record<string, { x: string; y: string }> = {
      'panoramica-esquerda': { x: `(iw-ow)*${recuo}`, y: '(ih-oh)/2' },
      'panoramica-direita': { x: `(iw-ow)*${avanco}`, y: '(ih-oh)/2' },
      'panoramica-cima': { x: '(iw-ow)/2', y: `(ih-oh)*${recuo}` },
      'panoramica-baixo': { x: '(iw-ow)/2', y: `(ih-oh)*${avanco}` },
    };
    const { x, y } = eixo[efeito];
    return `${escalaCobrindo(l, a)},crop=${largura}:${altura}:x='${x}':y='${y}'`;
  }

  if (efeito === 'rotacao') {
    const { largura: l, altura: a } = comSobra(largura, altura, 1.5);
    return (
      `${escalaCobrindo(l, a)},` +
      `rotate='(-1.1+2.2*t/${dur.toFixed(3)})*PI/180':fillcolor=black,` +
      `scale=${largura}:${altura}`
    );
  }

  // tridimensional: zoom + deslocamento lateral + leve rotação (dolly de câmera).
  const { largura: l, altura: a } = comSobra(largura, altura, 1.8);
  const { largura: li, altura: ai } = comSobra(largura, altura, 1.35);
  return (
    `${escalaCobrindo(l, a)},` +
    `zoompan=z='1+0.10*on/${quadros}':` +
    `x='(iw-iw/zoom)*(0.12+0.7*on/${quadros})':y='ih/2-(ih/zoom/2)':` +
    `d=1:s=${li}x${ai}:fps=${FPS_VIDEO},` +
    `rotate='(-0.7+1.4*t/${dur.toFixed(3)})*PI/180':fillcolor=black,` +
    `scale=${largura}:${altura}`
  );
}
