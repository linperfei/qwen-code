#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Tiny Agent - A minimal REPL-style AI coding agent.
 *
 * Features:
 * - Interactive REPL with multi-turn conversation
 * - Streaming output
 * - Built-in tools (read, write, shell, list files)
 * - Simple, clean UI
 * - OpenAI-compatible API support
 *
 * Usage:
 *   tiny-agent
 *   tiny-agent --model gpt-4o --base-url https://api.openai.com/v1
 *   TINY_API_KEY=sk-xxx tiny-agent
 */

import * as readline from 'node:readline/promises';
import type { Interface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
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
  systemPrompt: string;
}

const CONFIG_DIR = join(homedir(), '.tiny-agent');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  model: 'gpt-4o',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
};

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

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

function saveConfig(config: { model?: string; baseUrl?: string; apiKey?: string }): void {
  ensureConfigDir();
  const current = loadSavedConfig();
  const updated = { ...current, ...config };
  writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
}

function parseArgs(): Partial<Config> & { showConfig?: boolean } {
  const args = process.argv.slice(2);
  const result: Partial<Config> & { showConfig?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--model' || arg === '-m') {
      result.model = args[++i];
    } else if (arg === '--base-url' || arg === '-u') {
      result.baseUrl = args[++i];
    } else if (arg === '--api-key' || arg === '-k') {
      result.apiKey = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--config' || arg === '-c') {
      result.showConfig = true;
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
${c.bold}Tiny Agent - Your Minimal Coding Agent${c.reset}

${c.bold}Usage:${c.reset}
  tiny-agent [options]

${c.bold}Options:${c.reset}
  -m, --model <model>      Model to use (default: gpt-4o)
  -u, --base-url <url>     API base URL (default: https://api.openai.com/v1)
  -k, --api-key <key>      API key (or set TINY_API_KEY env var)
  -c, --config             Show current configuration
  -h, --help               Show this help message

${c.bold}Environment Variables:${c.reset}
  TINY_API_KEY             API key for the model service
  TINY_MODEL               Model name
  TINY_BASE_URL            API base URL

${c.bold}Config File:${c.reset}
  Config is saved to: ${CONFIG_FILE}
`);
}

function printCurrentConfig(): void {
  const saved = loadSavedConfig();
  // Get effective config with same priority as getConfig
  const model =
    process.env['TINY_MODEL'] || saved.model || DEFAULT_CONFIG.model;
  const baseUrl =
    process.env['TINY_BASE_URL'] || saved.baseUrl || DEFAULT_CONFIG.baseUrl;
  // Priority: TINY_API_KEY > saved config > OPENAI_API_KEY
  const apiKey =
    process.env['TINY_API_KEY'] ||
    saved.apiKey ||
    process.env['OPENAI_API_KEY'];

  console.log(`
${c.bold}Current Configuration:${c.reset}
  Model:    ${model}
  Base URL: ${baseUrl}
  API Key:  ${apiKey ? '***' + apiKey.slice(-4) : '(not set)'}

${c.bold}Saved Configuration (${CONFIG_FILE}):${c.reset}
  Model:    ${saved.model}
  Base URL: ${saved.baseUrl}
  API Key:  ${saved.apiKey ? '***' + saved.apiKey.slice(-4) : '(not set)'}

${c.dim}Priority: CLI args > TINY_* env vars > config file > OPENAI_API_KEY${c.reset}
`);
}

function getConfig(): Config {
  const args = parseArgs();

  // Handle --config flag
  if (args.showConfig) {
    printCurrentConfig();
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

  // Priority for API key: CLI args > TINY_API_KEY env > saved config > OPENAI_API_KEY env
  // Note: saved config takes precedence over OPENAI_API_KEY to respect user's explicit setting
  const apiKey =
    args.apiKey ||
    process.env['TINY_API_KEY'] ||
    saved.apiKey ||
    process.env['OPENAI_API_KEY'] ||
    undefined;

  // Save config for future use (without API key for security, unless explicitly provided)
  if (args.model || args.baseUrl) {
    saveConfig({
      model: args.model || saved.model,
      baseUrl: args.baseUrl || saved.baseUrl,
    });
  }

  return {
    model,
    baseUrl,
    apiKey,
    maxTurns: 10,
    systemPrompt: `You are Tiny Agent, a minimal AI coding assistant. You can:
- Read and write files using read_file and write_file tools
- Execute shell commands using run_shell tool
- List directory contents using list_files tool

Be concise and helpful. Use tools when needed to accomplish tasks.`,
  };
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

function setupToolExecutor() {
  const executor = createSimpleToolExecutor();

  // read_file
  executor.registerToolWithHandler(BUILTIN_TOOLS[0]!, async (args) => {
    const path = args['path'] as string;
    try {
      return await readFile(path, 'utf-8');
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // write_file
  executor.registerToolWithHandler(BUILTIN_TOOLS[1]!, async (args) => {
    const path = args['path'] as string;
    const content = args['content'] as string;
    try {
      await writeFile(path, content, 'utf-8');
      return `Wrote ${content.length} bytes to ${path}`;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // run_shell
  executor.registerToolWithHandler(BUILTIN_TOOLS[2]!, async (args) => {
    const command = args['command'] as string;
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

  // list_files
  executor.registerToolWithHandler(BUILTIN_TOOLS[3]!, async (args) => {
    const path = args['path'] as string;
    const pattern = args['pattern'] as string | undefined;
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

  return executor;
}

// ============================================================================
// UI Helpers
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const c = COLORS; // shorthand

function printBanner(config: Config) {
  const apiKeyDisplay = config.apiKey
    ? '***' + config.apiKey.slice(-4)
    : '(not set)';

  console.log(`
${c.bold}${c.magenta}╔═════════════════════════════════════════════════╗
║   Tiny Agent - Your Minimal Coding Agent         ║
╚═════════════════════════════════════════════════╝${c.reset}

${c.dim}Model: ${config.model}
Base URL: ${config.baseUrl}
API Key: ${apiKeyDisplay}${c.reset}

${c.dim}Type your message and press Enter.
Type 'exit' or 'quit' to end the session.
Type 'clear' to clear the screen.
Type 'help' for available commands.
Type 'config' to view/change settings.${c.reset}
`);
}

const PROMPT_TEXT = `${c.bold}${c.green}You:${c.reset} `;

function printPrompt(rl: Interface) {
  rl.prompt();
}

function printAssistant() {
  process.stdout.write(`${c.bold}${c.blue}Assistant:${c.reset} `);
}

function printToolCall(name: string) {
  console.log(`${c.dim}[Tool: ${name}]${c.reset}`);
}

function printError(message: string) {
  console.log(`${c.yellow}Error: ${message}${c.reset}`);
}

function printDivider() {
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
}

// ============================================================================
// Main REPL Loop
// ============================================================================

async function runRepl(config: Config) {
  const rl = readline.createInterface({ input, output });

  // Set up prompt - readline will handle backspace correctly
  rl.setPrompt(PROMPT_TEXT);

  // Create LLM client
  const llmConfig: LLMConfig = {
    model: config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  };
  const llmClient = createLLMClient(llmConfig);

  // Setup tool executor
  const toolExecutor = setupToolExecutor();

  printBanner(config);

  // Print initial prompt
  printPrompt(rl);

  // Use async iterator for better EOF handling
  for await (const userInput of rl) {
    if (!userInput.trim()) {
      printPrompt(rl);
      continue;
    }

    // Handle commands
    const cmd = userInput.trim().toLowerCase();

    if (cmd === 'exit' || cmd === 'quit') {
      console.log(`${c.dim}Goodbye!${c.reset}`);
      break;
    }

    if (cmd === 'clear') {
      console.clear();
      printBanner(config);
      printPrompt(rl);
      continue;
    }

    if (cmd === 'help') {
      console.log(`
${c.bold}Available Commands:${c.reset}
  exit, quit  - End the session
  clear       - Clear the screen
  help        - Show this help
  config      - View/change settings

${c.bold}Built-in Tools:${c.reset}
  read_file   - Read file contents
  write_file  - Write to a file
  run_shell   - Execute shell command
  list_files  - List directory contents
`);
      printPrompt(rl);
      continue;
    }

    if (cmd === 'config') {
      console.log(`
${c.bold}Current Configuration:${c.reset}
  Model:    ${config.model}
  Base URL: ${config.baseUrl}
  API Key:  ${config.apiKey ? '***' + config.apiKey.slice(-4) : '(not set)'}

${c.dim}To change settings, use command line options:
  tiny-agent --model gpt-4o --base-url https://api.openai.com/v1

Or set environment variables:
  TINY_MODEL, TINY_BASE_URL, TINY_API_KEY

Config file: ${CONFIG_FILE}${c.reset}
`);
      printPrompt(rl);
      continue;
    }

    // Create agent for this turn
    const agent = createAgentLoop(llmClient, toolExecutor, {
      maxTurns: config.maxTurns,
      maxTimeMinutes: 30,
      systemPrompt: config.systemPrompt,
      userMessage: '',
    });

    // Event handler
    let isFirstChunk = true;
    const eventHandler: AgentLoopEventHandler = (event) => {
      switch (event.type) {
        case 'content':
          if (isFirstChunk) {
            printAssistant();
            isFirstChunk = false;
          }
          process.stdout.write(event.data as string);
          break;
        case 'tool_call': {
          const tool = event.data as { name: string };
          if (!isFirstChunk) console.log(); // newline before tool
          printToolCall(tool.name);
          break;
        }
        case 'tool_result': {
          // Optionally show tool results
          break;
        }
        case 'error':
          printError(String(event.data));
          break;
      }
    };

    agent.onEvent(eventHandler);

    // Run agent
    try {
      await agent.run(userInput);
      console.log('\n');
      printDivider();
    } catch (error) {
      printError(error instanceof Error ? error.message : String(error));
      console.log(); // newline after error
      printDivider();
    }

    // Print prompt for next input
    printPrompt(rl);
  }

  rl.close();
}

// ============================================================================
// Entry Point
// ============================================================================

async function main() {
  const config = getConfig();

  if (!config.apiKey) {
    console.error(`${c.yellow}Error: No API key found.

Set API key via:
  1. Environment variable: export TINY_API_KEY=your-api-key
  2. Command line: tiny-agent --api-key your-api-key
  3. Config file: ${CONFIG_FILE}

For OpenAI-compatible APIs (OpenAI, Azure, local LLMs, etc.):
  tiny-agent --base-url https://api.openai.com/v1 --api-key sk-xxx

For other providers:
  tiny-agent --base-url https://your-provider.com/v1 --api-key your-key${c.reset}`);
    process.exit(1);
  }

  await runRepl(config);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
