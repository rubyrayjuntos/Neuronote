# Operator Architecture Specification

> **Status**: Current as of 2025-12-21  
> **Problem**: Operators are spread across multiple files making them "spaghetti" to maintain  
> **Goal**: Single source of truth with automatic propagation

---

## Executive Summary

Operators in NeuroNote are **pure dataflow primitives** that transform data in pipelines. They are the "verbs" the AI wires together. Currently, adding a new operator requires touching **3-5 files** depending on its tier.

### Current Pain Points
1. Tier 2 operators need definitions in registry AND implementations in Worker blob
2. No automated validation that registry matches Worker implementations
3. Manifest generation is manual (must click "Generate" in Gatekeeper)
4. Easy to add operator to registry but forget Worker implementation (or vice versa)

---

## File Inventory

### Primary Files (Must Touch)

| File | Purpose | What Goes Here |
|------|---------|----------------|
| `operators/registry.ts` | **SINGLE SOURCE OF TRUTH** | All 46 operator definitions with metadata |
| `services/WasmKernel.ts` | Worker blob with Tier 2 implementations | Lines 230-640: Helper functions + TIER2_OPERATORS |

### Secondary Files (Auto-Derived)

| File | Purpose | Derives From |
|------|---------|--------------|
| `manifest/registry.ts` | AI prompt generation | Imports from `operators/registry.ts` |
| `constants.ts` | ALLOWED_OPS for validator | `Object.keys(OPERATOR_REGISTRY)` |
| `public/manifest.json` | Static export (documentation) | Generated via Gatekeeper UI |

### Test Files

| File | Purpose |
|------|---------|
| `utils/operators.test.ts` | Unit tests for Tier 1 operators |
| `utils/architecture.test.ts` | Integration tests for manifest/validator |

---

## Operator Tiers

### Tier 1: Pure Synchronous (33 operators)
- **Execution**: Injected into Worker at boot, run inside QuickJS sandbox
- **Properties**: sync, pure, deterministic, bounded
- **Examples**: `Text.ToUpper`, `Math.Add`, `List.Map`

```
┌─────────────────────────────────────────────────────────────────┐
│                    operators/registry.ts                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ const TextToUpper: OperatorDefinition = {               │    │
│  │   op: 'Text.ToUpper',                                   │    │
│  │   tier: 1,           // <-- Tier 1 = sync              │    │
│  │   impl: (inputs) => String(inputs[0]).toUpperCase()    │    │
│  │ }                                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ generateTier1OperatorsSource()
┌─────────────────────────────────────────────────────────────────┐
│                    services/WasmKernel.ts                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ /* TIER1_OPERATORS_INJECTION_POINT */                   │    │
│  │ // Gets replaced with:                                  │    │
│  │ const TIER1_OPERATORS = {                               │    │
│  │   'Text.ToUpper': (inputs) => String(inputs[0])...     │    │
│  │ };                                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Adding a Tier 1 operator**: Only touch `operators/registry.ts`

### Tier 2: Async/Heavy (13 operators)
- **Execution**: Run in Worker's native JS (not QuickJS sandbox)
- **Properties**: async, uses browser APIs (OffscreenCanvas, AudioContext)
- **Examples**: `Image.Grayscale`, `CV.Vectorize`, `Audio.FFT`

```
┌─────────────────────────────────────────────────────────────────┐
│                    operators/registry.ts                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ const ImageGrayscale: OperatorDefinition = {            │    │
│  │   op: 'Image.Grayscale',                                │    │
│  │   tier: 2,           // <-- Tier 2 = async             │    │
│  │   async: true,                                          │    │
│  │   impl: async () => { throw new Error('...browser'); } │    │
│  │ }                     // ↑ STUB - real impl elsewhere  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ (metadata only - impl is stub)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    services/WasmKernel.ts                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ const TIER2_OPERATORS = {                               │    │
│  │   'Image.Grayscale': async (inputs) =>                 │    │
│  │       processImage(inputs[0], 'grayscale'),            │    │
│  │   // ... REAL implementation using OffscreenCanvas     │    │
│  │ };                                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ async function processImage(dataUrl, effect) {          │    │
│  │   const canvas = new OffscreenCanvas(...);             │    │
│  │   // ... actual pixel manipulation                     │    │
│  │ }                                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Adding a Tier 2 operator**: Touch BOTH `operators/registry.ts` AND `services/WasmKernel.ts`

---

## Current Operator Inventory

### By Category

| Category | Count | Tier | Operators |
|----------|-------|------|-----------|
| Text | 8 | 1 | ToUpper, ToLower, Length, RegexMatch, Join, Split, Replace, Template |
| Sanitizer | 3 | 1 | StripHTML, Clamp, Truncate |
| Math | 7 | 1 | Add, Subtract, Multiply, Divide, Threshold, Clamp, Normalize |
| Logic | 1 | 1 | If |
| Utility | 1 | 1 | JsonPath |
| List | 9 | 1 | Map, Filter, Sort, Take, Reduce, FoldN, Append, GroupBy, Length |
| Image | 7 | 2 | Decode, Grayscale, Invert, EdgeDetect, Resize, Threshold, Blur |
| CV | 2 | 2 | ContourTrace, Vectorize |
| Vector | 2 | 1 | ToSVG, Simplify |
| Audio | 4 | 2 | Decode, FFT, PeakDetect, BeatDetect |
| Debug | 2 | 1 | TraceInsert, DiffState |

**Total: 46 operators (33 Tier 1, 13 Tier 2)**

---

## Data Flow: How an Operator Executes

```
User clicks button → HostRuntime dispatches event
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     State Machine (QuickJS)                      │
│  Matches event → finds action "RUN:pipelineId:outputKey"        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Pipeline Executor (Worker)                   │
│  1. Topological sort nodes                                      │
│  2. For each node:                                              │
│     - Resolve inputs ($ = context, @ = previous node output)   │
│     - Look up operator in OPERATORS map                         │
│     - Execute: OPERATORS[node.op](resolvedInputs)              │
│  3. Write final output to context[outputKey]                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OPERATORS Map (Merged)                       │
│  const OPERATORS = { ...TIER1_OPERATORS, ...TIER2_OPERATORS }; │
│                                                                 │
│  Tier 1: Injected from registry at boot (sync functions)       │
│  Tier 2: Defined in Worker blob (async functions)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Locations (Line Numbers)

### operators/registry.ts (1201 lines)
```
Lines 1-30:     Module header and imports
Lines 31-100:   Helper functions (safeString, safeNumber, etc.)
Lines 101-600:  Tier 1 operator definitions (Text, Math, List, etc.)
Lines 601-800:  Tier 1 implementations
Lines 801-850:  Image operator definitions (Tier 2 stubs)
Lines 851-900:  CV operator definitions (Tier 2 stubs)  
Lines 901-950:  Audio operator definitions (Tier 2 stubs)
Lines 951-1000: Vector/Debug operators
Lines 1100-1201: OPERATOR_REGISTRY export object
```

### services/WasmKernel.ts (1089 lines)
```
Lines 1-50:     Imports and governance constants
Lines 51-180:   KERNEL_SOURCE (QuickJS state machine)
Lines 180-220:  WORKER_BLOB header
Lines 230-500:  Tier 2 helper functions:
                - processImage() (lines 230-350)
                - decodeImage() (lines 352-370)
                - traceContours() (lines 372-450)
                - contoursToSVG() (lines 452-470)
                - vectorizeImage() (lines 472-520)
                - decodeAudio() (lines 522-540)
                - detectBeats() (lines 542-580)
                - processAudio() (lines 582-620)
Lines 620-650:  TIER2_OPERATORS object (the registry of Tier 2 impls)
Lines 655:      TIER1_OPERATORS_INJECTION_POINT marker
Lines 660:      OPERATORS merge statement
Lines 665-800:  Pipeline executor (topological sort, execution loop)
Lines 800-900:  Worker message handlers
Lines 900-1089: WasmKernel class (boot, dispatch, shutdown)
```

### manifest/registry.ts (430 lines)
```
Lines 1-30:     Imports from operators/registry.ts
Lines 31-180:   Layer 1 primitives (Input.*, Output.*)
Lines 180-220:  Layer 2 derived from OPERATOR_REGISTRY (automatic!)
Lines 220-350:  Layer 3 primitives (Control.*, Capabilities)
Lines 350-430:  generateManifestForPrompt() function
```

---

## The Spaghetti Problem

### Current: Adding a Tier 2 Operator (5 steps)

```
1. operators/registry.ts
   └── Add OperatorDefinition with stub impl

2. services/WasmKernel.ts  
   ├── Add helper function (if needed)
   └── Add entry to TIER2_OPERATORS

3. (Optional) operators/index.ts
   └── Update getTier2OperatorNames if used

4. (Manual) Gatekeeper UI
   └── Click "Generate manifest.json"

5. (Manual) Test
   └── Create test case in operators.test.ts
```

### Proposed: Single-File Operator Definition

A script could read a single definition file and generate:
- Registry entry
- Worker implementation  
- Test stub
- Manifest update

```yaml
# operators/definitions/CV.Vectorize.yaml
operator:
  id: CV.Vectorize
  category: CV
  tier: 2
  async: true
  
inputs:
  - name: image
    type: image
    
output: svg

description: "Full vectorization: edge detect → contour trace → SVG paths."

implementation: |
  async function(inputs) {
    return vectorizeImage(inputs[0]);
  }

helpers:
  - vectorizeImage  # Reference to shared helper

tests:
  - input: "data:image/png;base64,..."
    expected: "<svg..."
```

---

## Validation Script

Run this to check for mismatches:

```bash
npx tsx -e "
import { OPERATOR_REGISTRY } from './operators/registry';

// Get all Tier 2 from registry
const tier2Registry = Object.entries(OPERATOR_REGISTRY)
  .filter(([_, def]) => def.tier === 2 || def.async)
  .map(([op]) => op)
  .sort();

// Hardcoded list from Worker (would be better to parse)
const tier2Worker = [
  'Image.Decode', 'Image.Grayscale', 'Image.Invert', 'Image.EdgeDetect',
  'Image.Resize', 'Image.Threshold', 'Image.Blur',
  'CV.ContourTrace', 'CV.Vectorize',
  'Audio.Decode', 'Audio.FFT', 'Audio.PeakDetect', 'Audio.BeatDetect'
].sort();

const missing = tier2Registry.filter(op => tier2Worker.indexOf(op) === -1);
const extra = tier2Worker.filter(op => tier2Registry.indexOf(op) === -1);

console.log('Registry Tier 2:', tier2Registry.length);
console.log('Worker Tier 2:', tier2Worker.length);
if (missing.length) console.log('❌ Missing in Worker:', missing);
if (extra.length) console.log('❌ Extra in Worker:', extra);
if (!missing.length && !extra.length) console.log('✅ All operators synced');
"
```

---

## Recommendations

### Short-term (Script)
1. Create `scripts/validate-operators.ts` that checks registry vs Worker
2. Add to CI/pre-commit hook
3. Generate manifest.json automatically on build

### Medium-term (Refactor)
1. Move Tier 2 implementations to separate file `operators/tier2-impl.ts`
2. Use code generation to inject into Worker blob
3. Single `operators/definitions/*.ts` files per operator

### Long-term (Architecture)
1. Wasm-based Tier 2 operators (no Worker blob string)
2. Hot-reloadable operators
3. User-defined operators (with safety constraints)

---

## Quick Reference: Adding an Operator

### Tier 1 (Easy)
```typescript
// operators/registry.ts - just add this:
const MyNewOp: OperatorDefinition = {
  op: 'Category.MyNewOp',
  category: 'Category',
  inputs: [{ name: 'input', type: 'string' }],
  output: 'string',
  description: 'Does something useful',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 1,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
  },
  impl: (inputs) => {
    return doSomething(inputs[0]);
  },
};

// Then add to OPERATOR_REGISTRY at bottom of file:
'Category.MyNewOp': MyNewOp,
```

### Tier 2 (Two files)
```typescript
// 1. operators/registry.ts - add definition with STUB:
const MyAsyncOp: OperatorDefinition = {
  op: 'Category.MyAsyncOp',
  tier: 2,
  async: true,
  impl: async () => { throw new Error('Category.MyAsyncOp requires browser context'); },
  // ... rest of definition
};

// 2. services/WasmKernel.ts - add to TIER2_OPERATORS:
const TIER2_OPERATORS = {
  // ... existing operators ...
  'Category.MyAsyncOp': async (inputs) => myHelperFunction(inputs[0]),
};

// 3. services/WasmKernel.ts - add helper if needed:
async function myHelperFunction(data) {
  // Use OffscreenCanvas, AudioContext, etc.
  return result;
}
```

---

## Appendix: OperatorDefinition Schema

```typescript
interface OperatorDefinition {
  op: string;              // e.g., 'Image.Grayscale'
  category: string;        // e.g., 'Image'
  inputs: {
    name: string;
    type: string;          // string, number, array, image, audio, etc.
    description?: string;
  }[];
  output: string;          // Return type
  description: string;     // Human-readable
  example?: string;        // Usage example
  tier: 1 | 2;            // 1 = sync, 2 = async
  pure: boolean;          // No side effects
  async: boolean;         // Returns Promise
  properties: {
    complexity: number;    // 1-10 cost score
    idempotent?: boolean;  // f(f(x)) = f(x)
    bounded: boolean;      // Guaranteed to terminate
    deterministic: boolean;// Same input = same output
    inputTaint?: number;   // Expected taint level
    outputTaint: number;   // Taint level of output
  };
  impl: Function;         // The actual implementation (or stub for Tier 2)
}
```
