# LSI Optics System

> **Facets**: stage: execution, migration | trust: sandboxed, trusted | domain: state | type: pattern

## What is LSI Optics?

**LSI Optics** (Lens/Store/Isomorphism) is NeuroNote's functional state management pattern. It provides composable, law-abiding abstractions for accessing and transforming nested state.

## Components

```
┌─────────────────────────────────────────────────────────────┐
│                      LSI Optics                              │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │    Lens     │  │    Store    │  │    Isomorphism      │  │
│  │             │  │  (Comonad)  │  │                     │  │
│  │ get/set for │  │             │  │  Bidirectional      │  │
│  │ properties  │  │ pos + peek  │  │  transformations    │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                    ┌─────▼─────┐                            │
│                    │ Compose   │                            │
│                    │ & Apply   │                            │
│                    └───────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

## Core Abstractions

### Lens
Focused getter/setter for a specific property:
```typescript
type Lens<S, A> = {
  get: (s: S) => A;
  set: (a: A, s: S) => S;
};
```
See: [prop-lens](./prop-lens.md)

### Store (Comonad)
Position + peek function for context-aware access:
```typescript
type Store<S, A> = {
  pos: S;
  peek: (s: S) => A;
};
```
See: [store-comonad](./store-comonad.md)

### Isomorphism
Bidirectional transformation between types:
```typescript
type Iso<A, B> = {
  to: (a: A) => B;
  from: (b: B) => A;
};
```

## Key Features

### 1. Composition
Build complex accessors from simple ones:
```typescript
const userNameLens = compose(
  prop('user'),
  prop('profile'),
  prop('name')
);
```
See: [lens-composition](./lens-composition.md)

### 2. Path Syntax
String-based lens creation:
```typescript
const lens = lensPath('user.profile.settings.theme');
```
See: [lens-path](./lens-path.md)

### 3. Law Compliance
Mathematical guarantees (GetPut, PutGet, PutPut):
```typescript
get(set(a, s)) === a  // You get what you put
```
See: [lens-laws](./lens-laws.md)

### 4. Migration
Preserve context across schema changes:
```typescript
const migrated = autoLens.migrate(oldContext, newSchema);
```
See: [auto-lens](./auto-lens.md)

## Usage in NeuroNote

### Context Binding
View bindings use lenses internally:
```json
{ "bindings": { "text": "context.user.name" } }
```

### State Updates
Machine actions use lenses for immutable updates:
```typescript
actions: {
  incrementCount: (ctx) => over(countLens, x => x + 1, ctx)
}
```

### Schema Migration
AutoLens migrates context when AppDefinition changes:
```typescript
// Old: { count: 5 }
// New: { counter: { value: 0 } }
// Migrated: { counter: { value: 5 } }
```

## Why LSI?

| Problem | LSI Solution |
|---------|--------------|
| Deep updates are verbose | Lens composition |
| Accidental mutation | Immutable set operations |
| Schema changes lose data | AutoLens migration |
| Type safety in paths | Typed lens constructors |
| Context in focus | Store comonad |

## Implementation Files

- [services/WasmKernel.ts](../../services/WasmKernel.ts) - Runtime state access
- [utils/migration.ts](../../utils/migration.ts) - AutoLens migration
- [runtime/RuntimeAssembler.tsx](../../runtime/RuntimeAssembler.tsx) - Binding resolution

## Further Reading

The LSI pattern draws from functional programming:
- Haskell's `lens` library
- Scala's Monocle
- PureScript's `profunctor-lenses`

## Relations

- **uses**: [store-comonad](./store-comonad.md), [prop-lens](./prop-lens.md), [lens-composition](./lens-composition.md), [lens-laws](./lens-laws.md), [auto-lens](./auto-lens.md)
- **part-of**: [dual-kernel](./dual-kernel.md)
- **enables**: [context-binding](./context-binding.md), [zustand-store](./zustand-store.md)
