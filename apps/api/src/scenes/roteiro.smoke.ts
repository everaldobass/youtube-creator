/**
 * Teste de fumaça da geração de roteiro (não faz parte do build).
 * Uso (em apps/api): npx ts-node -P tsconfig.json src/scenes/roteiro.smoke.ts
 *
 * Verifica a continuação automática até 90% da duração alvo e que o
 * encerramento (com a chamada para inscrição) fica só nas últimas cenas, sem
 * chamar a IA de verdade: o AiService é substituído por respostas controladas.
 */
import { promises as fs } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createProjectSchema } from '@yt/shared';
import type { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { LocalStorageDriver } from '../storage/local-storage.driver';
import { ScenesService } from './scenes.service';

let passos = 0;
const falhas: string[] = [];

function conferir(condicao: unknown, mensagem: string) {
  passos += 1;
  if (!condicao) falhas.push(mensagem);
}

const cena = (segundos: number, texto: string) => ({
  textoNarrado: texto,
  duracaoSegundos: segundos,
  descricaoVisual: `Visual de ${texto}`,
  movimentoCamera: 'zoom-in',
});

async function main() {
  const raiz = await mkdtemp(join(tmpdir(), 'youstudio-roteiro-smoke-'));
  const prisma = new PrismaService();
  await prisma.$connect();
  const storage = new LocalStorageDriver(join(raiz, 'storage'));
  const projetos = new ProjectsService(prisma, storage);

  const criados: string[] = [];
  try {
    const projeto = await projetos.create(
      createProjectSchema.parse({
        ideia: 'Teste de duração',
        tema: 'Continuação automática do roteiro',
        formato: 'longo',
        duracaoMinutos: 5,
        idioma: 'pt-BR',
      }),
    );
    criados.push(projeto.id);
    await prisma.project.update({
      where: { id: projeto.id },
      data: { tituloEscolhido: 'Roteiro de teste' },
    });

    // ---------- 1. continua até 90% e só fecha no fim ----------
    let chamadas = 0;
    const aiCurto = {
      generateJson: async () => {
        chamadas += 1;
        if (chamadas === 1) {
          return {
            cenas: [cena(15, 'Abertura'), cena(15, 'Contexto')],
            // Fonte repetida de propósito para conferir a deduplicação.
            fontes: [{ titulo: 'Fonte A', autor: '', ano: '', url: '' }],
          };
        }
        if (chamadas === 5) {
          return {
            cenas: [cena(15, 'Conclusão do documentário'), cena(15, 'Inscreva-se no canal')],
            fontes: [{ titulo: 'Fonte A', autor: '', ano: '', url: '' }],
          };
        }
        // Um bloco intermediário tenta encerrar cedo de propósito: a cena de
        // CTA precisa ser descartada para não ficar no meio do roteiro.
        const cenas =
          chamadas === 3
            ? [
                ...Array.from({ length: 4 }, (_, i) => cena(15, `Bloco ${chamadas} cena ${i + 1}`)),
                cena(15, 'Se inscreva no canal para acompanhar'),
              ]
            : Array.from({ length: 5 }, (_, i) => cena(15, `Bloco ${chamadas} cena ${i + 1}`));
        return {
          cenas,
          fontes: [
            { titulo: chamadas % 2 === 0 ? 'Fonte A' : 'Fonte B', autor: '', ano: '', url: '' },
          ],
        };
      },
    } as unknown as AiService;

    const roteiro = new ScenesService(prisma, aiCurto, projetos, storage);
    const gerado = await roteiro.generate(projeto.id);

    // 2 cenas (30 s) + 3 blocos de continuação (210 s) + fechamento (30 s) = 270 s (90% de 300 s).
    conferir(chamadas === 5, `continuação: 5 chamadas (foram ${chamadas})`);
    conferir(gerado.scenes.length === 18, `continuação: 18 cenas (foram ${gerado.scenes.length})`);
    conferir(
      gerado.resumo.totalSegundos === 270,
      `continuação: 90% da duração alvo (${gerado.resumo.totalSegundos} s)`,
    );
    conferir(gerado.resumo.dentroDaMargem, 'continuação: dentro da margem de 10%');
    conferir(gerado.avisos.length === 0, `continuação: sem avisos (${gerado.avisos.join(' | ')})`);
    conferir(
      gerado.fontes.length === 2,
      `continuação: fontes deduplicadas (${gerado.fontes.length})`,
    );
    conferir(
      gerado.scenes.every((s, i) => s.numero === i + 1),
      'continuação: cenas renumeradas em sequência',
    );
    const comInscricao = gerado.scenes.filter((s) => /inscrev/i.test(s.textoNarrado));
    conferir(comInscricao.length === 1, 'fechamento: uma única chamada para inscrição');
    conferir(
      comInscricao[0]?.numero === gerado.scenes.length,
      'fechamento: chamada para inscrição só na última cena',
    );

    // ---------- 2. falha no meio preserva o que já foi gerado ----------
    let segundaChamada = 0;
    const aiComFalha = {
      generateJson: async () => {
        segundaChamada += 1;
        if (segundaChamada === 1) {
          return { cenas: [cena(20, 'Primeira'), cena(20, 'Segunda')], fontes: [] };
        }
        throw new Error('cota esgotada');
      },
    } as unknown as AiService;

    const roteiroComFalha = new ScenesService(prisma, aiComFalha, projetos, storage);
    const parcial = await roteiroComFalha.generate(projeto.id);
    conferir(parcial.scenes.length === 2, 'falha: mantém as cenas já geradas');
    conferir(
      parcial.avisos.some((a) => a.includes('interrompida')),
      'falha: aviso de interrupção',
    );
    conferir(
      parcial.resumo.totalSegundos === 40,
      `falha: total salvo (${parcial.resumo.totalSegundos} s)`,
    );
  } finally {
    for (const id of criados) {
      await prisma.project.delete({ where: { id } }).catch(() => undefined);
      await storage.removePrefix(`projects/${id}`).catch(() => undefined);
    }
    await prisma.$disconnect();
    await fs.rm(raiz, { recursive: true, force: true }).catch(() => undefined);
  }

  if (falhas.length) {
    console.error(`\n${falhas.length} falha(s) de ${passos} verificações:`);
    for (const f of falhas) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`OK: ${passos} verificações da geração de roteiro passaram.`);
}

main().catch((e) => {
  console.error('FALHOU:', e instanceof Error ? e.stack : e);
  process.exit(1);
});
