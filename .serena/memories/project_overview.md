# NeuroNote Project Overview

## Purpose
NeuroNote is a research POC for a "Dual-Kernel Architecture for Safe Malleable Software". It demonstrates:
- AI-generated UI proposals (via Gemini)
- A 3-Phase Gatekeeper validation pipeline
- Deterministic execution in a WASM sandbox
- Bidirectional Lens (LSI) for atomic state rollback

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **AI Provider**: Google Gemini (gemini-2.0-flash)
- **Runtime**: Web Worker with WASM sandbox emulation
- **State**: LSI (Lens, Store, Isomorphism) pattern via Store Comonad

## Key Architecture Components
1. **HostRuntime.tsx**: Renders ViewNodes, dispatches events
2. **WasmKernel.ts**: Dual-kernel runtime with:
   - **QuickJS WASM sandbox** (quickjs-emscripten 0.29.0) - Tier 1 operators execute here
   - **Web Worker** (network-locked) - Tier 2 "Host-Managed Accelerators"
   - LSI optics for atomic state management
3. **validator.ts**: 3-Phase Gatekeeper (Structural, Semantic, Honesty)
4. **migration.ts**: AutoLens for schema migration + atomic rollback
5. **gemini.ts**: AI proposal generation with JSON schema
6. **SerenaBridge.ts**: Two-phase retrieval for AI providers ("Diner Menu" pattern)
7. **honestyOracle.ts**: Semantic attack detection for "valid but wrong" proposals

## Security Model: Governance by Topology
- AI-generated proposals specify operator names, NOT code
- **Tier 1**: 33 pure/sync operators run inside QuickJS VM (fuel-metered, no network)
- **Tier 2**: 13 heavy operators run in network-locked Worker (fetch/WebSocket blocked)
- AI danger is in COMPOSITION, not INVOCATION - operators are safe, wiring is verified

## Core Types (types.ts)
- `AppDefinition`: Complete app schema (view, pipelines, machine, testVectors)
- `ViewNode`: UI tree node with bindings
- `PipelineDefinition`: Dataflow graph of operators
- `Store<S, A>`: Comonad for focused state access (LSI)
- `Lens<S, A>`: Coalgebra lens type

## Operator System
- 46 operators in `operators/registry.ts`
- **Tier 1** (33 ops): Execute in QuickJS WASM sandbox - Math, String, Array, Logic, Control
- **Tier 2** (13 ops): Execute in locked Worker - Image, Audio, CV, Crypto

## Test Suite
- **381 tests** (as of 2025-12-24)
- Includes 17 security tests verifying tier separation and network lockdown
