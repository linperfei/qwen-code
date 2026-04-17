# Tiny Agent - Minimal AI Coding Agent

A minimal, open-source AI coding agent that lives in your terminal.

## Features

- **Minimal Architecture**: Three packages only - CLI, Core, LLM (~1,000 lines)
- **OpenAI-Compatible**: Support any OpenAI-compatible API endpoint
- **Built-in Tools**: File operations, shell execution, directory listing
- **Streaming Output**: Real-time response streaming
- **Unified Configuration**: Simple config file or environment variables

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    CLI Layer                     │
│  (tiny-agent, simple-agent)                     │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│                   Core Layer                     │
│  (AgentLoop, AgentContext, ToolExecutor)        │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│                    LLM Layer                     │
│  (OpenAI Adapter, Streaming, Types)             │
└─────────────────────────────────────────────────┘
```

## Packages

| Package | Description | Size |
|---------|-------------|------|
| `@qwen-code/cli` | CLI entry points | ~500 lines |
| `@qwen-code/core` | Agent core: Loop, Context, Executor | ~250 lines |
| `@qwen-code/llm` | LLM abstraction with OpenAI protocol | ~300 lines |

## Installation

```bash
# Clone the repository
git clone https://github.com/linperfei/qwen-code.git
cd qwen-code

# Install dependencies
npm install

# Build
npm run build
```

## Configuration

### Config File

Create `~/.tiny-agent/config.json`:

```json
{
  "model": "gpt-4o",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "your-api-key"
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `TINY_API_KEY` | API key for the model service |
| `TINY_MODEL` | Model name (default: gpt-4o) |
| `TINY_BASE_URL` | API base URL (default: OpenAI) |

### Priority

`CLI args > TINY_* env vars > config file > OPENAI_API_KEY`

## Usage

### Interactive Mode (REPL)

```bash
npm run tiny
```

```
╔═════════════════════════════════════════════════╗
║   Tiny Agent - Your Minimal Coding Agent         ║
╚═════════════════════════════════════════════════╝

Model: gpt-4o
Base URL: https://api.openai.com/v1
API Key: ***xxxx

You: list files in current directory
[Tool: list_files]
Assistant: Current directory contains...
```

### Single Query Mode

```bash
npm run tiny "Write a Python Hello World"
```

```
🤖 Model: gpt-4o
📝 Prompt: Write a Python Hello World
──────────────────────────────────────────────────

I'll create a Python Hello World program for you.
[Tool: write_file]

Done! Created hello.py with print("Hello, World!")
──────────────────────────────────────────────────
✅ Turns: 2 | Reason: goal_achieved | Duration: 3.21s
```

### Command Line Options

```bash
# Show help
npm run tiny -- --help

# Show current configuration
npm run tiny -- --config

# Single query with specific model
npm run tiny -m gpt-4o "Explain async/await"

# Use custom API endpoint
npm run tiny -u https://api.your-provider.com/v1 -k your-key

# Set max turns for single query
npm run tiny -t 5 "Debug this code"
```

### Available Commands

| Command | Description |
|---------|-------------|
| `npm run tiny` | Interactive REPL mode |
| `npm run tiny "prompt"` | Single query mode |
| `npm run build` | Build all packages |
| `npm run test` | Run tests |
| `npm run clean` | Clean dist directories |

## Built-in Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write content to a file |
| `run_shell` | Execute shell command |
| `list_files` | List directory contents |

## Supported Providers

Any OpenAI-compatible API:

- OpenAI (`https://api.openai.com/v1`)
- Azure OpenAI
- DashScope/Qwen (`https://dashscope.aliyuncs.com/compatible-mode/v1`)
- Baidu Qianfan (`https://qianfan.baidubce.com/v2/coding`)
- Local LLMs (Ollama, LM Studio, etc.)
- Other OpenAI-compatible services

## Development

```bash
# Run tests
npm run test

# Type check
npm run typecheck

# Clean build artifacts
npm run clean
```

## Project Structure

```
qwen-code/
├── package.json           # Root package config
├── tsconfig.json          # TypeScript config
├── packages/
│   ├── llm/               # LLM client layer
│   │   └── src/
│   │       ├── adapter/   # OpenAI adapter
│   │       │   ├── openai.ts
│   │       │   └── types.ts
│   │       └── index.ts
│   │
│   ├── core/              # Agent core library
│   │   └── src/
│   │       ├── agent/
│   │       │   ├── loop.ts      # Agent reasoning loop
│   │       │   ├── context.ts   # Immutable state
│   │       │   ├── executor.ts  # Tool execution
│   │       │   └── types.ts
│   │       └── index.ts
│   │
│   └── cli/               # CLI entry points
│       └── src/
│           ├── tiny-agent.ts    # Interactive REPL
│           └── simple-agent.ts  # Single query
```

## License

Apache-2.0
