/**
 * @license
 * Copyright 2026 Tiny Agent Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Core types for Agent layer.
 * Minimal, focused types supporting the three core components:
 * AgentLoop, ToolExecutor, AgentContext.
 */

import type { ChatMessage, ToolCall, ToolDefinition } from '@tiny-agent/llm';

// ============================================================================
// Agent Context Types
// ============================================================================

/**
 * Minimal agent context - the state that flows through the agent loop.
 */
export interface AgentContext {
  /** Conversation history */
  history: ChatMessage[];

  /** Current working directory */
  workingDirectory: string;

  /** Environment variables for tool execution */
  environment: Record<string, string>;

  /** User-provided context (file references, etc.) */
  userContext?: string;

  /** Session ID for tracking */
  sessionId: string;
}

/**
 * Context snapshot for state management.
 */
export interface ContextSnapshot {
  historyLength: number;
  workingDirectory: string;
  timestamp: number;
}

// ============================================================================
// Tool Execution Types
// ============================================================================

/**
 * Result of a single tool execution.
 */
export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  output: string;
  isError: boolean;
  durationMs: number;
}

/**
 * Tool executor interface.
 * Implementations handle actual tool invocation.
 */
export interface ToolExecutor {
  /**
   * Execute a tool call.
   */
  execute(
    call: ToolCall,
    context: AgentContext,
    signal?: AbortSignal,
  ): Promise<ToolExecutionResult>;

  /**
   * Get available tool definitions for LLM.
   */
  getToolDefinitions(): ToolDefinition[];

  /**
   * Check if a tool is available.
   */
  hasTool(name: string): boolean;
}

// ============================================================================
// Agent Loop Types
// ============================================================================

/**
 * Configuration for agent loop.
 */
export interface AgentLoopConfig {
  /** Maximum turns before stopping */
  maxTurns: number;

  /** Maximum time in minutes */
  maxTimeMinutes: number;

  /** System prompt */
  systemPrompt: string;

  /** Initial user message */
  userMessage: string;
}

/**
 * Reason for agent loop termination.
 */
export type TerminateReason =
  | 'goal_achieved' // No more tool calls, model said done
  | 'max_turns' // Hit turn limit
  | 'max_time' // Hit time limit
  | 'error' // Unrecoverable error
  | 'user_cancel' // User cancelled via signal
  | 'tool_error'; // Critical tool execution failure

/**
 * Result of agent loop execution.
 */
export interface AgentLoopResult {
  /** Final response content */
  content: string;

  /** Termination reason */
  reason: TerminateReason;

  /** Total turns executed */
  turns: number;

  /** Total tool calls made */
  toolCalls: number;

  /** Execution time in ms */
  durationMs: number;

  /** Final context snapshot */
  finalContext: ContextSnapshot;
}

/**
 * Event emitted during agent loop execution.
 */
export interface AgentLoopEvent {
  type:
    | 'turn_start'
    | 'turn_end'
    | 'tool_call'
    | 'tool_result'
    | 'content'
    | 'error';
  data: unknown;
  timestamp: number;
}

/**
 * Callback for agent loop events.
 */
export type AgentLoopEventHandler = (event: AgentLoopEvent) => void;

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_AGENT_LOOP_CONFIG: AgentLoopConfig = {
  maxTurns: 100,
  maxTimeMinutes: 30,
  systemPrompt: '',
  userMessage: '',
};
