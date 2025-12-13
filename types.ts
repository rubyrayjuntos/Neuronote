/**
 * THE TRIAD: Definitions for Logic-as-Data
 */

// 1. View Schema (The UI Structure)
export type NodeType = 'container' | 'text' | 'button' | 'input' | 'header' | 'list' | 'tabs' | 'card';

export interface ViewNode {
  id: string;
  type: NodeType;
  props?: Record<string, any>;
  children?: ViewNode[];
  // Bindings
  textBinding?: string; // Key in context to bind text content to
  valueBinding?: string; // Key in context to bind input value to
  // Event Wiring
  onClick?: string; // Event name to send to machine
  onChange?: string; // Event name to send to machine (payload is value)
}

// 2. Machine Schema (The Logic Flow - Simplified XState-like)
export interface Transition {
  target?: string;
  actions?: string[]; // Side-effects: "APPEND:newItem:items", "RESET:newItem"
}

export interface MachineState {
  on?: Record<string, string | Transition>; // EventName -> TargetStateName OR Transition Object
  entry?: string[]; // Actions to run on entry
}

export interface MachineDefinition {
  initial: string;
  states: Record<string, MachineState>;
}

// 3. Application Data (Context)
export type AppContext = Record<string, any>;

// 4. Verification & Trust
export interface TestVector {
  name: string;
  initialState: string; // State to start simulation in
  steps: {
    event: string;      // Event to fire
    payload?: any;      // Optional payload
    expectState?: string; // Expected resulting state
    expectContextKeys?: string[]; // Keys in context that MUST change
  }[];
}

export interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  evidence?: any; // Machine-readable data about the failure
  recommendedFix?: string; // AI-readable (or human-readable) hint
}

export interface VerificationReport {
  timestamp: number;
  passed: boolean;
  score: number; // 0-100 Trust Score
  checks: {
    structural: CheckResult[];
    semantic: CheckResult[];
    honesty: CheckResult[];
  };
}

// The "AppDefinition" bundle that the AI proposes
export interface AppDefinition {
  version: string;
  view: ViewNode;
  machine: MachineDefinition; // The Root Machine
  actors?: Record<string, MachineDefinition>; // Templates for child actors
  initialContext: AppContext;
  testVectors?: TestVector[]; // Proof of Behavior
}

// Telemetry & Logs
export interface SystemLog {
  id: string;
  timestamp: number;
  source: 'HOST' | 'GUEST' | 'VALIDATOR' | 'STORAGE';
  type: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}

// 9. Observability & Experimentation
export interface InteractionTrace {
  id: string;
  timestamp: number;
  type: 'click' | 'input' | 'navigation';
  targetId: string; // The UI node ID
  event: string;    // The logical event name
}

export interface MigrationStats {
  preserved: number;
  dropped: number;
  added: number;
  details: string;
}

// The "Change Journal" Entry
export interface ChangeRecord {
  id: string;
  timestamp: number;
  prompt: string;
  status: 'accepted' | 'rejected' | 'rolled_back';
  failureReason?: string; // If rolled back or rejected due to crash
  
  // Snapshots for Replay/Diffing
  oldDef: AppDefinition;
  newDef: AppDefinition;
  
  // Flight Recorder Data
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
  adoptionRate: number; // % of proposals accepted
  rollbackRate: number; // % of accepted changes rolled back
  averageLatency: number; // ms
  totalInteractions: number;
  experimentCount: number;
}