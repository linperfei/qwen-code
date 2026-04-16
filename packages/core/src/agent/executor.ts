/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolCall, ToolDefinition } from '@qwen-code/llm';
import type {
  ToolExecutor,
  ToolExecutionResult,
  AgentContext,
} from './types.js';

/**
 * Base implementation of ToolExecutor.
 * Provides tool registration and lookup, subclasses implement execution.
 */
export abstract class BaseToolExecutor implements ToolExecutor {
  protected tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a tool.
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools.
   */
  registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * Check if a tool is available.
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tool definitions.
   */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool call. Must be implemented by subclass.
   */
  abstract execute(
    call: ToolCall,
    context: AgentContext,
    signal?: AbortSignal,
  ): Promise<ToolExecutionResult>;
}

/**
 * Simple in-memory tool executor for testing.
 */
export class SimpleToolExecutor extends BaseToolExecutor {
  private handlers: Map<
    string,
    (args: Record<string, unknown>, context: AgentContext) => Promise<string>
  > = new Map();

  /**
   * Register a tool with its handler function.
   */
  registerToolWithHandler(
    tool: ToolDefinition,
    handler: (
      args: Record<string, unknown>,
      context: AgentContext,
    ) => Promise<string>,
  ): void {
    this.registerTool(tool);
    this.handlers.set(tool.name, handler);
  }

  async execute(
    call: ToolCall,
    context: AgentContext,
    _signal?: AbortSignal,
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const handler = this.handlers.get(call.name);

    if (!handler) {
      return {
        toolCallId: call.id,
        toolName: call.name,
        output: `Error: Unknown tool '${call.name}'`,
        isError: true,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const output = await handler(call.arguments, context);
      return {
        toolCallId: call.id,
        toolName: call.name,
        output,
        isError: false,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        toolCallId: call.id,
        toolName: call.name,
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

/**
 * Create a simple tool executor.
 */
export function createSimpleToolExecutor(): SimpleToolExecutor {
  return new SimpleToolExecutor();
}
