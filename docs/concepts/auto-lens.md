# AutoLens Migration

> **Facets**: stage: migration | trust: trusted | domain: state | type: component

## What is AutoLens?

**AutoLens** is a bidirectional schema migration system that preserves compatible context when AppDefinition schemas change. It uses lens composition to transfer values between old and new schemas.

## Location

[utils/migration.ts](../../utils/migration.ts)

## The Problem

When AI generates a new AppDefinition, the schema might change:

```typescript
// Old schema
{ count: 0, user: 'Alice' }

// New schema  
{ counter: { value: 0 }, username: 'Alice', theme: 'dark' }
```

Without migration, all context is lost. AutoLens preserves what it can.

## How It Works

### 1. Field Mapping
AutoLens detects correspondences:

```typescript
const mappings = detectMappings(oldSchema, newSchema);
// [
//   { old: 'count', new: 'counter.value', transform: identity },
//   { old: 'user', new: 'username', transform: identity }
// ]
```

### 2. Lens Generation
Create lenses for each mapping:

```typescript
const migrations = mappings.map(m => ({
  source: lensPath(m.old),
  target: lensPath(m.new),
  transform: m.transform
}));
```

### 3. Context Transfer
Apply lenses to transfer values:

```typescript
function migrateContext(
  oldContext: Context,
  newSchema: Schema,
  migrations: Migration[]
): Context {
  // Start with new schema defaults
  let newContext = initializeFromSchema(newSchema);
  
  // Transfer compatible values
  for (const { source, target, transform } of migrations) {
    const oldValue = view(source, oldContext);
    if (oldValue !== undefined) {
      const newValue = transform(oldValue);
      newContext = set(target, newValue, newContext);
    }
  }
  
  return newContext;
}
```

## Mapping Detection

AutoLens uses heuristics to detect field correspondences:

### 1. Exact Match
```typescript
'count' → 'count'  // Same name
```

### 2. Renamed Field
```typescript
'user' → 'username'  // Substring/similarity
```

### 3. Nested Field
```typescript
'count' → 'counter.value'  // Type match in nested structure
```

### 4. Type Coercion
```typescript
'count' (number) → 'countStr' (string)  // Compatible types
```

## Example

```typescript
const oldAppDef = {
  initialContext: { count: 42, user: 'Alice' },
  // ...
};

const newAppDef = {
  initialContext: { 
    counter: { value: 0 },
    username: '',
    theme: 'light'
  },
  // ...
};

const migratedContext = autoLens.migrate(
  oldAppDef.initialContext,
  newAppDef.initialContext
);

// Result:
{
  counter: { value: 42 },  // Preserved!
  username: 'Alice',       // Preserved!
  theme: 'light'           // New default
}
```

## Bidirectionality

AutoLens supports rollback via lens laws:

```typescript
// Forward migration
const newContext = migrate(oldContext, oldToNew);

// Rollback
const restoredContext = migrate(newContext, newToOld);

// Lens laws guarantee data preservation
deepEqual(restoredContext.count, oldContext.count);  // ✅
```

## Limitations

AutoLens cannot migrate:
- Completely new fields (uses defaults)
- Deleted fields (data lost)
- Incompatible type changes (e.g., object → boolean)
- Semantic changes (e.g., `age` to `birthYear`)

## Integration

AutoLens runs during proposal application:

```typescript
// In stores/appStore.ts
applyProposal: (proposal) => set((state) => {
  if (state.appDef) {
    // Save for rollback
    state.changeHistory.push(state.appDef);
    
    // Migrate context
    state.context = autoLens.migrate(
      state.context,
      proposal.initialContext
    );
  } else {
    state.context = proposal.initialContext;
  }
  
  state.appDef = proposal;
})
```

## Relations

- **requires**: [lens-laws](./lens-laws.md)
- **uses**: [app-definition](./app-definition.md)
- **part-of**: [lsi-optics](./lsi-optics.md)
- **see-also**: [zustand-store](./zustand-store.md)
