# Gatekeeper Pipeline

## Summary

The Gatekeeper is a multi-phase verification system that sits between AI proposals and the trusted Host runtime. It validates structure, semantics, and behavior before any proposal can affect the system.

## The Pipeline

```
AI Proposal (JSON)
       │
       ▼
┌─────────────────┐
│  1. REPAIR      │  Fix common AI mistakes
│  repairProposal │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. PARSE       │  Zod schema validation
│  parseAppDef    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. VERIFY      │  Semantic checks
│  verifyProposal │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. TEST        │  Execute test vectors
│  executeTests   │
└────────┬────────┘
         │
         ▼
   ✅ Safe to Apply
```

## Phase 1: Repair

**File:** `schemas/index.ts` → `repairProposal()`

AI models make predictable mistakes. The repair phase auto-fixes them:

| Mistake | Fix |
|---------|-----|
| `"type": "control.button"` | → `"Control.Button"` (PascalCase) |
| `"children": null` | → `"children": []` (empty array) |
| `"children": {...}` | → `"children": [{...}]` (wrap in array) |

```typescript
const { proposal, repaired, fixes } = repairProposal(rawJson);
// fixes = ["Fixed type casing: control.button → Control.Button"]
```

**Why repair instead of reject?**

- Better UX: Obvious fixes shouldn't block the user
- Feedback loop: Fixes are logged for prompt improvement
- Pragmatic: AI will improve, but we ship today

## Phase 2: Parse (Zod Validation)

**File:** `schemas/index.ts` → `parseAppDefinition()`

Zod schemas enforce structural correctness:

```typescript
const AppDefinitionSchema = z.object({
  version: z.string(),
  initialContext: z.record(z.any()),
  machine: MachineDefinitionSchema,
  pipelines: z.record(PipelineDefinitionSchema).optional(),
  view: ViewNodeSchema,
  testVectors: z.array(TestVectorSchema).optional(),
});
```

**What it catches:**
- Missing required fields
- Wrong types (string where number expected)
- Invalid enum values
- Malformed nested structures

**Output:**
```typescript
type ParseResult = 
  | { success: true; data: AppDefinition }
  | { success: false; error: z.ZodError };
```

## Phase 3: Verify (Semantic Checks)

**File:** `utils/validator.ts` → `verifyProposal()`

Structural validity ≠ semantic validity. This phase checks deeper invariants:

### Check: validateStructure
Ensures the view tree is well-formed:
- Unique node IDs
- Valid component types (whitelisted)
- Depth limits (prevent infinite nesting)
- Safe HTML tags

### Check: validatePipelines
Ensures dataflow graphs are valid:
- All referenced operators exist
- Input/output types match
- DAG structure (no cycles)
- Output node exists

### Check: validateBindings
Ensures context references are valid:
- `textBinding` keys exist in `initialContext`
- `valueBinding` keys exist in `initialContext`
- No references to undefined keys

### Check: validateEventWiring
Ensures UI events connect to machine events:
- `onEvent` values have handlers in machine
- No orphaned event handlers

### Check: validateMachineIntegrity
Ensures FSM is well-formed:
- Initial state exists
- All transition targets exist
- No unreachable states

### Check: validateProps
Ensures props are safe:
- No `dangerouslySetInnerHTML`
- No `javascript:` URLs
- No forbidden CSS properties
- No event handlers in props

### Check: validateReachability
Ensures all states are reachable from initial:
- Dead state detection
- Transition graph analysis

**Output:**
```typescript
interface VerificationReport {
  passed: boolean;
  score: number;  // 0-100
  timestamp: string;
  checks: CheckResult[];
}

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  evidence?: any;
  recommendedFix?: string;
}
```

## Phase 4: Test (Execute Test Vectors)

**File:** `utils/validator.ts` → `executeTestVectors()`

Proposals include self-tests. The gatekeeper runs them:

```typescript
// From the proposal
testVectors: [{
  name: "Counter increments",
  initialState: "idle",
  steps: [
    { event: "CLICK", expectContextKeys: { count: 1 } },
    { event: "CLICK", expectContextKeys: { count: 2 } }
  ]
}]
```

The executor:
1. Initializes context from `initialContext`
2. Sets machine to `initialState`
3. For each step:
   - Dispatches the event
   - Asserts `expectState` matches
   - Asserts `expectContextKeys` match
4. Reports pass/fail

**Why self-tests matter:**
- AI proves its proposal works
- Catches behavioral regressions
- Documents expected behavior
- Enables property-based testing

## Integration

```typescript
import { repairProposal, parseAppDefinition } from './schemas';
import { verifyProposal } from './utils/validator';

async function processProposal(raw: unknown): Promise<AppDefinition | null> {
  // 1. Repair
  const { proposal, fixes } = repairProposal(raw);
  if (fixes.length > 0) {
    console.log('Applied repairs:', fixes);
  }
  
  // 2. Parse
  const parsed = parseAppDefinition(proposal);
  if (!parsed.success) {
    console.error('Schema errors:', parsed.error.issues);
    return null;
  }
  
  // 3. Verify
  const report = verifyProposal(parsed.data);
  if (!report.passed) {
    console.error('Semantic errors:', report.checks.filter(c => c.status === 'FAIL'));
    return null;
  }
  
  // 4. Tests run inside verifyProposal
  
  return parsed.data;
}
```

## Constants

Key limits are defined in `constants.ts`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_TREE_DEPTH` | 20 | Prevent infinite nesting |
| `MAX_PIPELINE_NODES` | 50 | Limit pipeline complexity |
| `SAFE_TAGS` | [div, span, ...] | HTML tag whitelist |
| `FORBIDDEN_PROPS` | [dangerouslySetInnerHTML, ...] | XSS prevention |
| `OPCODES` | [Math.Add, ...] | Operator whitelist |

## Source Files

- `schemas/index.ts` - Zod schemas, `repairProposal()`, `parseAppDefinition()`
- `utils/validator.ts` - `verifyProposal()`, all semantic checks
- `constants.ts` - Security limits and whitelists

## Related Concepts

- [Zod Validation](zod-validation.md) - Schema enforcement details
- [Repair Proposal](repair-proposal.md) - Auto-fix logic
- [Semantic Checks](semantic-checks.md) - Individual check details
- [Test Vectors](test-vectors.md) - Self-testing system
- [Dual-Kernel](dual-kernel.md) - Why gatekeeper exists
