import type { LLMProvider, ChatMessage, ToolDefinition, StreamResult } from '../../../services/agent/types';

/**
 * A fake LLMProvider that replays a scripted sequence of StreamResult objects.
 * Each call to .stream() returns the next beat and invokes onDelta for any text.
 */
export class ScriptedProvider implements LLMProvider {
  private beats: StreamResult[] = [];
  private callIndex = 0;

  loadBeats(beats: StreamResult[]): void {
    this.beats = beats;
    this.callIndex = 0;
  }

  get callCount(): number {
    return this.callIndex;
  }

  async stream(
    _system: string,
    _messages: ChatMessage[],
    _tools: ToolDefinition[],
    onDelta: (text: string) => void,
  ): Promise<StreamResult> {
    return this.doStream(onDelta);
  }

  private doStream(onDelta: (text: string) => void): StreamResult {
    if (this.callIndex >= this.beats.length) {
      throw new Error(
        `ScriptedProvider: no more beats (called ${this.callIndex + 1} times, only ${this.beats.length} beats loaded)`,
      );
    }

    const beat = this.beats[this.callIndex++];

    // Simulate streaming text in small chunks
    if (beat.text) {
      const chunkSize = 10;
      for (let i = 0; i < beat.text.length; i += chunkSize) {
        onDelta(beat.text.slice(i, i + chunkSize));
      }
    }

    return beat;
  }
}
