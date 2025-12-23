# Code Style & Conventions

## TypeScript
- Strict mode enabled
- Prefer `interface` over `type` for object shapes
- Use `Record<string, T>` for dynamic keys
- Export types from `types.ts`

## Naming
- PascalCase: Components, Classes, Interfaces, Types
- camelCase: functions, variables, methods
- UPPER_SNAKE: Constants (KERNEL_SOURCE, OPERATOR_REGISTRY)
- Prefix private with underscore when needed

## React
- Functional components with hooks
- useEffect for side effects
- useState for local state
- Props destructured in function signature

## File Organization
- `components/`: React components
- `services/`: Core services (WasmKernel, gemini, persistence)
- `utils/`: Utilities (validator, migration, harness)
- `operators/`: Operator registry and schemas
- `types/`: Type definitions (optics.ts)
- `docs/`: Architecture documentation

## JSDoc
- Use JSDoc comments for public APIs
- Document complex algorithms
- Include @param and @returns

## Patterns
- LSI (Lens, Store, Isomorphism) for state updates
- Store Comonad for focused access with rollback
- 3-Phase Gatekeeper for validation
- Pipeline DAG for dataflow
