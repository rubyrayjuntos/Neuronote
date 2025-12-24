# Test Vectors

> **Facets**: stage: validation | trust: boundary | domain: testing | type: technique

## What Are Test Vectors?

Test vectors are **self-tests embedded in every AppDefinition**. They simulate user interactions and assert expected outcomes, allowing the system to verify that AI proposals actually work before deploying them.

## Why Test Vectors?

Traditional testing happens after deployment. Test vectors flip this:

```
Traditional: Code → Deploy → Test → Find bugs → Fix
NeuroNote:   AI Proposal → Test Vectors → Deploy only if passing
```

This makes AI-generated code **safe by construction**—if tests fail, the proposal is rejected before it can affect users.

## Structure

```typescript
interface TestVector {
  name: string;           // Human-readable test name
  initialState: string;   // Starting machine state
  steps: TestStep[];      // Sequence of events and assertions
}

interface TestStep {
  event: string;                    // Event to dispatch
  payload?: Record<string, any>;    // Event data
  expectState?: string;             // Expected machine state after
  expectContextKeys?: Record<string, any>;  // Expected context values
}
```

## Example: Counter App

```json
{
  "testVectors": [
    {
      "name": "Counter increments on click",
      "initialState": "idle",
      "steps": [
        { "event": "CLICK", "expectState": "idle", "expectContextKeys": { "count": 1 } },
        { "event": "CLICK", "expectContextKeys": { "count": 2 } },
        { "event": "CLICK", "expectContextKeys": { "count": 3 } }
      ]
    },
    {
      "name": "Reset returns count to zero",
      "initialState": "idle",
      "steps": [
        { "event": "CLICK", "expectContextKeys": { "count": 1 } },
        { "event": "CLICK", "expectContextKeys": { "count": 2 } },
        { "event": "RESET", "expectContextKeys": { "count": 0 } }
      ]
    }
  ]
}
```

## Example: Image Processor

```json
{
  "testVectors": [
    {
      "name": "Image upload triggers processing",
      "initialState": "idle",
      "steps": [
        {
          "event": "FILE_SELECTED",
          "payload": { "file": "test-image.png" },
          "expectState": "processing"
        },
        {
          "event": "PROCESSING_COMPLETE",
          "expectState": "idle",
          "expectContextKeys": { "hasResult": true }
        }
      ]
    }
  ]
}
```

## Execution

Test vectors are executed as the **final gate** in the [gatekeeper-pipeline](./gatekeeper-pipeline.md):

```typescript
// In utils/validator.ts
function executeTestVectors(appDef: AppDefinition): TestResult[] {
  return appDef.testVectors.map(vector => {
    // Initialize test state
    let state = vector.initialState;
    let context = { ...appDef.initialContext };
    
    for (const step of vector.steps) {
      // Dispatch event through machine
      const result = machine.transition(state, step.event, context);
      state = result.state;
      context = result.context;
      
      // Check assertions
      if (step.expectState && state !== step.expectState) {
        return { pass: false, error: `Expected state ${step.expectState}, got ${state}` };
      }
      
      if (step.expectContextKeys) {
        for (const [key, expected] of Object.entries(step.expectContextKeys)) {
          if (context[key] !== expected) {
            return { pass: false, error: `Expected ${key}=${expected}, got ${context[key]}` };
          }
        }
      }
    }
    
    return { pass: true };
  });
}
```

## Best Practices

### 1. Test the Happy Path
Every app should have at least one test vector covering normal usage.

### 2. Test Edge Cases
```json
{
  "name": "Cannot go below zero",
  "steps": [
    { "event": "DECREMENT", "expectContextKeys": { "count": 0 } }
  ]
}
```

### 3. Test State Transitions
Verify the machine moves through expected states:
```json
{
  "steps": [
    { "event": "START", "expectState": "loading" },
    { "event": "LOADED", "expectState": "ready" }
  ]
}
```

### 4. Name Tests Descriptively
Names appear in validation errors—make them explain the expected behavior.

## Failure Handling

When test vectors fail, the proposal is rejected:

```typescript
const results = executeTestVectors(appDef);
const failures = results.filter(r => !r.pass);

if (failures.length > 0) {
  throw new TestVectorError(
    `${failures.length} test vectors failed`,
    failures.map(f => f.error)
  );
}
```

The AI receives failure details and can regenerate a corrected proposal.

## Relations

- **part-of**: [gatekeeper-pipeline](./gatekeeper-pipeline.md)
- **uses**: [machine-fsm](./machine-fsm.md)
- **enables**: [safe-deployment](./safe-deployment.md)
- **see-also**: [honesty-oracle](./honesty-oracle.md)
