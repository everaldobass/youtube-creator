import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Idioma } from '@yt/shared';
import { ZodType } from 'zod';

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

  constructor(private readonly config: ConfigService) {}

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

  // ---------- configuração ----------
  private chave(): string {
    const k = this.config.get<string>('GEMINI_API_KEY');
    if (!k) {
      throw new ServiceUnavailableException(
        'Defina GEMINI_API_KEY em apps/api/.env e reinicie a API.',
      );
    }
    return k;
  }

  private modelo(variavel: 'GEMINI_MODEL_TEXT' | 'GEMINI_MODEL_IMAGE'): string {
    const m = this.config.get<string>(variavel);
    if (!m) {
      throw new ServiceUnavailableException(
        `Defina ${variavel} em apps/api/.env (nome do modelo como aparece no AI Studio) e reinicie a API.`,
      );
    }
    return m;
  }

  // ---------- chamada com fila, tentativas e erros claros ----------
  private async executar<T>(
    model: string,
    body: unknown,
    extrair: (data: GeminiResponse) => T,
  ): Promise<T> {
    const apiKey = this.chave();
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
      throw new ServiceUnavailableException(`A geração falhou: ${ultimoErro}`);
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
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new RecusaDefinitiva(msg);
      if (res.status === 429) {
        throw new Error(`${msg} — cota/limite do plano excedido (modelos de imagem exigem billing habilitado).`);
      }
      throw new Error(msg);
    }
    if (data.promptFeedback?.blockReason) {
      throw new RecusaDefinitiva(`Conteúdo bloqueado pelo modelo (${data.promptFeedback.blockReason})`);
    }
    return data;
  }

  private partes(data: GeminiResponse): Parte[] {
    return data.candidates?.[0]?.content?.parts ?? [];
  }

  // ---------- texto em JSON ----------
  async generateJson<T>(prompt: string, schema: ZodType<T>): Promise<T> {
    const model = this.modelo('GEMINI_MODEL_TEXT');
    return this.executar(
      model,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      },
      (data) => {
        const texto = this.partes(data).map((p) => p.text ?? '').join('');
        if (!texto.trim()) throw new Error('O modelo devolveu uma resposta vazia');
        const limpo = texto
          .trim()
          .replace(/^```(?:json)?/i, '')
          .replace(/```$/, '')
          .trim();
        return schema.parse(JSON.parse(limpo));
      },
    );
  }

  // ---------- voz (Fish Audio) ----------
  // A Fish Audio é um TTS: o campo `text` é lido literalmente. As marcações
  // `[calm]` e `[break]` são interpretadas pelo modelo S2 para dar pausas e
  // um tom mais natural (ver `textoParaNarracao`).
  async generateSpeech(text: string, natural = false, idioma: Idioma = 'pt-BR'): Promise<AudioGerado> {
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
            ...(natural ? { prosody: { speed: 0.97 } } : {}),
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
    const model = this.modelo('GEMINI_MODEL_IMAGE');
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
