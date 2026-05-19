---
name: coding-conventions
description: >
  Project-wide coding conventions for the my-mastra-app Mastra application.
  Follow these whenever reading, editing, or generating source code in this project.
---

# Coding Conventions

## Language & Runtime
- TypeScript strict mode (`"strict": true`)
- ESM modules (`"module": "NodeNext"`)
- Node.js 22 via nvm
- No CommonJS `require()` — use `import`/`export` only

## File & Module Layout
```
src/mastra/
  agents/       ← one file per agent
  workflows/    ← one file per workflow
  tools/        ← shared tool definitions
  processors/   ← input/output processors
  mcp/          ← MCPClient and MCPServer
  workspace/    ← workspace factory + skills
  browsers/     ← Playwright/Stagehand config
  scorers/      ← eval scorers
  index.ts      ← Mastra instance
```

## Agent Pattern
```typescript
export const myAgent = new Agent({
  id: 'Unique Human-Readable ID',
  name: 'Unique Human-Readable Name',
  description: 'One sentence — required for MCPServer exposure.',
  instructions: `...`,
  model: 'google/gemini-2.0-flash',   // default model
  tools: { ... },
  inputProcessors: [regexPIIRedactor, tokenLimiter],
  outputProcessors: [usageTracker],
});
```

## Processors (always apply)
- **`regexPIIRedactor`** — strip API keys, emails, credit cards from input
- **`TokenLimiter`** — keep context under 8 000 tokens (input)
- **`usageTracker`** — log token usage after each response (output)
- **`ToolCallFilter`** — prune tool history when context grows large (input)

## Workspace Tools (Claude conventions)
When using `codeWorkspace`, tool names are remapped:
| Default name | Remapped name |
|---|---|
| `mastra_workspace_read_file` | `view` |
| `mastra_workspace_write_file` | `write_file` |
| `mastra_workspace_edit_file` | `str_replace_editor` |
| `mastra_workspace_list_files` | `find_files` |
| `mastra_workspace_grep` | `search_content` |
| `mastra_workspace_execute_command` | `execute_command` |

## Code Style
- 2-space indentation
- Single quotes for strings
- Trailing commas in multi-line structures
- Max line length: 100 chars
- JSDoc comments on all exported symbols

## Git
- Commits: `type(scope): description` (Conventional Commits)
- Never commit `.env`, `workspace/`, `*.db`, `.mastra/`

## Error Handling
- Always wrap external API calls in try/catch
- Log errors via Mastra's `PinoLogger` — never `console.error` in production code
- Throw typed errors that include context (URL, tool name, agent ID)
