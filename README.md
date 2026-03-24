

# NeuroNote

**A Dual-Kernel Architecture for Safe Malleable Software**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646cff.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

*Treating AI-generated logic as hostile by default*

</div>

---

## Overview

NeuroNote is a **reference implementation of Proposal-Verification Code meets AI-Driven Malleability**. It demonstrates how software can safely accept, validate, execute, and recover from runtime-generated changes to its own structure and behavior.

Unlike traditional approaches that implicitly trust AI-generated code, NeuroNote treats all AI artifacts as **untrusted input** requiring verification before execution.

### Non-Goals

NeuroNote is **not** a general-purpose programming environment, 
autonomous agent, or self-executing AI system. It does not allow 
AI-generated code to execute directly, nor does it aim to replace 
traditional application logic with learned behavior.

Instead, NeuroNote is a **reference architecture** for safely mediating 
runtime-generated structure and behavior through explicit validation, 
governance, and recovery mechanisms. Its goal is not autonomy, but 
*controlled malleability*—enabling software to evolve at runtime 
without compromising safety or correctness.

### Key Innovation

> **Malleability becomes safe when runtime-generated behavior is treated as a guest, not a peer.**

The system enforces a strict **Host–Guest architecture**:
- The **Host Kernel** is an immutable, trusted runtime responsible for validation, rendering, persistence, and recovery
- The **Guest Kernel** (AI) proposes changes as declarative schemas that are verified before adoption

<div align="center">
  <img src="docs/architecture-pva-diagram.png" alt="Proposal-Verification Architecture: Three zones showing Guest (AI synthesis), Gatekeeper (validation pipeline), and Host (runtime execution)" width="900"/>
  <br/>
  <em>The Proposal–Verification Architecture: AI proposes, the Gatekeeper validates, the Host executes</em>
</div>

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ Natural     │  │ Rendered    │  │ System      │                 │
│  │ Language    │  │ Application │  │ Logs        │                 │
│  │ Prompt      │  │ View        │  │ & Traces    │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      GUEST KERNEL (Tier 0 / Synthesis Tier          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  AI Provider (Model-Agnostic)                                │   │
│  │  • Gemini 2.5 Flash                                          │   │
│  │  • Claude 3 Sonnet (via AWS Bedrock)                         │   │
│  │  • Llama 3 70B (via AWS Bedrock)                             │   │
│  │  • Mistral Large (via AWS Bedrock)                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                    AppDefinition (IR)                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GATEKEEPER (Trust Boundary)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Structural   │  │ Semantic     │  │ Honesty      │              │
│  │ Validation   │  │ Verification │  │ Oracle       │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Resource     │  │ Capability   │  │ Test Vector  │              │
│  │ Budgets      │  │ Manifest     │  │ Simulation   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      HOST KERNEL (Trusted)                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Tier 1: WASM Sandbox (QuickJS)                              │   │
│  │  • Fuel-metered execution                                    │   │
│  │  • Memory isolation                                          │   │
│  │  • No ambient capabilities                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Tier 2: Web Worker Isolation                                │   │
│  │  • 46 verified operators (Text, Math, Image, Audio, CV)     │   │
│  │  • Dataflow pipeline execution                               │   │
│  │  • Bounded iteration (FoldN with 1000 cap)                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  State Management                                            │   │
│  │  • Bidirectional lenses for schema migration                 │   │
│  │  • Automatic rollback on runtime errors                      │   │
│  │  • Persistent change journal                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```
Tier 0 is responsible exclusively for *synthesis*, not execution: it 
produces declarative proposals (AppDefinitions) but never participates 
in the runtime control loop.
---

## Features

### 🛡️ Security Model
- **Hostile-by-default**: All AI output undergoes 6-layer verification
- **WASM Sandbox**: QuickJS with fuel metering prevents infinite loops
- **Capability Manifest**: Operators declare required permissions
- **Honesty Oracle**: Detects semantic inconsistencies between a proposal’s 
declared intent, its structural effects, and its simulated execution 
traces (e.g., prompt injection, scope creep, intent drift).

### 🔄 Safe Evolution
- **Logic-as-Data**: Behavior represented as JSON schemas, not code
- **Bidirectional Lenses**: Type-safe schema migration with rollback
- **Test Vector Simulation**: AI proposals include tests run before deployment
- **Automatic Rollback**: Runtime errors trigger instant state reversion

### 🤖 Model-Agnostic AI
- **Provider Interface**: Swap AI models without changing business logic
- **Self-Correction**: Execution feedback helps AI learn from failures
- **Structured Output**: JSON mode ensures parseable responses

### 📊 Observability
- **Interaction Traces**: Every user action recorded with timing
- **Change Journal**: Full audit trail with diffs and verification scores
- **Session Metrics**: Latency percentiles, acceptance rates, coverage

---

## Operator Library

NeuroNote provides **46 verified primitive operators** that AI can compose:

| Category | Count | Operators |
|----------|-------|-----------|
| **Text** | 8 | `ToUpper`, `ToLower`, `Length`, `RegexMatch`, `Join`, `Split`, `Replace`, `Template` |
| **Sanitizer** | 3 | `StripHTML`, `Clamp`, `Truncate` |
| **Math** | 7 | `Add`, `Subtract`, `Multiply`, `Divide`, `Threshold`, `Clamp`, `Normalize` |
| **Logic** | 1 | `If` |
| **Utility** | 1 | `JsonPath` |
| **List** | 9 | `Map`, `Filter`, `Sort`, `Take`, `Reduce`, `FoldN`, `Append`, `GroupBy`, `Length` |
| **Image** | 7 | `Decode`, `Grayscale`, `Invert`, `EdgeDetect`, `Resize`, `Threshold`, `Blur` |
| **CV** | 2 | `ContourTrace`, `Vectorize` |
| **Vector** | 2 | `ToSVG`, `Simplify` |
| **Audio** | 4 | `Decode`, `FFT`, `PeakDetect`, `BeatDetect` |
| **Debug** | 2 | `TraceInsert`, `DiffState` |

**Tier 1 (33 operators)**: Sync, pure, run in QuickJS WASM sandbox  
**Tier 2 (13 operators)**: Async, use browser APIs (OffscreenCanvas, AudioContext)

These primitives are sufficient to compose tools ranging from Image Vectorizers to Audio Analyzers without new code execution.

All operators are:
- ✅ Property-based tested with fast-check (66 tests)
- ✅ Defensive against hostile input (`toString` traps, NaN, etc.)
- ✅ Pure functions with no side effects

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/rubyrayjuntos/Neuronote.git
cd Neuronote

# Install dependencies
npm install
```

### Configuration

Create a `.env.local` file:

```bash
# For Google Gemini (default)
VITE_API_KEY=your-gemini-api-key
VITE_AI_PROVIDER=gemini

# OR for AWS Bedrock (Claude, Llama, Mistral)
VITE_AI_PROVIDER=bedrock-claude
VITE_AWS_REGION=us-east-1
# AWS credentials via environment or IAM role
```

### Running

```bash
# Development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Deployment

The landing page is automatically deployed to GitHub Pages on every push to the `main` branch.

**Live Site**: [https://rubyrayjuntos.github.io/Neuronote/](https://rubyrayjuntos.github.io/Neuronote/)

To manually trigger a deployment:
1. Go to the **Actions** tab in GitHub
2. Select "Deploy to GitHub Pages"
3. Click "Run workflow"

The deployment workflow is configured in `.github/workflows/deploy.yml` and deploys the contents of the `/landing` directory.

---

## Project Structure

```
neuronote/
├── App.tsx                 # Main application component
├── types.ts                # IR type definitions (AppDefinition, ViewNode, etc.)
├── constants.ts            # Initial app state, operator schemas
├── components/
│   ├── HostRuntime.tsx     # Tier 1/2 execution, UI rendering
│   └── LabConsole.tsx      # Developer observability panel
├── services/
│   ├── ai/
│   │   ├── types.ts        # AIProvider interface
│   │   ├── gemini.ts       # Google Gemini provider
│   │   ├── bedrock.ts      # AWS Bedrock provider (Claude, Llama, Mistral)
│   │   └── index.ts        # Provider factory
│   ├── WasmKernel.ts       # QuickJS WASM sandbox + Web Worker
│   └── persistence.ts      # LocalStorage state management
├── utils/
│   ├── validator.ts        # Gatekeeper verification pipeline
│   ├── honestyOracle.ts    # Semantic attack detection
│   ├── operators.ts        # Pure operator implementations
│   ├── operators.test.ts   # Property-based tests (66 tests)
│   ├── migration.ts        # Bidirectional lens operations
│   ├── analytics.ts        # Diff computation, metrics
│   └── harness.ts          # Test vector simulation
└── docs/
    ├── NeuroNote_ A Dual-Kernel Architecture...  # Academic paper
    └── NeuroNote - Definition of Done...         # Implementation spec
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Dual-Kernel Architecture Paper](docs/NeuroNote_%20A%20Dual-Kernel%20Architecture%20for%20Safe%20Malleable%20Software_.md) | Academic paper describing the theoretical foundations |
| [Definition of Done](docs/NeuroNote%20-%20Definition%20of%20Done_%20Dataflow%20Primitive%20System%20(NeuroNote%20Tool%20Set%20Architecture).md) | Implementation specification for the operator system |
| [Primitive Tool Set](docs/NeuroNote%20-%20primitive%20tool%20set.md) | Detailed operator documentation |
| [Operator Architecture](docs/OPERATOR_ARCHITECTURE.md) | Technical spec for operator internals (files, tiers, adding new operators) |
| [🔨 How to Break NeuroNote](docs/HOW_TO_BREAK_NEURONOTE.md) | Red team testing guide with attack vectors and defenses |

---

## Collaborators

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/rubyrayjuntos">
        <img src="https://github.com/rubyrayjuntos.png" width="100px;" alt="Ray Juntos"/><br />
        <sub><b>Ray Juntos</b></sub>
      </a><br />
      <sub>Project Lead & Architecture</sub>
    </td>
    <td align="center">
      <a href="https://github.com/features/copilot">
        <img src="https://github.githubassets.com/assets/copilot-d7cf12b83469.png" width="100px;" alt="GitHub Copilot"/><br />
        <sub><b>GitHub Copilot</b></sub>
      </a><br />
      <sub>AI Pair Programmer (Claude Opus 4.5)</sub>
    </td>
  </tr>
</table>

### Contribution Model

This project was developed using a novel **AI-assisted architecture** approach:
- **Human**: Vision, requirements, architectural decisions, code review
- **AI**: Implementation, refactoring, test generation, documentation

All AI-generated code underwent human review and verification before integration.

---

## Research Context

NeuroNote is a **reference implementation** demonstrating the Proof-Carrying Verification Architecture (PVA) pattern. The note-taking application is a vehicle for exploring:

1. **Hostile-by-default AI integration** - Treating LLM output as untrusted
2. **Logic-as-Data** - Representing behavior as verifiable schemas
3. **Dual-kernel isolation** - Separating synthesis from execution
4. **Safe malleability** - Runtime evolution with safety guarantees

The architecture is approximately **75% general-purpose infrastructure** applicable to any domain requiring safe AI-driven modification.

---

## Contributing

We welcome contributors of all experience levels! This project sits at the intersection of **AI safety**, **programming languages**, and **systems security** - there's something for everyone.

### 🎯 Good First Issues

Looking to get started? These areas are beginner-friendly:

| Area | What You'd Do | Skills Needed |
|------|---------------|---------------|
| **Tests** | Add property-based tests for operators | TypeScript, fast-check |
| **Docs** | Improve inline comments, add examples | Technical writing |
| **Operators** | Implement new primitives (e.g., `Text.Capitalize`) | TypeScript |
| **UI/UX** | Improve the control panel styling | React, CSS |

### 🔬 Research Contributions

For those interested in deeper work:

| Topic | Open Questions |
|-------|----------------|
| **Formal Verification** | Can we prove operator correctness in Coq/Lean? |
| **Prompt Security** | Better detection of semantic attacks? |
| **Multi-model Consensus** | How should disagreeing AIs vote? |
| **Capability Theory** | Formal model for operator permissions? |

### 🛠️ How to Contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-thing`)
3. **Make** your changes with tests
4. **Run** the test suite (`npm test`)
5. **Submit** a Pull Request

### 💬 Ways to Engage

| If you want to... | Do this |
|-------------------|---------|
| **Ask questions** | Open a [Discussion](https://github.com/rubyrayjuntos/Neuronote/discussions) |
| **Report bugs** | Open an [Issue](https://github.com/rubyrayjuntos/Neuronote/issues) with reproduction steps |
| **Suggest features** | Open an Issue with `[Feature]` prefix |
| **Try to break it** | See [How to Break NeuroNote](docs/HOW_TO_BREAK_NEURONOTE.md) |
| **Just explore** | Clone it, run it, read the code! |

### 📚 Understanding the Codebase

New to the project? Start here:

```
Reading Order:
1. README.md (you are here)
2. types.ts - Core data structures (AppDefinition, ViewNode)
3. constants.ts - Initial state, operator schemas
4. App.tsx - Main flow, see handleSynthesize()
5. utils/validator.ts - The Gatekeeper verification
6. services/ai/types.ts - AI provider interface
7. docs/HOW_TO_BREAK_NEURONOTE.md - Security model
```

### 🤝 Code of Conduct

- Be respectful and inclusive
- Assume good intent
- Give and receive constructive feedback
- Credit others' work

---

## Roadmap

### Active Development
- [ ] **Prompt Firewall**: Rule-based pre-filter for known attack patterns
- [ ] **Formal Verification**: Coq/Lean proofs for critical operators
- [ ] **Multi-model Consensus**: Cross-reference proposals from multiple AIs
- [ ] **Capability Signing**: Cryptographic proof of operator permissions
- [ ] **Distributed Validation**: Peer-to-peer verification network

### Technical Debt & Architecture Improvements

#### High Priority
- [ ] **WASM-based Tier 2 Operators**: Replace Worker blob pattern with proper WASM modules
  - Currently Tier 2 operators (Image, Audio, CV) are defined in a string blob
  - Can't import modules, requires manual sync between registry and Worker
  - See `docs/OPERATOR_ARCHITECTURE.md` for details
- [ ] **Operator Validation Script**: CI check that registry matches Worker implementations
- [ ] **Auto-generate manifest.json**: Currently requires manual click in Gatekeeper UI

#### Medium Priority
- [ ] **Single-file Operator Definitions**: YAML/JSON schema that generates registry + impl + tests
- [ ] **Hot-reloadable Operators**: Add operators without full rebuild
- [ ] **Streaming Pipeline Execution**: Progress callbacks for long-running Tier 2 ops
- [ ] **Pipeline Caching**: Memoize deterministic pipeline results

#### Low Priority / Research
- [ ] **User-defined Operators**: Safe DSL for custom operators (with sandboxing)
- [ ] **Operator Composition**: Combine primitives into reusable macros
- [ ] **GPU Acceleration**: WebGPU for Image/CV operators
- [ ] **Differential Dataflow**: Incremental pipeline re-execution

### Known Issues
- [ ] CV operators (ContourTrace, Vectorize) produce basic output - needs refinement
- [ ] Audio.BeatDetect uses simple onset detection - not production-quality
- [ ] Image.Blur is box blur only - no Gaussian option yet
- [ ] No operator timeout enforcement in Worker (relies on fuel metering only)

---

## Community

### Star History

If you find this project interesting, please ⭐ star it! It helps others discover the work.

### Discuss

- **GitHub Discussions**: Questions, ideas, show & tell
- **Issues**: Bugs and feature requests

### Cite

If you use NeuroNote in academic work:

```bibtex
@software{neuronote2025,
  author = {Juntos, Ray and GitHub Copilot},
  title = {NeuroNote: A Dual-Kernel Architecture for Safe Malleable Software},
  year = {2025},
  url = {https://github.com/rubyrayjuntos/Neuronote}
}
```

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [QuickJS](https://bellard.org/quickjs/) by Fabrice Bellard - JavaScript engine for WASM sandbox
- [fast-check](https://github.com/dubzzz/fast-check) - Property-based testing framework
- [Google Gemini](https://ai.google.dev/) - Primary AI provider
- [AWS Bedrock](https://aws.amazon.com/bedrock/) - Multi-model AI access

---

<div align="center">

**Built with 🧠 by humans and AI, verified by machines**

[⭐ Star](https://github.com/rubyrayjuntos/Neuronote) · [🍴 Fork](https://github.com/rubyrayjuntos/Neuronote/fork) · [🐛 Report Bug](https://github.com/rubyrayjuntos/Neuronote/issues) · [💡 Request Feature](https://github.com/rubyrayjuntos/Neuronote/issues)

</div>
