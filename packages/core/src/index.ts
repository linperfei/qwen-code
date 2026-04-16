/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Qwen Code Core - Minimal Agent Library
 *
 * This package provides the core agent implementation:
 * - AgentLoop: The reasoning and execution loop
 * - AgentContext: Immutable state container
 * - ToolExecutor: Interface for tool execution
 *
 * Design philosophy: Keep it simple, keep it testable.
 */

// ============================================================================
// Agent Layer (Core)
// ============================================================================

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
} from './agent/index.js';

export {
  DEFAULT_AGENT_LOOP_CONFIG,
  AgentContextImpl,
  createAgentContext,
  AgentLoop,
  createAgentLoop,
  BaseToolExecutor,
  SimpleToolExecutor,
  createSimpleToolExecutor,
} from './agent/index.js';
