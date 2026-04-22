import type { LLMProvider, ChatMessage, ToolDefinition, ToolCall } from './types';
import { StopReason } from './types';
import type { SSEEmitter } from '../sse';
import { SSEEventType } from '../sse';
import { mapWithConcurrency } from './concurrency';

const MAX_ITERATIONS = 10;
// Cap parallel tool dispatches — prevents batch accepts (e.g. 31 create_event calls)
// from blowing through Google Calendar's per-user write quota.
const MAX_CONCURRENT_TOOLS = 3;

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
      case StopReason.ToolUse: {
        // Model hit the token budget OR completed tool_use normally. Either way,
        // any complete tool_use blocks returned are valid — dispatch them.
        // MaxTokens WITHOUT tool calls (pure text cutoff) still needs a nudge.
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
  return mapWithConcurrency(toolCalls, MAX_CONCURRENT_TOOLS, async (tc): Promise<ChatMessage> => {
    const started = Date.now();
    console.log(`[${new Date().toISOString()}] [tool] start ${tc.name}`);
    emit({ event: SSEEventType.ToolCall, data: { tool: tc.name } });
    try {
      const result = await dispatch(tc.name, tc.input);
      const dur = Date.now() - started;
      console.log(`[${new Date().toISOString()}] [tool] done ${tc.name} dur=${dur}ms`);
      emit({ event: SSEEventType.ToolResult, data: { tool: tc.name, summary: 'Completed' } });
      return { role: 'tool_result', toolCallId: tc.id, content: result };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const dur = Date.now() - started;
      console.log(`[${new Date().toISOString()}] [tool] err ${tc.name} dur=${dur}ms msg=${errMsg}`);
      emit({
        event: SSEEventType.ToolResult,
        data: { tool: tc.name, summary: errMsg, error: true },
      });
      return { role: 'tool_result', toolCallId: tc.id, content: `Error: ${errMsg}`, isError: true };
    }
  });
}
