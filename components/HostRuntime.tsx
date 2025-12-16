import React, { useState, useEffect, useCallback, useRef, ReactNode, ErrorInfo, Component } from 'react';
import { AppDefinition, ViewNode, AppContext, SystemLog, InteractionTrace } from '../types';
import { WasmKernel } from '../services/WasmKernel';
import * as Icons from 'lucide-react';

interface HostRuntimeProps {
  definition: AppDefinition;
  context: AppContext;
  setContext: React.Dispatch<React.SetStateAction<AppContext>>;
  onLog: (log: SystemLog) => void;
  onInteraction: (trace: InteractionTrace) => void;
  onRuntimeError?: (error: Error) => void;
}

interface ErrorBoundaryProps {
    onError?: (error: Error) => void;
    children?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

class RuntimeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (this.props.onError) {
        this.props.onError(error);
    }
    console.error("Runtime Crash:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-rose-500 space-y-4 p-8 animate-in fade-in duration-500">
          <Icons.AlertOctagon className="w-16 h-16 opacity-50" />
          <div className="text-center">
            <h3 className="font-bold text-lg">System Integrity Violation</h3>
            <p className="text-sm text-rose-400/80 font-mono mt-2">The Guest Architecture triggered a critical runtime fault.</p>
            <p className="text-xs text-rose-500/50 font-mono mt-1">Automatic rollback sequence initiated...</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- HOST PRIMITIVES (Whitelisted Capabilities) ---

const ClockPrimitive: React.FC<{ format?: string, className?: string }> = ({ format, className }) => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className={`font-mono ${className || ''}`}>{time.toLocaleTimeString()}</span>;
}

const ChartPrimitive: React.FC<{ data: any[], color?: string, height?: number, className?: string }> = ({ data, color = '#6366f1', height = 100, className }) => {
   if (!Array.isArray(data) || data.length === 0) {
       return <div className="h-[100px] w-full flex items-center justify-center bg-zinc-900/50 rounded border border-zinc-800 text-zinc-600 text-[10px]">No Data</div>
   }
   
   const values = data.map(d => typeof d === 'number' ? d : (d.value || 0));
   const min = Math.min(...values);
   const max = Math.max(...values);
   const range = max - min || 1;
   
   const points = values.map((val, i) => {
       const x = (i / (values.length - 1)) * 100;
       const y = 100 - ((val - min) / range) * 100;
       return `${x},${y}`;
   }).join(' ');

   return (
       <div className={`w-full overflow-hidden ${className || ''}`} style={{ height: `${height}px` }}>
           <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
               <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
               <polygon points={`${points} 100,100 0,100`} fill={color} fillOpacity="0.2" />
           </svg>
       </div>
   );
}

// NEW: File Input (Data Ingress)
const FileInputPrimitive: React.FC<{ onChange: (val: string) => void, className?: string }> = ({ onChange, className }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (typeof ev.target?.result === 'string') {
                    onChange(ev.target.result);
                }
            };
            reader.readAsDataURL(file);
        }
    };
    return (
        <input type="file" onChange={handleChange} className={`block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 ${className || ''}`} />
    );
};

// NEW: Canvas (Data Egress)
const CanvasPrimitive: React.FC<{ src?: string, className?: string }> = ({ src, className }) => {
    if (!src) return <div className={`bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center text-zinc-700 text-xs ${className || 'h-32'}`}>No Image</div>;
    
    // If it's a data URL, we just render it as an image for simplicity in this React host
    // A true canvas would drawImage, but <img> tags are safer and simpler for "Viewers"
    return <img src={src} alt="Output" className={`rounded border border-zinc-800 object-contain bg-black ${className || ''}`} />;
};


export const HostRuntime: React.FC<HostRuntimeProps> = ({ definition, context, setContext, onLog, onInteraction, onRuntimeError }) => {
  const kernelRef = useRef<WasmKernel | null>(null);
  const [isKernelReady, setIsKernelReady] = useState(false);
  const [governanceError, setGovernanceError] = useState<string | null>(null);

  // Initialize WASM Kernel
  const initKernel = useCallback(async () => {
       setIsKernelReady(false);
       setGovernanceError(null);
       if (!kernelRef.current) kernelRef.current = new WasmKernel();
       try {
           onLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: 'INFO', message: 'Booting WASM Sandbox...' });
           await kernelRef.current.init(context, definition);
           setIsKernelReady(true);
           onLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: 'SUCCESS', message: 'Sandbox Active. 32MB Cap.' });
       } catch (e: any) {
           onLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: 'ERROR', message: `Boot Failed: ${e.message}` });
           setGovernanceError(e.message);
       }
  }, [definition, onLog]); 

  useEffect(() => {
    initKernel();
    return () => { kernelRef.current?.dispose(); };
  }, [initKernel]);

  // --- EVENT DISPATCHER ---
  const sendEvent = useCallback(async (event: string, payload?: any, scopeId: string | 'root' = 'root') => {
    if (!kernelRef.current || !isKernelReady) return;

    if (event !== 'TICK') {
        onLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: 'INFO', message: `[${scopeId}] Event -> WASM: ${event}` });
    }

    try {
        const start = performance.now();
        // Updated to handle return type { context, traces }
        const result = await kernelRef.current.dispatch(event, payload, scopeId);
        const end = performance.now();
        
        setContext(result.context);
        
        if (event !== 'TICK') {
            onLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: 'INFO', message: `Computed in ${(end - start).toFixed(2)}ms` });
            
            // Log Pipeline Traces if present
            if (result.traces && result.traces.length > 0) {
                 result.traces.forEach(trace => {
                     const statusIcon = trace.status === 'success' ? '✅' : '❌';
                     const msg = `Pipeline '${trace.pipelineId}': ${statusIcon} in ${trace.totalDurationMs.toFixed(2)}ms. Ops: ${trace.nodeTraces.length}`;
                     onLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: trace.status === 'success' ? 'SUCCESS' : 'ERROR', message: msg, payload: trace });
                 });
            }
        }
    } catch (e: any) {
        const msg = e.message || 'Unknown Error';
        onLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: 'ERROR', message: `GOVERNANCE: ${msg}` });
        if (msg.includes('terminated')) {
             setGovernanceError("Sandbox Timeout. Restarting...");
             initKernel(); 
        }
    }
  }, [isKernelReady, onLog, setContext, initKernel]);

  useEffect(() => {
      const pulseInterval = definition.machine.pulse;
      if (!pulseInterval || pulseInterval <= 0) return;
      const timer = setInterval(() => sendEvent('TICK', new Date().toLocaleTimeString()), pulseInterval);
      return () => clearInterval(timer);
  }, [definition.machine.pulse, sendEvent]);

  // --- VIEW RENDERING ---
  const resolveActorRead = (scopeId: string | 'root') => {
    if (scopeId === 'root') return { state: context._sys?.rootState || definition.machine.initial, data: context };
    const state = context._sys?.actorStates?.[scopeId];
    const data = context.actors?.[scopeId] || {};
    if (!state) return null;
    return { state, data };
  };

  const renderNode = (node: ViewNode, scopeId: string | 'root'): ReactNode => {
    const { id, type, props = {}, children, textBinding, valueBinding, onClick, onChange } = node;
    const actor = resolveActorRead(scopeId);
    if (!actor) return <div className="text-red-500 text-xs p-2">Dead Actor: {scopeId}</div>;
    const { data, state } = actor;

    let childrenContent: ReactNode = null;
    if (textBinding && data[textBinding] !== undefined) childrenContent = data[textBinding];
    else if (children && type !== 'list' && type !== 'tabs') childrenContent = children.map(child => <React.Fragment key={child.id}>{renderNode(child, scopeId)}</React.Fragment>);

    const commonProps = { key: id, ...props };
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onInteraction({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'click', targetId: id, event: onClick || 'none' });
      if (onClick) sendEvent(onClick, null, scopeId);
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const val = e.target.value;
      onInteraction({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'input', targetId: id, event: onChange || 'UPDATE_CONTEXT' });
      if (valueBinding) sendEvent(`UPDATE_CONTEXT:${valueBinding}`, val, scopeId);
      if (onChange) sendEvent(onChange, val, scopeId);
    };

    const handleFileChange = (val: string) => {
        onInteraction({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'input', targetId: id, event: onChange || 'UPDATE_CONTEXT' });
        if (valueBinding) sendEvent(`UPDATE_CONTEXT:${valueBinding}`, val, scopeId);
        if (onChange) sendEvent(onChange, val, scopeId);
    };

    switch (type) {
      case 'container': return <div {...commonProps}>{childrenContent}</div>;
      case 'card': return <div {...commonProps} className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-sm ${props.className || ''}`}>{childrenContent}</div>;
      case 'header': return <h1 {...commonProps}>{childrenContent}</h1>;
      
      case 'text':
      case 'text-display': // Map text-display to text (handles textarea/div)
           return (state === 'editing' && textBinding) ? <textarea {...commonProps} value={data[textBinding] || ''} onChange={(e) => sendEvent(`UPDATE_CONTEXT:${textBinding}`, e.target.value, scopeId)} /> : <div {...commonProps}>{childrenContent}</div>;
      
      case 'button': return <button {...commonProps} onClick={handleClick}>{props.label || childrenContent || 'Button'}</button>;
      
      case 'input': 
      case 'text-input': // Map text-input to input
           return <input {...commonProps} value={valueBinding ? (data[valueBinding] || '') : undefined} onChange={handleInput} />;
      
      case 'element': { const Tag = (node.tag || 'div') as any; return <Tag {...commonProps} onClick={handleClick}>{childrenContent}</Tag>; }
      case 'icon': { const IconComp = (Icons as any)[props.name || 'HelpCircle'] || Icons.HelpCircle; return <IconComp {...commonProps} onClick={handleClick} />; }
      case 'clock': return <ClockPrimitive {...commonProps} />;
      case 'chart': return <ChartPrimitive data={textBinding ? (data[textBinding] || []) : []} {...commonProps} />;
      
      // NEW UI
      case 'file-input': return <FileInputPrimitive onChange={handleFileChange} {...commonProps} />;
      case 'slider': return <input type="range" {...commonProps} value={valueBinding ? (data[valueBinding] || 0) : 0} onChange={handleInput} />;
      case 'canvas': return <CanvasPrimitive src={textBinding ? data[textBinding] : undefined} {...commonProps} />;

      case 'list': {
          const key = props.binding || textBinding || valueBinding;
          const items = (key && Array.isArray(data[key])) ? data[key] : [];
          return (
              <div {...commonProps}>
                  {items.length === 0 && <div className="text-zinc-600 italic p-2">No items</div>}
                  {items.map((item: any, idx: number) => {
                      const isActor = typeof item === 'string' && item.startsWith('actor_');
                      if (isActor && children && children.length > 0) return <div key={item} className="mb-2 last:mb-0">{children.map(child => <React.Fragment key={child.id}>{renderNode(child, item)}</React.Fragment>)}</div>
                      else return <div key={idx} className="p-3 border-b border-zinc-800 last:border-0">{typeof item === 'string' ? item : JSON.stringify(item)}</div>;
                  })}
              </div>
          );
      }
      case 'tabs': {
          const activeTabId = valueBinding ? (data[valueBinding] || '') : '';
          if (textBinding) {
              const items = (Array.isArray(data[textBinding])) ? data[textBinding] : [];
              return (
                  <div {...commonProps} className={`flex flex-col gap-4 ${props.className || ''}`}>
                      <div className="flex border-b border-zinc-800 overflow-x-auto no-scrollbar">
                          {items.map((item: any) => {
                              const itemId = typeof item === 'string' ? item : item.id;
                              const label = typeof item === 'string' ? item : item.name;
                              return <button key={itemId} onClick={() => valueBinding && sendEvent(`UPDATE_CONTEXT:${valueBinding}`, itemId, scopeId)} className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${activeTabId === itemId ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-500'}`}>{label}</button>
                          })}
                      </div>
                      <div className="p-4 bg-zinc-900/30 rounded-b-lg">
                          {items.includes(activeTabId) ? children?.map(child => <React.Fragment key={child.id}>{renderNode(child, activeTabId.startsWith('actor_') ? activeTabId : scopeId)}</React.Fragment>) : <div className="text-zinc-500 text-sm">Select a tab</div>}
                      </div>
                  </div>
              )
          }
          return <div {...commonProps} className="text-red-500">Static Tabs Deprecated</div>;
      }
      default: return <div className="text-red-500">Unknown Node: {type}</div>;
    }
  };

  if (!isKernelReady && !governanceError) return <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 animate-pulse"><Icons.ShieldCheck className="w-8 h-8 mb-4 text-indigo-500" /><div className="text-xs font-mono">Initializing Secure Sandbox...</div></div>;

  return (
    <RuntimeErrorBoundary onError={onRuntimeError}>
        <div className="w-full h-full relative">
            {governanceError && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-950/90 text-rose-200 px-4 py-2 rounded text-xs flex gap-2"><Icons.AlertTriangle className="w-4 h-4" />{governanceError}</div>}
            {renderNode(definition.view, 'root')}
            <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 text-[10px] text-zinc-500 rounded pointer-events-none flex items-center gap-2"><Icons.Lock className="w-3 h-3 text-emerald-500" /><span>WASM/Worker</span><span>32MB Cap</span>{definition.machine.pulse ? <span className="text-indigo-400 flex items-center gap-1"><Icons.Activity className="w-3 h-3" />{definition.machine.pulse}ms</span> : null}</div>
        </div>
    </RuntimeErrorBoundary>
  );
};