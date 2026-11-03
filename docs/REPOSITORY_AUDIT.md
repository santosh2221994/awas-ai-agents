# AWAS Agent Repository Audit (`awas-ai-agents`)

**Date:** 2026-11-02  
**Target Specification:** `mastra-agent-repository-spec.md`  
**Package Name:** `awas-ai-agent-be` (`1.0.0`)  

---

## 1. Executive Summary

This audit inspects the existing `awas-ai-agents` repository prior to implementing the 46-role specialist and supervisor architecture (41 domain specialists across Entertainment & Media, Productivity & Autonomous Workspace, Marketing & Growth, and Business Operations, plus 5 platform/domain Supervisors).

### Installed Framework & Runtime Stack
- **Core Framework:** `@mastra/core@^1.80.0`, `mastra@^1.36.0`
- **Schema Validation:** `zod@^4.3.6`
- **Storage & Memory:** `@mastra/mongodb@^1.24.1` (`MongoDBStore`), `@mastra/memory@^1.39.1`, `@mastra/duckdb@^1.16.0` (local telemetry store)
- **Observability & Evaluation:** `@mastra/observability@^1.22.0`, `@mastra/evals@^1.10.9`, `@mastra/loggers@^1.3.10` (`PinoLogger`)
- **Workspace & Sandbox:** `@mastra/core/workspace` (`LocalFilesystem`, `LocalSandbox` with `globalWorkspace`, `codeWorkspace`, `readonlyWorkspace`, `dynamicWorkspace`)
- **Model Providers (`src/mastra/providers/` & `src/mastra/services/agent-config-service.ts`):**
  - Cloud: Google Gemini (`gemini.ts`), Groq (`groq.ts`), OpenAI (`openai.ts`)
  - Local: LM Studio (`lm-studio.ts` at `127.0.0.1:1234`), Ollama (`ollama.ts` at `127.0.0.1:11434`)
  - Dual Execution Router: Driven by `x-execution-mode` (`cloud` vs. `local`), `x-provider-id`, `x-model-id`, `x-user-tier` headers.

---

## 2. Existing Repository Inventory

### 2.1 Existing Agents (`src/mastra/agents/` — 22 Agent Modules)

| Existing File | Registered ID(s) | Current Role | Bound Tools | Target Catalogue Mapping |
|---|---|---|---|---|
| `video-idea-gen0agent.ts` | `video-idea-gen0agent`, `video-idea-gen-agent` | Video & film idea generation | `exaSearchTool`, `exaScrapePageTool`, `getVideoMetaTool`, `getVideoTranscriptTool` | **ENT-01** (Creative Producer) & **ENT-18** (Film Marketing Agent) |
| `image-generation-agent.ts` | `image-generation-agent`, `image-generator-agent`, `text-to-image-agent`, `qwen-image-agent` | Text-to-image prompt enhancement & synthesis | `generateImageTool`, `enhanceImagePromptTool`, `listImageModelsTool` | **ENT-04** (Storyboard Agent) & **ENT-06** (Production Design Agent) |
| `deep-search-agent.ts` | `deep-search-agent` | Multi-step web research | `exaSearchTool`, `exaScrapePageTool` | **PRD-05** (Research & Knowledge Agent) |
| `pdf-chat-agent.ts` | `pdf-chat-agent` | PDF parsing & Q&A | `loadPdfTool`, `searchPdfTool` | **PRD-06** (Document Intelligence Agent) |
| `docs-chatbot-agent.ts` | `docs-chatbot-agent` | Documentation Q&A | Workspace read tools | **PRD-06** (Document Intelligence Agent) |
| `translation-agent.ts` | `translation-agent` | Multi-lingual translation | None (prompt-only) | **PRD-07** (Writing & Language Agent) |
| `flash-cards-agent.ts` | `flash-cards-agent` | Study flashcard generation | None (prompt-only) | **PRD-07** (Writing & Language Agent) |
| `csv-questions-agent.ts` | `csv-questions-agent` | CSV tabular analysis | `parseCsvTool`, `analyzeColumnTool`, `generateCsvTool` | **PRD-09** (Data Intelligence Agent) |
| `text-to-sql-agent.ts` | `text-to-sql-agent` | Natural language to SQL | `listTablesTool`, `executeSqlTool` | **PRD-09** (Data Intelligence Agent) |
| `google-sheets-agent.ts` | `google-sheets-agent` | Google Sheets read/write | `readSheetTool`, `writeSheetTool` | **PRD-09** (Data Intelligence Agent) |
| `slack-agent.ts` | `slack-agent` | Slack channel messaging | `listSlackChannelsTool`, `readSlackChannelTool`, `sendSlackMessageTool` | **PRD-04** (Communication Agent) |
| `customer-feedback-agent.ts` | `customer-feedback-agent` | Customer sentiment & feedback triage | `exaSearchTool` | **OPS-05** (Customer Success Agent) |
| `youtube-chat-agent.ts` | `youtube-chat-agent` | YouTube transcript analysis | `getVideoMetaTool`, `getVideoTranscriptTool` | **ENT-14** (Video Editing) / **PRD-05** (Research) |
| `browser-agent.ts` | `browser-agent` | Playwright headless browser | `browseUrlTool`, `searchWebTool`, `extractPageDataTool` | **PRD-05** (Research) / **PRD-08** (Workflow Automation) |
| `mcp-agent.ts` | `mcp-agent` | MCP tool orchestration | MCP client tools | **PRD-08** (Workflow Automation Agent) |
| `studio-chat-agent.ts` | `studio-chat-agent` | Studio Canvas Co-Pilot | `skillListTool`, `exaSearchTool`, `listRepositoryAgentsTool`, `createNewAgentTool`, `generateCanvasWorkflowTool` | Platform Studio Co-Pilot (Preserved) |
| `studio-chat-copilot-agent.ts` | (Helper module) | Studio Co-Pilot variant | Studio tools | Platform Studio Co-Pilot (Preserved) |
| `agent-builder-agent.ts` | `agent-builder-agent` | Dynamic agent configuration | `listRepositoryAgentsTool`, `createNewAgentTool` | Platform Studio Co-Pilot (Preserved) |
| `github-pr-agent.ts` | `github-pr-agent` | GitHub PR diff reviewer | `getPrDiffTool`, `postReviewCommentTool` | Extensible Dev/IT Vertical (Preserved) |
| `github-repo-agent.ts` | `github-repo-agent`, `github-agent` | GitHub repository inspector | `getRepoBranchesTool`, `getRepoDetailsTool`, `listPullRequestsTool`, `listUserReposTool` | Extensible Dev/IT Vertical (Preserved) |
| `react-native-agent.ts` | `react-native-agent` | React Native code assistant | Workspace tools | Extensible Dev/IT Vertical (Preserved) |
| `gemma-agent.ts` | `gemma-agent` | Open-weight model test agent | `calculatorWithUITool` | Legacy Template Agent (Preserved) |
| `weather-agent.ts` | `weather-agent` | Weather forecast demo agent | `weatherTool` | Legacy Template Agent (Preserved) |

### 2.2 Existing Tools (`src/mastra/tools/` — 15 Tool Files)
1. `browser-tool.ts` (`browseUrlTool`, `searchWebTool`, `extractPageDataTool`)
2. `calculator-ui-tool.ts` (`calculatorWithUITool`)
3. `create-new-agent-tool.ts` (`createNewAgentTool`)
4. `csv-tool.ts` (`parseCsvTool`, `analyzeColumnTool`, `generateCsvTool`)
5. `exa-search-tool.ts` (`exaSearchTool`, `exaScrapePageTool`)
6. `generate-canvas-workflow-tool.ts` (`generateCanvasWorkflowTool`)
7. `github-tool.ts` (`getPrDiffTool`, `postReviewCommentTool`, `getRepoBranchesTool`, `getRepoDetailsTool`, `listPullRequestsTool`, `listUserReposTool`)
8. `google-sheets-tool.ts` (`readSheetTool`, `writeSheetTool`)
9. `image-generation-tool.ts` (`generateImageTool`, `enhanceImagePromptTool`, `listImageModelsTool`)
10. `list-repository-agents-tool.ts` (`listRepositoryAgentsTool`)
11. `pdf-tool.ts` (`loadPdfTool`, `searchPdfTool`)
12. `skill-list-tool.ts` (`skillListTool`)
13. `slack-tool.ts` (`listSlackChannelsTool`, `readSlackChannelTool`, `sendSlackMessageTool`)
14. `sql-tool.ts` (`listTablesTool`, `executeSqlTool`)
15. `weather-tool.ts` (`weatherTool`) & `youtube-tool.ts` (`getVideoMetaTool`, `getVideoTranscriptTool`)

### 2.3 Existing Workflows (`src/mastra/workflows/` — 18 Workflows)
`browser-workflow`, `csv-questions-workflow`, `customer-feedback-workflow`, `deep-search-workflow`, `docs-chatbot-workflow`, `flash-cards-workflow`, `gemma-workflow`, `github-pr-workflow`, `google-sheets-workflow`, `image-generation-workflow`, `mcp-workflow`, `pdf-chat-workflow`, `react-native-workflow`, `slack-workflow`, `text-to-sql-workflow`, `video-idea-gen-workflow`, `weather-workflow`, `youtube-chat-workflow`.

---

## 3. Capabilities to Consolidate into Reusable Skills

1. **Data & Spreadsheet Analysis (`csv-questions-agent`, `text-to-sql-agent`, `google-sheets-agent`):**
   - Currently split across 3 micro-agents. Their repeatable capabilities (`spreadsheet-analysis`, `sql-draft`, `data-cleaning-plan`, `kpi-analysis`, `chart-specification`, `report-generation`) belong in reusable skills shared by **PRD-09 (Data Intelligence Agent)** and **OPS-01 (Business Intelligence Agent)**, while keeping the legacy agent IDs mapped as aliases for backward compatibility.
2. **Document Parsing & Q&A (`pdf-chat-agent`, `docs-chatbot-agent`):**
   - Consolidate into reusable skills (`document-summary`, `entity-extraction`, `document-compare`, `document-classification`, `table-extraction`, `document-qa`) backing **PRD-06 (Document Intelligence Agent)** and **OPS-02 / OPS-03 / OPS-04**.
3. **Writing, Translation & Study (`translation-agent`, `flash-cards-agent`):**
   - Consolidate into reusable skills (`draft-writing`, `rewrite`, `proofreading`, `tone-adjustment`, `translation`, `localization`) backing **PRD-07 (Writing & Language Agent)**.
4. **Visual & Creative Ideation (`video-idea-gen0agent`, `image-generation-agent`):**
   - Extract creative ideation (`idea-to-brief`, `film-positioning`, `trailer-concept`) and visual framing (`scene-visualization`, `storyboard-prompt`, `art-direction`) into composable skills across **ENT-01**, **ENT-04**, **ENT-06**, and **ENT-18**.

---

## 4. Identified Gaps & Conflicts vs. Target Specification

| Area | Current State | Gap / Conflict | Remediation |
|---|---|---|---|
| **Agent Manifest Registry** | Flat `allAgents` object in `src/mastra/index.ts` and static fallback in `list-repository-agents-tool.ts`. | No `AgentManifest` contract, no domain/status metadata (`planned`, `scaffolded`, `active`, `deprecated`), no startup cross-reference validation. | Implement `src/mastra/registry/agent-registry.ts` with Zod startup validation, duplicate checks, reference checks, and `assertRoutable()`. |
| **Execution Guard on Status** | `dynamicAgentsRegistry` auto-provisions any unknown `custom-*`/`agent-*`/`wf-*` ID as an executable agent. | Violates Section 5 & 8: *"Do not route to agents whose status is `planned` or `scaffolded`"*, *"Do not invent tools, skills, integrations, or data access."* | Restrict auto-provisioning to explicit user-created `custom-*` agents; enforce `status === 'active'` guard for all catalogue agents and supervisor routing. |
| **Reusable Skill Layer** | Only 1 markdown file (`src/mastra/workspace/skills/coding-conventions.md`). | No typed `SkillManifest`, no Zod input/output validation, no reusable skill registry across the 41 specialists. | Implement `src/mastra/registry/skill-registry.ts` and domain skill modules (`entertainment`, `productivity`, `marketing`, `operations`). |
| **Task/Result Envelopes** | Free-form prompt/text or ad-hoc JSON per workflow. | Missing `AgentTask<TInput>` and `AgentResult<TOutput>` envelopes with `assumptions`, `warnings`, `sourceRefs`, `pendingApprovals`, and `permissionContext`. | Implement `src/mastra/schemas/envelopes.ts` and `src/mastra/schemas/domain-schemas.ts`. |
| **Permissions & Approval Gates** | Workspace file write approval in Mastra Studio, but custom tools execute without scope checks or approval binding. | Missing execution-layer scope verification (`files:read`, `email:send`, `finance:write`, etc.) and parameter-bound approval verification. | Implement `permission-service.ts`, `approval-service.ts`, and `createGovernedTool` wrapper in `tool-helper.ts`. |
| **Memory & Knowledge Isolation** | Single `defaultMemory` instance shared across agents; no prompt-injection filtering on retrieved docs. | Missing separation of Task State, User Memory, Workspace Memory, and Knowledge Base with `userId`/`workspaceId` boundary checks and untrusted content sanitization. | Implement `src/mastra/memory/knowledge-service.ts` with cross-tenant isolation and prompt-injection neutralization. |
| **Secrets & `.env.example`** | `.env.example`, `src/mastra/index.ts`, and `src/mastra/memory/index.ts` contain hardcoded fallback credentials/URIs. | Violates Section 16 (*"README and `.env.example` explain setup and contain no credentials"*). | Remove hardcoded credentials from `.env.example` and source files; use environment variables with safe local defaults. |

---

## 5. Target Catalogue Coverage Plan (46 Roles)

- **Entertainment & Media (18 Specialists, P0):** `ENT-01` through `ENT-18` + Workflows `WF-ENT-01` through `WF-ENT-06`.
- **Productivity & Workspace (10 Specialists, P0):** `PRD-01` through `PRD-10` + Workflows `WF-PRD-01` through `WF-PRD-06`.
- **Marketing & Growth (6 Specialists, P1):** `MKT-01` through `MKT-06` + Workflows `WF-MKT-01` through `WF-MKT-03`.
- **Business Operations (7 Specialists, P2):** `OPS-01` through `OPS-07` (`OPS-01`..`OPS-06` active with full workflows `WF-OPS-01`..`04`; `OPS-07` registered as `scaffolded` to demonstrate and enforce non-active status blocking until ERP vendor integration is enabled).
- **Platform Supervisors (5 Roles):** `SUP-01` (Global Orchestrator), `SUP-02` (Entertainment), `SUP-03` (Productivity), `SUP-04` (Marketing), `SUP-05` (Operations).

