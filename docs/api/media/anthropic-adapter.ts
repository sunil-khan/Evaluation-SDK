import type { ChatAdapter } from 'evalkit';

/**
 * Example Anthropic chat adapter.
 * Users must install `@anthropic-ai/sdk` and provide their API key.
 *
 * Usage:
 *   import Anthropic from '@anthropic-ai/sdk';
 *   const client = new Anthropic();
 *   const adapter = createAnthropicChatAdapter(client);
 */

interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
    }): Promise<{ content: Array<{ type: string; text: string }> }>;
  };
}

export function createAnthropicChatAdapter(
  client: AnthropicClient,
  model = 'claude-sonnet-4-6'
): ChatAdapter {
  return {
    async complete(params) {
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: params.system,
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: params.temperature,
      });

      const textBlock = response.content.find((c) => c.type === 'text');
      if (!textBlock) {
        throw new Error('Anthropic returned no text content');
      }

      return { content: textBlock.text };
    },
  };
}
