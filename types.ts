/**
 * THE TRIAD: Definitions for Logic-as-Data
 */

// 1. View Schema (The UI Structure)
export type NodeType = 
  | 'container' | 'text' | 'button' | 'input' | 'header' | 'list' | 'tabs' | 'card' 
  | 'element' | 'icon' | 'chart' | 'clock' 
  | 'file-input' | 'slider' | 'canvas'; 

export interface ViewNode {
  id: string;
  type: NodeType;
  tag?: string; 
  props?: Record<string, any>;
  children?: ViewNode[];
  textBinding?: string; 
  valueBinding?: string; 
  onClick?: string;
  onChange?: string;
}

// 2. Machine Schema (The Logic Flow)
export interface Transition {
  target?: string;
  actions?: string[]; 
}

export interface MachineState {
  on?: Record<string, string | Transition>; 
  entry?: string[]; 
}

export interface MachineDefinition {
  initial: string;
  pulse?: number; 
  states: Record<string, MachineState>;
}

// 3. Dataflow Schema (The Computation Graph)
// Layer 2: Dataflow Operators (Pure Semantics)
export type OperatorType = 
  // Text
  | 'Text.ToUpper' | 'Text.RegexMatch' | 'Text.Join' | 'Text.Length'
  // Math
  | 'Math.Add' | 'Math.Subtract' | 'Math.Multiply' | 'Math.Divide' | 'Math.Threshold'
  // Image (OffscreenCanvas)
  | 'Image.Grayscale' | 'Image.Invert' | 'Image.EdgeDetect' | 'Image.Resize' | 'Image.Threshold'
  // Audio (OfflineAudioContext)
  | 'Audio.FFT' | 'Audio.PeakDetect'
  // Lists & Logic (Control Flow)
  | 'List.Map' | 'List.Filter' | 'List.Sort' | 'List.Take'
  | 'Logic.If' | 'Utility.JsonPath';

export type DataType = 'string' | 'number' | 'boolean' | 'json' | 'image' | 'audio' | 'any';

export interface PortSpec {
  name: string;
  type: DataType;
}

export interface OperatorSchema {
  op: OperatorType;
  inputs: PortSpec[];
  output: DataType;
  description: string;
  pure: boolean;
}

export interface PipelineNode {
  id: string;
  op: OperatorType;
  // Inputs: "$contextKey", "@nodeId", or literal value
  inputs: Record<string, string | number | boolean>; 
}

export interface PipelineBudget {
  maxOps: number;     // e.g. 50 nodes
  maxTimeMs: number;  // e.g. 1000ms
}

export interface PipelineDefinition {
  inputs: Record<string, DataType>; // Expected inputs
  nodes: PipelineNode[];
  output: string; // The node ID whose output is the result
  budget?: PipelineBudget;
}

// Observability & Tracing
export interface NodeTrace {
  nodeId: string;
  op: string;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  durationMs: number;
  outputSummary?: string; // Short summary (e.g. "Image<1024x1024>")
}

export interface PipelineTrace {
  pipelineId: string;
  runId: string;
  timestamp: number;
  status: 'success' | 'failed' | 'timeout';
  totalDurationMs: number;
  nodeTraces: NodeTrace[];
  error?: string;
}

// 4. Application Data (Context)
export type AppContext = Record<string, any>;

// 5. App Definition Bundle
export interface AppDefinition {
  version: string;
  view: ViewNode;
  machine: MachineDefinition;
  actors?: Record<string, MachineDefinition>;
  pipelines?: Record<string, PipelineDefinition>; // Registry of tools
  initialContext: AppContext;
  testVectors?: TestVector[];
}

// ... (Rest of types: TestVector, CheckResult, VerificationReport, etc.)
export interface TestVector {
  name: string;
  initialState: string;
  steps: {
    event: string;
    payload?: any;
    expectState?: string;
    expectContextKeys?: string[];
  }[];
}

export interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  evidence?: any;
  recommendedFix?: string;
}

export interface VerificationReport {
  timestamp: number;
  passed: boolean;
  score: number;
  checks: {
    structural: CheckResult[];
    semantic: CheckResult[];
    honesty: CheckResult[];
  };
}

export interface SystemLog {
  id: string;
  timestamp: number;
  source: 'HOST' | 'GUEST' | 'VALIDATOR' | 'STORAGE' | 'HARNESS';
  type: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
  payload?: any;
}

export interface InteractionTrace {
  id: string;
  timestamp: number;
  type: 'click' | 'input' | 'navigation';
  targetId: string;
  event: string;
}

export interface MigrationStats {
  preserved: number;
  dropped: number;
  added: number;
  ghost: number; 
  details: string;
}

export interface ChangeRecord {
  id: string;
  timestamp: number;
  prompt: string;
  status: 'accepted' | 'rejected' | 'rolled_back';
  failureReason?: string;
  oldDef: AppDefinition;
  newDef: AppDefinition;
  verificationReport: VerificationReport;
  verificationScore: number; 
  diff: {
    uiNodes: number;
    states: number;
    dataKeys: number;
  };
  migration?: MigrationStats;
  latencyMs: number;
  version: string;
}

export interface SessionMetrics {
  adoptionRate: number; 
  rollbackRate: number;
  averageLatency: number; 
  totalInteractions: number;
  experimentCount: number;
}

export interface EvaluationResult {
  category: 'SAFETY' | 'LIVENESS' | 'CORRECTNESS';
  name: string;
  status: 'PASS' | 'FAIL';
  latencyMs: number;
  details: string;
}

export interface EvaluationSuiteReport {
  timestamp: number;
  results: EvaluationResult[];
  passed: boolean;
}