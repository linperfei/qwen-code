#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Simple Agent CLI - A minimal command-line interface for running agents.
 *
 * Usage:
 *   tiny-agent "Write a hello world program in Python"
 *   tiny-agent --model gpt-4o "Explain quantum computing"
 *   tiny-agent --help
 */

import {
  createLLMClient,
  type LLMConfig,
  type ToolDefinition,
} from '@qwen-code/llm';
import {
  createAgentLoop,
  createSimpleToolExecutor,
  type AgentLoopEventHandler,
} from '@qwen-code/qwen-code-core';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { glob } from 'glob';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

interface Config {
  model: string;
  baseUrl: string;
  apiKey: string | undefined;
  maxTurns: number;
}

const CONFIG_DIR = join(homedir(), '.tiny-agent');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  model: 'gpt-4o',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
};

function loadSavedConfig(): { model: string; baseUrl: string; apiKey: string } {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
    }
  } catch {
    // Ignore errors
  }
  return { ...DEFAULT_CONFIG };
}

function parseArgs(): { prompt: string; showConfig: boolean; help: boolean } & Partial<Config> {
  const args = process.argv.slice(2);
  const result: { prompt: string; showConfig: boolean; help: boolean } & Partial<Config> = {
    prompt: '',
    showConfig: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--config' || arg === '-c') {
      result.showConfig = true;
    } else if (arg === '--model' || arg === '-m') {
      result.model = args[++i];
    } else if (arg === '--base-url' || arg === '-u') {
      result.baseUrl = args[++i];
    } else if (arg === '--api-key' || arg === '-k') {
      result.apiKey = args[++i];
    } else if (arg === '--max-turns' || arg === '-t') {
      result.maxTurns = parseInt(args[++i] || '10', 10);
    } else if (!arg.startsWith('-')) {
      result.prompt = arg;
    }
  }

  return result;
}

function getConfig(): Config {
  const args = parseArgs();

  if (args.showConfig) {
    const saved = loadSavedConfig();
    const model =
      process.env['TINY_MODEL'] || saved.model || DEFAULT_CONFIG.model;
    const baseUrl =
      process.env['TINY_BASE_URL'] || saved.baseUrl || DEFAULT_CONFIG.baseUrl;
    const apiKey =
      process.env['TINY_API_KEY'] ||
      saved.apiKey ||
      process.env['OPENAI_API_KEY'];

    // eslint-disable-next-line no-console
    console.log(`
Current Configuration:
  Model:    ${model}
  Base URL: ${baseUrl}
  API Key:  ${apiKey ? '***' + apiKey.slice(-4) : '(not set)'}

Config file: ${CONFIG_FILE}
`);
    process.exit(0);
  }

  const saved = loadSavedConfig();

  // Priority: CLI args > env vars > saved config > defaults
  const model =
    args.model ||
    process.env['TINY_MODEL'] ||
    saved.model ||
    DEFAULT_CONFIG.model;

  const baseUrl =
    args.baseUrl ||
    process.env['TINY_BASE_URL'] ||
    saved.baseUrl ||
    DEFAULT_CONFIG.baseUrl;

  // Priority: CLI args > TINY_API_KEY > saved config > OPENAI_API_KEY
  const apiKey =
    args.apiKey ||
    process.env['TINY_API_KEY'] ||
    saved.apiKey ||
    process.env['OPENAI_API_KEY'] ||
    undefined;

  return {
    model,
    baseUrl,
    apiKey,
    maxTurns: args.maxTurns || 10,
  };
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
Tiny Agent - Single Query Mode

Usage:
  tiny-agent [options] <prompt>

Options:
  -h, --help          Show this help message
  -m, --model         Model to use (default: gpt-4o)
  -u, --base-url      API base URL
  -k, --api-key       API key
  -t, --max-turns     Maximum agent turns (default: 10)
  -c, --config        Show current configuration

Environment Variables:
  TINY_API_KEY        API key for the model service
  TINY_MODEL          Model name
  TINY_BASE_URL       API base URL

Config File:
  ${CONFIG_FILE}

Examples:
  tiny-agent "Write a Python function to sort a list"
  tiny-agent -m gpt-4o "Explain async/await in JavaScript"
  tiny-agent -t 5 "Debug this code: print(x)"
`);
}

// ============================================================================
// Built-in Tools
// ============================================================================

const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_shell',
    description: 'Execute a shell command',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
      required: ['command'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path' },
        pattern: { type: 'string', description: 'Optional glob pattern' },
      },
      required: ['path'],
    },
  },
];

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const config = getConfig();

  if (!args.prompt) {
    // eslint-disable-next-line no-console
    console.error('Error: No prompt provided. Use --help for usage information.');
    process.exit(1);
  }

  if (!config.apiKey) {
    // eslint-disable-next-line no-console
    console.error(`Error: No API key found.

Set API key via:
  1. Environment variable: export TINY_API_KEY=your-api-key
  2. Command line: tiny-agent --api-key your-api-key
  3. Config file: ${CONFIG_FILE}
`);
    process.exit(1);
  }

  // Create LLM client
  const llmConfig: LLMConfig = {
    model: config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  };

  const llmClient = createLLMClient(llmConfig);

  // Create tool executor with built-in tools
  const toolExecutor = createSimpleToolExecutor();

  // Register tool handlers
  toolExecutor.registerToolWithHandler(BUILTIN_TOOLS[0]!, async (toolArgs) => {
    const path = toolArgs['path'] as string;
    try {
      return await readFile(path, 'utf-8');
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  toolExecutor.registerToolWithHandler(BUILTIN_TOOLS[1]!, async (toolArgs) => {
    const path = toolArgs['path'] as string;
    const content = toolArgs['content'] as string;
    try {
      await writeFile(path, content, 'utf-8');
      return `Wrote ${content.length} bytes to ${path}`;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  toolExecutor.registerToolWithHandler(BUILTIN_TOOLS[2]!, async (toolArgs) => {
    const command = toolArgs['command'] as string;
    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 10,
        timeout: 60000,
      });
      return stdout || stderr || 'Done';
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; message?: string };
      return e.stdout || e.stderr || e.message || 'Failed';
    }
  });

  toolExecutor.registerToolWithHandler(BUILTIN_TOOLS[3]!, async (toolArgs) => {
    const path = toolArgs['path'] as string;
    const pattern = toolArgs['pattern'] as string | undefined;
    try {
      if (pattern) {
        const files = await glob(pattern, { cwd: path });
        return files.join('\n') || 'No files found';
      }
      const files = await readdir(path);
      return files.join('\n');
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // Create agent loop
  const agent = createAgentLoop(llmClient, toolExecutor, {
    maxTurns: config.maxTurns,
    maxTimeMinutes: 30,
    systemPrompt: 'You are a helpful coding assistant. Use the available tools to help the user.',
    userMessage: '',
  });

  // Event handler for output
  const eventHandler: AgentLoopEventHandler = (event) => {
    switch (event.type) {
      case 'content':
        process.stdout.write(event.data as string);
        break;
      case 'tool_call': {
        const toolCall = event.data as { name: string };
        // eslint-disable-next-line no-console
        console.log(`\n[Tool: ${toolCall.name}]`);
        break;
      }
      case 'error':
        // eslint-disable-next-line no-console
        console.log(`\n[Error] ${event.data}`);
        break;
    }
  };

  agent.onEvent(eventHandler);

  // Run the agent
  // eslint-disable-next-line no-console
  console.log(`
🤖 Model: ${config.model}
📝 Prompt: ${args.prompt}
${'─'.repeat(50)}
`);

  try {
    const result = await agent.run(args.prompt);

    // eslint-disable-next-line no-console
    console.log(`
${'─'.repeat(50)}
✅ Turns: ${result.turns} | Reason: ${result.reason} | Duration: ${(result.durationMs / 1000).toFixed(2)}s
`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', error);
  process.exit(1);
});
