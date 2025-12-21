/**
 * CAPABILITY MANIFEST - The Three-Layer Primitive Hierarchy
 * 
 * This is the "Menu of Safe Legos" that the AI Guest receives.
 * The AI can only wire primitives that appear in this manifest.
 * 
 * THREE LAYERS:
 * 
 * Layer 1: EMBODIED I/O (Interface Primitives)
 *   - Input Streams: FileInput, Slider, Toggle, TextInput, Dropzone
 *   - Output Sinks: Canvas, Chart, Timeline, Toast
 *   - These bind human interaction to data streams
 *   - They never execute logic; they only expose input events or accept output streams
 * 
 * Layer 2: DATAFLOW OPERATORS (Logic Primitives)
 *   - Signal & Media: Image.*, Audio.*, CV.*
 *   - Data Transformation: List.*, Text.*, Math.*
 *   - Sanitizers: Sanitizer.*
 *   - These are pure, metered functions executed by the Host Worker
 * 
 * Layer 3: CONTROL & STATE (Glue Primitives)
 *   - Flow Control: Branch, Gate, Throttle, Debounce
 *   - State Bindings: State.Set, Pipeline.Run
 *   - Since AI cannot write loops, these provide declarative control structures
 * 
 * SECURITY MODEL:
 * The AI is an Architect (wiring components), not a Coder (writing instructions).
 * Every primitive ID must resolve to a pre-compiled, Host-controlled implementation.
 */

// ============================================================================
// LAYER 1: EMBODIED I/O (Interface Primitives)
// ============================================================================

/**
 * Supported input types for file inputs.
 */
export type FileInputType = 'image' | 'audio' | 'text' | 'csv' | 'json';

/**
 * Canvas rendering modes.
 */
export type CanvasMode = 'vector' | 'raster' | 'plot';

/**
 * Chart/plot visualization types.
 */
export type ChartType = 'line' | 'bar' | 'scatter' | 'area' | 'pie';

/**
 * Input stream primitive - binds user interaction to data.
 */
export interface InputPrimitive {
  /** Unique identifier for this primitive type */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Description for AI */
  description: string;
  
  /** The data type this input produces */
  outputType: 'string' | 'number' | 'boolean' | 'image' | 'audio' | 'json' | 'array';
  
  /** Configuration schema for this input */
  config?: {
    /** For FileInput: accepted file types */
    acceptTypes?: FileInputType[];
    /** For Slider: min/max/step */
    range?: { min: number; max: number; step?: number };
    /** For TextInput: maxLength, pattern */
    validation?: { maxLength?: number; pattern?: string };
  };
  
  /** The event this input emits when value changes */
  emitsEvent: string;
}

/**
 * Output sink primitive - renders data to the user.
 */
export interface OutputPrimitive {
  /** Unique identifier for this primitive type */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Description for AI */
  description: string;
  
  /** The data type this sink accepts */
  inputType: 'string' | 'number' | 'image' | 'audio' | 'json' | 'array' | 'svg';
  
  /** Configuration schema for this output */
  config?: {
    /** For Canvas: rendering mode */
    mode?: CanvasMode;
    /** For Chart: chart type */
    chartType?: ChartType;
  };
}

/**
 * Layer 1: All I/O primitives available to the AI.
 */
export interface Layer1_EmbodiedIO {
  /** Input streams - how users provide data */
  inputs: InputPrimitive[];
  
  /** Output sinks - how results are displayed */
  outputs: OutputPrimitive[];
}

// ============================================================================
// LAYER 2: DATAFLOW OPERATORS (Logic Primitives)
// ============================================================================

/**
 * Data types that flow through pipelines.
 */
export type DataType = 'string' | 'number' | 'boolean' | 'json' | 'image' | 'audio' | 'array' | 'svg' | 'any';

/**
 * Operator input port specification.
 */
export interface OperatorPort {
  /** Port name */
  name: string;
  /** Data type */
  type: DataType;
  /** Optional description */
  description?: string;
}

/**
 * Dataflow operator - pure function executed by Host.
 */
export interface OperatorPrimitive {
  /** Fully qualified operator ID (e.g., 'Image.Grayscale') */
  id: string;
  
  /** Category for grouping - matches operators/types.ts */
  category: 'Text' | 'Math' | 'Image' | 'Audio' | 'List' | 'Logic' | 'Utility' | 'Sanitizer' | 'CV' | 'Vector' | 'Debug';
  
  /** Input ports */
  inputs: OperatorPort[];
  
  /** Output type */
  output: DataType;
  
  /** Human-readable description */
  description: string;
  
  /** Example usage for AI */
  example?: string;
  
  /** Complexity weight (for budget calculation) */
  complexity: number;
  
  /** Whether this is a heavy operation (Tier 2) */
  isHeavy: boolean;
}

/**
 * Layer 2: All dataflow operators available to the AI.
 */
export interface Layer2_DataflowOperators {
  /** All operators, grouped by category */
  operators: OperatorPrimitive[];
}

// ============================================================================
// LAYER 3: CONTROL & STATE (Glue Primitives)
// ============================================================================

/**
 * Control flow primitive - declarative control structures.
 */
export interface ControlPrimitive {
  /** Unique identifier (e.g., 'Control.Branch') */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Description for AI */
  description: string;
  
  /** Input ports */
  inputs: OperatorPort[];
  
  /** Output type */
  output: DataType;
}

/**
 * State machine capability - actions the machine can perform.
 */
export interface CapabilityPrimitive {
  /** Capability ID (e.g., 'SET', 'APPEND', 'RUN') */
  id: string;
  
  /** Description for AI */
  description: string;
  
  /** Argument pattern (e.g., 'key:value') */
  argPattern: string;
  
  /** Example usage */
  example: string;
}

/**
 * Layer 3: Control and state management primitives.
 */
export interface Layer3_ControlState {
  /** Flow control: Branch, Gate, Throttle, Debounce */
  flowControl: ControlPrimitive[];
  
  /** State machine capabilities: SET, APPEND, RUN, etc. */
  capabilities: CapabilityPrimitive[];
}

// ============================================================================
// THE COMPLETE MANIFEST
// ============================================================================

/**
 * Manifest version information.
 */
export interface ManifestMeta {
  /** Semantic version of the manifest schema */
  version: string;
  
  /** Cryptographic hash for integrity verification */
  hash?: string;
  
  /** When this manifest was generated */
  generatedAt: string;
}

/**
 * The complete Capability Manifest - the "Menu of Safe Legos".
 * 
 * This is what the AI Guest receives. It can only wire primitives
 * that appear in this manifest. Any ID not in the manifest is rejected
 * by the Validation Kernel.
 */
export interface CapabilityManifest {
  /** Manifest metadata */
  meta: ManifestMeta;
  
  /** Layer 1: Interface primitives (I/O binding) */
  embodiedIO: Layer1_EmbodiedIO;
  
  /** Layer 2: Dataflow operators (pure logic) */
  dataflow: Layer2_DataflowOperators;
  
  /** Layer 3: Control and state primitives (glue) */
  controlState: Layer3_ControlState;
}

// ============================================================================
// AI PROPOSAL SCHEMA (What the AI outputs)
// ============================================================================

/**
 * UI node in the AI's proposal.
 */
export interface ProposalUINode {
  /** Unique ID within the proposal */
  id: string;
  
  /** Type from Layer 1 (Input.* or Output.*) or layout type */
  type: string;
  
  /** Configuration for this node */
  config?: Record<string, unknown>;
  
  /** Child nodes for containers */
  children?: ProposalUINode[];
  
  /** Data binding (links to pipeline output or context) */
  binding?: string;
  
  /** Event to trigger on interaction */
  trigger?: string;
}

/**
 * Pipeline node in the AI's proposal.
 */
export interface ProposalPipelineNode {
  /** Unique ID within the pipeline */
  id: string;
  
  /** Operator ID from Layer 2 (e.g., 'Image.Grayscale') */
  op: string;
  
  /** Input bindings: "$ui.nodeId.value" or "@prevNodeId.output" */
  inputs: string[];
  
  /** Optional config */
  config?: Record<string, unknown>;
}

/**
 * Pipeline definition in the AI's proposal.
 */
export interface ProposalPipeline {
  /** Pipeline nodes */
  nodes: ProposalPipelineNode[];
  
  /** Output bindings: where results go */
  bindings: Record<string, {
    target: string;
    source: string;
    mime?: string;
  }>;
}

/**
 * Verification vector for the Honesty Oracle.
 */
export interface VerificationVector {
  /** Human-readable description */
  description: string;
  
  /** Mock input data */
  inputMock: Record<string, unknown>;
  
  /** Expected output type */
  expectedType: string;
  
  /** Resource budget cap for this test */
  budgetCap: {
    ops: number;
    memoryMb: number;
  };
}

/**
 * Complete AI Guest Proposal - the "wire protocol".
 */
export interface GuestProposal {
  /** Unique proposal ID */
  proposalId: string;
  
  /** Human-readable summary of intent */
  intentSummary: string;
  
  /** Application definition */
  appDefinition: {
    /** Metadata */
    meta: {
      title: string;
      version: string;
      layout?: string;
    };
    
    /** Layer 1: UI Schema */
    uiSchema: {
      root: ProposalUINode;
    };
    
    /** Layer 2: Pipeline Definition */
    pipelineDefinition: ProposalPipeline;
    
    /** State machine (Layer 3 capabilities) */
    machine?: {
      initial: string;
      states: Record<string, {
        on?: Record<string, { actions?: string[]; target?: string }>;
      }>;
    };
  };
  
  /** Test vectors for Honesty Oracle */
  testVectors: VerificationVector[];
}
