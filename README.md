# Qwen Code - Minimal AI Agent

A minimal, open-source AI agent that lives in your terminal.

## Features

- **Minimal Architecture**: Three packages only - CLI, Core, LLM
- **OpenAI-Compatible**: Support any OpenAI-compatible API endpoint
- **Built-in Tools**: File operations, shell execution, and more
- **Streaming Output**: Real-time response streaming

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    CLI Layer                     │
│  (User Interaction, Command Parsing, UI)        │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│                   Core Layer                     │
│  (Agent Loop, Tool Executor, Context)           │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│                    LLM Layer                     │
│  (OpenAI Protocol, Streaming, Token Count)      │
└─────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@qwen-code/cli` | CLI entry point with interactive UI |
| `@qwen-code/core` | Core logic: Agent, Tools, Services |
| `@qwen-code/llm` | LLM abstraction with OpenAI protocol |

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

## Usage

### Interactive Mode

```bash
npm run start
```

### Simple Agent (Non-interactive)

```bash
# Set your API key
export DASHSCOPE_API_KEY=your-api-key

# Run agent
node packages/cli/dist/src/simple-agent.js "Write a Python function to sort a list"

# With options
node packages/cli/dist/src/simple-agent.js \
  --model gpt-4o \
  --max-turns 5 \
  "Explain async/await in JavaScript"
```

### Simple Agent Options

```
Options:
  -h, --help          Show help message
  -m, --model         Model to use (default: qwen-coder-plus)
  -u, --base-url      API base URL (default: DashScope)
  -k, --api-key       API key
  -t, --max-turns     Maximum agent turns (default: 10)

Environment Variables:
  DASHSCOPE_API_KEY   API key for DashScope/Qwen
  QWEN_MODEL          Default model name
  QWEN_BASE_URL       Default API base URL
```

## Development

```bash
# Run tests
npm run test

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

## License

Apache-2.0
