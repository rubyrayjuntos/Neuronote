# NeuroNote Copilot Instructions

## Architecture Overview

NeuroNote implements a **Host–Guest dual-kernel architecture** for safe runtime-malleable software. AI-generated artifacts are treated as **untrusted input** requiring verification before execution.

```
User Prompt → AI (Guest) → AppDefinition (IR) → Gatekeeper → Host Runtime
                              │                    │
                              │                    ├── Zod schema validation
                              │                    ├── Semantic verification
                              │                    └── Test vector execution
                              │
                              └── Declarative JSON schema (never raw code)
```

### Key Components

| Layer | Location | Purpose |
|-------|----------|---------|
| **Schemas** | `schemas/index.ts` | Zod schemas + `repairProposal()` for AI output normalization |
| **Store** | `stores/appStore.ts` | Zustand + Immer state management |
| **AI Providers** | `services/ai/{groq,gemini,bedrock}.ts` | Model-agnostic proposal generation |
| **Operators** | `operators/registry.ts` | 45+ pure dataflow operators (Math.*, Image.*, etc.) |
| **Validator** | `utils/validator.ts` | Multi-pass verification: structure, pipelines, bindings, honesty |
| **Runtime** | `components/HostRuntime.tsx` | Renders verified AppDefinition via component registry |

## Critical Patterns

### AppDefinition Structure
Every AI proposal must conform to this IR:
```typescript
{
  version: "v2025-12-23-14:30",  // Timestamp version
  initialContext: { key: value },  // State initialization
  machine: { initial: "idle", states: {...} },  // FSM
  pipelines: { pipelineId: { inputs, nodes, output } },  // Dataflow
  view: { id, type, children, bindings... },  // UI tree
  testVectors: [{ name, initialState, steps }]  // Self-tests
}
```

### TestVector Step Format
Each step simulates an event and asserts expectations:
```typescript
testVectors: [{
  name: "Counter increments on click",
  initialState: "idle",
  steps: [
    {
      event: "CLICK",
      payload: {},  // Optional event data
      expectState: "idle",  // Expected machine state after
      expectContextKeys: { count: 1 }  // Expected context values
    },
    { event: "CLICK", expectContextKeys: { count: 2 } }
  ]
}]
```

### Pipeline Input References
**CRITICAL**: Every `$variable` in node inputs MUST be declared in that pipeline's `inputs`:
```typescript
// ✅ Correct
{ inputs: { count: "number" }, nodes: [{ inputs: { a: "$count" } }] }

// ❌ Fails validation - $count not declared
{ inputs: {}, nodes: [{ inputs: { a: "$count" } }] }
```

### Node Output References (`@nodeId`)
Use `@nodeId` to reference another node's output within the same pipeline:
```typescript
{
  inputs: { image: "image" },
  nodes: [
    { id: "gray", op: "Image.Grayscale", inputs: { image: "$image" } },
    { id: "blur", op: "Image.Blur", inputs: { image: "@gray", radius: 5 } }  // References gray's output
  ],
  output: "blur"
}
```

### Machine (FSM) Event Handling
The `machine` defines state transitions triggered by events:
```typescript
machine: {
  initial: "idle",
  states: {
    idle: {
      on: {
        FILE_SELECTED: { target: "processing", actions: ["storeFile"] },
        CLICK: "active"  // Shorthand: just target state
      }
    },
    processing: {
      entry: ["runPipeline"],  // Actions on state entry
      on: { COMPLETE: "idle", ERROR: "error" }
    }
  }
}
```

### UI Event Wiring (`onEvent`)
Connect UI components to machine events using `onEvent`:
```typescript
{
  id: "uploadBtn",
  type: "Input.Image",
  onEvent: "FILE_SELECTED",  // Dispatches this event to machine
  valueBinding: "selectedImage"  // Stores value in context
}
```
Common events: `CLICK`, `FILE_SELECTED`, `VALUE_CHANGED`, `SUBMIT`

### View Node Types
Use PascalCase hierarchical types: `Input.Image`, `Display.Chart`, `Layout.Stack`, `Control.Button`
The `repairProposal()` function auto-corrects `input.image` → `Input.Image`

## Environment Variables

Create `.env` from `.env.example`:
```bash
VITE_GROQ_API_KEY=gsk_...      # Groq API (default provider)
VITE_API_KEY=AIza...            # Google Gemini API
# AWS Bedrock uses IAM or bearer token auth (see services/ai/bedrock.ts)
```

## Commands

```bash
npm run dev          # Start Vite dev server (port 3000/3001)
npm run build        # Production build
npx vitest run       # Run all 322 tests
npx vitest run <file>  # Run specific test file
```

## Testing Conventions

- Tests co-located: `foo.ts` → `foo.test.ts`
- Use Vitest: `describe`, `it`, `expect`
- Run tests after changes: `npx vitest run`
- Test count should go UP, not down

## Validation Pipeline (Gatekeeper)

AI proposals pass through in order:
1. `repairProposal()` - Auto-fix known AI mistakes (casing, children arrays)
2. `validateAppDefinition()` - Zod schema validation
3. `verifyProposal()` - Semantic checks:
   - `validateStructure()` - View tree integrity
   - `validatePipelines()` - Operator existence, DAG validation
   - `validateBindings()` - Context key references
   - `validateEventWiring()` - UI event → machine event mapping
   - `executeTestVectors()` - Run self-tests

## State Management

Use Zustand store directly, avoid prop drilling:
```typescript
import { useAppStore, selectContext, useAppActions } from '../stores';

// Reading state
const context = useAppStore(selectContext);

// Actions
const { updateContext, applyProposal } = useAppActions();
```

### Error Recovery & Rollback
The store maintains `changeHistory` for recovery:
```typescript
const { rollback, changeHistory } = useAppActions();

// Rollback to previous version after failed proposal
if (verificationFailed) {
  rollback();  // Restores previous appDef from history
}
```

## Adding New Operators

Add to `operators/registry.ts` following this pattern:
```typescript
const MyOperator: OperatorDef = {
  op: 'Category.Name',  // PascalCase
  category: 'category',
  tier: 1,  // 1=WASM sandbox, 2=Host
  pure: true,
  async: false,
  inputs: [{ name: 'input', type: 'number' }],
  output: { name: 'result', type: 'number' },
  description: 'What it does',
  impl: (inputs) => inputs.input * 2,
};
```

## File Organization

```
schemas/          # Zod schemas, repairProposal
stores/           # Zustand store, selectors, actions
services/ai/      # AI providers (groq, gemini, bedrock)
operators/        # Dataflow operators + registry
utils/            # validator, honestyOracle, migration
components/       # React components, HostRuntime
```

## SerenaBridge: Two-Phase Prompt Retrieval

`services/SerenaBridge.ts` implements a token-efficient pattern for AI prompts:

### Phase 1: Menu Mode
Send abbreviated operator summaries to reduce token usage:
```typescript
const menu = SerenaBridge.buildMenuPrompt();
// Returns: "Math.Add(a,b)→number, Image.Blur(img,radius)→image, ..."
```

### Phase 2: Full Specs
When AI needs details, request full specifications for specific operators:
```typescript
const specs = SerenaBridge.buildSpecsPrompt(['Math.Add', 'Image.Blur']);
// Returns complete input/output schemas, examples, tier info
```

### Hybrid Mode (Experimental)
`buildHybridPrompt()` sends featured operators with full specs + menu for others:
```typescript
const prompt = SerenaBridge.buildHybridPrompt({
  featuredOperators: ['Math.Add', 'Image.Grayscale', 'Text.Template']
});
```

**Note**: Hybrid mode is in TODO - some AI models produce casing errors that `repairProposal()` auto-fixes.
## Agent Best Practices

### 1. Tool Priority: Serena First

When Serena (mcp_oraios_serena_*) tools are available, ALWAYS prefer them over VS Code built-in tools:

| Operation | Use Serena | NOT VS Code |
|-----------|------------|-------------|
| Search text/patterns | `search_for_pattern` | `grep_search` |
| Find symbols | `find_symbol` | `grep_search` or `semantic_search` |
| Find references | `find_referencing_symbols` | `list_code_usages` |
| File overview | `get_symbols_overview` | `read_file` (full file) |
| List directories | `list_dir` | `list_dir` (VS Code) |
| Find files | `find_file` | `file_search` |

Only fall back to VS Code tools when Serena tools are unavailable or return no results.

---

### 2. Fix Root Causes, Not Symptoms

**NEVER do these to "fix" a problem:**

| Anti-Pattern | Why It's Harmful |
|--------------|------------------|
| Make a required field optional | Hides the real bug, breaks type safety |
| Add a NOOP/passthrough handler | Masks failures instead of fixing them |
| Catch and swallow errors silently | Hides bugs that will resurface later |
| Remove failing tests | Destroys the safety net |
| Weaken validation rules | Lets invalid data through |
| Add `as any` or `@ts-ignore` | Disables type checking instead of fixing types |
| Comment out problematic code | Leaves dead code and unresolved issues |

**ALWAYS do these instead:**

- Trace the error to its source
- Understand WHY the field is missing/wrong
- Fix the producer of the bad data, not the consumer
- If unclear, ASK before weakening constraints

---

### 3. Testing Discipline

- Run tests BEFORE committing changes
- Run tests AFTER making changes to verify nothing broke
- Add tests for new functionality
- If a test fails, fix the code OR fix the test if the test was wrong—never delete it
- Test count should go UP or stay the same, rarely down

---

### 4. Code Modification Principles

- **Minimal changes**: Don't refactor unrelated code while fixing a bug
- **Preserve intent**: Understand what code does before changing it
- **Backward compatibility**: Consider callers when changing function signatures
- **Use Serena's symbolic editing** (`replace_symbol_body`, `insert_after_symbol`) when modifying functions/classes
- **Read before writing**: Always understand context before editing

---

### 5. Error Handling

- Errors should propagate with useful context, not be swallowed
- Log errors with enough detail to debug (what failed, what was the input)
- Distinguish between recoverable and unrecoverable errors
- Validation errors should explain what's wrong AND what's expected

---

### 6. Memory Management

- Read relevant memory files before starting complex tasks
- Update memory files when completing significant work
- Use TODO.md to track pending items
- Don't read the same memory file twice in one conversation

---

### 7. Communication

- If a fix seems wrong or too easy, pause and verify
- Ask for clarification rather than making assumptions
- Explain trade-offs when multiple solutions exist
- Admit uncertainty rather than guessing

---

### 8. Improvement Persistence

**NEVER roll back an improvement just to remove a hurdle.**

When an improvement causes problems:
1. **Test** - Verify what exactly is failing
2. **Probe** - Gather data about the failure conditions
3. **Troubleshoot** - Understand the root cause
4. **Fix** - Address the actual issue, not the symptom

**Rolling back is only allowed when:**
- Both user and agent explicitly agree to stop trying
- The improvement is documented in TODO.md with:
  - What was attempted
  - Why it failed
  - What was learned
  - Potential future approaches

**Examples of what NOT to do:**

| Situation | Wrong Response | Right Response |
|-----------|----------------|----------------|
| Hybrid prompt mode causes casing errors | Revert to full docs | Fix the casing with auto-repair layer |
| New validation rejects AI output | Remove validation | Improve AI prompts or add repair logic |
| Zustand migration breaks a component | Revert to prop drilling | Debug and fix the store integration |
| Test fails after refactor | Delete the test | Fix the code or update the test correctly |

**The easy way out is almost always the wrong way out.**