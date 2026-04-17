/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateResponse, LLMClient, ToolCall } from '@qwen-code/llm';
import type {
  AgentLoopConfig,
  AgentLoopResult,
  AgentLoopEvent,
  AgentLoopEventHandler,
  TerminateReason,
  ToolExecutionResult,
  ToolExecutor,
} from './types.js';
import type { AgentContextImpl} from './context.js';
import { createAgentContext } from './context.js';
import { DEFAULT_AGENT_LOOP_CONFIG } from './types.js';

/**
 * AgentLoop - The core reasoning and execution loop.
 *
 * Design principles:
 * 1. Minimal: ~150 lines, easy to understand and modify
 * 2. Composable: Dependencies injected (LLMClient, ToolExecutor)
 * 3. Observable: Events emitted for every significant action
 * 4. Interruptible: Respects AbortSignal
 *
 * The loop:
 * ```
 * while (!shouldStop) {
 *   response = await llm.generateStream(context.history)
 *   if (response.toolCalls) {
 *     results = await toolExecutor.execute(response.toolCalls)
 *     context.appendToolResults(results)
 *   } else {
 *     break  // Goal achieved
 *   }
 * }
 * ```
 */
export class AgentLoop {
  private context!: AgentContextImpl;
  private turnCount = 0;
  private startTime = 0;
  private eventHandlers: AgentLoopEventHandler[] = [];

  constructor(
    private readonly llmClient: LLMClient,
    private readonly toolExecutor: ToolExecutor,
    private readonly config: AgentLoopConfig = DEFAULT_AGENT_LOOP_CONFIG,
  ) {}

  // ============================================================================
  // Event Handling
  // ============================================================================

  onEvent(handler: AgentLoopEventHandler): void {
    this.eventHandlers.push(handler);
  }

  private emit(type: AgentLoopEvent['type'], data: unknown): void {
    const event: AgentLoopEvent = { type, data, timestamp: Date.now() };
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  // ============================================================================
  // Main Loop
  // ============================================================================

  /**
   * Run the agent loop with initial user message.
   */
  async run(
    userMessage: string,
    signal?: AbortSignal,
  ): Promise<AgentLoopResult> {
    this.startTime = Date.now();
    this.turnCount = 0;
    this.context = createAgentContext();

    // Add initial messages
    if (this.config.systemPrompt) {
      this.context = this.context.withMessage({
        role: 'system',
        content: this.config.systemPrompt,
      });
    }
    this.context = this.context.addUserMessage(userMessage);

    let terminateReason: TerminateReason = 'goal_achieved';
    let finalContent = '';

    try {
      while (!this.shouldStop()) {
        if (signal?.aborted) {
          terminateReason = 'user_cancel';
          break;
        }

        this.turnCount++;
        this.emit('turn_start', { turn: this.turnCount });

        // Generate response (content is emitted during streaming)
        const response = await this.generateResponse(signal);

        // Store final content
        if (response.content) {
          finalContent = response.content;
        }

        // Handle tool calls
        if (response.toolCalls && response.toolCalls.length > 0) {
          const results = await this.executeTools(response.toolCalls, signal);
          this.appendToolResults(results);
        } else {
          // No tool calls = goal achieved
          break;
        }

        this.emit('turn_end', { turn: this.turnCount });
      }

      // Check termination reasons
      if (this.turnCount >= this.config.maxTurns) {
        terminateReason = 'max_turns';
      } else if (this.elapsedMinutes() >= this.config.maxTimeMinutes) {
        terminateReason = 'max_time';
      }
    } catch (error) {
      terminateReason = 'error';
      this.emit('error', error);
      // Don't rethrow - let the caller handle it via the error event
    }

    return {
      content: finalContent,
      reason: terminateReason,
      turns: this.turnCount,
      toolCalls: this.turnCount, // Simplified: counts turns with tools
      durationMs: Date.now() - this.startTime,
      finalContext: this.context.snapshot(),
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private shouldStop(): boolean {
    return (
      this.turnCount >= this.config.maxTurns ||
      this.elapsedMinutes() >= this.config.maxTimeMinutes
    );
  }

  private elapsedMinutes(): number {
    return (Date.now() - this.startTime) / 60000;
  }

  private async generateResponse(
    signal?: AbortSignal,
  ): Promise<GenerateResponse> {
    const tools = this.toolExecutor.getToolDefinitions();
    // Pass empty config - the LLM client will use its configured model
    const config = {};

    let fullContent = '';
    let toolCalls: ToolCall[] = [];
    let finishReason: GenerateResponse['finishReason'] = 'stop';

    // Use streaming for real-time output
    for await (const chunk of this.llmClient.generateStream(
      this.context.history,
      tools,
      config,
      signal,
    )) {
      if (chunk.delta) {
        fullContent += chunk.delta;
        this.emit('content', chunk.delta);
      }
      if (chunk.toolCalls) {
        toolCalls = chunk.toolCalls;
      }
      if (chunk.finishReason) {
        finishReason = chunk.finishReason;
      }
    }

    // Add assistant message to history
    if (fullContent || toolCalls.length > 0) {
      this.context = this.context.addAssistantMessage(fullContent);
    }

    return {
      content: fullContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
    };
  }

  private async executeTools(
    calls: ToolCall[],
    signal?: AbortSignal,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const call of calls) {
      this.emit('tool_call', call);

      const result = await this.toolExecutor.execute(
        call,
        this.context,
        signal,
      );
      results.push(result);

      this.emit('tool_result', result);
    }

    return results;
  }

  private appendToolResults(results: ToolExecutionResult[]): void {
    for (const result of results) {
      this.context = this.context.addToolResult(
        result.toolCallId,
        result.output,
        result.isError,
      );
    }
  }
}

/**
 * Create an agent loop instance.
 */
export function createAgentLoop(
  llmClient: LLMClient,
  toolExecutor: ToolExecutor,
  config?: Partial<AgentLoopConfig>,
): AgentLoop {
  return new AgentLoop(llmClient, toolExecutor, {
    ...DEFAULT_AGENT_LOOP_CONFIG,
    ...config,
  });
}
