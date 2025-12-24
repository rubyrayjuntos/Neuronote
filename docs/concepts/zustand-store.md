# Store (Zustand + Immer)

> **Facets**: stage: execution | trust: host | domain: state | type: component

## What is the Store?

The **Store** is the central state management system built on [Zustand](https://zustand-demo.pmnd.rs/) with [Immer](https://immerjs.github.io/immer/) for immutable updates. It holds the current `AppDefinition`, context, and provides actions for state transitions.

## Location

[stores/appStore.ts](../../stores/appStore.ts)

## Why Zustand + Immer?

| Library | Purpose |
|---------|---------|
| **Zustand** | Minimal, hook-based state management |
| **Immer** | Write "mutable" code that produces immutable updates |

Together they provide:
- No Redux boilerplate
- Direct state access via hooks
- Immutable state history for rollback
- TypeScript-first design

## Store Structure

```typescript
interface AppState {
  // Current application definition
  appDef: AppDefinition | null;
  
  // Runtime context (variable state)
  context: Record<string, unknown>;
  
  // Current machine state
  machineState: string;
  
  // History for rollback
  changeHistory: AppDefinition[];
  
  // Actions
  applyProposal: (proposal: AppDefinition) => void;
  updateContext: (updates: Record<string, unknown>) => void;
  transition: (event: string, payload?: unknown) => void;
  rollback: () => void;
}
```

## Creating the Store

```typescript
// In stores/appStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export const useAppStore = create<AppState>()(
  immer((set, get) => ({
    appDef: null,
    context: {},
    machineState: 'idle',
    changeHistory: [],

    applyProposal: (proposal) => set((state) => {
      // Save current for rollback
      if (state.appDef) {
        state.changeHistory.push(state.appDef);
      }
      state.appDef = proposal;
      state.context = proposal.initialContext;
      state.machineState = proposal.machine.initial;
    }),

    updateContext: (updates) => set((state) => {
      Object.assign(state.context, updates);
    }),

    transition: (event, payload) => set((state) => {
      const { machine } = state.appDef!;
      const currentState = machine.states[state.machineState];
      const transition = currentState.on?.[event];
      
      if (transition) {
        state.machineState = typeof transition === 'string' 
          ? transition 
          : transition.target;
      }
    }),

    rollback: () => set((state) => {
      const prev = state.changeHistory.pop();
      if (prev) {
        state.appDef = prev;
        state.context = prev.initialContext;
        state.machineState = prev.machine.initial;
      }
    }),
  }))
);
```

## Using the Store

### Reading State

```typescript
// In components
import { useAppStore } from '../stores';

function CounterDisplay() {
  // Subscribe to specific state slice
  const count = useAppStore(state => state.context.count);
  return <div>{count}</div>;
}
```

### Using Selectors

```typescript
// Reusable selectors for performance
export const selectContext = (state: AppState) => state.context;
export const selectMachineState = (state: AppState) => state.machineState;
export const selectAppDef = (state: AppState) => state.appDef;

// Usage
const context = useAppStore(selectContext);
```

### Using Actions

```typescript
// Custom hook for actions
export function useAppActions() {
  return useAppStore(state => ({
    applyProposal: state.applyProposal,
    updateContext: state.updateContext,
    transition: state.transition,
    rollback: state.rollback,
  }));
}

// Usage
function IncrementButton() {
  const { updateContext } = useAppActions();
  
  return (
    <button onClick={() => updateContext({ count: (c) => c + 1 })}>
      Increment
    </button>
  );
}
```

## Immer Benefits

Immer lets you write "mutable" code:

```typescript
// Without Immer (manual immutability)
updateContext: (updates) => set((state) => ({
  ...state,
  context: {
    ...state.context,
    ...updates,
  }
}))

// With Immer (looks mutable, produces immutable)
updateContext: (updates) => set((state) => {
  Object.assign(state.context, updates);
})
```

## Rollback for Error Recovery

When a proposal fails verification:

```typescript
async function applyProposalSafely(proposal: AppDefinition) {
  const { applyProposal, rollback } = useAppActions();
  
  try {
    // Apply optimistically
    applyProposal(proposal);
    
    // Verify
    await verifyProposal(proposal);
  } catch (error) {
    // Revert to previous state
    rollback();
    throw error;
  }
}
```

## DevTools Integration

Zustand supports Redux DevTools:

```typescript
import { devtools } from 'zustand/middleware';

const useAppStore = create<AppState>()(
  devtools(
    immer((set, get) => ({
      // ... state and actions
    })),
    { name: 'NeuroNote Store' }
  )
);
```

## Relations

- **enables**: [runtime-assembler](./runtime-assembler.md)
- **uses**: [machine-fsm](./machine-fsm.md)
- **part-of**: [host-runtime](./host-runtime.md)
- **see-also**: [lsi-optics](./lsi-optics.md)
