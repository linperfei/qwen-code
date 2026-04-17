/**
 * @license
 * Copyright 2026 Tiny Agent Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Core Agent Layer
 *
 * This module provides the minimal agent implementation:
 * - AgentLoop: The reasoning and execution loop
 * - AgentContext: Immutable state container
 * - ToolExecutor: Interface for tool execution
 *
 * Design philosophy: Keep it simple, keep it testable.
 *
 * @example
 * ```typescript
 * import { createAgentLoop, createAgentContext } from './agent';
 * import { createLLMClient } from '@tiny-agent/llm';
 *
 * const llmClient = createLLMClient({ model: 'gpt-4o' });
 * const toolExecutor = new MyToolExecutor();
 *
 * const agent = createAgentLoop(llmClient, toolExecutor, {
 *   maxTurns: 10,
 *   systemPrompt: 'You are a helpful coding assistant.',
 * });
 *
 * const result = await agent.run('Write a hello world program');
 * console.log(result.content);
 * ```
 */

// Types
export type {
  AgentContext,
  AgentLoopConfig,
  AgentLoopEvent,
  AgentLoopEventHandler,
  AgentLoopResult,
  ContextSnapshot,
  TerminateReason,
  ToolExecutionResult,
  ToolExecutor,
} from './types.js';

export { DEFAULT_AGENT_LOOP_CONFIG } from './types.js';

// Context
export { AgentContextImpl, createAgentContext } from './context.js';

// Loop
export { AgentLoop, createAgentLoop } from './loop.js';

// Executor
export {
  BaseToolExecutor,
  SimpleToolExecutor,
  createSimpleToolExecutor,
} from './executor.js';
