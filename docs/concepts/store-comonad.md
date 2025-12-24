# Store Comonad

> **Facets**: stage: execution, migration | trust: sandboxed, trusted | domain: state | type: pattern

## What is the Store Comonad?

The **Store Comonad** is a functional data structure that pairs a focus position with a function to peek at any position. It's the foundation of NeuroNote's lens-based state access.

## Definition

```typescript
type Store<S, A> = {
  pos: S;           // Current focus position
  peek: (s: S) => A; // Function to get value at any position
};
```

## Intuition

Think of Store as a "cursor" into a data structure:
- `pos` tells you where you're looking
- `peek` lets you look anywhere

```
Data:      { user: { name: "Alice", age: 30 } }
           ───────────────────────────────────
Store:     pos = "user.name"
           peek("user.name") → "Alice"
           peek("user.age") → 30
```

## Comonad Operations

### extract
Get the value at the current position:
```typescript
function extract<S, A>(store: Store<S, A>): A {
  return store.peek(store.pos);
}

// Example
const s = { pos: "name", peek: (k) => data[k] };
extract(s) // → "Alice"
```

### extend
Apply a function to all positions:
```typescript
function extend<S, A, B>(
  f: (store: Store<S, A>) => B,
  store: Store<S, A>
): Store<S, B> {
  return {
    pos: store.pos,
    peek: (s) => f({ pos: s, peek: store.peek })
  };
}
```

### duplicate
Create a Store of Stores:
```typescript
function duplicate<S, A>(store: Store<S, A>): Store<S, Store<S, A>> {
  return {
    pos: store.pos,
    peek: (s) => ({ pos: s, peek: store.peek })
  };
}
```

## Why Store Comonad?

### 1. Composable Focus
Lenses compose via Store comonads:
```typescript
const nameLens = prop('name');
const userLens = prop('user');
const userNameLens = compose(userLens, nameLens);
// Focus on state.user.name
```

### 2. Bidirectional Access
Get and set through the same interface:
```typescript
// Get
const name = view(userNameLens, state);

// Set
const newState = set(userNameLens, "Bob", state);
```

### 3. Law-Abiding
Store comonads satisfy mathematical laws that guarantee correctness:
```typescript
// extract . duplicate = id
extract(duplicate(s)) === s

// fmap extract . duplicate = id
fmap(extract)(duplicate(s)) === s
```

## In NeuroNote

Store comonads power the LSI optics system:

```typescript
// Create a store focused on context.count
const countStore: Store<string, any> = {
  pos: 'count',
  peek: (key) => context[key]
};

// Read current value
const currentCount = extract(countStore); // 42

// Create update function
const increment = (s: Store<string, number>) => extract(s) + 1;

// Apply to get new store
const newStore = extend(increment, countStore);
```

## Location

Implemented conceptually in:
- [services/WasmKernel.ts](../../services/WasmKernel.ts) - State access
- [utils/migration.ts](../../utils/migration.ts) - Schema migration

## Relations

- **enables**: [prop-lens](./prop-lens.md), [lens-composition](./lens-composition.md)
- **part-of**: [lsi-optics](./lsi-optics.md)
- **see-also**: [lens-laws](./lens-laws.md)
