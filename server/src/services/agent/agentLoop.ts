import type { LLMProvider, ChatMessage, ToolDefinition, ToolCall } from './types';
import { StopReason } from './types';
import type { SSEEmitter } from '../sse';
import { SSEEventType } from '../sse';

const MAX_ITERATIONS = 10;

export interface AgentLoopDeps {
  provider: LLMProvider;
  tools: ToolDefinition[];
  dispatchTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  buildSystemPrompt: () => string;
}

export async function runAgentLoop(
  inputMessages: ChatMessage[],
  deps: AgentLoopDeps,
  emit: SSEEmitter,
): Promise<void> {
  const system = deps.buildSystemPrompt();
  const messages: ChatMessage[] = [...inputMessages];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    emit({ event: SSEEventType.Status, data: { type: 'thinking' } });

    const result = await deps.provider.stream(
      system,
      messages,
      deps.tools,
      (text) => emit({ event: SSEEventType.Delta, data: { text } }),
    );

    switch (result.stopReason) {
      case StopReason.EndTurn: {
        emit({ event: SSEEventType.Done, data: {} });
        return;
      }

      case StopReason.MaxTokens:
        // Model hit the token budget mid-response. Nudge it to resume.
        handleIncompleteResponse(messages, result.text);
        continue;

      case StopReason.ToolUse: {
        // API quirk: the model can signal tool_use but return no tool call blocks.
        // Treat it the same as MaxTokens — nudge and retry.
        if (result.toolCalls.length === 0) {
          handleIncompleteResponse(messages, result.text);
          continue;
        }

        const toolResults = await dispatchAll(result.toolCalls, deps.dispatchTool, emit);
        messages.push({ role: 'assistant', text: result.text, toolCalls: result.toolCalls });
        messages.push(...toolResults);
        continue;
      }

      default: {
        // Should never happen — StopReason covers all values the API currently returns.
        // If a new stop reason is introduced, fail loudly rather than spinning the loop.
        console.error(`[agentLoop] Unrecognised stop reason: ${result.stopReason as string}`);
        emit({ event: SSEEventType.Error, data: { message: 'Unexpected response from AI provider.' } });
        emit({ event: SSEEventType.Done, data: {} });
        return;
      }
    }
  }

  emit({
    event: SSEEventType.Error,
    data: { message: 'Too many tool calls — please try a simpler question.' },
  });
  emit({ event: SSEEventType.Done, data: {} });
}

/** Appends a partial assistant turn and a "Please continue." nudge so the loop retries. */
function handleIncompleteResponse(messages: ChatMessage[], text: string): void {
  messages.push({ role: 'assistant', text, toolCalls: [] });
  messages.push({ role: 'user', content: 'Please continue.' });
}

async function dispatchAll(
  toolCalls: ToolCall[],
  dispatch: (name: string, input: Record<string, unknown>) => Promise<string>,
  emit: SSEEmitter,
): Promise<ChatMessage[]> {
  return Promise.all(
    toolCalls.map(async (tc): Promise<ChatMessage> => {
      emit({ event: SSEEventType.ToolCall, data: { tool: tc.name } });
      try {
        const result = await dispatch(tc.name, tc.input);
        emit({ event: SSEEventType.ToolResult, data: { tool: tc.name, summary: 'Completed' } });
        return { role: 'tool_result', toolCallId: tc.id, content: result };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        emit({
          event: SSEEventType.ToolResult,
          data: { tool: tc.name, summary: errMsg, error: true },
        });
        return { role: 'tool_result', toolCallId: tc.id, content: `Error: ${errMsg}`, isError: true };
      }
    }),
  );
}
