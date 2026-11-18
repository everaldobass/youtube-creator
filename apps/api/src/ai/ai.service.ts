import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Idioma } from '@yt/shared';
import { ZodType } from 'zod';
import { SettingsService } from '../settings/settings.service';
import { amigavel, DICA_CONFIGURACOES } from './erros-ia';

const MAX_CONCORRENCIA = 2; // limite do documento: no máximo 2 gerações ao mesmo tempo
const MAX_TENTATIVAS = 3;

interface Parte {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}
interface GeminiResponse {
  candidates?: { content?: { parts?: Parte[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

interface AnthropicResponse {
  content?: { type?: string; text?: string }[];
  error?: { message?: string };
}

/** Parte de mensagem no formato da OpenAI/Groq (texto ou imagem em base64). */
type ParteOpenAI =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

/** Bloco no formato da Anthropic (texto ou imagem em base64). */
type BlocoAnthropic =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/** Um provedor alternativo de texto, usado quando a Gemini falha. */
interface FallbackTexto {
  nome: string;
  modelo: string;
  exec: (prompt: string, imagens: { data: Buffer; mime: string }[]) => Promise<string>;
}

const SISTEMA_JSON =
  'Você responde exclusivamente com JSON válido, sem comentários e sem cercas de código.';

class RecusaDefinitiva extends Error {}

export interface AudioGerado {
  wav: Buffer;
  duracaoMs: number;
}
export interface ImagemGerada {
  data: Buffer;
  mime: string;
}

/** Único ponto de acesso à Gemini API. A chave nunca sai do backend. */
@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);
  private ativos = 0;
  private fila: (() => void)[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  // ---------- controle de concorrência ----------
  private async entrar(): Promise<void> {
    if (this.ativos < MAX_CONCORRENCIA) {
      this.ativos++;
      return;
    }
    // A vaga é repassada diretamente por sair(), sem alterar o contador.
    await new Promise<void>((resolve) => this.fila.push(resolve));
  }

  private sair(): void {
    const proximo = this.fila.shift();
    if (proximo) proximo();
    else this.ativos--;
  }

  // ---------- configuração (tela de Configurações tem prioridade sobre o .env) ----------
  private async chave(): Promise<string> {
    const k = await this.settings.valor('GEMINI_API_KEY');
    if (!k) {
      throw new ServiceUnavailableException(
        'A chave da Gemini não está configurada. Abra Configurações e informe GEMINI_API_KEY.',
      );
    }
    return k;
  }

  private async modelo(variavel: 'GEMINI_MODEL_TEXT' | 'GEMINI_MODEL_IMAGE'): Promise<string> {
    const m = await this.settings.valor(variavel);
    if (!m) {
      throw new ServiceUnavailableException(
        `O modelo ${variavel} não está configurado. Abra Configurações e informe o nome do modelo.`,
      );
    }
    return m;
  }

  // ---------- cadeia de fallback de texto (usada só quando a Gemini falha) ----------
  /**
   * Provedores alternativos configurados, na ordem em que devem ser tentados:
   * OpenAI → Anthropic → Groq. Cada um só entra se a chave e o modelo estiverem
   * definidos no .env. A Gemini continua sendo sempre a primeira opção.
   */
  private async provedoresTexto(): Promise<FallbackTexto[]> {
    const lista: FallbackTexto[] = [];

    const openai = await this.par('OPENAI_API_KEY', 'OPENAI_MODEL_TEXT');
    if (openai) {
      lista.push({
        nome: 'OpenAI',
        modelo: openai.modelo,
        exec: (prompt, imagens) =>
          this.chamarOpenAICompativel(
            'https://api.openai.com/v1/chat/completions',
            openai.chave,
            openai.modelo,
            this.mensagensChat(prompt, imagens),
          ),
      });
    }

    const anthropic = await this.par('ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL_TEXT');
    if (anthropic) {
      lista.push({
        nome: 'Anthropic',
        modelo: anthropic.modelo,
        exec: (prompt, imagens) =>
          this.chamarAnthropic(anthropic.chave, anthropic.modelo, prompt, imagens),
      });
    }

    const groq = await this.par('GROQ_API_KEY', 'GROQ_MODEL_TEXT');
    if (groq) {
      lista.push({
        nome: 'Groq',
        modelo: groq.modelo,
        // A API da Groq é compatível com o formato chat/completions da OpenAI.
        exec: (prompt, imagens) =>
          this.chamarOpenAICompativel(
            'https://api.groq.com/openai/v1/chat/completions',
            groq.chave,
            groq.modelo,
            this.mensagensChat(prompt, imagens),
          ),
      });
    }

    return lista;
  }

  /** Lê a par de variáveis (chave + modelo) de um provedor; null se incompleta. */
  private async par(
    varChave: string,
    varModelo: string,
  ): Promise<{ chave: string; modelo: string } | null> {
    const chave = await this.settings.valor(varChave);
    const modelo = await this.settings.valor(varModelo);
    if (!chave || !modelo) return null;
    return { chave, modelo };
  }

  /**
   * Executa a geração com a Gemini e, se ela falhar, tenta os provedores
   * configurados em ordem (OpenAI → Anthropic → Groq). Se nenhum estiver
   * configurado, o erro da Gemini é propagado; se todos falharem, o erro
   * informa o motivo de cada um.
   */
  private async comFallbacks<T>(
    gemini: () => Promise<T>,
    alternativo: (fb: FallbackTexto) => Promise<T>,
  ): Promise<T> {
    try {
      return await gemini();
    } catch (erroGemini) {
      const brutoGemini = erroGemini instanceof Error ? erroGemini.message : String(erroGemini);
      const provedores = await this.provedoresTexto();
      if (provedores.length === 0) {
        // Sem alternativa: o motivo vira frase amigável para o usuário final.
        const motivo = amigavel(brutoGemini);
        this.log.warn(`Gemini falhou sem fallback disponível: ${brutoGemini}`);
        throw new ServiceUnavailableException(`${motivo} ${DICA_CONFIGURACOES}`);
      }
      const motivos: string[] = [`Gemini: ${amigavel(brutoGemini)}`];
      this.log.warn(
        `Gemini falhou (${brutoGemini}); tentando ${provedores.map((p) => p.nome).join(' → ')}.`,
      );
      for (const fb of provedores) {
        try {
          return await alternativo(fb);
        } catch (e) {
          const bruto = e instanceof Error ? e.message : String(e);
          // Log técnico completo; para o usuário, só a frase traduzida.
          this.log.warn(`Fallback ${fb.nome} (${fb.modelo}) falhou: ${bruto}`);
          motivos.push(`${fb.nome}: ${amigavel(bruto)}`);
        }
      }
      throw new ServiceUnavailableException(
        `A geração falhou em todos os provedores configurados — ${motivos.join(' · ')}. ${DICA_CONFIGURACOES}`,
      );
    }
  }

  /** Mensagens no formato chat/completions (OpenAI e Groq), com imagens em data URL. */
  private mensagensChat(prompt: string, imagens: { data: Buffer; mime: string }[] = []): unknown[] {
    const conteudo: ParteOpenAI[] = [{ type: 'text', text: prompt }];
    for (const i of imagens) {
      conteudo.push({
        type: 'image_url',
        image_url: { url: `data:${i.mime};base64,${i.data.toString('base64')}` },
      });
    }
    return [
      { role: 'system', content: SISTEMA_JSON },
      { role: 'user', content: imagens.length ? conteudo : prompt },
    ];
  }

  /** Chamada genérica a uma API compatível com chat/completions (OpenAI e Groq). */
  private async chamarOpenAICompativel(
    url: string,
    apiKey: string,
    model: string,
    mensagens: unknown[],
  ): Promise<string> {
    return this.comTentativas('OpenAI-compatível', async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: mensagens }),
        signal: AbortSignal.timeout(180_000),
      });
      const data = (await res.json().catch(() => ({}))) as OpenAIResponse;
      if (!res.ok) throw this.erroHttp(res.status, data.error?.message);
      const texto = data.choices?.[0]?.message?.content ?? '';
      if (!texto.trim()) throw new Error('O modelo devolveu uma resposta vazia');
      return texto;
    });
  }

  /** Chamada à Anthropic Messages API (claude-*). */
  private async chamarAnthropic(
    apiKey: string,
    model: string,
    prompt: string,
    imagens: { data: Buffer; mime: string }[],
  ): Promise<string> {
    const blocos: BlocoAnthropic[] = [{ type: 'text', text: prompt }];
    for (const i of imagens) {
      blocos.push({
        type: 'image',
        source: { type: 'base64', media_type: i.mime, data: i.data.toString('base64') },
      });
    }
    return this.comTentativas('Anthropic', async () => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          system: SISTEMA_JSON,
          messages: [{ role: 'user', content: blocos }],
        }),
        signal: AbortSignal.timeout(180_000),
      });
      const data = (await res.json().catch(() => ({}))) as AnthropicResponse;
      if (!res.ok) throw this.erroHttp(res.status, data.error?.message);
      const texto = (data.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
      if (!texto.trim()) throw new Error('O modelo devolveu uma resposta vazia');
      return texto;
    });
  }

  /** Traduz o status HTTP em erro claro; 4xx (exceto 429) não melhora com nova tentativa. */
  private erroHttp(status: number, mensagem?: string): Error {
    const msg = mensagem ?? `HTTP ${status}`;
    if (status >= 400 && status < 500 && status !== 429) return new RecusaDefinitiva(msg);
    if (status === 429) return new Error(`${msg} — cota/limite do plano excedido.`);
    return new Error(msg);
  }

  /** Fila + até 3 tentativas para qualquer chamada de texto alternativa. */
  private async comTentativas<T>(provedor: string, fn: () => Promise<T>): Promise<T> {
    await this.entrar();
    try {
      let ultimoErro = 'Falha desconhecida';
      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
        try {
          return await fn();
        } catch (e) {
          ultimoErro = e instanceof Error ? e.message : String(e);
          this.log.warn(
            `[${provedor}] Tentativa ${tentativa}/${MAX_TENTATIVAS} falhou: ${ultimoErro}`,
          );
          if (e instanceof RecusaDefinitiva) break;
          if (tentativa < MAX_TENTATIVAS) await new Promise((r) => setTimeout(r, 1500 * tentativa));
        }
      }
      throw new ServiceUnavailableException(`A geração falhou (${provedor}): ${ultimoErro}`);
    } finally {
      this.sair();
    }
  }

  // ---------- chamada com fila, tentativas e erros claros ----------
  private async executar<T>(
    model: string,
    body: unknown,
    extrair: (data: GeminiResponse) => T,
  ): Promise<T> {
    const apiKey = await this.chave();
    await this.entrar();
    try {
      let ultimoErro = 'Falha desconhecida';
      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
        try {
          return extrair(await this.chamar(apiKey, model, body));
        } catch (e) {
          ultimoErro = e instanceof Error ? e.message : String(e);
          this.log.warn(`Tentativa ${tentativa}/${MAX_TENTATIVAS} falhou: ${ultimoErro}`);
          if (e instanceof RecusaDefinitiva) break;
          if (tentativa < MAX_TENTATIVAS) await new Promise((r) => setTimeout(r, 1500 * tentativa));
        }
      }
      throw new ServiceUnavailableException(`${amigavel(ultimoErro)} ${DICA_CONFIGURACOES}`.trim());
    } finally {
      this.sair();
    }
  }

  private async chamar(apiKey: string, model: string, body: unknown): Promise<GeminiResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      // 4xx (exceto 429) não melhora com nova tentativa: chave inválida, modelo inexistente etc.
      if (res.status >= 400 && res.status < 500 && res.status !== 429)
        throw new RecusaDefinitiva(msg);
      if (res.status === 429) {
        throw new Error(
          `${msg} — cota/limite do plano excedido (modelos de imagem exigem billing habilitado).`,
        );
      }
      throw new Error(msg);
    }
    if (data.promptFeedback?.blockReason) {
      throw new RecusaDefinitiva(
        `Conteúdo bloqueado pelo modelo (${data.promptFeedback.blockReason})`,
      );
    }
    return data;
  }

  private partes(data: GeminiResponse): Parte[] {
    return data.candidates?.[0]?.content?.parts ?? [];
  }

  // ---------- texto em JSON ----------
  async generateJson<T>(prompt: string, schema: ZodType<T>): Promise<T> {
    const model = await this.modelo('GEMINI_MODEL_TEXT');
    return this.comFallbacks(
      () =>
        this.executar(
          model,
          {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          },
          (data) => this.parseJson(data, schema),
        ),
      async (fb) => this.parseJsonTexto(await fb.exec(prompt, []), schema),
    );
  }

  /**
   * JSON a partir de texto + imagens (verificação visual). Usa o modelo de texto
   * quando ele aceita imagem; se o modelo configurado recusar, o erro é claro.
   */
  async generateJsonWithImages<T>(
    prompt: string,
    schema: ZodType<T>,
    imagens: { data: Buffer; mime: string }[],
  ): Promise<T> {
    const model = await this.modelo('GEMINI_MODEL_TEXT');
    const parts: Parte[] = [
      { text: prompt },
      ...imagens.map((i) => ({
        inlineData: { mimeType: i.mime, data: i.data.toString('base64') },
      })),
    ];
    return this.comFallbacks(
      () =>
        this.executar(
          model,
          {
            contents: [{ role: 'user', parts }],
            generationConfig: { responseMimeType: 'application/json' },
          },
          (data) => this.parseJson(data, schema),
        ),
      async (fb) => this.parseJsonTexto(await fb.exec(prompt, imagens), schema),
    );
  }

  private parseJson<T>(data: GeminiResponse, schema: ZodType<T>): T {
    const texto = this.partes(data)
      .map((p) => p.text ?? '')
      .join('');
    if (!texto.trim()) throw new Error('O modelo devolveu uma resposta vazia');
    return this.parseJsonTexto(texto, schema);
  }

  /** Remove cercas de código (se vierem) e valida a resposta contra o schema. */
  private parseJsonTexto<T>(texto: string, schema: ZodType<T>): T {
    const limpo = texto
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    return schema.parse(JSON.parse(limpo));
  }

  // ---------- voz (Fish Audio) ----------
  // A Fish Audio é um TTS: o campo `text` é lido literalmente. As marcações
  // `[calm]` e `[break]` são interpretadas pelo modelo S2 para dar pausas e
  // um tom mais natural (ver `textoParaNarracao`).
  async generateSpeech(
    text: string,
    natural = false,
    idioma: Idioma = 'pt-BR',
    velocidade = 97,
  ): Promise<AudioGerado> {
    const apiKey = process.env.FISH_API_KEY;
    const referenceId = process.env.FISH_VOICE_ID;
    const model = process.env.FISH_MODEL_TTS || 's2.1-pro-free';

    if (!apiKey || !referenceId) {
      throw new ServiceUnavailableException(
        'Defina FISH_API_KEY e FISH_VOICE_ID em apps/api/.env e reinicie a API.',
      );
    }
    const limpo = text.trim();
    if (!limpo) throw new Error('Texto vazio para narração.');

    // Velocidade só entra quando a narração natural está ligada; 100% é o padrão da voz.
    const speed = Math.min(1.3, Math.max(0.7, (natural ? velocidade : 100) / 100));

    let ultimoErro = 'Falha desconhecida';
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        const resposta = await fetch('https://api.fish.audio/v1/tts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            model,
          },
          body: JSON.stringify({
            text: limpo,
            reference_id: referenceId,
            format: 'wav',
            normalize: true,
            // Ajuda a normalizar números, datas e unidades no idioma do vídeo.
            language: idioma,
            // Um pouco mais devagar e com pausas marcadas no texto: menos robótico.
            ...(natural ? { prosody: { speed } } : {}),
          }),
          signal: AbortSignal.timeout(120_000),
        });

        if (!resposta.ok) {
          const detalhe = (await resposta.text().catch(() => '')).slice(0, 300);
          ultimoErro = `Erro na Fish Audio (${resposta.status})${detalhe ? `: ${detalhe}` : ''}`;
          // 4xx (exceto 429) não melhora com nova tentativa: chave, voz ou modelo inválidos.
          if (resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429) break;
        } else {
          const wav = Buffer.from(await resposta.arrayBuffer());
          if (wav.length <= 44) throw new Error('A Fish Audio devolveu um áudio vazio.');
          // Lê a taxa de bytes por segundo no cabeçalho WAV (offset 28) para calcular a duração.
          const byteRate = wav.readUInt32LE(28);
          const duracaoMs = byteRate > 0 ? Math.round(((wav.length - 44) / byteRate) * 1000) : 0;
          return { wav, duracaoMs };
        }
      } catch (e) {
        ultimoErro = e instanceof Error ? e.message : String(e);
        this.log.warn(`Tentativa ${tentativa}/${MAX_TENTATIVAS} de narração falhou: ${ultimoErro}`);
      }
      if (tentativa < MAX_TENTATIVAS) await new Promise((r) => setTimeout(r, 1500 * tentativa));
    }
    throw new ServiceUnavailableException(`A narração falhou: ${ultimoErro}`);
  }

  // ---------- imagem ----------
  async generateImage(prompt: string, proporcao: '16:9' | '9:16'): Promise<ImagemGerada> {
    const model = await this.modelo('GEMINI_MODEL_IMAGE');
    if (model.startsWith('imagen-')) {
      throw new ServiceUnavailableException(
        'Modelos Imagen não são compatíveis com generateContent. Use GEMINI_MODEL_IMAGE="gemini-3.1-flash-image" (ou "gemini-3-pro-image") e habilite billing no Google AI Studio.',
      );
    }
    return this.executar(
      model,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: proporcao },
        },
      },
      (data) => {
        const parte = this.partes(data).find((p) => p.inlineData?.data);
        if (!parte?.inlineData?.data) {
          throw new Error('O modelo não devolveu imagem (o conteúdo pode ter sido bloqueado)');
        }
        return {
          data: Buffer.from(parte.inlineData.data, 'base64'),
          mime: parte.inlineData.mimeType ?? 'image/png',
        };
      },
    );
  }
}

/** Cabeçalho WAV de 44 bytes para PCM de 16 bits, mono. */
export function pcmParaWav(pcm: Buffer, taxa: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(taxa, 24);
  h.writeUInt32LE(taxa * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
