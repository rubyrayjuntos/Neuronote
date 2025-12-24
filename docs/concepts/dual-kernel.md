# Dual-Kernel Architecture

## Summary

The Host–Guest dual-kernel model separates the **trusted runtime** (Host) from **AI-generated execution** (Guest), treating AI output as untrusted input that must pass through verification gates before affecting the system.

## The Problem

Traditional software assumes code is written by trusted developers. AI-generated code breaks this assumption:

- LLMs hallucinate
- Prompts can be manipulated
- Generated code may contain security vulnerabilities
- Behavior is non-deterministic

**If AI writes code, who validates it?**

## The Solution

Split the system into two kernels with different trust levels:

```
┌─────────────────────────────────────────────────────────────┐
│                      HOST KERNEL                            │
│                    (Trusted, Main Thread)                   │
│                                                             │
│  • Validates AI proposals                                   │
│  • Manages state (Zustand store)                            │
│  • Renders UI (React)                                       │
│  • Controls the component whitelist                         │
│  • Owns the security policy                                 │
├─────────────────────────────────────────────────────────────┤
│                     GATEKEEPER                              │
│            (Verification boundary)                          │
├─────────────────────────────────────────────────────────────┤
│                     GUEST KERNEL                            │
│                  (Sandboxed, Web Worker)                    │
│                                                             │
│  • Executes pipelines                                       │
│  • Runs Tier 1 operators                                    │
│  • Isolated in QuickJS WASM                                 │
│  • No DOM access                                            │
│  • No network access                                        │
│  • Resource-budgeted                                        │
└─────────────────────────────────────────────────────────────┘
```

## Key Properties

### 1. No Raw Code Execution

AI never produces JavaScript/TypeScript that executes directly. Instead, it produces a **declarative schema** (AppDefinition) that the Host interprets:

```json
{
  "view": { "type": "Control.Button", "onClick": "INCREMENT" },
  "machine": { "states": { "idle": { "on": { "INCREMENT": "..." } } } }
}
```

The Host maps `"Control.Button"` to a trusted React component. The AI cannot introduce arbitrary DOM manipulation.

### 2. Defense in Depth

Multiple verification layers:

| Layer | What it Catches |
|-------|-----------------|
| **Zod Schema** | Structural errors, missing fields |
| **Semantic Checks** | Invalid references, unreachable states |
| **Prop Sanitization** | XSS vectors, forbidden attributes |
| **Test Vectors** | Behavioral violations |
| **Operator Whitelist** | Unauthorized operations |

### 3. Capability-Based Security

The Guest can only invoke **whitelisted operators**. It cannot:
- Access the filesystem
- Make network requests
- Modify the DOM
- Access cookies/localStorage

### 4. Rollback by Design

Every proposal is stored before application. If anything goes wrong:

```typescript
const { rollback } = useAppActions();
rollback(); // Instantly restore previous state
```

## Trust Boundaries

```
UNTRUSTED          GATEKEEPER         TRUSTED           SANDBOXED
    │                  │                 │                  │
    │   AI Proposal    │                 │                  │
    │─────────────────>│                 │                  │
    │                  │                 │                  │
    │                  │  Parse/Verify   │                  │
    │                  │────────────────>│                  │
    │                  │                 │                  │
    │                  │                 │   Dispatch       │
    │                  │                 │─────────────────>│
    │                  │                 │                  │
    │                  │                 │   Result         │
    │                  │                 │<─────────────────│
    │                  │                 │                  │
    │                  │                 │  Update Store    │
    │                  │                 │  Render UI       │
```

## Implementation

### Host Kernel Files

- `components/HostRuntime.tsx` - Top-level runtime
- `runtime/RuntimeAssembler.tsx` - View tree → React
- `runtime/ComponentRegistry.tsx` - Type → Component mapping
- `stores/appStore.ts` - Zustand state management
- `utils/validator.ts` - Gatekeeper verification

### Guest Kernel Files

- `services/WasmKernel.ts` - QuickJS sandbox
- `operators/registry.ts` - Operator whitelist

## Why This Matters

The dual-kernel architecture enables **runtime malleability** without sacrificing security:

1. **Users can reshape apps on the fly** via natural language
2. **AI proposals are verified** before affecting the system
3. **Rollback is instant** if something goes wrong
4. **The attack surface is minimized** through whitelisting

This is the foundation that makes NeuroNote safe to use with AI-generated content.

## Related Concepts

- [Gatekeeper Pipeline](gatekeeper-pipeline.md) - The verification layer
- [AppDefinition Schema](app-definition.md) - The IR that AI produces
- [WASM Sandbox](wasm-sandbox.md) - Guest isolation details
- [Rollback](rollback.md) - Recovery mechanism
