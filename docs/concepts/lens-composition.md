# Lens Composition

> **Facets**: stage: execution, migration | trust: sandboxed, trusted | domain: state | type: technique

## What is Lens Composition?

**Lens composition** combines two lenses to focus deeper into nested structures. If lens A focuses on B, and lens B focuses on C, then `compose(A, B)` focuses on C through A.

## Definition

```typescript
function compose<A, B, C>(
  ab: Lens<A, B>,
  bc: Lens<B, C>
): Lens<A, C> {
  return {
    get: (a) => bc.get(ab.get(a)),
    set: (c, a) => ab.set(bc.set(c, ab.get(a)), a)
  };
}
```

## Example

```typescript
interface State {
  user: {
    profile: {
      name: string;
    };
  };
}

// Individual lenses
const userLens = prop<State, 'user'>('user');
const profileLens = prop<State['user'], 'profile'>('profile');
const nameLens = prop<State['user']['profile'], 'name'>('name');

// Compose them
const userProfileLens = compose(userLens, profileLens);
const userProfileNameLens = compose(userProfileLens, nameLens);

// Usage
const state: State = {
  user: { profile: { name: 'Alice' } }
};

view(userProfileNameLens, state)  // → 'Alice'
set(userProfileNameLens, 'Bob', state)
// → { user: { profile: { name: 'Bob' } } }
```

## Properties

### Associativity
Order of composition doesn't matter:
```typescript
compose(compose(a, b), c) === compose(a, compose(b, c))
```

### Identity
Composing with identity lens does nothing:
```typescript
const identity: Lens<A, A> = {
  get: (a) => a,
  set: (a, _) => a
};

compose(identity, lens) === lens
compose(lens, identity) === lens
```

## Visual

```
State ─────────────────────────────────────────────────
  │                                                    
  │ userLens                                           
  ▼                                                    
User ──────────────────────────────────────            
  │                                                    
  │ profileLens                                        
  ▼                                                    
Profile ───────────────────                            
  │                                                    
  │ nameLens                                           
  ▼                                                    
"Alice" ◄──── userProfileNameLens ──── composed lens   
```

## Variadic Composition

For convenience, compose multiple lenses at once:

```typescript
function composePath<S>(...lenses: Lens<any, any>[]): Lens<S, any> {
  return lenses.reduce((acc, lens) => compose(acc, lens));
}

// Usage
const deepLens = composePath(userLens, profileLens, nameLens);
```

## Why Composition?

### 1. Deep Updates Without Mutation
```typescript
// Without lenses (verbose, error-prone)
const newState = {
  ...state,
  user: {
    ...state.user,
    profile: {
      ...state.user.profile,
      name: 'Bob'
    }
  }
};

// With lenses (clean, safe)
const newState = set(userProfileNameLens, 'Bob', state);
```

### 2. Reusable Pieces
```typescript
// Define once
const profileLens = compose(userLens, prop('profile'));

// Reuse for different properties
const nameLens = compose(profileLens, prop('name'));
const emailLens = compose(profileLens, prop('email'));
const avatarLens = compose(profileLens, prop('avatar'));
```

### 3. Type Safety
TypeScript tracks types through composition:
```typescript
const lens: Lens<State, string> = compose(userLens, compose(profileLens, nameLens));
// ✅ TypeScript knows the result is a string
```

## In NeuroNote

Lens composition enables deep context access:

```typescript
// Access context.form.fields.email
const emailLens = composePath(
  prop('form'),
  prop('fields'),
  prop('email')
);

// In machine action
actions: {
  updateEmail: (context, payload) => 
    set(emailLens, payload.value, context)
}
```

## Relations

- **requires**: [prop-lens](./prop-lens.md)
- **enables**: [lens-path](./lens-path.md)
- **part-of**: [lsi-optics](./lsi-optics.md)
