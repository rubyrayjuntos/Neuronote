import { AppDefinition, EvaluationResult, EvaluationSuiteReport } from '../types';
import { verifyProposal } from './validator';
import { verifyLensLaws } from './migration';
import { WasmKernel } from '../services/WasmKernel';

/**
 * APPENDIX A: Test Harness Controller
 * 
 * This module implements the "Test Controller" and "Scenario Generator" 
 * described in the paper. It executes the Adversarial Prompt Suite (Section 4.1)
 * and Liveness Stress Tests (Section 4.2).
 */

// Helper to create a deep nested structure that exceeds limits
function createDeepNest(depth: number): any {
    if (depth === 0) return { id: 'leaf', type: 'text' };
    return {
        id: `node_${depth}`,
        type: 'container',
        children: [createDeepNest(depth - 1)]
    };
}

// 1. ADVERSARIAL GENERATOR
const ADVERSARIAL_SUITE: Record<string, Partial<AppDefinition>> = {
  'Invalid Component Type': {
    view: { id: 'root', type: 'malware_button' as any }
  },
  'Infinite Recursion Structure': {
    view: createDeepNest(60) // Depth 60 > Max 50
  },
  'Action/Event Conflation': {
    machine: {
      initial: 'idle',
      states: {
        idle: { on: { 'APPEND:data:list': 'idle' } } // Illegal: Action as Event
      }
    }
  },
  'Reset-Before-Use Hazard': {
    machine: {
      initial: 'idle',
      states: {
        idle: { 
            on: { 
                'SAVE': { actions: ['RESET:input', 'APPEND:input:list'] } // Logic Hazard
            } 
        }
      }
    }
  }
};

export class EvaluationHarness {
    
    // SECTION 4.1: Safety Under Adversarial Generation
    static async runSafetyTests(): Promise<EvaluationResult[]> {
        const results: EvaluationResult[] = [];
        
        for (const [name, partialDef] of Object.entries(ADVERSARIAL_SUITE)) {
            const start = performance.now();
            try {
                // Construct a malformed proposal
                const badProposal = {
                    version: 'test-v1',
                    initialContext: {},
                    machine: { initial: 'idle', states: { idle: {} } },
                    view: { id: 'root', type: 'container' },
                    ...partialDef
                } as AppDefinition;

                const report = await verifyProposal(badProposal);
                
                // WE EXPECT FAILURE (Rejection)
                const passed = !report.passed; // Invert logic: If validator failed (rejected), we PASS the safety test
                
                results.push({
                    category: 'SAFETY',
                    name: `Adversarial: ${name}`,
                    status: passed ? 'PASS' : 'FAIL',
                    latencyMs: performance.now() - start,
                    details: passed ? 'Correctly Rejected' : 'Safety Violation: Schema was accepted!'
                });
            } catch (e: any) {
                results.push({
                    category: 'SAFETY',
                    name: `Adversarial: ${name}`,
                    status: 'FAIL',
                    latencyMs: performance.now() - start,
                    details: `Harness Error: ${e.message}`
                });
            }
        }

        return results;
    }

    // SECTION 4.2: Liveness Under Unbounded Execution
    static async runLivenessTests(currentContext: any, currentDef: AppDefinition): Promise<EvaluationResult[]> {
        const results: EvaluationResult[] = [];
        const kernel = new WasmKernel();
        
        try {
            await kernel.init(currentContext, currentDef);
            const start = performance.now();
            
            // STRESS TEST: FORCE INFINITE LOOP
            // We deliberately try to hang the worker to prove the Fuel Limit works.
            try {
                await kernel.forceHang();
                // If it doesn't throw, that's bad!
                results.push({
                    category: 'LIVENESS',
                    name: 'Fuel Limit / Infinite Loop Protection',
                    status: 'FAIL',
                    latencyMs: performance.now() - start,
                    details: 'Vulnerability: Infinite loop was NOT terminated by Sandbox.'
                });
            } catch (e: any) {
                // We EXPECT an error here containing "GOVERNANCE"
                if (e.message.includes('GOVERNANCE')) {
                    results.push({
                        category: 'LIVENESS',
                        name: 'Fuel Limit / Infinite Loop Protection',
                        status: 'PASS',
                        latencyMs: performance.now() - start,
                        details: `Attack Neutralized: ${e.message}`
                    });
                } else {
                     results.push({
                        category: 'LIVENESS',
                        name: 'Fuel Limit / Infinite Loop Protection',
                        status: 'FAIL',
                        latencyMs: performance.now() - start,
                        details: `Unexpected Error: ${e.message}`
                    });
                }
            }

        } catch (e: any) {
             results.push({
                category: 'LIVENESS',
                name: 'Kernel Initialization',
                status: 'FAIL',
                latencyMs: 0,
                details: e.message || 'Worker init failed'
            });
        } finally {
            kernel.dispose();
        }

        return results;
    }

    // SECTION 4.3: Correctness of Schema Evolution
    static runCorrectnessTests(currentContext: any, currentDef: AppDefinition): EvaluationResult[] {
        const start = performance.now();
        const lensCheck = verifyLensLaws(currentContext, currentDef);
        
        return [{
            category: 'CORRECTNESS',
            name: 'Lens Law Compliance (Round-Trip)',
            status: lensCheck.satisfied ? 'PASS' : 'FAIL',
            latencyMs: performance.now() - start,
            details: lensCheck.satisfied ? 'Get/Put Laws Satisfied' : lensCheck.violation || 'Failed'
        }];
    }
}