NeuroNote \- Definition of Done: Dataflow Primitive System (NeuroNote Tool Set Architecture)

This DoD is met when you can demo (or run in CI) end-to-end tool synthesis where the Guest proposes a typed pipeline and the Host validates, executes, and surfaces full traces—while remaining safe under adversarial or buggy proposals.

1\) Primary Deliverable

A working “Dataflow Tool” path from prompt → proposal → validation → execution → UI with rollback \+ observability.

You must be able to:

Prompt the AI: “Add a tool that vectorizes an image (grayscale \+ threshold) and shows output on canvas.”

Receive a Proposal containing:

PipelineDefinition (typed DAG)

ToolBindingDefinition (UI inputs/outputs wired to pipeline ports)

Optional: test vectors / expected outputs

Gatekeeper accepts or rejects deterministically.

If accepted: tool runs in Worker and renders output.

If rejected: app remains usable and prior version is intact.

2\) Required Components & Acceptance Criteria  
2.1 Intermediate Representation (IR) is formal and typed

Done when:

types.ts defines:

DataType (at minimum: String | Number | Image | Audio | JSON)

PortSpec (name, type, optional shape/constraints)

PipelineNode (id, op, inputs, params, outputs)

PipelineDefinition:

id, version

nodes, edges

inputs, outputs (external ports)

budget (hard limits)

optional: purity/determinism flags

ToolBindingDefinition:

UI node → pipeline input port bindings

pipeline output port → UI renderer bindings

Acceptance checks:

Type-checker prevents invalid wiring at compile time.

Runtime validator still enforces types (don’t rely on TS at runtime).

2.2 Tier 2 pipeline executor exists and is governed (Worker)

Done when:

There is a Worker-side executor that:

topologically sorts the DAG

runs nodes using an Operator Registry (manifest map)

enforces runtime typing on every edge

returns outputs \+ full metrics \+ trace

Budget enforcement must be real:

maxNodes, maxSteps (or equivalent)

maxMillis

maxBytes (inputs \+ intermediates \+ outputs)

maxOutputBytes

Acceptance checks:

A deliberately oversized image or huge JSON is rejected with a governance error, not a crash.

A pipeline with 10,000 nodes is rejected before execution.

A pipeline that exceeds runtime budget terminates and returns a structured failure result.

2.3 Tier 1 schedules; Tier 2 executes (ABI/Task contract)

Done when:

There is a stable request/response contract:

PipelineRunRequest \= { runId, pipelineId, version, inputs, budget, traceLevel }

PipelineRunResult \= { runId, status, outputs?, metrics, trace?, warnings?, violation? }

Cancellation exists: CANCEL\_TASK(runId)

Host stores run history (in-memory is fine for MVP; persisted is better).

Acceptance checks:

You can run a pipeline, cancel it, and the UI recovers cleanly.

Re-running the same pipeline with same inputs produces same output (when operators are deterministic).

2.4 Operator Standard Library exists and is allowlisted

Done when:

Operator registry is explicit and versioned (e.g., OPERATORS\_v1).

Each operator has:

input port specs

param schema \+ range clamps

output port specs

declared purity/determinism

Minimum operator set to qualify as “tool synthesis”:

Image: Image.Grayscale, Image.Threshold, Image.Invert (OffscreenCanvas)

Text: Text.RegexReplace, Text.NormalizeWhitespace

Math: Math.Add, Math.Multiply, Math.Clamp

JSON/List: JSON.Select, List.Map (constrained), List.Filter (constrained)

Acceptance checks:

Unknown operator → rejected at Gatekeeper (not executed).

Invalid params (e.g., threshold=9999) → clamped or rejected deterministically.

2.5 Gatekeeper validates proposals (static \+ optional dynamic)

Done when:

Validation rejects:

cyclic graphs

unknown ops

type mismatches across edges

missing required ports

budget out of bounds

bindings referencing missing pipeline ports or missing UI nodes

Optional but strongly recommended: dynamic “dry run”:

Run with small synthetic inputs in Worker before acceptance.

Acceptance checks:

A malicious/garbled proposal cannot brick the app.

Validation failures are returned as structured errors suitable for display \+ logging.

2.6 UI primitives and binding layer exist

Done when:

UI supports at least:

FileInput (image)

Slider (numeric param)

Canvas (render image output)

TextInput (text tool input) OR existing Editor binding to pipeline input

Bindings are declarative: UI nodes declare which pipeline port they bind to.

Acceptance checks:

You can synthesize a brand-new tool UI by wiring these primitives via JSON (no code edits).

2.7 Observability is first-class (this enables your evaluation)

Done when:

Every proposal produces an artifact bundle:

proposal.json (pipeline \+ bindings \+ budgets)

validation\_report.json

if executed: run\_trace.json \+ run\_metrics.json

Traces include:

node execution order

per-node timing

per-node input/output shapes (not full sensitive content unless debug)

budget consumption

Acceptance checks:

After a prompt, you can inspect “what happened under the hood” from logs alone.

A failed run produces a failure code \+ location (node id) \+ reason.

2.8 Rollback / time travel works for tools

Done when:

Tool registry (pipelines/bindings) is versioned.

On failure or user rejection, Host reverts to previous tool registry version.

Data created while in “bad version” is preserved when possible (via lens or salvage strategy).

Acceptance checks:

A broken tool proposal does not corrupt existing notes or tools.

You can revert and keep prior functionality instantly.

3\) Demo Requirements (Minimum)

Provide one of:

deployed link

60–90s screen recording

local run script output \+ log bundle (for CI-style proof)

Demo must show:

AI proposes a new tool (image threshold tool)

Gatekeeper accepts

Tool runs and output renders

A deliberately invalid proposal is rejected safely (e.g., unknown op)

A budget violation terminates safely (e.g., huge image triggers maxBytes)

Trace artifacts are visible and interpretable

4\) Test Harness Requirements (must exist for “Done”)

You don’t need perfect coverage, but you must have the harness structure in place.

Harness must include:

Golden-path tests (at least 3):

image tool pipeline works

text tool pipeline works

mixed pipeline works (text → json select, etc.)

Rejection tests (at least 5):

cyclic graph rejected

unknown operator rejected

type mismatch rejected

binding mismatch rejected

budget too high rejected

Governance runtime tests (at least 3):

maxMillis exceeded → terminated

maxBytes exceeded → terminated

cancel → terminated \+ clean UI state

Determinism test (at least 1):

same input \+ same pipeline → identical output hash

Outputs:

On every test run, the harness writes:

artifacts/\<testname\>/proposal.json

.../validation.json

.../trace.json

.../metrics.json

5\) “Done means done”

You can say the Dataflow Primitive System is complete when:

The AI can synthesize a new tool as a pipeline \+ bindings using only primitives,

The Host can validate \+ govern it deterministically,

Execution is safe under malicious inputs,

And the harness produces reproducible artifacts that show exactly what happened.  
