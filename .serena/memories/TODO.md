# NeuroNote TODO

## Completed
- [x] LSI + Immer Patch Integration - Now using `produceWithPatches` for transparent JSON-Patch artifacts (2025-12-23)
- [x] QuickJS Tier 1 Operator Execution (2025-12-23)
  - Tier 1 operators now run inside QuickJS WASM sandbox
  - Pipeline executor added to KERNEL_SOURCE
  - 12 new security tests added (376 total tests)
  - Paper claims are now accurate

## Implementation Details: QuickJS Tier 1

### Architecture Change
- `generateKernelSource()` now dynamically builds KERNEL_SOURCE with:
  - LSI optics (lens implementation)
  - TIER1_OPERATORS (injected from operators/registry.ts)
  - `isPureTier1Pipeline()` - checks if pipeline can run entirely in sandbox
  - `executeTier1Pipeline()` - runs pure Tier 1 pipelines in QuickJS
  
### Security Properties
- Tier 1 operators execute inside QuickJS VM with:
  - No access to fetch(), WebSocket, XMLHttpRequest
  - No access to DOM (document, window)
  - Fuel metering via instruction counting
  - Memory limits via setMemoryLimit()
  
### Flow
1. Dispatch event → QuickJS VM
2. If RUN action for pure Tier 1 pipeline → execute in QuickJS
3. If RUN action for Tier 2 pipeline → queue for Worker native execution
4. Return { context, tasks, tier1Traces }

---

## Backlog

### RxDB Integration
- Paper claims RxDB for reactive persistence
- Currently using Zustand + localStorage
- Either implement or reframe paper as "target architecture"

### Paper Revisions
- Remove `[Source N]` citations or add bibliography
- Add Related Work section
- Add Threat Model subsection
- Add quantitative methodology to Section 4 (sample sizes, hardware specs)
