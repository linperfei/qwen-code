/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from 'openai';
import { BaseLLMClient } from '../client.js';
import type {
  ChatMessage,
  GenerateResponse,
  LLMConfig,
  StreamChunk,
  StreamToolCall,
  ToolDefinition,
  ToolCall,
} from './types.js';

/**
 * OpenAI-compatible adapter.
 * Supports OpenAI, DashScope, OpenRouter, and any OpenAI-compatible API.
 */
export class OpenAIAdapter extends BaseLLMClient {
  private client: OpenAI;

  constructor(config: LLMConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: this.getApiKey(),
      baseURL: config.baseUrl || 'https://api.openai.com/v1',
      timeout: config.timeout || 120000,
      defaultHeaders: config.headers,
    });
  }

  async generate(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: LLMConfig,
  ): Promise<GenerateResponse> {
    const sampling = this.mergeSampling(config.sampling);

    const response = await this.client.chat.completions.create({
      model: config.model || this.config.model || 'gpt-4o',
      messages: this.convertMessages(messages),
      tools: tools.length > 0 ? this.convertTools(tools) : undefined,
      temperature: sampling.temperature,
      top_p: sampling.topP,
      max_tokens: sampling.maxTokens,
      stop: sampling.stop.length > 0 ? sampling.stop : undefined,
      ...config.extraBody,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content || '',
      toolCalls: this.extractToolCalls(choice.message.tool_calls),
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  async *generateStream(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: LLMConfig,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const sampling = this.mergeSampling(config.sampling);

    const stream = await this.client.chat.completions.create(
      {
        model: config.model || this.config.model || 'gpt-4o',
        messages: this.convertMessages(messages),
        tools: tools.length > 0 ? this.convertTools(tools) : undefined,
        temperature: sampling.temperature,
        top_p: sampling.topP,
        max_tokens: sampling.maxTokens,
        stop: sampling.stop.length > 0 ? sampling.stop : undefined,
        stream: true,
        ...config.extraBody,
      },
      { signal },
    );

    const accumulatedToolCalls: Map<number, StreamToolCall> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Handle tool calls accumulation
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          const existing = accumulatedToolCalls.get(idx) || {
            id: '',
            name: '',
            arguments: '',
          };

          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments)
            existing.arguments = existing.arguments + tc.function.arguments;

          accumulatedToolCalls.set(idx, existing);
        }
      }

      const finishReason = chunk.choices[0]?.finish_reason;

      // Yield chunk
      const streamChunk: StreamChunk = {
        delta: delta.content || '',
        finishReason: finishReason
          ? this.mapStreamFinishReason(finishReason)
          : undefined,
      };

      // On finish, include complete tool calls
      if (finishReason === 'tool_calls' || finishReason === 'stop') {
        streamChunk.toolCalls = Array.from(accumulatedToolCalls.values())
          .filter((tc) => tc.id && tc.name)
          .map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: this.parseArguments(tc.arguments || '{}'),
          }));
        accumulatedToolCalls.clear();
      }

      yield streamChunk;
    }
  }

  async countTokens(messages: ChatMessage[]): Promise<number> {
    // Simple estimation: ~4 chars per token
    // For accurate counting, use tiktoken
    const text = messages
      .map((m) =>
        typeof m.content === 'string'
          ? m.content
          : m.content.map((p) => ('text' in p ? p.text : '')).join(''),
      )
      .join('');
    return Math.ceil(text.length / 4);
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private convertMessages(
    messages: ChatMessage[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role as OpenAI.Chat.ChatCompletionMessageParam['role'],
          content: msg.content,
        };
      }

      // Handle multimodal content
      const parts: OpenAI.Chat.ChatCompletionContentPart[] = msg.content
        .map((part) => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text };
          }
          if (part.type === 'image') {
            return {
              type: 'image_url' as const,
              image_url: { url: `data:${part.mimeType};base64,${part.data}` },
            };
          }
          // tool_use and tool_result handled separately
          return { type: 'text' as const, text: '' };
        })
        .filter(
          (p) =>
            p.type !== 'text' ||
            (p as OpenAI.Chat.ChatCompletionContentPartText).text,
        );

      return {
        role: msg.role as OpenAI.Chat.ChatCompletionMessageParam['role'],
        content: parts,
      };
    }) as OpenAI.Chat.ChatCompletionMessageParam[];
  }

  private convertTools(
    tools: ToolDefinition[],
  ): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private extractToolCalls(
    toolCalls?: OpenAI.Chat.ChatCompletionMessageToolCall[],
  ): ToolCall[] | undefined {
    if (!toolCalls || toolCalls.length === 0) return undefined;
    return toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: this.parseArguments(tc.function.arguments),
    }));
  }

  private parseArguments(argsString: string): Record<string, unknown> {
    try {
      return JSON.parse(argsString);
    } catch {
      return {};
    }
  }

  private mapFinishReason(
    reason: string | null | undefined,
  ): GenerateResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
        return 'tool_use';
      case 'length':
        return 'length';
      default:
        return 'stop';
    }
  }

  private mapStreamFinishReason(
    reason: string | null | undefined,
  ): StreamChunk['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
        return 'tool_use';
      case 'length':
        return 'length';
      default:
        return undefined;
    }
  }
}

/**
 * Factory function to create OpenAI adapter.
 */
export function createOpenAIAdapter(config: LLMConfig): OpenAIAdapter {
  return new OpenAIAdapter(config);
}
