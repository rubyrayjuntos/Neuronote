# Lens Laws (GetPut/PutGet)

> **Facets**: stage: validation, migration | trust: gatekeeper, trusted | domain: state, verification | type: pattern

## What Are Lens Laws?

**Lens laws** are mathematical properties that well-behaved lenses must satisfy. They guarantee that get and set operations work correctly together.

## The Three Laws

### 1. GetPut (You get what you put)
```typescript
// If you set a value and then get it, you get back what you set
get(set(a, s)) === a
```

Example:
```typescript
const nameLens = prop('name');
const state = { name: 'Alice' };

const updated = set(nameLens, 'Bob', state);
get(nameLens, updated) === 'Bob'  // ✅
```

### 2. PutGet (Setting what's there changes nothing)
```typescript
// If you set the current value, nothing changes
set(get(s), s) === s
```

Example:
```typescript
const nameLens = prop('name');
const state = { name: 'Alice' };

const currentName = get(nameLens, state);  // 'Alice'
const result = set(nameLens, currentName, state);
result === state  // ✅ (or structurally equal)
```

### 3. PutPut (Setting twice = setting once with last value)
```typescript
// Setting twice is the same as setting once with the final value
set(b, set(a, s)) === set(b, s)
```

Example:
```typescript
const nameLens = prop('name');
const state = { name: 'Alice' };

const way1 = set(nameLens, 'Carol', set(nameLens, 'Bob', state));
const way2 = set(nameLens, 'Carol', state);
way1 === way2  // ✅ Both are { name: 'Carol' }
```

## Why Laws Matter

### 1. Correctness Guarantees
Law-abiding lenses are predictable and composable.

### 2. Optimization
PutGet enables "no-op detection":
```typescript
function smartSet<S, A>(lens: Lens<S, A>, a: A, s: S): S {
  // Skip update if value unchanged
  if (get(lens, s) === a) return s;  // PutGet law
  return set(lens, a, s);
}
```

### 3. Undo/Redo
Laws ensure reversibility:
```typescript
const original = { count: 0 };
const modified = set(countLens, 5, original);

// We can "undo" because of GetPut
const restored = set(countLens, get(countLens, original), modified);
get(countLens, restored) === get(countLens, original)  // ✅
```

## Testing Laws

```typescript
// In tests
describe('Lens Laws', () => {
  const lens = prop<State, 'count'>('count');
  const state = { count: 42 };
  const newValue = 100;
  
  it('satisfies GetPut', () => {
    expect(view(lens, set(lens, newValue, state))).toBe(newValue);
  });
  
  it('satisfies PutGet', () => {
    const current = view(lens, state);
    expect(set(lens, current, state)).toEqual(state);
  });
  
  it('satisfies PutPut', () => {
    const val1 = 10, val2 = 20;
    expect(set(lens, val2, set(lens, val1, state)))
      .toEqual(set(lens, val2, state));
  });
});
```

## Law Violations

### Broken GetPut
```typescript
// BAD: Lens that transforms on get
const brokenLens = {
  get: (s) => s.name.toUpperCase(),  // Transforms!
  set: (a, s) => ({ ...s, name: a })
};

// get(set("bob", state)) returns "BOB", not "bob" ❌
```

### Broken PutGet
```typescript
// BAD: Lens that normalizes on set
const brokenLens = {
  get: (s) => s.name,
  set: (a, s) => ({ ...s, name: a.trim() })  // Transforms!
};

// set(get(state), state) might !== state if name has spaces ❌
```

## In NeuroNote

The [auto-lens](./auto-lens.md) migration system relies on lens laws:

```typescript
// Migration preserves data because of laws
function migrate(oldContext: Context, lens: Lens): Context {
  const value = view(lens, oldContext);
  return set(lens, value, newContext);
}
// Laws guarantee: view(lens, migrate(old, lens)) === view(lens, old)
```

## Relations

- **requires**: [store-comonad](./store-comonad.md)
- **enables**: [auto-lens](./auto-lens.md)
- **part-of**: [lsi-optics](./lsi-optics.md)
