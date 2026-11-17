import { PrismaService } from '../prisma/prisma.service';

/** Texto do roteiro (só a narração) para dar contexto aos prompts de tags, thumbnails e descrição. */
export async function textoDoRoteiro(prisma: PrismaService, projectId: string, max = 6000): Promise<string> {
  const cenas = await prisma.scene.findMany({ where: { projectId }, orderBy: { numero: 'asc' } });
  return cenas.map((c) => c.textoNarrado.trim()).filter(Boolean).join(' ').slice(0, max);
}

export interface CenaNaLinha {
  numero: number;
  inicioMs: number;
  duracaoMs: number;
  texto: string;
  audioPath: string | null;
  imagemPath: string | null;
}

/** Linha do tempo do vídeo: cada cena dura o tempo do seu áudio (ou a duração estimada, sem áudio). */
export function linhaDoTempo(
  cenas: {
    numero: number;
    textoNarrado: string;
    duracaoSegundos: number;
    audioDuracaoMs: number | null;
    audioPath: string | null;
    imagemPath: string | null;
  }[],
): CenaNaLinha[] {
  let acumulado = 0;
  return cenas.map((c) => {
    const duracaoMs = c.audioDuracaoMs ?? c.duracaoSegundos * 1000;
    const item = {
      numero: c.numero,
      inicioMs: acumulado,
      duracaoMs,
      texto: c.textoNarrado,
      audioPath: c.audioPath,
      imagemPath: c.imagemPath,
    };
    acumulado += duracaoMs;
    return item;
  });
}
