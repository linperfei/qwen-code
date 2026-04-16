/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type { ChatMessage, ContentPart } from '@qwen-code/llm';
import type { AgentContext, ContextSnapshot } from './types.js';

/**
 * AgentContext - Minimal state container for agent execution.
 *
 * Design principles:
 * 1. Immutable history: Use withHistory() to create new context with added messages
 * 2. Simple state: Only three core pieces of state (history, cwd, env)
 * 3. Serializable: Can be snapshotted and restored
 */
export class AgentContextImpl implements AgentContext {
  private _history: ChatMessage[] = [];
  private _workingDirectory: string;
  private _environment: Record<string, string>;
  private _sessionId: string;
  private _userContext?: string;

  constructor(
    options: {
      workingDirectory?: string;
      environment?: Record<string, string>;
      sessionId?: string;
      userContext?: string;
    } = {},
  ) {
    this._workingDirectory = options.workingDirectory ?? process.cwd();
    this._environment =
      options.environment ?? ({ ...process.env } as Record<string, string>);
    this._sessionId = options.sessionId ?? randomUUID();
    this._userContext = options.userContext;
  }

  // ============================================================================
  // Getters
  // ============================================================================

  get history(): ChatMessage[] {
    return [...this._history]; // Return copy for immutability
  }

  get workingDirectory(): string {
    return this._workingDirectory;
  }

  get environment(): Record<string, string> {
    return { ...this._environment };
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get userContext(): string | undefined {
    return this._userContext;
  }

  // ============================================================================
  // History Management
  // ============================================================================

  /**
   * Create new context with added message.
   * Returns new instance, original is unchanged.
   */
  withMessage(message: ChatMessage): AgentContextImpl {
    const newContext = this.clone();
    newContext._history.push(message);
    return newContext;
  }

  /**
   * Add user message.
   */
  addUserMessage(content: string | ContentPart[]): AgentContextImpl {
    return this.withMessage({ role: 'user', content });
  }

  /**
   * Add assistant message.
   */
  addAssistantMessage(content: string): AgentContextImpl {
    return this.withMessage({ role: 'assistant', content });
  }

  /**
   * Add tool result message.
   */
  addToolResult(
    toolCallId: string,
    content: string,
    _isError = false,
  ): AgentContextImpl {
    return this.withMessage({
      role: 'tool',
      content,
      toolCallId,
    });
  }

  /**
   * Clear history.
   */
  clearHistory(): AgentContextImpl {
    const newContext = this.clone();
    newContext._history = [];
    return newContext;
  }

  /**
   * Truncate history to last N messages.
   */
  truncateHistory(keepLast: number): AgentContextImpl {
    const newContext = this.clone();
    newContext._history = newContext._history.slice(-keepLast);
    return newContext;
  }

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Update working directory.
   */
  withWorkingDirectory(dir: string): AgentContextImpl {
    const newContext = this.clone();
    newContext._workingDirectory = dir;
    return newContext;
  }

  /**
   * Set environment variable.
   */
  withEnv(key: string, value: string): AgentContextImpl {
    const newContext = this.clone();
    newContext._environment[key] = value;
    return newContext;
  }

  /**
   * Set user context (additional context string).
   */
  withUserContext(context: string): AgentContextImpl {
    const newContext = this.clone();
    newContext._userContext = context;
    return newContext;
  }

  // ============================================================================
  // Snapshot
  // ============================================================================

  /**
   * Create snapshot of current state.
   */
  snapshot(): ContextSnapshot {
    return {
      historyLength: this._history.length,
      workingDirectory: this._workingDirectory,
      timestamp: Date.now(),
    };
  }

  // ============================================================================
  // Private
  // ============================================================================

  private clone(): AgentContextImpl {
    const newContext = new AgentContextImpl({
      workingDirectory: this._workingDirectory,
      environment: this._environment,
      sessionId: this._sessionId,
      userContext: this._userContext,
    });
    newContext._history = [...this._history];
    return newContext;
  }
}

/**
 * Create a new agent context.
 */
export function createAgentContext(
  options?: ConstructorParameters<typeof AgentContextImpl>[0],
): AgentContextImpl {
  return new AgentContextImpl(options);
}
