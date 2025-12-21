import { AppDefinition, AppContext, PipelineDefinition, PipelineTrace, NodeTrace } from "../types";
import { 
  MAX_INSTRUCTIONS, 
  WASM_MEMORY_LIMIT, 
  KERNEL_BOOT_TIMEOUT_MS, 
  DISPATCH_TIMEOUT_MS,
  DEFAULT_PIPELINE_TIMEOUT_MS,
  MAX_PIPELINE_BYTES,
  MAX_OUTPUT_BYTES
} from "../constants";
import { generateTier1OperatorsSource } from "../operators";

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
 * Constants are injected from the Host to maintain single source of truth.
 */
const WORKER_BLOB = `
import { getQuickJS } from "https://esm.sh/quickjs-emscripten@0.29.0";

// Injected Governance Constants (from Host)
const MAX_INSTRUCTIONS = ${MAX_INSTRUCTIONS};
const WASM_MEMORY_LIMIT = ${WASM_MEMORY_LIMIT};
const DEFAULT_PIPELINE_TIMEOUT_MS = ${DEFAULT_PIPELINE_TIMEOUT_MS};
const MAX_PIPELINE_BYTES = ${MAX_PIPELINE_BYTES};
const MAX_OUTPUT_BYTES = ${MAX_OUTPUT_BYTES};

const KERNEL_SOURCE = ${JSON.stringify(KERNEL_SOURCE)};

let runtime = null;
let vm = null;
let module = null;
let globalContext = null; // Cache for native use
let globalDef = null;

// --- TIER 2: DATAFLOW ENGINE (NATIVE JS) ---
// This runs in the Worker.

// Helper: Async Image Processor using OffscreenCanvas
async function processImage(dataUrl, effect, params = {}) {
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

        // Image effects - data-driven where possible
        const effects = {
            grayscale: () => {
                for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    data[i] = avg;
                    data[i + 1] = avg;
                    data[i + 2] = avg;
                }
            },
            invert: () => {
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = 255 - data[i];
                    data[i + 1] = 255 - data[i + 1];
                    data[i + 2] = 255 - data[i + 2];
                }
            },
            threshold: () => {
                const thresh = params.threshold ?? 128;
                for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    const v = avg > thresh ? 255 : 0;
                    data[i] = v;
                    data[i + 1] = v;
                    data[i + 2] = v;
                }
            },
            edge: () => {
                // Sobel edge detection
                const grayscale = new Uint8Array(width * height);
                for (let i = 0; i < data.length; i += 4) {
                    grayscale[i / 4] = (data[i] + data[i + 1] + data[i + 2]) / 3;
                }
                const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
                const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
                for (let y = 1; y < height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        let gx = 0, gy = 0;
                        for (let ky = -1; ky <= 1; ky++) {
                            for (let kx = -1; kx <= 1; kx++) {
                                const idx = (y + ky) * width + (x + kx);
                                const ki = (ky + 1) * 3 + (kx + 1);
                                gx += grayscale[idx] * sobelX[ki];
                                gy += grayscale[idx] * sobelY[ki];
                            }
                        }
                        const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
                        const i = (y * width + x) * 4;
                        data[i] = data[i + 1] = data[i + 2] = mag;
                    }
                }
            },
            blur: () => {
                // Box blur (3x3 kernel)
                const radius = params.radius ?? 1;
                const copy = new Uint8ClampedArray(data);
                for (let y = radius; y < height - radius; y++) {
                    for (let x = radius; x < width - radius; x++) {
                        let r = 0, g = 0, b = 0, count = 0;
                        for (let ky = -radius; ky <= radius; ky++) {
                            for (let kx = -radius; kx <= radius; kx++) {
                                const idx = ((y + ky) * width + (x + kx)) * 4;
                                r += copy[idx];
                                g += copy[idx + 1];
                                b += copy[idx + 2];
                                count++;
                            }
                        }
                        const i = (y * width + x) * 4;
                        data[i] = r / count;
                        data[i + 1] = g / count;
                        data[i + 2] = b / count;
                    }
                }
            },
            resize: () => {
                // Resize is handled separately since it changes canvas size
                // This is a placeholder - actual resize happens below
            }
        };

        if (effect === 'resize') {
            const targetWidth = params.width ?? Math.min(width, 512);
            const targetHeight = params.height ?? Math.min(height, 512);
            const resizeCanvas = new OffscreenCanvas(targetWidth, targetHeight);
            const resizeCtx = resizeCanvas.getContext('2d');
            resizeCtx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
            const blobOut = await resizeCanvas.convertToBlob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blobOut);
            });
        }

        // Apply the effect
        if (effects[effect]) {
            effects[effect]();
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

// Helper: Decode image to raw pixel data (for CV operations)
async function decodeImage(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return null;
    try {
        const blob = await (await fetch(dataUrl)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        return {
            width: bitmap.width,
            height: bitmap.height,
            data: Array.from(imageData.data), // Convert to regular array for JSON
            channels: 4
        };
    } catch (e) {
        console.warn("Image Decode Failed", e);
        return null;
    }
}

// Helper: Contour tracing using marching squares algorithm
function traceContours(imageData, threshold = 128) {
    const { width, height, data } = imageData;
    
    // Convert to binary image (1 = foreground, 0 = background)
    const binary = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
        binary[i / 4] = gray > threshold ? 1 : 0;
    }
    
    const contours = [];
    const visited = new Set();
    
    // Marching squares lookup table (simplified)
    const marchingSquares = (x, y) => {
        const idx = (cy, cx) => {
            if (cx < 0 || cx >= width || cy < 0 || cy >= height) return 0;
            return binary[cy * width + cx];
        };
        
        // Get 2x2 cell values
        const tl = idx(y, x);
        const tr = idx(y, x + 1);
        const bl = idx(y + 1, x);
        const br = idx(y + 1, x + 1);
        
        return (tl << 3) | (tr << 2) | (br << 1) | bl;
    };
    
    // Find contour starting points and trace
    for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width - 1; x++) {
            const cell = marchingSquares(x, y);
            // Edge cells (not all same)
            if (cell > 0 && cell < 15) {
                const key = y * width + x;
                if (!visited.has(key)) {
                    visited.add(key);
                    // Start a new contour
                    const contour = [];
                    let cx = x, cy = y;
                    let steps = 0;
                    const maxSteps = width * height; // Prevent infinite loops
                    
                    while (steps < maxSteps) {
                        const c = marchingSquares(cx, cy);
                        if (c === 0 || c === 15) break;
                        
                        contour.push({ x: cx + 0.5, y: cy + 0.5 });
                        visited.add(cy * width + cx);
                        
                        // Simple direction based on cell type
                        if (c === 1 || c === 5 || c === 13) cy++;
                        else if (c === 2 || c === 6 || c === 14) cx++;
                        else if (c === 4 || c === 10 || c === 11) cy--;
                        else if (c === 8 || c === 9 || c === 12) cx--;
                        else if (c === 3 || c === 7) cx++;
                        else cx++;
                        
                        if (cx < 0 || cx >= width - 1 || cy < 0 || cy >= height - 1) break;
                        steps++;
                    }
                    
                    if (contour.length > 10) { // Only keep significant contours
                        contours.push(contour);
                    }
                }
            }
        }
    }
    
    return contours;
}

// Helper: Convert contours to SVG paths
function contoursToSVG(contours, width, height) {
    const paths = contours.map(contour => {
        if (contour.length === 0) return '';
        const first = contour[0];
        let d = 'M ' + first.x.toFixed(1) + ' ' + first.y.toFixed(1);
        for (let i = 1; i < contour.length; i++) {
            d += ' L ' + contour[i].x.toFixed(1) + ' ' + contour[i].y.toFixed(1);
        }
        d += ' Z'; // Close path
        return '<path d="' + d + '" fill="none" stroke="black" stroke-width="1"/>';
    }).filter(p => p);
    
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '">' + paths.join('') + '</svg>';
}

// Helper: Full vectorization pipeline
async function vectorizeImage(dataUrl) {
    const decoded = await decodeImage(dataUrl);
    if (!decoded) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    
    // Apply edge detection first for better contours
    const edgeData = { ...decoded, data: [...decoded.data] };
    const grayscale = new Uint8Array(decoded.width * decoded.height);
    for (let i = 0; i < decoded.data.length; i += 4) {
        grayscale[i / 4] = (decoded.data[i] + decoded.data[i + 1] + decoded.data[i + 2]) / 3;
    }
    
    // Sobel edge detection
    const edges = new Uint8Array(decoded.width * decoded.height);
    const w = decoded.width;
    const h = decoded.height;
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const gx = -grayscale[(y-1)*w+(x-1)] + grayscale[(y-1)*w+(x+1)]
                     - 2*grayscale[y*w+(x-1)] + 2*grayscale[y*w+(x+1)]
                     - grayscale[(y+1)*w+(x-1)] + grayscale[(y+1)*w+(x+1)];
            const gy = -grayscale[(y-1)*w+(x-1)] - 2*grayscale[(y-1)*w+x] - grayscale[(y-1)*w+(x+1)]
                     + grayscale[(y+1)*w+(x-1)] + 2*grayscale[(y+1)*w+x] + grayscale[(y+1)*w+(x+1)];
            edges[y * w + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
        }
    }
    
    // Convert edges back to RGBA for contour tracing
    for (let i = 0; i < edges.length; i++) {
        edgeData.data[i * 4] = edges[i];
        edgeData.data[i * 4 + 1] = edges[i];
        edgeData.data[i * 4 + 2] = edges[i];
    }
    
    const contours = traceContours(edgeData, 50);
    return contoursToSVG(contours, decoded.width, decoded.height);
}

// Helper: Decode audio to PCM buffer
async function decodeAudio(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:audio')) return null;
    try {
        const resp = await fetch(dataUrl);
        const arrayBuffer = await resp.arrayBuffer();
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        return {
            sampleRate: audioBuffer.sampleRate,
            duration: audioBuffer.duration,
            numberOfChannels: audioBuffer.numberOfChannels,
            samples: Array.from(audioBuffer.getChannelData(0)) // First channel
        };
    } catch (e) {
        console.warn("Audio Decode Failed", e);
        return null;
    }
}

// Helper: Beat detection using onset detection
async function detectBeats(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:audio')) return [];
    try {
        const resp = await fetch(dataUrl);
        const arrayBuffer = await resp.arrayBuffer();
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const samples = audioBuffer.getChannelData(0);
        
        // Simple onset detection using energy differences
        const frameSize = 1024;
        const hopSize = 512;
        const beats = [];
        let prevEnergy = 0;
        const threshold = 1.5; // Energy ratio threshold for beat
        
        for (let i = 0; i < samples.length - frameSize; i += hopSize) {
            let energy = 0;
            for (let j = 0; j < frameSize; j++) {
                energy += samples[i + j] * samples[i + j];
            }
            energy = Math.sqrt(energy / frameSize);
            
            // Detect onset (sudden increase in energy)
            if (prevEnergy > 0 && energy / prevEnergy > threshold) {
                const timeMs = (i / audioBuffer.sampleRate) * 1000;
                beats.push(timeMs);
            }
            prevEnergy = energy;
        }
        
        return beats;
    } catch (e) {
        console.warn("Beat Detection Failed", e);
        return [];
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

/**
 * TIER 2 OPERATOR IMPLEMENTATIONS (Worker-specific APIs)
 * 
 * These operators use OffscreenCanvas, AudioContext, etc. which only exist in Workers.
 * They are defined here, not in the registry, because the registry can't serialize
 * Worker-specific APIs.
 * 
 * Tier 1 operators (sync, pure) are injected from operators/registry.ts at boot time.
 */
const TIER2_OPERATORS = {
    // IMAGE OPS (Async - use OffscreenCanvas)
    'Image.Decode': async (inputs) => decodeImage(inputs[0]),
    'Image.Grayscale': async (inputs) => processImage(inputs[0], 'grayscale'),
    'Image.Invert': async (inputs) => processImage(inputs[0], 'invert'),
    'Image.EdgeDetect': async (inputs) => processImage(inputs[0], 'edge'),
    'Image.Resize': async (inputs) => processImage(inputs[0], 'resize', { width: inputs[1], height: inputs[2] }),
    'Image.Threshold': async (inputs) => processImage(inputs[0], 'threshold', { threshold: inputs[1] }),
    'Image.Blur': async (inputs) => processImage(inputs[0], 'blur', { radius: inputs[1] }),

    // COMPUTER VISION OPS (Async - complex algorithms)
    'CV.ContourTrace': async (inputs) => {
        const decoded = await decodeImage(inputs[0]);
        if (!decoded) return [];
        return traceContours(decoded, inputs[1] ?? 128);
    },
    'CV.Vectorize': async (inputs) => vectorizeImage(inputs[0]),

    // AUDIO OPS (Async - use AudioContext)
    'Audio.Decode': async (inputs) => decodeAudio(inputs[0]),
    'Audio.FFT': async (inputs) => processAudio(inputs[0], 'fft'),
    'Audio.PeakDetect': async (inputs) => processAudio(inputs[0], 'peak'),
    'Audio.BeatDetect': async (inputs) => detectBeats(inputs[0])
};

// Tier 1 operators are injected here at boot time from operators/registry.ts
/* TIER1_OPERATORS_INJECTION_POINT */

// Merge Tier 1 (injected) and Tier 2 (Worker APIs) into unified OPERATORS map
const OPERATORS = { ...TIER1_OPERATORS, ...TIER2_OPERATORS };

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

    // Helper to estimate byte size of a value
    function estimateBytes(val) {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'string') return val.length * 2; // UTF-16
        if (typeof val === 'number') return 8;
        if (typeof val === 'boolean') return 4;
        if (Array.isArray(val)) return val.reduce((acc, v) => acc + estimateBytes(v), 0);
        if (typeof val === 'object') return JSON.stringify(val).length * 2;
        return 0;
    }

    try {
        const sortedNodes = getExecutionOrder(pipe.nodes);
        const maxTime = pipe.budget?.maxTimeMs || DEFAULT_PIPELINE_TIMEOUT_MS;
        const maxBytes = pipe.budget?.maxBytes || MAX_PIPELINE_BYTES;
        const maxOutputBytes = pipe.budget?.maxOutputBytes || MAX_OUTPUT_BYTES;
        let totalBytesInFlight = 0;

        for (const node of sortedNodes) {
            // Time Budget Check
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

                // Bytes Budget Check
                const resultBytes = estimateBytes(result);
                totalBytesInFlight += resultBytes;
                
                if (totalBytesInFlight > maxBytes) {
                    trace.status = 'failed';
                    throw new Error("GOVERNANCE: Pipeline exceeded maxBytes budget (" + Math.round(totalBytesInFlight/1024) + "KB > " + Math.round(maxBytes/1024) + "KB)");
                }

                // Trace Success
                let summary = typeof result;
                if (typeof result === 'string' && result.length > 50) summary = 'string<' + result.length + '>';
                if (Array.isArray(result)) summary = 'array<' + result.length + '>';
                if (resultBytes > 1024) summary += ' (' + Math.round(resultBytes/1024) + 'KB)';

                trace.nodeTraces.push({
                    nodeId: node.id,
                    op: node.op,
                    status: 'success',
                    durationMs: performance.now() - nodeStart,
                    outputSummary: summary
                });

            } catch (opError) {
                // Operator Error Boundary: wrap error with context
                const errorMessage = opError instanceof Error ? opError.message : String(opError);
                trace.nodeTraces.push({
                    nodeId: node.id,
                    op: node.op,
                    status: 'failed',
                    durationMs: performance.now() - nodeStart,
                    error: errorMessage
                });
                trace.status = 'failed';
                throw new Error("Operator '" + node.op + "' failed at node '" + node.id + "': " + errorMessage);
            }
        }

        trace.totalDurationMs = performance.now() - startTime;
        let output = null;
        if (pipe.output) {
            output = nodeResults[pipe.output];
            
            // Final output size check
            const outputBytes = estimateBytes(output);
            if (outputBytes > maxOutputBytes) {
                trace.status = 'failed';
                throw new Error("GOVERNANCE: Pipeline output exceeds maxOutputBytes (" + Math.round(outputBytes/1024) + "KB > " + Math.round(maxOutputBytes/1024) + "KB)");
            }
        }
        
        return { output, trace };

    } catch (e) {
        trace.status = 'failed';
        trace.error = e.message;
        trace.totalDurationMs = performance.now() - startTime;
        return { output: null, trace };
    }
}

// ------------------------------------------

// Instruction counter for fuel metering
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
       runtime.setMemoryLimit(WASM_MEMORY_LIMIT);
       
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
 * Manages the WebWorker lifecycle and communication.
 */
export class WasmKernel {
  private worker: Worker | null = null;
  private pending = new Map<string, { resolve: (value: unknown) => void, reject: (reason: Error) => void, timer: ReturnType<typeof setTimeout> }>();
  private activeTasks = new Map<string, { runId: string, startTime: number }>();

  async init(context: AppContext, definition: AppDefinition): Promise<void> {
    this.dispose();
    
    // Generate Tier 1 operators from the registry (single source of truth)
    const tier1OperatorsCode = generateTier1OperatorsSource();
    
    // Inject Tier 1 operators into the Worker blob
    const workerCode = WORKER_BLOB.replace(
      '/* TIER1_OPERATORS_INJECTION_POINT */',
      tier1OperatorsCode
    );
    
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    this.worker = new Worker(url, { type: "module" });
    
    this.worker.onmessage = (e: MessageEvent<{ type: string; id: string; payload?: unknown; error?: string }>) => {
        const { type, id, payload, error } = e.data;
        if (this.pending.has(id)) {
            const pending = this.pending.get(id)!;
            clearTimeout(pending.timer);
            this.pending.delete(id);
            this.activeTasks.delete(id);
            if (type === 'ERROR') pending.reject(new Error(error || 'Unknown worker error'));
            else pending.resolve(payload);
        }
    };
    await this.send<void>('BOOT', { context, definition }, KERNEL_BOOT_TIMEOUT_MS); 
  }

  async dispatch(event: string, payload: unknown, scopeId: string = 'root'): Promise<{context: AppContext, traces?: PipelineTrace[]}> {
      return this.send<{context: AppContext, traces?: PipelineTrace[]}>('DISPATCH', { event, data: payload, scopeId }, DISPATCH_TIMEOUT_MS);
  }

  async forceHang(): Promise<void> {
      return this.send<void>('TEST_HANG', {}, DISPATCH_TIMEOUT_MS * 2);
  }

  /**
   * Cancel a specific active task by its ID.
   * Since Worker runs synchronously, this will terminate and restart the kernel.
   * Returns true if task was found and cancelled.
   */
  cancel(taskId: string): boolean {
      if (!this.pending.has(taskId)) {
          return false;
      }
      
      const pending = this.pending.get(taskId)!;
      clearTimeout(pending.timer);
      this.pending.delete(taskId);
      this.activeTasks.delete(taskId);
      
      pending.reject(new Error('GOVERNANCE: Task cancelled by user'));
      
      // If there are other pending tasks, we can't selectively cancel
      // For safety, terminate and let caller reinitialize if needed
      if (this.pending.size === 0) {
          // No other pending - safe to continue
      } else {
          // Must terminate to cancel (Worker is synchronous)
          this.terminate();
      }
      
      return true;
  }

  /**
   * Cancel all active tasks.
   */
  cancelAll(): void {
      for (const [id, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error('GOVERNANCE: All tasks cancelled'));
      }
      this.pending.clear();
      this.activeTasks.clear();
  }

  /**
   * Get list of currently active task IDs.
   */
  getActiveTasks(): Array<{ id: string; runId: string; elapsedMs: number }> {
      const now = Date.now();
      return Array.from(this.activeTasks.entries()).map(([id, task]) => ({
          id,
          runId: task.runId,
          elapsedMs: now - task.startTime
      }));
  }

  private send<T>(type: string, payload: Record<string, unknown>, timeoutMs: number): Promise<T> {
      return new Promise<T>((resolve, reject) => {
          if (!this.worker) return reject(new Error("Worker terminated"));
          const id = Math.random().toString(36).slice(2);
          const runId = `run_${Date.now()}_${id}`;
          
          const timer = setTimeout(() => {
              if (this.pending.has(id)) {
                  this.pending.delete(id);
                  this.activeTasks.delete(id);
                  this.terminate(); 
                  reject(new Error(`GOVERNANCE: Wall-clock timeout (> ${timeoutMs}ms). Worker terminated.`));
              }
          }, timeoutMs);

          this.pending.set(id, { 
              resolve: (val: unknown) => { resolve(val as T); },
              reject: (err: Error) => { reject(err); },
              timer
          });
          
          this.activeTasks.set(id, { runId, startTime: Date.now() });
          this.worker.postMessage({ type, payload, id });
      });
  }
  
  terminate(): void {
      if (this.worker) {
          this.worker.terminate();
          this.worker = null;
      }
      for (const [id, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error("Worker terminated"));
      }
      this.pending.clear();
      this.activeTasks.clear();
  }
  
  dispose(): void {
      this.terminate();
  }
}