# Host Runtime

> **Facets**: stage: assembly, render, interaction | trust: trusted | domain: presentation | type: component

## What is the Host Runtime?

The **Host Runtime** is the top-level React component that orchestrates the entire application. It connects the store, machine, and view tree into a running app.

## Location

[components/HostRuntime.tsx](../../components/HostRuntime.tsx)

## Architecture Position

```
┌─────────────────────────────────────────────────────────┐
│                     HostRuntime                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Zustand Store (state)                               ││
│  │ • appDef: AppDefinition                             ││
│  │ • context: Record<string, any>                      ││
│  │ • machineState: string                              ││
│  └─────────────────────────────────────────────────────┘│
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │ RuntimeAssembler                                    ││
│  │ • Walks view tree                                   ││
│  │ • Resolves bindings                                 ││
│  │ • Wires events                                      ││
│  └─────────────────────────────────────────────────────┘│
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Rendered React Components                           ││
│  │ <StackLayout>                                       ││
│  │   <TextDisplay text={context.title} />              ││
│  │   <Button onClick={() => dispatch('CLICK')} />      ││
│  │ </StackLayout>                                      ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Core Responsibilities

### 1. State Subscription
Subscribes to store and re-renders on changes:

```typescript
function HostRuntime() {
  const appDef = useAppStore(state => state.appDef);
  const context = useAppStore(state => state.context);
  const machineState = useAppStore(state => state.machineState);
  
  if (!appDef) return <EmptyState />;
  
  return (
    <RuntimeAssembler 
      appDef={appDef}
      context={context}
      machineState={machineState}
    />
  );
}
```

### 2. Event Dispatch
Provides dispatch function to child components:

```typescript
function HostRuntime() {
  const transition = useAppStore(state => state.transition);
  
  const dispatch = useCallback((event: string, payload?: any) => {
    transition(event, payload);
  }, [transition]);
  
  return (
    <DispatchContext.Provider value={dispatch}>
      <RuntimeAssembler {...props} />
    </DispatchContext.Provider>
  );
}
```

### 3. Error Boundary
Catches render errors and provides recovery:

```typescript
function HostRuntime() {
  return (
    <ErrorBoundary fallback={<ErrorRecovery />}>
      <RuntimeAssembler {...props} />
    </ErrorBoundary>
  );
}
```

### 4. Hot Reload
Automatically re-renders when appDef changes:

```typescript
// When a new proposal is applied:
const { applyProposal } = useAppActions();
applyProposal(newAppDef);
// HostRuntime re-renders with new view tree
```

## Lifecycle

```
1. Initial Render
   └── Check for appDef → Show empty state or render

2. Proposal Applied
   └── Store updates → HostRuntime re-renders → New UI appears

3. User Interaction
   └── Click → dispatch('EVENT') → Store updates → Re-render

4. Rollback
   └── rollback() → Previous appDef restored → UI reverts
```

## Error Recovery

When rendering fails:

```typescript
function ErrorRecovery() {
  const { rollback, changeHistory } = useAppActions();
  
  return (
    <div className="error-panel">
      <h2>Render Error</h2>
      <p>The current app definition caused an error.</p>
      {changeHistory.length > 0 && (
        <button onClick={rollback}>
          Rollback to Previous Version
        </button>
      )}
    </div>
  );
}
```

## Relations

- **uses**: [runtime-assembler](./runtime-assembler.md)
- **uses**: [zustand-store](./zustand-store.md)
- **uses**: [event-dispatch](./event-dispatch.md)
- **part-of**: [dual-kernel](./dual-kernel.md)
