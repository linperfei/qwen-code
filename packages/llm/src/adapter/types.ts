/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core types for LLM layer.
 * Designed to be protocol-agnostic, using OpenAI format as baseline.
 */

// ============================================================================
// Message Types
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  name?: string;
  toolCallId?: string;
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    };

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: string[];
  description?: string;
  default?: unknown;
  [key: string]: unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

// ============================================================================
// Response Types
// ============================================================================

export interface GenerateResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_use' | 'length' | 'error';
  usage?: UsageInfo;
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Accumulated tool call during streaming (arguments as string).
 */
export interface StreamToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface StreamChunk {
  delta: string;
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'tool_use' | 'length';
  usage?: UsageInfo;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface LLMConfig {
  /** Model identifier */
  model: string;

  /** API key (or reference to env var) */
  apiKey?: string;
  apiKeyEnvKey?: string;

  /** Base URL for API endpoint */
  baseUrl?: string;

  /** Sampling parameters */
  sampling?: SamplingParams;

  /** Request timeout in ms */
  timeout?: number;

  /** Custom headers */
  headers?: Record<string, string>;

  /** Extra body parameters (provider-specific) */
  extraBody?: Record<string, unknown>;
}

export interface SamplingParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stop?: string[];
}

// ============================================================================
// Provider Types
// ============================================================================

export type ProviderType = 'openai-compatible';

export interface ProviderConfig {
  type: ProviderType;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  defaultSampling?: SamplingParams;
}
