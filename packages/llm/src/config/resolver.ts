/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  LLMConfig,
  ProviderConfig,
  SamplingParams,
} from '../adapter/types.js';

/**
 * Model configuration from user settings.
 * This is the user-facing config format.
 */
export interface ModelProviderSettings {
  /** Model identifier (e.g., 'gpt-4o', 'qwen3-coder-plus') */
  id: string;

  /** Display name */
  name?: string;

  /** API base URL (for non-standard endpoints) */
  baseUrl?: string;

  /** Environment variable name for API key */
  envKey?: string;

  /** Description */
  description?: string;

  /** Default sampling params */
  sampling?: SamplingParams;

  /** Provider-specific extra body */
  extraBody?: Record<string, unknown>;
}

/**
 * Resolve model configuration from user settings.
 */
export function resolveModelConfig(
  modelId: string,
  providers: Record<string, ModelProviderSettings>,
  defaults?: Partial<LLMConfig>,
): LLMConfig {
  const provider = providers[modelId];

  if (!provider) {
    // Use as direct model ID with defaults
    return {
      model: modelId,
      apiKey: defaults?.apiKey,
      apiKeyEnvKey: defaults?.apiKeyEnvKey || 'OPENAI_API_KEY',
      baseUrl: defaults?.baseUrl,
      sampling: defaults?.sampling,
      ...defaults,
    };
  }

  return {
    model: provider.id,
    apiKey: undefined, // Resolved from env at runtime
    apiKeyEnvKey: provider.envKey || 'OPENAI_API_KEY',
    baseUrl: provider.baseUrl,
    sampling: { ...defaults?.sampling, ...provider.sampling },
    extraBody: provider.extraBody,
    ...defaults,
  };
}

/**
 * Validate model configuration.
 */
export function validateModelConfig(config: LLMConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.model) {
    errors.push('Model ID is required');
  }

  // API key validation happens at runtime (might be in env)
  const hasKey =
    config.apiKey || process.env[config.apiKeyEnvKey || 'OPENAI_API_KEY'];
  if (!hasKey) {
    errors.push(
      `API key not found. Set ${config.apiKeyEnvKey || 'OPENAI_API_KEY'} environment variable.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Predefined provider configurations.
 */
export const PREDEFINED_PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    type: 'openai-compatible',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
  },
  dashscope: {
    type: 'openai-compatible',
    name: 'DashScope (Alibaba Cloud)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-coder-plus',
  },
  openrouter: {
    type: 'openai-compatible',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'qwen/qwen-2.5-coder-32b-instruct',
  },
  fireworks: {
    type: 'openai-compatible',
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    defaultModel: 'accounts/fireworks/models/qwen2p5-coder-32b-instruct',
  },
};
