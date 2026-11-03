# AWAS Specialist AI Agent Repository (`awas-ai-agents`)

A governed, multi-domain repository of **46 AI roles** (41 domain specialists and 5 platform/domain supervisors), **121+ composable skills**, **30+ permission-scoped tools**, and **19 multi-agent workflows** built on `@mastra/core`.

---

## 1. Domain Inventory & Implementation Status

| Domain | Roles | Priority | Active | Scaffolded | Workflows |
|---|---:|---|---:|---:|---|
| **Entertainment & Media** (`ENT-01` .. `ENT-18`) | 18 | P0 | 18 | 0 | `WF-ENT-01` .. `WF-ENT-06` |
| **Productivity & Workspace** (`PRD-01` .. `PRD-10`) | 10 | P0 | 10 | 0 | `WF-PRD-01` .. `WF-PRD-06` |
| **Marketing & Growth** (`MKT-01` .. `MKT-06`) | 6 | P1 | 6 | 0 | `WF-MKT-01` .. `WF-MKT-03` |
| **Business Operations** (`OPS-01` .. `OPS-07`) | 7 | P2 | 6 (`OPS-01`..`06`) | 1 (`OPS-07`) | `WF-OPS-01` .. `WF-OPS-04` |
| **Platform Supervisors** (`SUP-01` .. `SUP-05`) | 5 | Platform | 5 | 0 | Cross-domain orchestration |
| **Total Catalogue** | **46** | | **45** | **1** | **19 Catalogue + 18 Legacy** |

> **Status Policy:** Only `active` agents (backed by unit tests and a passing `EvaluationRecord`) can be routed or executed in production. Agents with status `planned` or `scaffolded` (such as `OPS-07 Supply & Vendor Agent`, which awaits external ERP procurement integration) remain discoverable in catalogue views (`GET /api/catalogue/agents`) but are blocked from execution and supervisor delegation.

---

## 2. Core Architecture

- **Validated Agent & Skill Registries (`src/mastra/registry/`):**
  - `AgentRegistry` (`agent-registry.ts`): Validates all 46 `AgentManifest` entries with Zod at startup, rejects duplicate IDs/slugs, verifies cross-references (skills, tools, workflows, schemas, supervisors), and enforces `assertRoutable()`.
  - `SkillRegistry` (`skill-registry.ts`): Registers reusable capabilities (`src/mastra/skills/index.ts`) with Zod input/output schemas, acceptance criteria, and permission checks (including deterministic screenplay scene extraction in `script.scene-extraction`).
- **Standard Task & Result Envelopes (`src/mastra/schemas/envelopes.ts`):**
  - `AgentTask<TInput>` and `AgentResult<TOutput>` with explicit `assumptions`, `warnings`, `sourceRefs` provenance, `pendingApprovals`, and structured error codes.
- **Least-Privilege Permissions & Approval Gates (`src/mastra/services/`):**
  - `permission-service.ts`: Resolves granted scopes (`files:read`, `files:write`, `calendar:read`, `calendar:write`, `email:read`, `email:draft`, `email:send`, `tasks:read`, `tasks:write`, `crm:read`, `crm:write`, `production:read`, `production:write`, `finance:read`, `finance:write`, `campaigns:read`, `campaigns:launch`, `knowledge:search`, `data:read`, `approvals:read`, `approvals:write`) strictly from the authenticated principal/workspace context—never trusting model-supplied permission strings.
  - `approval-service.ts`: Binds consequential actions to a canonical SHA-256 hash of `{ action, toolId, userId, workspaceId, parameters }`. If parameters change materially after approval, re-approval is required.
- **Memory & Knowledge Isolation (`src/mastra/memory/knowledge-service.ts`):**
  - Separates `TaskStateStore`, `UserMemoryStore` (opt-in, `userId`-isolated, sensitive-data blocked), `WorkspaceMemoryStore` (`workspaceId`-isolated), and `KnowledgeBaseService` (with `sourceRefs` and `sanitizeUntrustedContent()` prompt-injection defense).

---

## 3. Setup & Commands

1. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```
   Populate your preferred cloud provider key (`GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, or `OPENAI_API_KEY`) or run local inference (`LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1` / `OLLAMA_BASE_URL=http://127.0.0.1:11434/v1`).

2. **Install & Typecheck:**
   ```bash
   npm install
   npm run typecheck
   ```

3. **Run Automated Governance, Registry, Skill, Workflow & Security Test Suite:**
   ```bash
   npm test
   ```

4. **Start Development Server:**
   ```bash
   npm run dev
   ```

---

## 4. API Endpoints

- `GET /api/catalogue/agents?domain=&status=&q=` — Query the validated 46-role agent catalogue.
- `GET /api/catalogue/skills?domain=` — Query registered reusable skills.
- `POST /api/agents/:id/execute-task` — Execute a typed `AgentTask<TInput>` envelope and receive a validated `AgentResult<TOutput>`.
- `POST /api/workflows/:id/execute-governed` — Execute any of the 19 catalogue workflows (`WF-ENT-01`..`06`, `WF-PRD-01`..`06`, `WF-MKT-01`..`03`, `WF-OPS-01`..`04`) with permission and approval enforcement.
- `GET /api/tools` & `POST /api/tools/:id/execute` — Inspect and execute registered tools.
