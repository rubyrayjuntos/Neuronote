/**
 * NeuroNote Observability Service
 * 
 * Provides 100% transparency into the AI interaction flow.
 * Every phase, decision, and data transformation is captured for:
 * 1. Research validation (POC for the paper)
 * 2. Debugging and development
 * 3. Audit trail for trust assurance
 * 
 * INTEGRATION WITH TRACING:
 * - Uses UUID v7 from tracing.ts for chronologically-sortable trace IDs
 * - Records taint levels at each phase for security auditing
 * - Provides end-to-end linking from gateway to kernel
 * 
 * The flow phases are:
 * 1. PROMPT_RECEIVED - User input captured
 * 2. CONTEXT_ASSEMBLED - Current state + feedback gathered
 * 3. SYSTEM_PROMPT_BUILT - Full prompt constructed for AI
 * 4. AI_REQUEST_SENT - Request dispatched to AI provider
 * 5. AI_RESPONSE_RECEIVED - Raw response from AI
 * 6. RESPONSE_PARSED - JSON parsed from response
 * 7. VALIDATION_STARTED - Verification pipeline begins
 * 8. VALIDATION_STRUCTURAL - Structural checks complete
 * 9. VALIDATION_SEMANTIC - Semantic checks complete
 * 10. VALIDATION_HONESTY - Honesty oracle checks complete
 * 11. VALIDATION_COMPLETE - All verification done
 * 12. MIGRATION_COMPUTED - Context migration calculated
 * 13. LENS_LAWS_VERIFIED - Bidirectional integrity confirmed
 * 14. PROPOSAL_APPLIED - New definition activated
 * 15. FLOW_COMPLETE - Full cycle done
 * 16. FLOW_ERROR - Error at any phase
 */

import { generateTraceId, TaintLevel } from './tracing';

export type FlowPhase = 
  | 'PROMPT_RECEIVED'
  | 'CONTEXT_ASSEMBLED'
  | 'SYSTEM_PROMPT_BUILT'
  | 'AI_REQUEST_SENT'
  | 'AI_RESPONSE_RECEIVED'
  | 'RESPONSE_PARSED'
  | 'VALIDATION_STARTED'
  | 'VALIDATION_STRUCTURAL'
  | 'VALIDATION_SEMANTIC'
  | 'VALIDATION_HONESTY'
  | 'VALIDATION_COMPLETE'
  | 'MIGRATION_COMPUTED'
  | 'LENS_LAWS_VERIFIED'
  | 'PROPOSAL_APPLIED'
  | 'FLOW_COMPLETE'
  | 'FLOW_ERROR';

export interface FlowEvent {
  id: string;
  traceId: string;  // UUID v7 - links events in the same flow
  phase: FlowPhase;
  timestamp: number;
  durationMs?: number;  // Time since previous event
  data: Record<string, unknown>;  // Phase-specific data
  summary: string;  // Human-readable summary
  taintLevels?: Record<string, TaintLevel>;  // Taint levels of data at this phase
}

export interface AIFlowTrace {
  id: string;
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  
  // User intent
  userPrompt: string;
  
  // AI Provider info
  provider: string;
  model: string;
  
  // Key artifacts (for deep inspection)
  systemPromptLength?: number;
  systemPromptPreview?: string;  // First N chars
  rawResponseLength?: number;
  rawResponsePreview?: string;   // First N chars
  parsedProposal?: unknown;      // Full parsed JSON
  
  // Validation summary
  validationPassed?: boolean;
  validationScore?: number;
  structuralCheckCount?: number;
  semanticCheckCount?: number;
  honestyCheckCount?: number;
  failedChecks?: string[];
  
  // Migration summary
  migrationPreserved?: number;
  migrationDropped?: number;
  migrationGhost?: number;
  lensLawsSatisfied?: boolean;
  
  // Outcome
  status: 'in-progress' | 'success' | 'rejected' | 'error';
  errorMessage?: string;
  errorPhase?: FlowPhase;
  
  // All events in this flow
  events: FlowEvent[];
}

/**
 * Singleton Observability Service
 * Captures and stores all AI flow traces
 */
class ObservabilityServiceClass {
  private traces: AIFlowTrace[] = [];
  private currentTrace: AIFlowTrace | null = null;
  private eventListeners: ((event: FlowEvent) => void)[] = [];
  private traceListeners: ((trace: AIFlowTrace) => void)[] = [];
  
  private maxTraces = 100; // Keep last N traces
  
  /**
   * Start a new AI flow trace.
   * Uses UUID v7 for chronologically-sortable trace IDs.
   */
  startTrace(userPrompt: string, provider: string, model: string): string {
    // Use UUID v7 for chronological ordering and cross-system tracing
    const traceId = generateTraceId();
    
    this.currentTrace = {
      id: traceId,
      startTime: Date.now(),
      userPrompt,
      provider,
      model,
      status: 'in-progress',
      events: []
    };
    
    this.emitEvent({
      id: generateTraceId(),
      traceId,
      phase: 'PROMPT_RECEIVED',
      timestamp: Date.now(),
      data: { prompt: userPrompt, provider, model },
      summary: `User prompt: "${userPrompt.substring(0, 100)}${userPrompt.length > 100 ? '...' : ''}"`
    });
    
    return traceId;
  }
  
  /**
   * Record a phase in the current flow
   */
  recordPhase(
    phase: FlowPhase, 
    data: Record<string, unknown>, 
    summary: string
  ): void {
    if (!this.currentTrace) {
      console.warn('[Observability] No active trace for phase:', phase);
      return;
    }
    
    const lastEvent = this.currentTrace.events[this.currentTrace.events.length - 1];
    const now = Date.now();
    
    const event: FlowEvent = {
      id: generateTraceId(),
      traceId: this.currentTrace.id,
      phase,
      timestamp: now,
      durationMs: lastEvent ? now - lastEvent.timestamp : 0,
      data,
      summary
    };
    
    this.currentTrace.events.push(event);
    this.emitEvent(event);
    
    // Update trace summary based on phase
    this.updateTraceSummary(phase, data);
  }
  
  /**
   * Update the trace summary with phase-specific data
   */
  private updateTraceSummary(phase: FlowPhase, data: Record<string, unknown>): void {
    if (!this.currentTrace) return;
    
    switch (phase) {
      case 'SYSTEM_PROMPT_BUILT':
        this.currentTrace.systemPromptLength = data.length as number;
        this.currentTrace.systemPromptPreview = data.preview as string;
        break;
        
      case 'AI_RESPONSE_RECEIVED':
        this.currentTrace.rawResponseLength = data.length as number;
        this.currentTrace.rawResponsePreview = data.preview as string;
        break;
        
      case 'RESPONSE_PARSED':
        this.currentTrace.parsedProposal = data.proposal;
        break;
        
      case 'VALIDATION_COMPLETE':
        this.currentTrace.validationPassed = data.passed as boolean;
        this.currentTrace.validationScore = data.score as number;
        this.currentTrace.structuralCheckCount = data.structuralCount as number;
        this.currentTrace.semanticCheckCount = data.semanticCount as number;
        this.currentTrace.honestyCheckCount = data.honestyCount as number;
        this.currentTrace.failedChecks = data.failedChecks as string[];
        break;
        
      case 'MIGRATION_COMPUTED':
        this.currentTrace.migrationPreserved = data.preserved as number;
        this.currentTrace.migrationDropped = data.dropped as number;
        this.currentTrace.migrationGhost = data.ghost as number;
        break;
        
      case 'LENS_LAWS_VERIFIED':
        this.currentTrace.lensLawsSatisfied = data.satisfied as boolean;
        break;
    }
  }
  
  /**
   * Complete the current trace as successful
   */
  completeTrace(finalVersion: string): AIFlowTrace | null {
    if (!this.currentTrace) return null;
    
    this.recordPhase('FLOW_COMPLETE', { version: finalVersion }, `Flow complete: ${finalVersion}`);
    
    this.currentTrace.endTime = Date.now();
    this.currentTrace.totalDurationMs = this.currentTrace.endTime - this.currentTrace.startTime;
    this.currentTrace.status = 'success';
    
    const trace = this.currentTrace;
    this.finalizeTrace(trace);
    return trace;
  }
  
  /**
   * Complete the current trace as rejected (validation failed)
   */
  rejectTrace(reason: string): AIFlowTrace | null {
    if (!this.currentTrace) return null;
    
    this.recordPhase('FLOW_COMPLETE', { rejected: true, reason }, `Proposal rejected: ${reason}`);
    
    this.currentTrace.endTime = Date.now();
    this.currentTrace.totalDurationMs = this.currentTrace.endTime - this.currentTrace.startTime;
    this.currentTrace.status = 'rejected';
    
    const trace = this.currentTrace;
    this.finalizeTrace(trace);
    return trace;
  }
  
  /**
   * Fail the current trace with an error
   */
  failTrace(error: Error, phase: FlowPhase): AIFlowTrace | null {
    if (!this.currentTrace) return null;
    
    this.recordPhase('FLOW_ERROR', { 
      error: error.message, 
      stack: error.stack,
      failedPhase: phase 
    }, `Error in ${phase}: ${error.message}`);
    
    this.currentTrace.endTime = Date.now();
    this.currentTrace.totalDurationMs = this.currentTrace.endTime - this.currentTrace.startTime;
    this.currentTrace.status = 'error';
    this.currentTrace.errorMessage = error.message;
    this.currentTrace.errorPhase = phase;
    
    const trace = this.currentTrace;
    this.finalizeTrace(trace);
    return trace;
  }
  
  /**
   * Finalize and store the trace
   */
  private finalizeTrace(trace: AIFlowTrace): void {
    this.traces.unshift(trace);
    
    // Trim to max traces
    if (this.traces.length > this.maxTraces) {
      this.traces = this.traces.slice(0, this.maxTraces);
    }
    
    this.currentTrace = null;
    this.notifyTraceListeners(trace);
  }
  
  /**
   * Emit event to listeners
   */
  private emitEvent(event: FlowEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (e) {
        console.error('[Observability] Event listener error:', e);
      }
    });
  }
  
  /**
   * Notify trace completion listeners
   */
  private notifyTraceListeners(trace: AIFlowTrace): void {
    this.traceListeners.forEach(listener => {
      try {
        listener(trace);
      } catch (e) {
        console.error('[Observability] Trace listener error:', e);
      }
    });
  }
  
  // ============================================================================
  // Public API for reading traces
  // ============================================================================
  
  /**
   * Get all stored traces (most recent first)
   */
  getTraces(): AIFlowTrace[] {
    return [...this.traces];
  }
  
  /**
   * Get a specific trace by ID
   */
  getTrace(traceId: string): AIFlowTrace | undefined {
    return this.traces.find(t => t.id === traceId);
  }
  
  /**
   * Get the current in-progress trace
   */
  getCurrentTrace(): AIFlowTrace | null {
    return this.currentTrace;
  }
  
  /**
   * Subscribe to real-time flow events
   */
  onEvent(callback: (event: FlowEvent) => void): () => void {
    this.eventListeners.push(callback);
    return () => {
      this.eventListeners = this.eventListeners.filter(l => l !== callback);
    };
  }
  
  /**
   * Subscribe to trace completions
   */
  onTraceComplete(callback: (trace: AIFlowTrace) => void): () => void {
    this.traceListeners.push(callback);
    return () => {
      this.traceListeners = this.traceListeners.filter(l => l !== callback);
    };
  }
  
  /**
   * Clear all traces (for testing/reset)
   */
  clear(): void {
    this.traces = [];
    this.currentTrace = null;
  }
  
  /**
   * Export traces as JSON for analysis
   */
  exportTraces(): string {
    return JSON.stringify(this.traces, null, 2);
  }
  
  /**
   * Get summary statistics
   */
  getStats(): {
    totalTraces: number;
    successCount: number;
    rejectedCount: number;
    errorCount: number;
    avgDurationMs: number;
    avgValidationScore: number;
  } {
    const completed = this.traces.filter(t => t.status !== 'in-progress');
    const successful = completed.filter(t => t.status === 'success');
    const rejected = completed.filter(t => t.status === 'rejected');
    const errored = completed.filter(t => t.status === 'error');
    
    const avgDuration = completed.length > 0
      ? completed.reduce((sum, t) => sum + (t.totalDurationMs || 0), 0) / completed.length
      : 0;
      
    const scoresWithValues = completed.filter(t => t.validationScore !== undefined);
    const avgScore = scoresWithValues.length > 0
      ? scoresWithValues.reduce((sum, t) => sum + (t.validationScore || 0), 0) / scoresWithValues.length
      : 0;
    
    return {
      totalTraces: this.traces.length,
      successCount: successful.length,
      rejectedCount: rejected.length,
      errorCount: errored.length,
      avgDurationMs: avgDuration,
      avgValidationScore: avgScore
    };
  }
}

// Singleton instance
export const ObservabilityService = new ObservabilityServiceClass();

// Re-export types for convenience
export type { FlowEvent as ObservabilityEvent, AIFlowTrace as ObservabilityTrace };
