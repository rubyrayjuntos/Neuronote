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
2. **WasmKernel.ts**: Worker blob with WASM sandbox, pipeline executor, LSI optics
3. **validator.ts**: 3-Phase Gatekeeper (Structural, Semantic, Honesty)
4. **migration.ts**: AutoLens for schema migration + atomic rollback
5. **gemini.ts**: AI proposal generation with JSON schema
6. **SerenaBridge.ts**: Two-phase retrieval for AI providers ("Diner Menu" pattern)
7. **honestyOracle.ts**: Semantic attack detection for "valid but wrong" proposals

## Core Types (types.ts)
- `AppDefinition`: Complete app schema (view, pipelines, machine, testVectors)
- `ViewNode`: UI tree node with bindings
- `PipelineDefinition`: Dataflow graph of operators
- `Store<S, A>`: Comonad for focused state access (LSI)
- `Lens<S, A>`: Coalgebra lens type

## Operator System
- 46 operators in `operators/registry.ts`
- Tier 1: Host-side (Math, String, Array, Logic)
- Tier 2: Worker-side with WASM emulation (Image, Audio, CV, Crypto)
