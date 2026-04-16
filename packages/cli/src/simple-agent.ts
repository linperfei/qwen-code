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
 *   qwen-agent "Write a hello world program in Python"
 *   qwen-agent --model gpt-4o "Explain quantum computing"
 *   qwen-agent --help
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

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
  prompt: string;
  model: string;
  baseUrl: string;
  apiKey: string | undefined;
  maxTurns: number;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    prompt: '',
    model: process.env['QWEN_MODEL'] || 'qwen-coder-plus',
    baseUrl:
      process.env['QWEN_BASE_URL'] ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env['DASHSCOPE_API_KEY'] || process.env['OPENAI_API_KEY'],
    maxTurns: 10,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--model' || arg === '-m') {
      result.model = args[++i] || result.model;
    } else if (arg === '--base-url' || arg === '-u') {
      result.baseUrl = args[++i] || result.baseUrl;
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

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
qwen-agent - A minimal AI agent CLI

Usage:
  qwen-agent [options] <prompt>

Options:
  -h, --help          Show this help message
  -m, --model         Model to use (default: qwen-coder-plus)
  -u, --base-url      API base URL (default: DashScope)
  -k, --api-key       API key (or set DASHSCOPE_API_KEY env)
  -t, --max-turns     Maximum agent turns (default: 10)

Environment Variables:
  DASHSCOPE_API_KEY   API key for DashScope/Qwen
  QWEN_MODEL          Default model name
  QWEN_BASE_URL       Default API base URL

Examples:
  qwen-agent "Write a Python function to sort a list"
  qwen-agent -m gpt-4o "Explain async/await in JavaScript"
  qwen-agent -t 5 "Debug this code: print(x)"
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
        path: {
          type: 'string',
          description: 'The path to the file to read',
        },
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
        path: {
          type: 'string',
          description: 'The path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
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
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
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
        path: {
          type: 'string',
          description: 'The directory path to list',
        },
        pattern: {
          type: 'string',
          description: 'Glob pattern to filter files',
        },
      },
      required: ['path'],
    },
  },
];

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { glob } from 'glob';

const execAsync = promisify(exec);

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.prompt) {
    // eslint-disable-next-line no-console
    console.error(
      'Error: No prompt provided. Use --help for usage information.',
    );
    process.exit(1);
  }

  if (!args.apiKey) {
    // eslint-disable-next-line no-console
    console.error(
      'Error: No API key provided. Set DASHSCOPE_API_KEY environment variable or use --api-key.',
    );
    process.exit(1);
  }

  // Create LLM client
  const llmConfig: LLMConfig = {
    model: args.model,
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
  };

  const llmClient = createLLMClient(llmConfig);

  // Create tool executor with built-in tools
  const toolExecutor = createSimpleToolExecutor();

  // Register tool handlers
  toolExecutor.registerToolWithHandler(
    BUILTIN_TOOLS[0]!, // read_file
    async (args) => {
      const path = args['path'] as string;
      try {
        const content = await readFile(path, 'utf-8');
        return content;
      } catch (error) {
        return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  );

  toolExecutor.registerToolWithHandler(
    BUILTIN_TOOLS[1]!, // write_file
    async (args) => {
      const path = args['path'] as string;
      const content = args['content'] as string;
      try {
        await writeFile(path, content, 'utf-8');
        return `Successfully wrote to ${path}`;
      } catch (error) {
        return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  );

  toolExecutor.registerToolWithHandler(
    BUILTIN_TOOLS[2]!, // run_shell
    async (args) => {
      const command = args['command'] as string;
      try {
        const { stdout, stderr } = await execAsync(command, {
          maxBuffer: 1024 * 1024 * 10, // 10MB buffer
          timeout: 60000, // 60 second timeout
        });
        return stdout || stderr || 'Command completed with no output';
      } catch (error) {
        const execError = error as {
          stdout?: string;
          stderr?: string;
          message?: string;
        };
        return (
          execError.stdout ||
          execError.stderr ||
          execError.message ||
          'Command failed'
        );
      }
    },
  );

  toolExecutor.registerToolWithHandler(
    BUILTIN_TOOLS[3]!, // list_files
    async (args) => {
      const path = args['path'] as string;
      const pattern = args['pattern'] as string | undefined;

      try {
        if (pattern) {
          const files = await glob(pattern, { cwd: path });
          return files.join('\n');
        } else {
          const files = await readdir(path);
          return files.join('\n');
        }
      } catch (error) {
        return `Error listing files: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  );

  // Create agent loop
  const agent = createAgentLoop(llmClient, toolExecutor, {
    maxTurns: args.maxTurns,
    maxTimeMinutes: 30,
    systemPrompt:
      'You are a helpful coding assistant. Use the available tools to help the user.',
    userMessage: '',
  });

  // Event handler for output
  const eventHandler: AgentLoopEventHandler = (event) => {
    switch (event.type) {
      case 'content':
        process.stdout.write(event.data as string);
        break;
      case 'tool_call': {
        const toolCall = event.data as {
          name: string;
          arguments: Record<string, unknown>;
        };
        // eslint-disable-next-line no-console
        console.error(`\n[Tool: ${toolCall.name}]`);
        break;
      }
      case 'tool_result': {
        const result = event.data as { output: string; isError: boolean };
        if (result.isError) {
          // eslint-disable-next-line no-console
          console.error(`[Error: ${result.output.slice(0, 200)}...]`);
        }
        break;
      }
      case 'error':
        // eslint-disable-next-line no-console
        console.error('\n[Error]', event.data);
        break;
      default:
        // Ignore other event types
        break;
    }
  };

  agent.onEvent(eventHandler);

  // Run the agent
  // eslint-disable-next-line no-console
  console.log(`\n🤖 Agent started with model: ${args.model}`);
  // eslint-disable-next-line no-console
  console.log(`📝 Prompt: ${args.prompt}\n`);
  // eslint-disable-next-line no-console
  console.log('─'.repeat(50) + '\n');

  try {
    const result = await agent.run(args.prompt);

    // eslint-disable-next-line no-console
    console.log('\n' + '─'.repeat(50));
    // eslint-disable-next-line no-console
    console.log(`\n✅ Completed in ${result.turns} turn(s)`);
    // eslint-disable-next-line no-console
    console.log(`📊 Reason: ${result.reason}`);
    // eslint-disable-next-line no-console
    console.log(`⏱️  Duration: ${(result.durationMs / 1000).toFixed(2)}s\n`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      '\n❌ Agent failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

// Run main
main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', error);
  process.exit(1);
});
