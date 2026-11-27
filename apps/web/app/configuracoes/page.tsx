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
    <main
      id="conteudo"
      className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-8 sm:px-6 lg:px-8"
    >
      <header className="max-w-[68ch]">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2rem]">
          Configurações de IA
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Escolha a chave e o modelo de cada provedor. O YouStudio usa o primeiro da fila e desce
          para o próximo quando alguém falha.
        </p>
      </header>
      <ConfiguracoesIa inicial={inicial} erroInicial={erro} />
    </main>
  );
}
