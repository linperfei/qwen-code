#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Minimal Interactive Agent - A simple REPL-style AI agent.
 *
 * Features:
 * - Interactive REPL with multi-turn conversation
 * - Streaming output
 * - Built-in tools (read, write, shell)
 * - Simple, clean UI
 *
 * Usage:
 *   qwen-chat
 *   qwen-chat --model gpt-4o
 */

import * as readline from 'node:readline/promises';
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

function getConfig(): Config {
  return {
    model: process.env['QWEN_MODEL'] || 'qwen-coder-plus',
    baseUrl:
      process.env['QWEN_BASE_URL'] ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env['DASHSCOPE_API_KEY'] || process.env['OPENAI_API_KEY'],
    maxTurns: 10,
    systemPrompt: `You are a helpful AI coding assistant. You can:
- Read and write files
- Execute shell commands
- List directory contents

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
};

const c = COLORS; // shorthand

function printBanner() {
  console.log(`
${c.bold}${c.cyan}╔═══════════════════════════════════════╗
║     Qwen Chat - Minimal AI Agent      ║
╚═══════════════════════════════════════╝${c.reset}

${c.dim}Type your message and press Enter.
Type 'exit' or 'quit' to end the session.
Type 'clear' to clear the screen.
Type 'help' for available commands.${c.reset}
`);
}

function printPrompt() {
  process.stdout.write(`${c.bold}${c.green}You:${c.reset} `);
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

  // Create LLM client
  const llmConfig: LLMConfig = {
    model: config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  };
  const llmClient = createLLMClient(llmConfig);

  // Setup tool executor
  const toolExecutor = setupToolExecutor();

  printBanner();

  // Main loop
  while (true) {
    printPrompt();
    const userInput = await rl.question('');

    if (!userInput.trim()) continue;

    // Handle commands
    const cmd = userInput.trim().toLowerCase();
    if (cmd === 'exit' || cmd === 'quit') {
      console.log(`${c.dim}Goodbye!${c.reset}`);
      break;
    }
    if (cmd === 'clear') {
      console.clear();
      printBanner();
      continue;
    }
    if (cmd === 'help') {
      console.log(`
${c.bold}Available Commands:${c.reset}
  exit, quit  - End the session
  clear       - Clear the screen
  help        - Show this help

${c.bold}Built-in Tools:${c.reset}
  read_file   - Read file contents
  write_file  - Write to a file
  run_shell   - Execute shell command
  list_files  - List directory contents
`);
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
    }
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
Set DASHSCOPE_API_KEY or OPENAI_API_KEY environment variable.${c.reset}`);
    process.exit(1);
  }

  await runRepl(config);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
