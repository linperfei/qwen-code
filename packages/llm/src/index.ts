/**
 * @license
 * Copyright 2026 Tiny Agent Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview LLM Layer for Tiny Agent
 *
 * This package provides a unified interface for interacting with LLM providers.
 * Design principles:
 *
 * 1. Single protocol: OpenAI-compatible API as the baseline
 * 2. User-configurable: Any OpenAI-compatible endpoint can be configured
 * 3. Stream-first: Async generators for real-time output
 * 4. Minimal dependencies: Only 'openai' as external dependency
 *
 * @example
 * ```typescript
 * import { createLLMClient, resolveModelConfig } from '@tiny-agent/llm';
 *
 * const config = resolveModelConfig('qwen-coder-plus', {
 *   'qwen-coder-plus': {
 *     id: 'qwen-coder-plus',
 *     baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
 *     envKey: 'DASHSCOPE_API_KEY',
 *   },
 * });
 *
 * const client = createLLMClient(config);
 *
 * for await (const chunk of client.generateStream(messages, tools)) {
 *   console.log(chunk.delta);
 * }
 * ```
 */

// Core types
export type {
  ChatMessage,
  ContentPart,
  GenerateResponse,
  LLMConfig,
  ProviderConfig,
  ProviderType,
  SamplingParams,
  StreamChunk,
  StreamToolCall,
  ToolCall,
  ToolDefinition,
  ToolResult,
  UsageInfo,
} from './adapter/types.js';

// Client interface
export { BaseLLMClient } from './client.js';
export type { LLMClient } from './client.js';

// OpenAI adapter
export { createOpenAIAdapter, OpenAIAdapter } from './adapter/openai.js';

// Configuration
export {
  type ModelProviderSettings,
  PREDEFINED_PROVIDERS,
  resolveModelConfig,
  validateModelConfig,
} from './config/resolver.js';

// ============================================================================
// Factory function
// ============================================================================

import type { LLMConfig } from './adapter/types.js';
import { createOpenAIAdapter } from './adapter/openai.js';

/**
 * Create an LLM client with the given configuration.
 * Currently only supports OpenAI-compatible providers.
 */
export function createLLMClient(config: LLMConfig) {
  return createOpenAIAdapter(config);
}
