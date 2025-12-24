# Path Lens

> **Facets**: stage: execution | trust: sandboxed | domain: state | type: api

## What is Path Lens?

**Path lens** converts dot-notation strings into composed lenses. It's the user-friendly API for deep state access.

## Definition

```typescript
function lensPath<S>(path: string): Lens<S, any> {
  const keys = path.split('.');
  return keys.reduce(
    (lens, key) => compose(lens, prop(key)),
    identity as Lens<S, S>
  );
}
```

## Usage

```typescript
const state = {
  user: {
    profile: {
      name: 'Alice',
      settings: {
        theme: 'dark'
      }
    }
  }
};

// Create lens from path
const themeLens = lensPath<typeof state>('user.profile.settings.theme');

// Use it
view(themeLens, state)  // → 'dark'
set(themeLens, 'light', state)
// → { user: { profile: { settings: { theme: 'light' } } } }
```

## Caching

Path lenses are memoized for performance:

```typescript
const pathCache = new Map<string, Lens<any, any>>();

function lensPath<S>(path: string): Lens<S, any> {
  if (pathCache.has(path)) {
    return pathCache.get(path)!;
  }
  
  const lens = buildLensFromPath(path);
  pathCache.set(path, lens);
  return lens;
}
```

## Array Access

Path lens supports array indices:

```typescript
const state = {
  users: [
    { name: 'Alice' },
    { name: 'Bob' }
  ]
};

const firstUserNameLens = lensPath('users.0.name');
view(firstUserNameLens, state)  // → 'Alice'
```

## Optional Paths

Handle missing keys gracefully:

```typescript
function lensPathSafe<S>(path: string): Lens<S, any | undefined> {
  return {
    get: (s) => {
      try {
        return path.split('.').reduce((obj, key) => obj?.[key], s);
      } catch {
        return undefined;
      }
    },
    set: (a, s) => {
      // Creates path if missing
      return setPath(path, a, s);
    }
  };
}
```

## In Bindings

View bindings use path lens internally:

```json
{
  "bindings": {
    "text": "context.user.profile.name"
  }
}
```

Becomes:
```typescript
const lens = lensPath('user.profile.name');
const text = view(lens, context);
```

## Helper: setPath

Creates nested structure when setting:

```typescript
function setPath(path: string, value: any, obj: any): any {
  const keys = path.split('.');
  const last = keys.pop()!;
  
  let current = { ...obj };
  let pointer = current;
  
  for (const key of keys) {
    pointer[key] = { ...pointer[key] };
    pointer = pointer[key];
  }
  
  pointer[last] = value;
  return current;
}
```

## Comparison

| Approach | Code | Type Safety |
|----------|------|-------------|
| Manual | `state.user?.profile?.name` | ⚠️ Partial |
| Spread | `{ ...state, user: { ...state.user, ... } }` | ✅ Full |
| Path Lens | `view(lensPath('user.profile.name'), state)` | ⚠️ Runtime |
| Typed Lens | `view(compose(userLens, profileLens, nameLens), state)` | ✅ Full |

## Performance

Path lens vs manual access:

```typescript
// Path lens (with cache): ~100ns
view(lensPath('a.b.c'), state)

// Manual: ~10ns
state.a.b.c

// Path lens is 10x slower but provides immutable set
```

Use path lens when you need both get and set. Use manual access for read-only hot paths.

## Relations

- **requires**: [lens-composition](./lens-composition.md)
- **part-of**: [lsi-optics](./lsi-optics.md)
- **see-also**: [context-binding](./context-binding.md)
