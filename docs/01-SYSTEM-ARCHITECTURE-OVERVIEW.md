# NeuroNote System Architecture Overview

## Quick Reference: Linear Architecture

```
User Prompt → AI Provider → AppDefinition → Gatekeeper → Store → Runtime → UI
```

- **User Prompt** — Natural language request ("make a counter app")
- **Prompt Builder** — Constructs system prompt with schema docs + operator menu
- **AI Provider** — Sends to LLM (Groq/Gemini/Bedrock), receives JSON proposal
- **Repair Layer** — Auto-fixes common AI mistakes (casing, arrays)
- **Zod Validation** — Parses JSON against AppDefinition schema
- **Semantic Checks** — Validates structure, pipelines, bindings, event wiring
- **Test Vectors** — Executes embedded self-tests to verify behavior
- **Zustand Store** — Stores verified AppDefinition + context + machine state
- **Runtime Assembler** — Walks view tree, resolves bindings, wires events
- **Component Registry** — Maps type strings to React components
- **Host Runtime** — Renders final UI, dispatches events back to store
- **WASM Sandbox** — Executes Tier 1 pipeline operators in isolation
- **Rollback** — Reverts to previous AppDefinition if anything fails

**Trust Boundaries:**
- 🔴 Untrusted: AI output (raw JSON)
- 🟡 Gatekeeper: Repair → Zod → Semantic → TestVectors
- 🟢 Trusted Host: Store, Runtime, Tier 2 operators
- 🔵 Sandboxed Guest: WASM kernel, Tier 1 operators

---

## Executive Summary

NeuroNote implements a **Host–Guest Dual-Kernel Architecture** for building safe, runtime-malleable software. The system treats AI-generated artifacts as untrusted input, requiring multi-phase verification before execution.

## Core Design Principle

```
User Prompt → AI (Guest) → AppDefinition (IR) → Gatekeeper → Host Runtime
```

AI never generates executable code. Instead, it produces a **declarative JSON schema** (AppDefinition) that the Host interprets through a trusted component registry.

---

## The Dual-Kernel Model

### Host Kernel (Trusted)
The Host runs in the main browser thread with full privileges:

| Responsibility | Implementation |
|----------------|----------------|
| Component Registry | `runtime/ComponentRegistry.tsx` |
| State Management | `stores/appStore.ts` (Zustand + Immer) |
| Event Dispatch | FSM-based machine transitions |
| Validation | `utils/validator.ts` (Gatekeeper) |
| Schema Parsing | `schemas/index.ts` (Zod) |

### Guest Kernel (Sandboxed)
The Guest runs in a Web Worker with QuickJS WASM:

| Responsibility | Implementation |
|----------------|----------------|
| Pipeline Execution | `services/WasmKernel.ts` |
| Tier 1 Operators | Pure dataflow (Math.*, Image.*, Text.*) |
| Context Lenses | LSI optics for state access |
| Resource Budgets | Time/memory/operation limits |

---

## Key Architectural Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACE                           │
│  (React Components rendered by RuntimeAssembler)            │
├─────────────────────────────────────────────────────────────┤
│                    HOST RUNTIME                             │
│  HostRuntime.tsx │ ComponentRegistry │ RuntimeAssembler     │
├─────────────────────────────────────────────────────────────┤
│                    STATE LAYER                              │
│  Zustand Store │ Context │ FSM Machine │ Change History     │
├─────────────────────────────────────────────────────────────┤
│                    GATEKEEPER                               │
│  Schema Validation │ Semantic Checks │ Test Vectors         │
├─────────────────────────────────────────────────────────────┤
│                    AI PROPOSAL LAYER                        │
│  Groq/Gemini/Bedrock │ SerenaBridge │ Prompt Builder        │
├─────────────────────────────────────────────────────────────┤
│                    WASM SANDBOX                             │
│  QuickJS Worker │ Tier 1 Operators │ LSI Lenses             │
└─────────────────────────────────────────────────────────────┘
```

---

## The AppDefinition IR (Intermediate Representation)

Every AI proposal compiles to this schema:

```typescript
interface AppDefinition {
  version: string;           // Timestamp version "v2025-12-23-14:30"
  initialContext: object;    // Initial state
  machine: MachineDefinition; // Finite State Machine
  pipelines: Record<string, PipelineDefinition>; // Dataflow graphs
  view: ViewNode;            // UI tree
  testVectors: TestVector[]; // Self-tests
}
```

### Why an IR?

1. **Inspection**: JSON is human-readable and auditable
2. **Validation**: Zod schemas catch malformed proposals
3. **Sandboxing**: No arbitrary code execution
4. **Rollback**: Easy to snapshot and restore previous states

---

## Data Flow

```
1. USER INPUT
   └─→ User types prompt in LabConsole

2. AI SYNTHESIS  
   └─→ promptBuilder.ts constructs system prompt
   └─→ AI provider returns AppDefinition JSON

3. REPAIR
   └─→ repairProposal() fixes common AI mistakes (casing, structure)

4. VALIDATION
   └─→ Zod schema validation (parseAppDefinition)
   └─→ Semantic verification (verifyProposal)
   └─→ Test vector execution (executeTestVectors)

5. APPLY
   └─→ Store updates appDef, context, machine state
   └─→ Migration (AutoLens) preserves compatible context

6. RENDER
   └─→ RuntimeAssembler walks view tree
   └─→ ComponentRegistry resolves types to React components
   └─→ Bindings connect context to UI props

7. INTERACTION
   └─→ User clicks button → dispatches event
   └─→ Machine transitions state
   └─→ Pipelines execute in WASM sandbox
   └─→ Context updates → re-render
```

---

## Security Boundaries

| Boundary | Protection |
|----------|------------|
| AI → Host | AppDefinition schema validation |
| View → DOM | Component whitelist, prop sanitization |
| Event → Machine | Event name validation |
| Machine → Pipeline | Operator whitelist (OPCODES) |
| Pipeline → Context | LSI lens laws, immutability |
| WASM → Host | Message passing only, no direct access |

---

## File Organization

```
/                         # Project root
├── schemas/              # Zod schemas, repairProposal
├── stores/               # Zustand store, selectors, actions
├── services/
│   ├── ai/               # AI providers (groq, gemini, bedrock)
│   └── WasmKernel.ts     # WASM sandbox
├── operators/            # Dataflow operators + registry
├── utils/
│   ├── validator.ts      # Gatekeeper verification
│   └── migration.ts      # AutoLens for schema migration
├── runtime/              # RuntimeAssembler, ComponentRegistry
├── components/           # React components, HostRuntime
└── docs/                 # This documentation
```

---

## Key Invariants

1. **No Raw Code**: AI never produces JavaScript/TypeScript that executes directly
2. **Whitelist Everything**: Components, operators, events, tags are all whitelisted
3. **Immutable State**: Context updates via Immer, never mutated directly
4. **Lens Laws**: All state access through lenses satisfies GetPut/PutGet
5. **Test Vectors**: Proposals include self-tests that run before acceptance
6. **Rollback Ready**: Change history enables instant recovery from bad proposals

---

## Related Documentation

- [02-VALIDATION-GATES.md](02-VALIDATION-GATES.md) - Detailed validation pipeline
- [03-PROPOSAL-STAGE.md](03-PROPOSAL-STAGE.md) - AI proposal generation
- [04-SANDBOX.md](04-SANDBOX.md) - WASM isolation details
- [07-LENSES.md](07-LENSES.md) - LSI optics implementation
- [08-ASSEMBLY.md](08-ASSEMBLY.md) - Runtime assembly process
