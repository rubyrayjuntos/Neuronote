# Property Lens

> **Facets**: stage: execution, migration | trust: sandboxed, trusted | domain: state | type: technique

## What is a Property Lens?

A **property lens** focuses on a single property of an object. It's the building block for accessing nested state.

## Definition

```typescript
type Lens<S, A> = {
  get: (s: S) => A;
  set: (a: A, s: S) => S;
};

function prop<S, K extends keyof S>(key: K): Lens<S, S[K]> {
  return {
    get: (s) => s[key],
    set: (a, s) => ({ ...s, [key]: a })
  };
}
```

## Usage

```typescript
interface User {
  name: string;
  age: number;
}

const nameLens = prop<User, 'name'>('name');

// Get
const user = { name: 'Alice', age: 30 };
nameLens.get(user) // → 'Alice'

// Set
nameLens.set('Bob', user) // → { name: 'Bob', age: 30 }
```

## Immutability

Lenses create new objects, never mutating:

```typescript
const original = { name: 'Alice', age: 30 };
const updated = nameLens.set('Bob', original);

original.name // → 'Alice' (unchanged)
updated.name  // → 'Bob'
original !== updated // → true
```

## Store Connection

Property lenses create Store comonads:

```typescript
function prop<K extends string>(key: K) {
  return <S extends Record<K, any>>(state: S): Store<K, S[K]> => ({
    pos: key,
    peek: (k) => state[k]
  });
}

// Usage
const store = prop('name')(user);
store.pos  // → 'name'
store.peek('name') // → 'Alice'
store.peek('age')  // → 30
```

## Why Property Lenses?

### 1. Type Safety
TypeScript ensures you access valid properties:
```typescript
const nameLens = prop<User, 'name'>('name');
const invalid = prop<User, 'email'>('email'); // ❌ Type error
```

### 2. Composability
Combine with other lenses (see [lens-composition](./lens-composition.md)):
```typescript
const userLens = prop('user');
const nameLens = prop('name');
const userNameLens = compose(userLens, nameLens);
```

### 3. Reusability
Define once, use everywhere:
```typescript
const countLens = prop('count');

// In different contexts
view(countLens, stateA)
set(countLens, 10, stateB)
over(countLens, x => x + 1, stateC)
```

## Helper Functions

```typescript
// View through lens
function view<S, A>(lens: Lens<S, A>, s: S): A {
  return lens.get(s);
}

// Set through lens
function set<S, A>(lens: Lens<S, A>, a: A, s: S): S {
  return lens.set(a, s);
}

// Modify through lens
function over<S, A>(lens: Lens<S, A>, f: (a: A) => A, s: S): S {
  return lens.set(f(lens.get(s)), s);
}
```

## In NeuroNote

Property lenses access context in the runtime:

```typescript
// Access context.count
const countLens = prop('count');

function handleIncrement(context: Context) {
  return over(countLens, x => x + 1, context);
}
```

## Relations

- **requires**: [store-comonad](./store-comonad.md)
- **enables**: [lens-composition](./lens-composition.md)
- **part-of**: [lsi-optics](./lsi-optics.md)
