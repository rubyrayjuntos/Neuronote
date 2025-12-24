# Rollback & Change History

> **Facets**: stage: store | trust: trusted | domain: state | type: technique

## What is Rollback?

**Rollback** restores the previous `AppDefinition` when something goes wrong. It's NeuroNote's safety net for bad AI proposals.

## Location

[stores/appStore.ts](../../stores/appStore.ts)

## Why Rollback?

AI-generated proposals can fail at multiple points:
- Render errors (bad component structure)
- Runtime errors (invalid expressions)
- User rejection ("this isn't what I wanted")

Rollback provides instant recovery without data loss.

## Change History

The store maintains a history stack:

```typescript
interface AppState {
  appDef: AppDefinition | null;
  changeHistory: AppDefinition[];  // Previous versions
  
  applyProposal: (proposal: AppDefinition) => void;
  rollback: () => void;
}
```

## Implementation

### Saving History

When applying a new proposal, the current state is saved:

```typescript
applyProposal: (proposal) => set((state) => {
  // Save current for rollback (if exists)
  if (state.appDef) {
    state.changeHistory.push(state.appDef);
  }
  
  // Apply new proposal
  state.appDef = proposal;
  state.context = proposal.initialContext;
  state.machineState = proposal.machine.initial;
})
```

### Performing Rollback

Rollback pops the last saved state:

```typescript
rollback: () => set((state) => {
  const previous = state.changeHistory.pop();
  
  if (previous) {
    state.appDef = previous;
    state.context = previous.initialContext;
    state.machineState = previous.machine.initial;
  }
})
```

## Usage

### After Render Error

```typescript
function ErrorBoundary({ children }) {
  const { rollback, changeHistory } = useAppActions();
  const [hasError, setHasError] = useState(false);
  
  if (hasError && changeHistory.length > 0) {
    return (
      <div>
        <p>Something went wrong.</p>
        <button onClick={() => {
          rollback();
          setHasError(false);
        }}>
          Undo Last Change
        </button>
      </div>
    );
  }
  
  return children;
}
```

### After User Rejection

```typescript
function AppControls() {
  const { rollback, changeHistory } = useAppActions();
  
  return (
    <div>
      {changeHistory.length > 0 && (
        <button onClick={rollback}>
          Undo
        </button>
      )}
    </div>
  );
}
```

### After Failed Verification

```typescript
async function tryApplyProposal(raw: unknown) {
  const { applyProposal, rollback } = useAppActions();
  
  try {
    const verified = await verifyProposal(raw);
    applyProposal(verified);
  } catch (error) {
    // Proposal failed verification - keep current state
    console.error('Proposal rejected:', error);
    // No rollback needed - we didn't apply it
  }
}
```

## History Limits

To prevent memory bloat, history can be limited:

```typescript
const MAX_HISTORY = 10;

applyProposal: (proposal) => set((state) => {
  if (state.appDef) {
    state.changeHistory.push(state.appDef);
    
    // Trim old history
    if (state.changeHistory.length > MAX_HISTORY) {
      state.changeHistory.shift();
    }
  }
  
  state.appDef = proposal;
})
```

## Multi-Level Undo

Multiple rollbacks go further back:

```typescript
// Undo once
rollback(); // Goes to version N-1

// Undo twice
rollback(); // Goes to version N-2
```

## DevTools Integration

History is visible in Redux DevTools (via Zustand devtools middleware):

```
State Timeline:
├── Initial (empty)
├── Proposal #1: Counter app
├── Proposal #2: Counter with reset  ← current
└── (rollback would go here)
```

## Relations

- **requires**: [zustand-store](./zustand-store.md)
- **part-of**: [dual-kernel](./dual-kernel.md)
- **see-also**: [gatekeeper-pipeline](./gatekeeper-pipeline.md)
