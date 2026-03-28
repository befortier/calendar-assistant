import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatMessage, ToolDefinition, StreamResult, ToolCall } from '../../agent/types';
import { StopReason } from '../../agent/types';

export class ClaudeAdapter implements LLMProvider {
  constructor(
    private readonly client: Anthropic,
    private readonly model = 'claude-sonnet-4-6',
  ) {}

  async stream(
    system: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onDelta: (text: string) => void,
  ): Promise<StreamResult> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system,
      tools: tools.map(toAnthropicTool),
      messages: messages.map(toAnthropicMessage),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onDelta(event.delta.text);
      }
    }

    return normalizeResponse(await stream.finalMessage());
  }
}

function toAnthropicTool(def: ToolDefinition): Anthropic.Tool {
  return {
    name: def.name,
    description: def.description,
    input_schema: {
      ...def.inputSchema,
      ...(def.strict ? { additionalProperties: false } : {}),
    },
    ...(def.strict ? { strict: true } : {}),
  };
}

function toAnthropicMessage(msg: ChatMessage): Anthropic.MessageParam {
  switch (msg.role) {
    case 'user':
      return { role: 'user', content: msg.content };
    case 'assistant': {
      const content: Anthropic.ContentBlockParam[] = [];
      if (msg.text) content.push({ type: 'text', text: msg.text });
      for (const tc of msg.toolCalls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      return { role: 'assistant', content };
    }
    case 'tool_result':
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.toolCallId,
            content: msg.content,
            ...(msg.isError ? { is_error: true } : {}),
          },
        ],
      };
  }
}

function normalizeResponse(msg: Anthropic.Message): StreamResult {
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const toolCalls: ToolCall[] = msg.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

  const stopReason =
    msg.stop_reason === 'tool_use'
      ? StopReason.ToolUse
      : msg.stop_reason === 'max_tokens'
        ? StopReason.MaxTokens
        : StopReason.EndTurn;

  return { stopReason, text, toolCalls };
}
