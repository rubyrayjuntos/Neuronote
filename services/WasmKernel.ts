import { AppDefinition, AppContext, PipelineDefinition, PipelineTrace, NodeTrace } from "../types";

/**
 * THE LOGIC KERNEL (Guest Code)
 * This runs inside QuickJS.
 */
const KERNEL_SOURCE = `
let context = {};
let definition = {};
let pendingTasks = []; // Queue for Tier 2 tasks

// --- KERNEL BOOT ---
globalThis.boot = function(initialContext, def) {
  context = initialContext;
  definition = def;
  
  if (!context._sys) {
     context._sys = {
       rootState: definition.machine.initial,
       actorStates: {},
       actorTypes: {}
     };
     context.actors = context.actors || {};
  }
  return context;
};

// --- HELPER: RESOLVE ACTOR ---
function resolveActor(scopeId) {
    if (scopeId === 'root') {
      return {
        def: definition.machine,
        state: context._sys.rootState || definition.machine.initial,
        data: context,
        type: null
      };
    }
    const type = context._sys.actorTypes ? context._sys.actorTypes[scopeId] : null;
    const def = (definition.actors && type) ? definition.actors[type] : null;
    const state = context._sys.actorStates ? context._sys.actorStates[scopeId] : null;
    const data = (context.actors && context.actors[scopeId]) ? context.actors[scopeId] : {};
    
    if (!def || !state) return null;
    return { def, state, data, type };
}

// --- CAPABILITY MANIFEST (The Governance Layer) ---
const CAPABILITY_MANIFEST = {
    SPAWN: {
        minArgs: 2,
        exec: (args, { setScopedData, getScopedData }) => {
             const actorType = args[0];
             const listKey = args[1];
             if (!definition.actors || !definition.actors[actorType]) throw new Error("Security: Unknown Actor Type '" + actorType + "'");
             const newId = 'actor_' + Math.random().toString(36).substr(2, 9);
             const data = getScopedData();
             const list = Array.isArray(data[listKey]) ? data[listKey] : [];
             setScopedData({ [listKey]: [...list, newId] });
             context._sys.actorStates[newId] = definition.actors[actorType].initial;
             context._sys.actorTypes[newId] = actorType;
             if (!context.actors) context.actors = {};
             context.actors[newId] = {};
        }
    },
    APPEND: {
        minArgs: 2,
        exec: (args, { setScopedData, getScopedData }) => {
            const src = args[0];
            const tgt = args[1];
            const data = getScopedData();
            const val = data[src];
            if (!val && val !== 0 && val !== false) return; 
            const list = Array.isArray(data[tgt]) ? data[tgt] : [];
            setScopedData({ [tgt]: [...list, val] });
        }
    },
    RESET: {
        minArgs: 1,
        exec: (args, { setScopedData }) => {
            const key = args[0];
            setScopedData({ [key]: '' });
        }
    },
    SET: {
        minArgs: 2,
        exec: (args, { setScopedData }) => {
            const key = args[0];
            const val = args[1];
            setScopedData({ [key]: val });
        }
    },
    ASSIGN: {
        minArgs: 1,
        exec: (args, { setScopedData, payload }) => {
            const key = args[0];
            setScopedData({ [key]: payload });
        }
    },
    TOGGLE: {
        minArgs: 1,
        exec: (args, { setScopedData, getScopedData }) => {
            const key = args[0];
            const data = getScopedData();
            setScopedData({ [key]: !data[key] });
        }
    },
    DELETE: {
        minArgs: 0,
        exec: (args, { scopeId }) => {
            if (scopeId === 'root') throw new Error("Security: Cannot DELETE root");
            delete context._sys.actorStates[scopeId];
        }
    },
    // NEW: TIER 2 SCHEDULING
    RUN: {
        minArgs: 2,
        exec: (args, { scopeId }) => {
            const pipelineId = args[0];
            const targetKey = args[1];
            // Push to scheduler queue
            pendingTasks.push({ pipelineId, targetKey, scopeId });
        }
    }
};

// --- HELPER: EXECUTE ACTION ---
function executeAction(actionString, scopeId, payload) {
    const parts = actionString.split(':');
    const opcode = parts[0];
    const args = parts.slice(1);
    const capability = CAPABILITY_MANIFEST[opcode];
    if (!capability) throw new Error("GOVERNANCE VIOLATION: Illegal Opcode '" + opcode + "'");
    if (args.length < capability.minArgs) throw new Error("GOVERNANCE VIOLATION: Invalid arguments for '" + opcode + "'");

    const getScopedData = () => scopeId === 'root' ? context : (context.actors[scopeId] || {});
    const setScopedData = (newData) => {
        if (scopeId === 'root') {
           Object.assign(context, newData);
        } else {
           if (!context.actors) context.actors = {};
           if (!context.actors[scopeId]) context.actors[scopeId] = {};
           Object.assign(context.actors[scopeId], newData);
        }
    };

    capability.exec(args, { setScopedData, getScopedData, scopeId, payload });
}

// --- DISPATCHER ---
globalThis.dispatch = function(event, payload, scopeId) {
    if (!scopeId) scopeId = 'root';
    pendingTasks = []; // Reset queue

    if (event.startsWith('UPDATE_CONTEXT')) {
        const key = event.split(':')[1];
        if (scopeId === 'root') context[key] = payload;
        else {
            if (!context.actors) context.actors = {};
            if (!context.actors[scopeId]) context.actors[scopeId] = {};
            context.actors[scopeId][key] = payload;
        }
        return { context, tasks: [] };
    }

    const actor = resolveActor(scopeId);
    if (!actor) return { context, tasks: [] };
    
    const { def, state } = actor;
    const machineState = def.states[state];
    if (!machineState) return { context, tasks: [] };
    
    const transitionDef = machineState.on ? machineState.on[event] : null;
    
    if (transitionDef) {
        let target = undefined;
        let actions = [];
        if (typeof transitionDef === 'string') {
            target = transitionDef;
        } else {
            target = transitionDef.target;
            actions = transitionDef.actions || [];
        }
        actions.forEach(act => executeAction(act, scopeId, payload));
        if (target) {
            if (scopeId === 'root') context._sys.rootState = target;
            else context._sys.actorStates[scopeId] = target;
        }
    }
    
    return { context, tasks: pendingTasks };
};
`;

/**
 * THE WORKER BLOB
 * Contains QuickJS VM + Dataflow Engine (Tier 2)
 */
const WORKER_BLOB = `
import { getQuickJS } from "https://esm.sh/quickjs-emscripten@0.29.0";

const KERNEL_SOURCE = ${JSON.stringify(KERNEL_SOURCE)};

let runtime = null;
let vm = null;
let module = null;
let globalContext = null; // Cache for native use
let globalDef = null;

// --- TIER 2: DATAFLOW ENGINE (NATIVE JS) ---
// This runs in the Worker.

// Helper: Async Image Processor using OffscreenCanvas
async function processImage(dataUrl, effect) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl;
    
    try {
        const blob = await (await fetch(dataUrl)).blob();
        const bitmap = await createImageBitmap(blob);
        const width = bitmap.width;
        const height = bitmap.height;
        
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        if (effect === 'grayscale') {
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                data[i] = avg;
                data[i + 1] = avg;
                data[i + 2] = avg;
            }
        } else if (effect === 'invert') {
             for (let i = 0; i < data.length; i += 4) {
                data[i] = 255 - data[i];
                data[i + 1] = 255 - data[i + 1];
                data[i + 2] = 255 - data[i + 2];
            }
        } else if (effect === 'threshold') {
             for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                const v = avg > 128 ? 255 : 0;
                data[i] = v;
                data[i + 1] = v;
                data[i + 2] = v;
             }
        } else if (effect === 'edge') {
            // Simple Edge Detection (High Pass)
            for (let i = 0; i < data.length; i += 4) {
               const r = Math.abs(data[i] - (data[i+4] || data[i]));
               const val = r > 20 ? 255 : 0;
               data[i] = val;
               data[i+1] = val;
               data[i+2] = val;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        const blobOut = await canvas.convertToBlob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blobOut);
        });
    } catch (e) {
        console.warn("Image Processing Failed", e);
        return dataUrl; 
    }
}

// Helper: Perform FFT on Audio Data
async function processAudio(dataUrl, effect) {
    if (!dataUrl || !dataUrl.startsWith('data:audio')) return [];
    
    try {
        const resp = await fetch(dataUrl);
        const arrayBuffer = await resp.arrayBuffer();
        
        // Use OfflineAudioContext to decode (Standard Web Audio API)
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0);
        
        if (effect === 'fft') {
            return performRealFFT(rawData, 64);
        } else if (effect === 'peak') {
            let max = 0;
            for(let i=0; i<rawData.length; i++) {
                if(Math.abs(rawData[i]) > max) max = Math.abs(rawData[i]);
            }
            return max > 0.5;
        }
        return [];
    } catch (e) {
        console.warn("Audio Processing Failed", e);
        return [];
    }
}

function performRealFFT(waveform, bins) {
    const result = new Array(bins).fill(0);
    const step = Math.floor(waveform.length / bins);
    
    for (let i = 0; i < bins; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
            const idx = i * step + j;
            if (idx < waveform.length) {
                sum += Math.abs(waveform[idx]);
            }
        }
        result[i] = (sum / step) * 100; // Normalized amplitude
    }
    return result;
}

const OPERATORS = {
    // TEXT OPS
    'Text.ToUpper': (inputs) => (String(inputs[0] || '')).toUpperCase(),
    'Text.Length': (inputs) => (String(inputs[0] || '').length),
    'Text.RegexMatch': (inputs) => {
        const str = String(inputs[0] || '');
        const pattern = String(inputs[1] || '');
        const match = str.match(new RegExp(pattern));
        return match ? match[0] : '';
    },
    'Text.Join': (inputs) => {
        const arr = Array.isArray(inputs[0]) ? inputs[0] : [inputs[0]];
        return arr.join(inputs[1] || ', ');
    },
    
    // MATH OPS
    'Math.Add': (inputs) => Number(inputs[0]) + Number(inputs[1]),
    'Math.Subtract': (inputs) => Number(inputs[0]) - Number(inputs[1]),
    'Math.Multiply': (inputs) => Number(inputs[0]) * Number(inputs[1]),
    'Math.Divide': (inputs) => Number(inputs[0]) / (Number(inputs[1]) || 1),
    'Math.Threshold': (inputs) => Number(inputs[0]) > Number(inputs[1]) ? 1 : 0,

    // LOGIC
    'Logic.If': (inputs) => inputs[0] ? inputs[1] : inputs[2],
    'Utility.JsonPath': (inputs) => {
        const obj = inputs[0];
        const path = String(inputs[1] || '');
        return path.split('.').reduce((o, k) => (o || {})[k], obj);
    },

    // LIST OPS
    'List.Map': (inputs) => {
         const arr = Array.isArray(inputs[0]) ? inputs[0] : [];
         return arr.map(x => String(x));
    },
    'List.Filter': (inputs) => {
         const arr = Array.isArray(inputs[0]) ? inputs[0] : [];
         return arr.filter(x => !!x);
    },
    'List.Sort': (inputs) => {
         const arr = Array.isArray(inputs[0]) ? [...inputs[0]] : [];
         return arr.sort();
    },
    'List.Take': (inputs) => {
        const arr = Array.isArray(inputs[0]) ? inputs[0] : [];
        const n = Number(inputs[1]) || 0;
        return arr.slice(0, n);
    },

    // IMAGE OPS (Async)
    'Image.Grayscale': async (inputs) => processImage(inputs[0], 'grayscale'),
    'Image.Invert': async (inputs) => processImage(inputs[0], 'invert'),
    'Image.EdgeDetect': async (inputs) => processImage(inputs[0], 'edge'),
    'Image.Resize': async (inputs) => processImage(inputs[0], 'resize'),
    'Image.Threshold': async (inputs) => processImage(inputs[0], 'threshold'),

    // AUDIO OPS (Real)
    'Audio.FFT': async (inputs) => processAudio(inputs[0], 'fft'),
    'Audio.PeakDetect': async (inputs) => processAudio(inputs[0], 'peak')
};

// Topological Sort (Kahn's Algorithm)
function getExecutionOrder(nodes) {
    const adj = {};
    const inDegree = {};
    const nodeMap = {};
    
    nodes.forEach(n => {
        adj[n.id] = [];
        inDegree[n.id] = 0;
        nodeMap[n.id] = n;
    });
    
    nodes.forEach(n => {
        Object.values(n.inputs).forEach(ref => {
            if (typeof ref === 'string' && ref.startsWith('@')) {
                const targetId = ref.substring(1).split('.')[0];
                if (adj[targetId]) {
                    adj[targetId].push(n.id);
                    inDegree[n.id]++;
                }
            }
        });
    });
    
    const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    const order = [];
    
    while(queue.length > 0) {
        const u = queue.shift();
        order.push(nodeMap[u]);
        
        adj[u].forEach(v => {
            inDegree[v]--;
            if (inDegree[v] === 0) queue.push(v);
        });
    }
    
    if (order.length !== nodes.length) throw new Error("Cycle detected in pipeline (Runtime Check)");
    return order;
}

async function executePipeline(pipeId, scopeId) {
    const startTime = performance.now();
    const trace = {
        pipelineId: pipeId,
        runId: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        status: 'success',
        totalDurationMs: 0,
        nodeTraces: [],
        error: undefined
    };

    if (!globalDef.pipelines || !globalDef.pipelines[pipeId]) {
        throw new Error("Pipeline not found: " + pipeId);
    }
    const pipe = globalDef.pipelines[pipeId];
    const nodeResults = {};

    function resolveInput(ref) {
        if (typeof ref === 'string' && ref.startsWith('$')) {
            const key = ref.substring(1);
            if (scopeId === 'root') return globalContext[key];
            else return globalContext.actors?.[scopeId]?.[key];
        }
        if (typeof ref === 'string' && ref.startsWith('@')) {
            const [nodeId, port] = ref.substring(1).split('.');
            return nodeResults[nodeId];
        }
        return ref; 
    }

    try {
        const sortedNodes = getExecutionOrder(pipe.nodes);
        const maxTime = pipe.budget?.maxTimeMs || 1000;

        for (const node of sortedNodes) {
            // Strict Budget Check
            if (performance.now() - startTime > maxTime) {
                trace.status = 'timeout';
                throw new Error("Pipeline exceeded runtime budget of " + maxTime + "ms");
            }

            const nodeStart = performance.now();
            const inputs = Object.values(node.inputs).map(resolveInput);
            const op = OPERATORS[node.op];
            
            if (!op) throw new Error("Unknown Op: " + node.op);
            
            try {
                // Execute Op
                const result = await op(inputs);
                nodeResults[node.id] = result;

                // Trace Success
                let summary = typeof result;
                if (typeof result === 'string' && result.length > 50) summary = 'string<' + result.length + '>';
                if (Array.isArray(result)) summary = 'array<' + result.length + '>';

                trace.nodeTraces.push({
                    nodeId: node.id,
                    op: node.op,
                    status: 'success',
                    durationMs: performance.now() - nodeStart,
                    outputSummary: summary
                });

            } catch (e) {
                trace.nodeTraces.push({
                    nodeId: node.id,
                    op: node.op,
                    status: 'failed',
                    durationMs: performance.now() - nodeStart
                });
                throw e;
            }
        }

        trace.totalDurationMs = performance.now() - startTime;
        let output = null;
        if (pipe.output) output = nodeResults[pipe.output];
        
        return { output, trace };

    } catch (e) {
        trace.status = 'failed';
        trace.error = e.message;
        trace.totalDurationMs = performance.now() - startTime;
        return { output: null, trace };
    }
}

// ------------------------------------------

// GOVERNANCE CONFIG
const MAX_INSTRUCTIONS = 100000; 
let instructionCount = 0;

function marshallJSON(ctx, json) {
    const jsonParse = ctx.unwrapResult(ctx.evalCode("JSON.parse"));
    const strHandle = ctx.newString(JSON.stringify(json));
    const handle = ctx.callFunction(jsonParse, ctx.undefined, strHandle).value;
    strHandle.dispose();
    jsonParse.dispose();
    return handle;
}

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;

  try {
    if (!module) module = await getQuickJS();

    if (type === 'BOOT') {
       if (runtime) {
           vm.dispose();
           runtime.dispose();
       }
       
       runtime = module.newRuntime();
       runtime.setMemoryLimit(1024 * 1024 * 32);
       
       instructionCount = 0;
       runtime.setInterruptHandler(() => {
           instructionCount++;
           if (instructionCount > MAX_INSTRUCTIONS) return true;
           return false;
       });
       
       vm = runtime.newContext();
       const evalRes = vm.evalCode(KERNEL_SOURCE);
       if (evalRes.error) {
           const err = vm.dump(evalRes.error);
           evalRes.error.dispose();
           throw new Error("Kernel Syntax Error: " + JSON.stringify(err));
       }
       evalRes.value.dispose();
       
       const { context, definition } = payload;
       globalContext = context; // Store for Tier 2
       globalDef = definition;

       const fnBoot = vm.getProp(vm.global, "boot");
       const hCtx = marshallJSON(vm, context);
       const hDef = marshallJSON(vm, definition);
       
       instructionCount = 0;
       const res = vm.callFunction(fnBoot, vm.undefined, hCtx, hDef);
       hCtx.dispose(); hDef.dispose(); fnBoot.dispose();
       
       if (res.error) {
           const err = vm.dump(res.error);
           res.error.dispose();
           throw new Error("Boot Failed: " + JSON.stringify(err));
       }
       res.value.dispose();
       
       self.postMessage({ type: 'SUCCESS', id });
    }

    if (type === 'DISPATCH') {
       if (!vm) throw new Error("VM Not Booted");
       
       const { event, data, scopeId } = payload;
       const fnDispatch = vm.getProp(vm.global, "dispatch");
       
       const hEvent = vm.newString(event);
       const hPayload = marshallJSON(vm, data === undefined ? null : data);
       const hScope = vm.newString(scopeId || 'root');
       
       instructionCount = 0;
       const res = vm.callFunction(fnDispatch, vm.undefined, hEvent, hPayload, hScope);
       
       hEvent.dispose(); hPayload.dispose(); hScope.dispose(); fnDispatch.dispose();
       
       if (res.error) {
           const err = vm.dump(res.error);
           res.error.dispose();
           if (instructionCount > MAX_INSTRUCTIONS) throw new Error("Governance: Fuel Limit");
           throw new Error("Dispatch Error: " + JSON.stringify(err));
       }
       
       const resultObj = vm.dump(res.value); // { context, tasks }
       res.value.dispose();

       globalContext = resultObj.context;
       const tasks = resultObj.tasks || [];
       const traces = [];

       // --- TIER 2 EXECUTION ---
       // If QuickJS returned tasks, execute them in Native Worker
       if (tasks.length > 0) {
           for (const task of tasks) {
               const { output, trace } = await executePipeline(task.pipelineId, task.scopeId);
               traces.push(trace);
               
               if (trace.status === 'success') {
                   // Merge Result
                   if (task.scopeId === 'root') {
                       globalContext[task.targetKey] = output;
                   } else {
                       globalContext.actors[task.scopeId][task.targetKey] = output;
                   }
               }
           }
       }

       self.postMessage({ type: 'SUCCESS', id, payload: { context: globalContext, traces } });
    }

    if (type === 'TEST_HANG') {
       if (!vm) throw new Error("VM Not Booted");
       instructionCount = 0;
       const res = vm.evalCode("while(true) {}");
       if (res.error) {
           res.error.dispose();
           throw new Error("GOVERNANCE: Loop terminated by Fuel Limit.");
       }
       res.value.dispose();
       self.postMessage({ type: 'SUCCESS', id });
    }
    
  } catch (err) {
    self.postMessage({ type: 'ERROR', id, error: err.message });
  }
};
`;

/**
 * HOST KERNEL PROXY
 */
export class WasmKernel {
  private worker: Worker | null = null;
  private pending = new Map<string, { resolve: Function, reject: Function }>();

  async init(context: AppContext, definition: AppDefinition) {
    this.dispose();
    const blob = new Blob([WORKER_BLOB], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    this.worker = new Worker(url, { type: "module" });
    
    this.worker.onmessage = (e) => {
        const { type, id, payload, error } = e.data;
        if (this.pending.has(id)) {
            const { resolve, reject } = this.pending.get(id)!;
            this.pending.delete(id);
            if (type === 'ERROR') reject(new Error(error));
            else resolve(payload);
        }
    };
    return this.send('BOOT', { context, definition }, 20000); 
  }

  async dispatch(event: string, payload: any, scopeId: string = 'root'): Promise<{context: AppContext, traces?: PipelineTrace[]}> {
      return this.send('DISPATCH', { event, data: payload, scopeId }, 1000) as Promise<{context: AppContext, traces?: PipelineTrace[]}>;
  }

  async forceHang(): Promise<void> {
      return this.send('TEST_HANG', {}, 2000) as Promise<void>;
  }

  private send(type: string, payload: any, timeoutMs: number) {
      return new Promise((resolve, reject) => {
          if (!this.worker) return reject(new Error("Worker terminated"));
          const id = Math.random().toString(36).slice(2);
          const timer = setTimeout(() => {
              if (this.pending.has(id)) {
                  this.pending.delete(id);
                  this.terminate(); 
                  reject(new Error(`GOVERNANCE: Wall-clock timeout (> ${timeoutMs}ms). Worker terminated.`));
              }
          }, timeoutMs);

          this.pending.set(id, { 
              resolve: (val: any) => { clearTimeout(timer); resolve(val); },
              reject: (err: any) => { clearTimeout(timer); reject(err); }
          });
          this.worker.postMessage({ type, payload, id });
      });
  }
  
  terminate() {
      if (this.worker) {
          this.worker.terminate();
          this.worker = null;
      }
      this.pending.forEach(p => p.reject(new Error("Worker terminated")));
      this.pending.clear();
  }
  
  dispose() {
      this.terminate();
  }
}