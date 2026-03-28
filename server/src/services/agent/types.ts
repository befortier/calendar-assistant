/**
 * Normalized types for the LLM provider abstraction layer.
 * These types are provider-agnostic and form the contract between
 * the agent loop and any LLM provider implementation.
 */

/**
 * Stop reasons normalized across all LLM providers.
 * Allows the agent loop to handle completion uniformly.
 */
export const StopReason = {
  EndTurn: 'end_turn',
  ToolUse: 'tool_use',
  MaxTokens: 'max_tokens',
} as const;

export type StopReason = (typeof StopReason)[keyof typeof StopReason];

/**
 * Provider-neutral tool schema definition.
 * Each provider adapter converts this to its own SDK format.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  strict?: boolean;
}

/**
 * A tool call extracted from the LLM response.
 * Providers normalize their tool invocation format to this interface.
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * All message types that flow through the agent loop.
 * Discriminated union ensures type safety at each role.
 */
export type ChatMessage =
  | { role: 'user'; content: string; metadata?: Record<string, unknown> }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { role: 'tool_result'; toolCallId: string; content: string; isError?: boolean };

/**
 * What the provider returns after streaming completes.
 * Encapsulates the final state from a provider's stream.
 */
export interface StreamResult {
  stopReason: StopReason;
  text: string;
  toolCalls: ToolCall[];
}

/**
 * The contract every LLM provider must implement.
 * Providers call onDelta during streaming and return a typed StreamResult when done.
 */
export interface LLMProvider {
  stream(
    system: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onDelta: (text: string) => void,
  ): Promise<StreamResult>;
}
