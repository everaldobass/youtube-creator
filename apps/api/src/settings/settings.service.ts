import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiSettingsDto,
  CampoConfigIa,
  PROVEDORES_IA_INFO,
  ProvedorIa,
  ProvedorIaConfigDto,
  UpdateProvedorIaInput,
} from '@yt/shared';
import { PrismaService } from '../prisma/prisma.service';
import { amigavel, DICA_CONFIGURACOES } from '../ai/erros-ia';

/** Resumo da chave para exibir na tela sem revelar o valor ("AIza…xyz4"). */
function resumoChave(chave: string): string {
  if (chave.length <= 8) return '••••';
  return `${chave.slice(0, 4)}…${chave.slice(-4)}`;
}

/**
 * Chaves e modelos de IA usados pelo AiService.
 * O valor salvo na tela (tabela Setting) tem prioridade sobre o .env;
 * linha apagada = volta ao valor do .env.
 */
@Injectable()
export class SettingsService {
  private readonly log = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Valor efetivo de uma variável (banco primeiro, depois .env). */
  async valor(variavel: string): Promise<string> {
    const salvo = await this.prisma.setting.findUnique({ where: { chave: variavel } });
    if (salvo) return salvo.valor;
    return this.config.get<string>(variavel) ?? '';
  }

  /** Composição de um campo: valor + de onde veio (+ resumo, para chave). */
  private async campo(variavel: string, comResumo = false): Promise<CampoConfigIa> {
    const salvo = await this.prisma.setting.findUnique({ where: { chave: variavel } });
    const valor = salvo ? salvo.valor : (this.config.get<string>(variavel) ?? '');
    const origem: CampoConfigIa['origem'] = salvo ? 'salvo' : valor ? 'env' : 'nenhuma';
    if (comResumo) {
      // A chave nunca sai do backend: o navegador recebe só o resumo ("AIza…xyz4").
      return { valor: '', origem, ...(valor ? { resumo: resumoChave(valor) } : {}) };
    }
    return { valor, origem };
  }

  /** Estado de todos os provedores para a tela de Configurações. */
  async obter(): Promise<AiSettingsDto> {
    const provedores: ProvedorIaConfigDto[] = [];
    for (const info of PROVEDORES_IA_INFO) {
      const chave = await this.campo(info.varChave, true);
      const modeloTexto = await this.campo(info.varModeloTexto);
      const modeloImagem = info.varModeloImagem
        ? await this.campo(info.varModeloImagem)
        : undefined;
      provedores.push({
        id: info.id,
        nome: info.nome,
        ordem: info.ordem,
        // A chave chega redigida ao navegador; "origem" diz se ela existe.
        ativo: chave.origem !== 'nenhuma' && Boolean(modeloTexto.valor),
        campos: { chave, modeloTexto, ...(modeloImagem ? { modeloImagem } : {}) },
      });
    }
    return { provedores };
  }

  /** Salva os campos enviados pela tela; campos ausentes não mudam. */
  async atualizar(provedor: ProvedorIa, dados: UpdateProvedorIaInput): Promise<AiSettingsDto> {
    const info = PROVEDORES_IA_INFO.find((p) => p.id === provedor);
    if (!info) throw new ServiceUnavailableException(`Provedor desconhecido: ${provedor}`);

    if (dados.restaurarEnv) {
      const chaves = [info.varChave, info.varModeloTexto, info.varModeloImagem].filter(
        (v): v is string => Boolean(v),
      );
      await this.prisma.setting.deleteMany({ where: { chave: { in: chaves } } });
      this.log.log(`${info.nome}: configuração restaurada para o .env.`);
    } else {
      if (dados.limparChave) {
        await this.prisma.setting
          .delete({ where: { chave: info.varChave } })
          .catch(() => undefined);
      } else if (dados.apiKey) {
        await this.salvar(info.varChave, dados.apiKey);
      }
      if (dados.modeloTexto !== undefined)
        await this.salvar(info.varModeloTexto, dados.modeloTexto);
      if (dados.modeloImagem !== undefined && info.varModeloImagem) {
        await this.salvar(info.varModeloImagem, dados.modeloImagem);
      }
    }
    return this.obter();
  }

  private async salvar(chave: string, valor: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: { chave },
      create: { chave, valor },
      update: { valor },
    });
  }

  /**
   * Testa o provedor com uma chamada real mínima (ping de texto).
   * Retorna { ok: true, detalhe } ou { ok: false, erro } — a chave nunca aparece.
   */
  async testar(provedor: ProvedorIa): Promise<{ ok: boolean; detalhe?: string; erro?: string }> {
    const info = PROVEDORES_IA_INFO.find((p) => p.id === provedor);
    if (!info) return { ok: false, erro: 'Provedor desconhecido.' };

    const chave = await this.valor(info.varChave);
    const modelo = await this.valor(info.varModeloTexto);
    if (!chave || !modelo) {
      return { ok: false, erro: 'Preencha a chave e o modelo de texto antes de testar.' };
    }

    try {
      const texto = await this.chamar(provedor, info.varChave, modelo, chave);
      const detalhe = texto.trim()
        ? `${info.nome} respondeu com "${texto.slice(0, 60)}"`
        : `${info.nome} aceitou a chave e respondeu.`;
      return { ok: true, detalhe };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`Teste ${info.nome} falhou: ${msg}`);
      // Para o usuário, só a frase traduzida — o detalhe fica no log.
      return { ok: false, erro: `${amigavel(msg)} ${DICA_CONFIGURACOES}` };
    }
  }

  /** Chamada mínima ao provedor, no formato da sua API. */
  private async chamar(
    provedor: ProvedorIa,
    _varChave: string,
    modelo: string,
    chave: string,
  ): Promise<string> {
    const corpo = JSON.stringify({
      model: modelo,
      contents: [{ role: 'user', parts: [{ text: 'Responda apenas com a palavra ok.' }] }],
      generationConfig: { maxOutputTokens: 16 },
    });

    if (provedor === 'gemini') {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent` +
        `?key=${chave}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: corpo,
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
      return 'ok';
    }

    if (provedor === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': chave,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Responda apenas com a palavra ok.' }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json().catch(() => ({}))) as {
        content?: { text?: string }[];
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
      return data.content?.[0]?.text ?? 'ok';
    }

    // OpenAI e Groq: compatíveis com chat/completions.
    const url =
      provedor === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: modelo,
        messages: [{ role: 'user', content: 'Responda apenas com a palavra ok.' }],
        max_tokens: 16,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
    return data.choices?.[0]?.message?.content ?? 'ok';
  }
}
