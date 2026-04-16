/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ChatMessage,
  GenerateResponse,
  LLMConfig,
  SamplingParams,
  StreamChunk,
  ToolDefinition,
} from './adapter/types.js';

/**
 * LLMClient interface - the core abstraction for all model interactions.
 *
 * Design principles:
 * 1. Single responsibility: handle model API calls only
 * 2. Protocol-agnostic: use unified types, adapters handle conversion
 * 3. Stream-first: primary method returns async generator
 */
export interface LLMClient {
  /**
   * Generate a response (non-streaming).
   * Use for simple queries or when streaming is not needed.
   */
  generate(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: LLMConfig,
  ): Promise<GenerateResponse>;

  /**
   * Generate a response (streaming).
   * Primary method for interactive use cases.
   */
  generateStream(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: LLMConfig,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk>;

  /**
   * Count tokens for given messages.
   * Used for context management and cost estimation.
   */
  countTokens(messages: ChatMessage[]): Promise<number>;

  /**
   * Check if client is ready to make requests.
   */
  isReady(): boolean;
}

/**
 * Base class for LLM clients with common utilities.
 */
export abstract class BaseLLMClient implements LLMClient {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  abstract generate(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: LLMConfig,
  ): Promise<GenerateResponse>;

  abstract generateStream(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: LLMConfig,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk>;

  abstract countTokens(messages: ChatMessage[]): Promise<number>;

  isReady(): boolean {
    return !!(
      this.config.apiKey ||
      process.env[this.config.apiKeyEnvKey || 'OPENAI_API_KEY']
    );
  }

  /**
   * Get effective API key from config or environment.
   */
  protected getApiKey(): string {
    if (this.config.apiKey) return this.config.apiKey;
    const envKey = this.config.apiKeyEnvKey || 'OPENAI_API_KEY';
    const key = process.env[envKey];
    if (!key) {
      throw new Error(
        `API key not found. Set ${envKey} environment variable or provide in config.`,
      );
    }
    return key;
  }

  /**
   * Merge sampling params with defaults.
   */
  protected mergeSampling(override?: SamplingParams): Required<SamplingParams> {
    return {
      temperature:
        override?.temperature ?? this.config.sampling?.temperature ?? 0.7,
      topP: override?.topP ?? this.config.sampling?.topP ?? 1,
      topK: override?.topK ?? this.config.sampling?.topK ?? 40,
      maxTokens: override?.maxTokens ?? this.config.sampling?.maxTokens ?? 4096,
      stop: override?.stop ?? this.config.sampling?.stop ?? [],
    };
  }
}
