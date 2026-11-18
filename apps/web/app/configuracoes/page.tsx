import type { AiSettingsDto } from '@yt/shared';
import { ConfiguracoesIa } from '@/components/configuracoes-ia';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Busca na API antes de renderizar: a tela já nasce com os dados (sem "carregando"). */
async function carregar(): Promise<{ inicial: AiSettingsDto | null; erro: string }> {
  try {
    return { inicial: await api.aiSettings(), erro: '' };
  } catch (e) {
    return {
      inicial: null,
      erro: e instanceof Error ? e.message : 'Não foi possível carregar as configurações.',
    };
  }
}

export default async function ConfiguracoesPage() {
  const { inicial, erro } = await carregar();

  return (
    <main className="mx-auto max-w-4xl px-6 pb-16 pt-10">
      <div className="max-w-[56ch]">
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em]">
          Configurações de IA
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Escolha a chave e o modelo de cada provedor. Você cola o modelo da sua preferência — o
          YouStudio usa o primeiro da fila e vai descendo quando alguém falha.
        </p>
      </div>
      <ConfiguracoesIa inicial={inicial} erroInicial={erro} />
    </main>
  );
}
