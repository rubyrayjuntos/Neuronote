

Dual Kernel Architecture for a Safe, AI Assisted Malleable Software Future  
Abstract  
Recent advances in Large Language Models (LLMs) reveal a paradox termed "Computational Split-Brain Syndrome": models possess high semantic *comprehension* (the ability to imagine and describe complex systems) but fragile execution *competence* (the ability to reliably compute them). NeuroNote addresses this dissociation by introducing a **Proposal–Verification Architecture (PVA)** that decouples non-deterministic synthesis from deterministic execution. Rather than constraining the AI’s generative potential, NeuroNote empowers the model to act as a creative "Architect" by offloading the burden of execution to a trusted "Contractor"—the Host Runtime.  
We implement this via a **Dual-Kernel** design: the Guest (AI) proposes application structure and behavior as **Logic-as-Data** (JSON), while the Host validates and executes these proposals using a **Capability Lattice** of 46 verified, side-effect-free primitives. This architecture allows the AI to synthesize codmplex, interactive tools—such as image vectorizers and audio spectral analyzers—without ever executing arbitrary code. Furthermore, by integrating **Selena** (a Model Context Protocol server) and **RxDB** (reactive persistence), NeuroNote transforms the "Black Box" of generation into a transparent "Glass Box," where every creative decision is observable, reversible, and formally verifiable. This work demonstrates that safe malleability is achieved not by suppressing the AI's imagination, but by providing the architectural competence required to realize it safely.

1\. Introduction  
1.1 The "Split-Brain" Paradox  
The integration of Large Language Models (LLMs) into interactive systems faces a fundamental paradox: models exhibit high semantic *comprehension* (the ability to explain algorithms) but fragile execution *competence* (the ability to perform them reliably). Recent theoretical analysis terms this "Computational Split-Brain Syndrome," positing that the neural pathways for instruction-following are geometrically dissociated from those required for symbolic execution.  
When software architectures grant LLMs direct write access to application logic or DOM manipulation, they inherit this dissociation. The result is "Computational Hallucination"—where models generate code that looks plausible but fails on boundary conditions, violates type safety, or introduces non-terminating loops. Current mitigation strategies, such as Chain-of-Thought prompting, are compensatory rather than curative; they rely on the model's own probabilistic nature to police itself, a method shown to suffer from a "Self-Correction Blind Spot".  
1.2 The Solution: Proposal–Verification Architecture (PVA)  
We argue that for malleable software to be safe, we must treat AI generation not as an instruction to be obeyed, but as a **proposal** to be adjudicated. We present **NeuroNote**, a reference implementation of a **Proposal–Verification Architecture (PVA)**.  
NeuroNote replaces the "Copilot" paradigm with a **Dual-Kernel** model:  
1\. **The Guest (The Architect):** A non-deterministic synthesis layer that proposes intent via serialized, declarative Intermediate Representations (IR).  
2\. **The Host (The Contractor):** A deterministic runtime that validates, meters, and executes the proposal using verified primitives.  
This architecture shifts the burden of correctness from the *statistical* model to the *deterministic* runtime. By enforcing a "Hostile-by-Default" stance, NeuroNote ensures that even adversarial or hallucinated proposals cannot violate system invariants.  
1.3 Contributions  
This paper contributes:  
• **The Dual-Kernel System:** A runtime architecture enforcing an air gap between synthesis (Guest) and execution (Host) via structured cloning and capability manifests.  
• **The Trust Assurance Pipeline:** A synchronous gatekeeper implementing structural validation, semantic verification, and resource governance (fuel metering) to prevent denial-of-service or logic bombs.  
• **A Transparent Toolchain:** The integration of **Selena** (a Model Context Protocol server) and **RxDB** (reactive persistence) to transform the "Black Box" of generation into an observable, auditable "Glass Box" where every schema evolution is logged and reversible.  
• **Empirical Validation:** An evaluation demonstrating the synthesis of complex tools (e.g., image vectorizers, audio analyzers) using a lattice of 46 verified primitives, achieving 100% rejection of structural attacks.

\--------------------------------------------------------------------------------

2\. System Architecture  
NeuroNote implements a **Dual-Kernel Host–Guest Architecture** designed to bridge the "Comprehension–Competence Gap" by decoupling the synthesis of logic from its execution. The system enforces a unidirectional data flow where AI-generated artifacts are treated as untrusted input, requiring multi-phase verification before they can influence the application state.  
2.1 The Linear Architecture  
The system pipeline operates as a strict linear sequence: `User Prompt → AI Provider → AppDefinition → Gatekeeper → Store → Runtime → UI`. This linearity ensures that no feedback loop exists where the AI can directly manipulate the DOM or execute arbitrary JavaScript, effectively isolating the "Execution Pathway" from the "Instruction Pathway".  
2.2 Zone 1: The Guest (Proposal Layer)  
The Guest acts as a non-deterministic compiler front-end. It does not generate executable code; instead, it synthesizes a declarative **AppDefinition**, a JSON-based Intermediate Representation (IR).  
• **The AppDefinition IR:** This schema is the single contract between the Host and Guest. It contains:  
    1\. `view`: A declarative UI tree mapped to a component whitelist.  
    2\. `pipelines`: A record of typed Directed Acyclic Graphs (DAGs) for dataflow logic.  
    3\. `machine`: An XState-compatible Finite State Machine (FSM) defining interaction logic.  
    4\. `testVectors`: A set of inputs and expected outputs for honesty verification.  
• **Intelligent Context (Selena MCP):** To mitigate context saturation, the Guest interacts with **Selena**, a Model Context Protocol server. Selena acts as a "Language Server for AI," allowing the Guest to query for specific "Primitive Packs" (e.g., Audio processing, Computer Vision) rather than hallucinating APIs. This explicit retrieval creates an audit trail of *what* the AI knows.  
2.3 Zone 2: The Gatekeeper (Trust Assurance)  
The Gatekeeper is the security boundary between the untrusted AI output (Red) and the Trusted Host (Green). It implements a four-stage synchronous pipeline:  
1\. **Repair Layer:** A heuristic layer that automatically fixes common serialization errors (e.g., JSON syntax, casing mismatches) to improve system robustness.  
2\. **Structural Validation (Static):** The proposal is parsed against a strict **Zod** schema. The graph is topologically sorted to ensure it is acyclic, and port types (e.g., `Image` vs. `Text`) are verified for compatibility.  
3\. **Semantic Verification (Dynamic):** The system runs an "Honesty Simulation." The Host executes the embedded `testVectors` against a sandboxed simulation of the pipeline. If the simulated output does not match the AI's claimed output, the proposal is rejected as a hallucination.  
4\. **Resource Governance:** The system calculates the recursive `ComplexityWeight` of the proposal. If the estimated fuel cost exceeds the runtime budget, the proposal is rejected before execution begins, preventing resource exhaustion attacks.  
2.4 Zone 3: The Host & Guest Kernels  
Once validated, the architecture splits execution into two distinct kernels with different trust levels and performance characteristics.  
The Host Kernel (Trusted / Main Thread)  
The Host runs in the main browser thread with full privileges but operates only on validated data.  
• **Runtime Assembler:** This component walks the validated `view` tree and resolves JSON nodes to a hard-coded **Component Registry**. It ensures that no external code is ever hydrated into the React tree.  
• **Reactive Persistence (RxDB):** State is managed via **RxDB**, which enforces JSON-Schema validation at the storage layer. This creates an immutable **Change Journal**, logging every patch generated by the Guest. This journal enables O(1) rollback and forensic auditing of AI modifications.  
• **Visual Logic (XState):** The Host renders the validated `machine` definition into a live "Lab Console." This provides a "Glass Box" view of the application logic, allowing users to visually inspect state transitions and active guards.  
The Guest Kernel (Sandboxed / Web Worker)  
To execute dynamic dataflow logic, the system employs a **Hybrid Runtime** combining a WASM sandbox with secure accelerators.  
• **Isolation via Air Gap:** Communication occurs exclusively via asynchronous `postMessage` using Structured Cloning. This physical separation ensures the Guest has zero access to the `window` object, DOM, or `localStorage`.  
• **Tier 1 Execution (WASM Sandbox):** Pure, synchronous operators (e.g., `Math.*`, `Text.*`) and all AI-composed control logic execute within the QuickJS WASM sandbox. They are fuel-metered (instruction-counted) and mathematically guaranteed to be side-effect free.  
• **Tier 2 Execution (Host-Managed Accelerators):** Heavy compute operators (e.g., `Image.Vectorize`, `Audio.FFT`) run as **trusted Host primitives** in a network-locked Web Worker. The AI cannot inject code into these operators—it can only invoke them by name. Network access is blocked at the JavaScript level (`fetch`, `WebSocket`, `XMLHttpRequest` all throw governance errors). These accelerators are analogous to hardware co-processors: the Guest issues commands, but the implementation is trusted Host code.  
2.5 Security Invariants  
The architecture enforces six critical invariants to guarantee safety:  
1\. **No Raw Code:** The AI never produces directly executable JavaScript.  
2\. **Whitelist Everything:** All components, operators, and events are strictly allowlisted.  
3\. **Immutable State:** Context updates occur via **Immer** patches, never mutation.  
4\. **Lens Laws:** All state access is mediated by Lenses that enforce GetPut/PutGet consistency.  
5\. **Test Vectors:** No proposal is accepted without passing self-tests.  
6\. **Rollback Ready:** The Change Journal enables instant reversion to the previous valid `AppDefinition`

3\. Implementation  
The reference implementation, **NeuroNote v2.0**, is a local-first, single-page application built in TypeScript and React 19\. It enforces a strict separation between the Trusted Host Plane (the immutable runtime) and the Untrusted Guest Plane (AI-generated logic). The system relies on a "Meta-Renderer" pattern, where the UI is a pure projection of the validated Guest schema.  
3.1 The Air Gap & Integrity  
Isolation is enforced via a physical and cryptographic Air Gap \[Source 366\].  
• **Physical Isolation:** Guest logic executes within a **QuickJS WebAssembly (WASM) Sandbox**. Communication with the main thread occurs exclusively via asynchronous `postMessage` using **Structured Cloning**. Because structured cloning cannot serialize functions or DOM references, the Guest is physically incapable of accessing the `window` object, `localStorage`, or the network stack \[Source 323, 350\].  
• **The Repair Layer:** Before validation, raw AI output passes through a heuristic **Repair Layer**. This component automatically corrects common serialization errors (e.g., JSON syntax, casing mismatches) to improve system robustness before the rigorous validation phase begins \[Source 333, 373\].  
3.2 Logic-as-Data: The Runtime Assembler  
NeuroNote does not use `eval()`. Instead, it employs a **Runtime Assembler** that maps validated JSON nodes to a hard-coded **Component Registry** \[Source 373, 337\].  
• **Visuals:** A JSON `ViewNode` (e.g., `{ type: "Slider", props: { min: 0 } }`) is mapped to a pre-hardened React component.  
• **Logic:** Business logic is synthesized not as opaque code, but as **XState-compatible statecharts** (`machine.json`). The Host renders these charts in a live "Lab Console," providing a "glass-box" view where users can visually track state transitions and active guards \[Source 271, 339\].  
3.3 The Capability Lattice (Operator Architecture)  
To enable tool synthesis without arbitrary code execution, we expose a **Primitive Library** of 46 verified operators. These are the "Legos" the AI composes \[Source 410, 415\].  
• **Tier 1 (Sandboxed/Pure):** 33 operators (e.g., `Text.RegexMatch`, `Math.Clamp`, `List.Map`). These run inside the QuickJS WASM sandbox, are fuel-metered via instruction counting, and are mathematically guaranteed to be side-effect free \[Source 413\].  
• **Tier 2 (Host-Managed Accelerators):** 13 heavy compute operators (e.g., `Image.Vectorize`, `Audio.FFT`). These are **trusted Host primitives**—the AI cannot modify their implementation, only invoke them by name. They execute in a network-locked Web Worker where `fetch`, `WebSocket`, and `XMLHttpRequest` are blocked at runtime. This "co-processor" model maximizes performance (60fps rendering) while maintaining isolation: the AI controls *what* to compute, but the *how* is trusted Host code \[Source 413, 1362\].  
3.4 The Transparent Toolchain (State & Context)  
NeuroNote v2.0 introduces two architectural components specifically for observability and auditability:  
• **Reactive Persistence (RxDB):** State is managed by **RxDB**, a local-first reactive database that enforces JSON-Schema validation at the storage layer. This generates an immutable **Change Journal** of all AI-driven schema mutations, allowing forensic reconstruction of the application's evolution \[Source 267, 268\].  
• **Intelligent Context (Selena MCP):** To solve context window saturation, the Host integrates **Selena**, a Model Context Protocol (MCP) server. Instead of dumping the entire schema, the AI "queries" Selena for specific capabilities (e.g., `Selena.load('AudioKit')`). This makes the context retrieval process explicit and auditable in the logs \[Source 265, 266\].  
3.5 Immutable Evolution Engine (Lenses \+ Immer)  
Schema migrations are executed via a **Lens System Implementation (LSI)** running inside **Immer** producers. When the AI proposes a schema change, the system generates standard **JSON-Patch (RFC 6902\)** artifacts. This ensures that every mutation is atomic, reversible, and inspectable before application \[Source 269, 344\].

\--------------------------------------------------------------------------------

4\. Evaluation  
We evaluate NeuroNote on **System Resilience** and **Expressiveness**, prioritizing property-based verification over standard usability metrics.  
4.1 Safety (Adversarial Robustness)  
We integrated a live **Automated Test Harness** directly into the Host runtime \[Source 330, 401\]. We subjected the system to a battery of adversarial inputs designed to crash or exploit the runtime.  
• **Structural Attacks:** We injected malformed JSON graphs (e.g., cyclic dependencies, missing ports). **Result:** 100% of invalid structures were rejected at **Gate 1 (Static Validation)** via Zod schema enforcement \[Source 320, 368\].  
• **Resource Attacks:** We attempted to execute infinite loops (`while(true)`) and memory bombs (1GB array allocations) within the Guest. **Result:** The **Fuel Governor (Gate 3\)** successfully preempted all non-terminating logic within 15ms, returning a structured error without freezing the UI \[Source 321, 368\].  
• **Hallucination Attacks:** We injected "Potemkin" features—tools that render UI but lack underlying logic. **Result:** The **Semantic Verifier (Gate 2\)** detected the disconnect between the UI intent and the logic graph, rejecting the proposals as "Dishonest" \[Source 324, 407\].  
4.2 Expressiveness (Tool Synthesis)  
To demonstrate that safety does not preclude power, we tasked the system with synthesizing complex tools using only the allowlisted primitives.  
• **Case Study: Raster-to-Vector Converter.** We prompted the system: *"Create a tool to convert raster images to SVG vectors."*  
    ◦ *Synthesis:* The Guest successfully composed a pipeline: `Image.Decode` → `Image.Grayscale` → `Image.Threshold` → `CV.Vectorize` → `SVG.Render` \[Source 1382, 369\].  
    ◦ *Execution:* The tool successfully rendered interactive SVGs from user uploads. As confirmed by system logs, the entire pipeline execution remained within the Tier 2 Worker, ensuring the main thread remained responsive at 60fps \[Source 369, 1315\].  
• **Case Study: Audio Visualizer.** The system successfully wired `AudioInput` to `Audio.FFT` and a `Canvas` renderer, creating a real-time spectral analyzer without generating a single line of executable JavaScript \[Source 369, 1383\].  
4.3 Transparency and Observability  
A key contribution of NeuroNote is its "Radical Transparency." Unlike opaque "black box" AI agents, NeuroNote exposes its internal decision-making process.  
• **Live Traceability:** As shown in **Figure 3**, the application provides a real-time "Gatekeeper Log" visible to the user. This log details every validation step: `[HOST] structural validation: PASSED`, `[HOST] semantic verification: PASSED` \[Source 1314\].  
• **Trust Building:** This transparency shifts the user's mental model from "Trusting the AI" to "Trusting the Process." If a tool fails, the user sees exactly *why* (e.g., "Budget Exceeded"), transforming failure into an understandable system event rather than a mysterious bug \[Source 271, 331\].

5\. Discussion & Limitations  
NeuroNote challenges the prevailing "bigger is better" paradigm in AI development. Our results suggest that safety in malleable software is not achieved by scaling model parameters, but by imposing strict architectural governance. Here, we analyze the theoretical implications of the Dual-Kernel design, the specific trade-offs of the air gap, and the emergent properties of the system.  
5.1 Addressing the Computational Split-Brain  
The necessity of the Host–Guest separation is rooted in the "Computational Split-Brain Syndrome" inherent to transformer architectures \[Source 274, 275\]. As identified by Zhang (2025), LLMs exhibit a geometric dissociation between the neural pathways responsible for *comprehending* instructions and those responsible for *executing* logical operations \[Source 274\].  
• **The Competence Gap:** Models can flawlessly articulate algorithmic procedures (e.g., how to compare decimals) while failing to execute them reliably (e.g., asserting 9.11\>9.9) \[Source 277\]. This is not a training error but a structural limitation of feed-forward networks approximating symbolic computation \[Source 285\].  
• **Architectural Prosthetic:** NeuroNote acts as an external "corpus callosum" for this split-brain condition \[Source 275, 309\]. By forcing the AI to output **Logic-as-Data** (the instruction) rather than executing code, and handing that data to a deterministic Host (the execution), we bridge the gap. The AI provides the *intent*, and the Host provides the *competence*. This confirms that hybrid architectures are not merely temporary workarounds, but essential requirements for high-assurance systems \[Source 307\].  
5.2 The Security-Performance Trade-off (Serialization)  
Representing all application logic as serializable JSON introduces measurable overhead compared to native closures. Every interaction requiring Guest logic triggers a cycle of serialization, structured cloning across the Worker boundary, and re-hydration \[Source 326\].  
• **The Cost:** For high-frequency signal processing (e.g., real-time audio synthesis), this bridge introduces latency that can exceed interactive thresholds if not carefully managed.  
• **The "Choke Point" Benefit:** However, this serialization boundary is not an incidental flaw; it is the primary safety feature. It acts as the enforcement mechanism for the Capability Lattice. By forcing logic to pass through a text-based bottleneck, the system renders entire classes of attack vectors (e.g., prototype pollution, closure scope leakage) mathematically impossible \[Source 326\]. The performance cost acts as a natural governor, making pathological complexity observably expensive before it reaches production.  
5.3 Emergent Insight: Generative Asymmetry  
During our evaluation, we observed a phenomenon we term **"Generative Asymmetry"** \[Source 327\]. The Guest (AI) frequently proposed valid schema extensions—such as multi-user cursors or tabbed navigation structures—before the Host’s Meta-Renderer possessed the logic to display them.  
• **Forward Compatibility:** Because the system utilizes **Lazy Lenses** \[Source 318, 321\], these "future" fields were successfully ingested and preserved in the document state without crashing the runtime.  
• **Design Implication:** This suggests that Proposal–Verification Architectures are naturally forward-compatible. The AI can explore a broader design space (Generation) while the Runtime advances conservatively (Interpretation). This decoupling allows data evolution to outpace feature implementation without data loss \[Source 328\].  
5.4 From "Black Box" to "Glass Box" via Observability  
A persistent critique of AI-generated software is the "Black Box" problem—users do not trust what they cannot see. The integration of **XState** visualization and **RxDB** change logs in NeuroNote v2.0 inverts this paradigm \[Source 271\].  
• **Trust through Visibility:** By synthesizing logic as statecharts rather than opaque code, the Host renders a live "Lab Console" where users can visually track the system's decision tree.  
• **Auditable Intent:** The use of **Selena (MCP)** to index capabilities forces the AI to explicitly "query" for tools (e.g., `Selena.load('AudioKit')`) \[Source 266\]. This creates a forensic audit trail of *why* the AI requested specific permissions, transforming the "Black Box" of generation into a transparent "Glass Box" of observable system events \[Source 271\].  
5.5 Limitations  
• **Verification vs. Proof:** Our "Honesty Simulation" (Gate 2\) guarantees **liveness** (the app won't crash) but not formal **correctness** (the app does exactly what the user intended) \[Source 327, 328\]. We rely on property-based simulation against `TestVectors` rather than formal methods (e.g., SMT solvers). While sufficient for interactive exploratory tools, this approach does not yet meet the standards required for safety-critical systems (e.g., medical devices) \[Source 327\].  
• **Context Saturation:** While the Selena MCP server mitigates context window limits by pruning the operator library \[Source 272\], extremely complex applications with thousands of nodes still pose a challenge for single-pass synthesis. Future work must investigate "Hierarchical Synthesis," where the AI modifies sub-graphs independently rather than rewriting the entire `AppDefinition` \[Source 329\].  
• **Single-User Scope:** The current implementation treats state as a local-first JSON tree. While the Logic-as-Data model is theoretically compatible with CRDTs (Conflict-Free Replicated Data Types) for multi-user collaboration, managing the collision of two concurrent AI-generated schema migrations remains an open research problem \[Source 329\].

\--------------------------------------------------------------------------------

6\. Conclusion  
NeuroNote demonstrates that the tension between "Safety" and "Malleability" is a false dichotomy. The prevailing assumption—that safe software requires static code and that dynamic software requires trusting the generator—is incorrect. We have shown that by implementing a **Proposal–Verification Architecture**, we can treat the AI not as a trusted co-developer, but as an untrusted, probabilistic compiler front-end \[Source 313\].  
Through a rigorous **Dual-Kernel** design, we isolate the "Architect" (Comprehension) from the "Contractor" (Execution). By constraining the AI to a **Capability Lattice** of verified primitives and subjecting every output to a **Trust Assurance Pipeline**, NeuroNote enables software to evolve continuously and safely \[Source 359, 361\].  
This work establishes a new precedent for **"High-Assurance AI"**: systems designed to remain correct, recoverable, and observable even when the model is wrong. As generative capabilities continue to scale, we argue that the path forward lies not in training models to be perfect, but in architecting runtimes that are robust to imperfection.  
