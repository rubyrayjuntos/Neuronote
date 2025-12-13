import { AppDefinition, AppContext } from "../types";

/**
 * THE LOGIC KERNEL (Guest Code)
 * This runs inside QuickJS.
 */
const KERNEL_SOURCE = `
let context = {};
let definition = {};

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
// This defines the strict Allowlist of actions the Guest Logic can invoke.
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
             
             // Initialize System State for Actor
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
            if (!val && val !== 0 && val !== false) return; // Strict truthy check (allow 0/false?) - adjusted to allow 0
            
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
            const val = args[1]; // Value is passed as string from split, but typically primitive in this simplified VM
            setScopedData({ [key]: val });
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
            // We leave the data in actors map for now, or could clean it up.
            // But we must remove it from the parent list? 
            // The current simple implementation doesn't track parent-child relationships easily for list removal.
            // For MVP, we effectively 'kill' the actor state.
        }
    }
};

// --- HELPER: EXECUTE ACTION ---
function executeAction(actionString, scopeId) {
    const parts = actionString.split(':');
    const opcode = parts[0];
    const args = parts.slice(1);
    
    // 1. Manifest Check
    const capability = CAPABILITY_MANIFEST[opcode];
    if (!capability) {
        throw new Error("GOVERNANCE VIOLATION: Illegal Opcode '" + opcode + "'. Action rejected.");
    }
    
    // 2. Arg Validation
    if (args.length < capability.minArgs) {
        throw new Error("GOVERNANCE VIOLATION: Invalid arguments for '" + opcode + "'. Expected " + capability.minArgs);
    }

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

    // 3. Execution
    capability.exec(args, { setScopedData, getScopedData, scopeId });
}

// --- DISPATCHER ---
globalThis.dispatch = function(event, payload, scopeId) {
    if (!scopeId) scopeId = 'root';

    if (event.startsWith('UPDATE_CONTEXT')) {
        const key = event.split(':')[1];
        if (scopeId === 'root') {
            context[key] = payload;
        } else {
            if (!context.actors) context.actors = {};
            if (!context.actors[scopeId]) context.actors[scopeId] = {};
            context.actors[scopeId][key] = payload;
        }
        return context;
    }

    const actor = resolveActor(scopeId);
    if (!actor) return context;
    
    const { def, state } = actor;
    const machineState = def.states[state];
    if (!machineState) return context;
    
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
        
        // Execute all side effects through the Governance Layer
        actions.forEach(act => executeAction(act, scopeId));
        
        if (target) {
            if (scopeId === 'root') {
                context._sys.rootState = target;
            } else {
                context._sys.actorStates[scopeId] = target;
            }
        }
    }
    
    return context;
};
`;

/**
 * THE WORKER BLOB
 * This code runs in the Web Worker thread.
 * It loads QuickJS from CDN and manages the VM.
 */
const WORKER_BLOB = `
import { getQuickJS } from "https://esm.sh/quickjs-emscripten@0.29.0";

const KERNEL_SOURCE = ${JSON.stringify(KERNEL_SOURCE)};

let runtime = null;
let vm = null;
let module = null;

// GOVERNANCE CONFIG
const MAX_INSTRUCTIONS = 100000; // Fuel Limit
let instructionCount = 0;

// Helper: Marshalling
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
    if (!module) {
        module = await getQuickJS();
    }

    if (type === 'BOOT') {
       if (runtime) {
           vm.dispose();
           runtime.dispose();
       }
       
       // 8.4 RESOURCE GOVERNANCE: Memory Budget (16MB)
       runtime = module.newRuntime();
       runtime.setMemoryLimit(1024 * 1024 * 16);
       
       // 8.5 RESOURCE GOVERNANCE: Deterministic Instruction Metering
       instructionCount = 0;
       runtime.setInterruptHandler(() => {
           instructionCount++;
           if (instructionCount > MAX_INSTRUCTIONS) {
               return true; // Interrupt execution
           }
           return false;
       });
       
       vm = runtime.newContext();
       
       // Load Kernel Logic
       const evalRes = vm.evalCode(KERNEL_SOURCE);
       if (evalRes.error) {
           const err = vm.dump(evalRes.error);
           evalRes.error.dispose();
           throw new Error("Kernel Syntax Error: " + JSON.stringify(err));
       }
       evalRes.value.dispose();
       
       // Boot
       const { context, definition } = payload;
       const fnBoot = vm.getProp(vm.global, "boot");
       const hCtx = marshallJSON(vm, context);
       const hDef = marshallJSON(vm, definition);
       
       // Reset Fuel for Boot
       instructionCount = 0;
       
       const res = vm.callFunction(fnBoot, vm.undefined, hCtx, hDef);
       
       hCtx.dispose();
       hDef.dispose();
       fnBoot.dispose();
       
       if (res.error) {
           const err = vm.dump(res.error);
           res.error.dispose();
           if (instructionCount > MAX_INSTRUCTIONS) {
               throw new Error("GOVERNANCE: Boot exceeded fuel limit (" + MAX_INSTRUCTIONS + " ops)");
           }
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
       
       // Reset Fuel for Dispatch
       instructionCount = 0;
       
       const res = vm.callFunction(fnDispatch, vm.undefined, hEvent, hPayload, hScope);
       
       hEvent.dispose();
       hPayload.dispose();
       hScope.dispose();
       fnDispatch.dispose();
       
       if (res.error) {
           const err = vm.dump(res.error);
           res.error.dispose();
           if (instructionCount > MAX_INSTRUCTIONS) {
               throw new Error("GOVERNANCE: Dispatch exceeded fuel limit (" + MAX_INSTRUCTIONS + " ops)");
           }
           throw new Error("Dispatch Error: " + JSON.stringify(err));
       }
       
       const newContext = vm.dump(res.value);
       res.value.dispose();
       
       self.postMessage({ type: 'SUCCESS', id, payload: newContext });
    }
    
  } catch (err) {
    self.postMessage({ type: 'ERROR', id, error: err.message });
  }
};
`;

/**
 * HOST KERNEL PROXY
 * Manages the Worker lifecycle and enforces time budgets.
 */
export class WasmKernel {
  private worker: Worker | null = null;
  private pending = new Map<string, { resolve: Function, reject: Function }>();

  async init(context: AppContext, definition: AppDefinition) {
    this.dispose();

    // Create Worker from Blob
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

    // Boot with Time Limit (Fallback for Fuel)
    return this.send('BOOT', { context, definition }, 5000); 
  }

  async dispatch(event: string, payload: any, scopeId: string = 'root'): Promise<AppContext> {
      // 8.4 RESOURCE GOVERNANCE: Time Budget (Fallback)
      return this.send('DISPATCH', { event, data: payload, scopeId }, 500) as Promise<AppContext>;
  }

  private send(type: string, payload: any, timeoutMs: number) {
      return new Promise((resolve, reject) => {
          if (!this.worker) return reject(new Error("Worker terminated"));
          
          const id = Math.random().toString(36).slice(2);
          
          // Governance: Wall-clock Timeout (Backstop)
          const timer = setTimeout(() => {
              if (this.pending.has(id)) {
                  this.pending.delete(id);
                  this.terminate(); // Kill the offender
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
