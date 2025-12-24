# AppDefinition Schema

## Summary

The AppDefinition is the **Intermediate Representation (IR)** that AI produces and the Host interprets. It's a declarative JSON schema that describes an entire application: state, behavior, UI, and tests.

## Why an IR?

| Approach | Problem |
|----------|---------|
| **AI writes code** | Unsafe, unpredictable, hard to validate |
| **AI writes config** | Limited expressiveness |
| **AI writes IR** | ✅ Inspectable, validatable, interpretable |

The AppDefinition is:
- **Declarative**: Describes *what*, not *how*
- **Inspectable**: Human-readable JSON
- **Validatable**: Zod schema enforcement
- **Versionable**: Snapshots for rollback

## Schema Structure

```typescript
interface AppDefinition {
  // Version identifier (timestamp-based)
  version: string;  // "v2025-12-23-14:30"
  
  // Initial state values
  initialContext: Record<string, any>;
  
  // Finite State Machine
  machine: MachineDefinition;
  
  // Dataflow graphs
  pipelines: Record<string, PipelineDefinition>;
  
  // UI tree
  view: ViewNode;
  
  // Self-tests
  testVectors: TestVector[];
  
  // Optional: Actor definitions for scoped state
  actors?: Record<string, MachineDefinition>;
  
  // Optional: Cryptographic signature
  signature?: string;
}
```

## Components

### 1. Version

Timestamp-based version string for tracking changes:

```json
{
  "version": "v2025-12-23-14:30:45"
}
```

### 2. Initial Context

The starting state of the application:

```json
{
  "initialContext": {
    "count": 0,
    "items": [],
    "user": { "name": "", "loggedIn": false }
  }
}
```

Context keys are referenced by:
- View bindings (`textBinding: "count"`)
- Pipeline inputs (`inputs: { value: "number" }`)
- Machine actions

### 3. Machine (FSM)

A finite state machine defining behavior:

```json
{
  "machine": {
    "initial": "idle",
    "states": {
      "idle": {
        "on": {
          "CLICK": { "target": "active", "actions": ["increment"] },
          "RESET": "idle"
        }
      },
      "active": {
        "entry": ["playSound"],
        "on": {
          "TIMEOUT": "idle"
        }
      }
    }
  }
}
```

**Key properties:**
- `initial` - Starting state name
- `states` - Map of state name → state definition
- `on` - Map of event name → transition
- `entry` - Actions to run on state entry
- `target` - Destination state
- `actions` - Side effects to execute

### 4. Pipelines

Dataflow graphs for computation:

```json
{
  "pipelines": {
    "processImage": {
      "inputs": { "image": "image" },
      "nodes": [
        { "id": "gray", "op": "Image.Grayscale", "inputs": { "image": "$image" } },
        { "id": "blur", "op": "Image.Blur", "inputs": { "image": "@gray", "radius": 5 } }
      ],
      "output": "blur"
    }
  }
}
```

**Key properties:**
- `inputs` - Declared pipeline inputs with types
- `nodes` - Processing steps with operators
- `output` - Which node's result is the pipeline output
- `$variable` - References pipeline input
- `@nodeId` - References another node's output

### 5. View

A tree of UI components:

```json
{
  "view": {
    "id": "root",
    "type": "Layout.Stack",
    "children": [
      {
        "id": "counter",
        "type": "Display.Text",
        "textBinding": "count"
      },
      {
        "id": "btn",
        "type": "Control.Button",
        "props": { "label": "Click me" },
        "onEvent": "CLICK"
      }
    ]
  }
}
```

**Key properties:**
- `id` - Unique identifier
- `type` - Component type (PascalCase, hierarchical)
- `children` - Nested components
- `props` - Static properties
- `textBinding` - Context key for text content
- `valueBinding` - Context key for input value
- `onEvent` - Event to dispatch on interaction

### 6. Test Vectors

Self-tests that verify behavior:

```json
{
  "testVectors": [
    {
      "name": "Counter increments on click",
      "initialState": "idle",
      "steps": [
        { "event": "CLICK", "expectState": "idle", "expectContextKeys": { "count": 1 } },
        { "event": "CLICK", "expectContextKeys": { "count": 2 } }
      ]
    }
  ]
}
```

**Key properties:**
- `name` - Test description
- `initialState` - Starting machine state
- `steps` - Sequence of events and assertions
- `event` - Event to dispatch
- `payload` - Optional event data
- `expectState` - Expected machine state after
- `expectContextKeys` - Expected context values

## Validation

AppDefinitions are validated in phases:

1. **Zod Parsing** - Structural validation
2. **Semantic Checks** - Reference validation
3. **Test Vector Execution** - Behavioral validation

```typescript
import { parseAppDefinition, verifyProposal } from './schemas';

// Phase 1: Parse with Zod
const result = parseAppDefinition(jsonFromAI);
if (!result.success) {
  console.error(result.error);
  return;
}

// Phase 2: Semantic verification
const report = verifyProposal(result.data);
if (!report.passed) {
  console.error(report.checks.filter(c => c.status === 'FAIL'));
  return;
}

// Safe to use
applyProposal(result.data);
```

## Source Files

- `schemas/index.ts` - Zod schemas
- `types.ts` - TypeScript interfaces

## Related Concepts

- [Zod Validation](zod-validation.md) - Schema enforcement
- [Gatekeeper Pipeline](gatekeeper-pipeline.md) - Full verification flow
- [View Node](view-node.md) - UI tree structure
- [Machine Definition](machine-definition.md) - FSM details
- [Pipeline Definition](pipeline-definition.md) - Dataflow graphs
- [Test Vectors](test-vectors.md) - Self-testing
