import type { ChatAdapter, EmbeddingAdapter } from '@sunil-khan/evalkit';

/**
 * Example OpenAI chat adapter.
 * Users must install `openai` package and provide their API key.
 *
 * Usage:
 *   import OpenAI from 'openai';
 *   const client = new OpenAI();
 *   const adapter = createOpenAIChatAdapter(client);
 */

interface OpenAIClient {
  chat: {
    completions: {
      create(params: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
      }): Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
  embeddings: {
    create(params: {
      model: string;
      input: string[];
    }): Promise<{ data: Array<{ embedding: number[] }> }>;
  };
}

export function createOpenAIChatAdapter(
  client: OpenAIClient,
  model = 'gpt-4o'
): ChatAdapter {
  return {
    async complete(params) {
      const messages: Array<{ role: string; content: string }> = [];

      if (params.system) {
        messages.push({ role: 'system', content: params.system });
      }

      for (const msg of params.messages) {
        messages.push({ role: msg.role, content: msg.content });
      }

      const response = await client.chat.completions.create({
        model,
        messages,
        temperature: params.temperature,
      });

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new Error('OpenAI returned empty response');
      }

      return { content };
    },
  };
}

export function createOpenAIEmbeddingAdapter(
  client: OpenAIClient,
  model = 'text-embedding-3-small'
): EmbeddingAdapter {
  return {
    async embed(texts) {
      const response = await client.embeddings.create({
        model,
        input: [...texts],
      });

      return response.data.map((d) => d.embedding);
    },
  };
}
