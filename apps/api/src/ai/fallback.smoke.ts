/**
 * Teste de fumaça da cadeia de fallback de texto (não faz parte do build).
 * Uso: npx ts-node -P tsconfig.json src/ai/fallback.smoke.ts
 * Força a Gemini a falhar (chave inválida) e verifica se o AiService tenta
 * os provedores configurados em ordem: OpenAI → Anthropic → Groq.
 * Variáveis opcionais para isolar um provedor:
 *   FALLBACK_SOMENTE=openai|anthropic|groq  (apenas esse, pulando os anteriores)
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { AiService } from './ai.service';
import { SettingsService } from '../settings/settings.service';

const schema = z.object({ frase: z.string() });

/** Lê apps/api/.env (o ConfigModule normalmente faz isso automaticamente). */
function carregarEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const arquivo = join(__dirname, '../../.env');
  for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  const env = carregarEnv();
  // FALLBACK_SOMENTE=openai|anthropic|groq deixa só esse provedor na cadeia.
  const so = process.env.FALLBACK_SOMENTE?.toUpperCase();
  if (so) {
    for (const [nome, chave] of [
      ['OPENAI', 'OPENAI_API_KEY'],
      ['ANTHROPIC', 'ANTHROPIC_API_KEY'],
      ['GROQ', 'GROQ_API_KEY'],
    ] as const) {
      if (nome !== so) env[chave] = '';
    }
  }
  const config = new ConfigService({ ...env, GEMINI_API_KEY: 'chave-invalida-de-proposito' });
  // Stub do SettingsService: o teste lê direto do .env, sem banco.
  const settings = { valor: async (variavel: string) => env[variavel] ?? '' } as unknown as SettingsService;
  const ai = new AiService(config, settings);

  const cadeia = [
    ['OpenAI', 'OPENAI_API_KEY', 'OPENAI_MODEL_TEXT'],
    ['Anthropic', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL_TEXT'],
    ['Groq', 'GROQ_API_KEY', 'GROQ_MODEL_TEXT'],
  ] as const;
  console.log(
    'Cadeia de fallback:',
    cadeia
      .filter(([, chave, modelo]) => config.get(chave) && config.get(modelo))
      .map(([nome, , modelo]) => `${nome} (${config.get(modelo)})`)
      .join(' → ') || '(nenhum configurado)',
  );

  const inicio = Date.now();
  const resultado = await ai.generateJson(
    'Escreva uma frase curta em português sobre o outono. Responda com JSON no formato {"frase": "..."}',
    schema,
  );
  console.log('OK em', Date.now() - inicio, 'ms →', resultado);
}

main().catch((e) => {
  console.error('FALHOU:', e instanceof Error ? e.message : e);
  process.exit(1);
});
