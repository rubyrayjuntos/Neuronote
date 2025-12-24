# Task Completion Checklist

When completing a task in NeuroNote, ensure:

## Before Committing
- [ ] ``npm test` passes (322/322 tests expected)
- [ ] `npx tsc --noEmit` has no type errors
- [ ] New operators added to `operators/registry.ts`
- [ ] Worker implementations in `services/WasmKernel.ts` for Tier 2 ops

## Validation Considerations
- [ ] Gatekeeper 3-Phase validation still works
- [ ] testVectors provided for new pipelines (required by schema)
- [ ] Lens laws satisfied for state migrations

## Documentation
- [ ] Update `docs/OPERATOR_ARCHITECTURE.md` if adding operators
- [ ] Update `.github/copilot-instructions.md` for AI guidance
- [ ] README.md updated if major changes

## Architecture Invariants
- [ ] No direct DOM manipulation (use ViewNode bindings)
- [ ] All state updates through LSI Store.peek()
- [ ] Operators are pure functions (no side effects)
- [ ] System keys prefixed with `_`
