import React, { useState, useEffect, useCallback, useRef, ReactNode, ErrorInfo, Component } from 'react';
import { AppDefinition, ViewNode, AppContext, SystemLog, InteractionTrace } from '../types';
import { WasmKernel } from '../services/WasmKernel';
import * as Icons from 'lucide-react';

// UUID helper that works in all environments (including non-HTTPS)
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

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
  declare props: ErrorBoundaryProps;  // Explicit declaration for React 19 types
  public state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error);
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

// ============================================================================
// HOST PRIMITIVES FOR CONTROLLED OVERLAYS
// These provide safe overlay patterns without allowing arbitrary positioning
// ============================================================================

interface ModalPrimitiveProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}

const ModalPrimitive: React.FC<ModalPrimitiveProps> = ({ isOpen, onClose, title, children, className }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div 
        className={`bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-auto ${className || ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <Icons.X className="w-5 h-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

interface ToastPrimitiveProps {
  message: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  isVisible: boolean;
  className?: string;
}

const ToastPrimitive: React.FC<ToastPrimitiveProps> = ({ message, type = 'info', isVisible, className }) => {
  if (!isVisible || !message) return null;
  
  const colors = {
    info: 'bg-zinc-800 text-zinc-200 border-zinc-700',
    success: 'bg-emerald-950 text-emerald-200 border-emerald-800',
    error: 'bg-rose-950 text-rose-200 border-rose-800',
    warning: 'bg-amber-950 text-amber-200 border-amber-800',
  };
  
  const icons = {
    info: <Icons.Info className="w-4 h-4" />,
    success: <Icons.CheckCircle className="w-4 h-4" />,
    error: <Icons.XCircle className="w-4 h-4" />,
    warning: <Icons.AlertTriangle className="w-4 h-4" />,
  };

  return (
    <div className={`fixed bottom-4 right-4 z-40 px-4 py-3 rounded-lg border shadow-lg flex items-center gap-2 ${colors[type]} ${className || ''}`}>
      {icons[type]}
      <span className="text-sm">{message}</span>
    </div>
  );
};

interface DropdownPrimitiveProps {
  trigger: React.ReactNode;
  items: Array<{ label: string; onClick: () => void; icon?: string }>;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

const DropdownPrimitive: React.FC<DropdownPrimitiveProps> = ({ trigger, items, isOpen, onToggle, className }) => {
  return (
    <div className={`relative inline-block ${className || ''}`}>
      <div onClick={onToggle}>{trigger}</div>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[160px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 z-20">
          {items.map((item, idx) => (
            <button
              key={idx}
              onClick={() => { item.onClick(); onToggle(); }}
              className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
            >
              {item.icon && (() => {
                const IconComp = (Icons as Record<string, React.FC<{className?: string}>>)[item.icon];
                return IconComp ? <IconComp className="w-4 h-4" /> : null;
              })()}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface TooltipPrimitiveProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

const TooltipPrimitive: React.FC<TooltipPrimitiveProps> = ({ content, children, position = 'top', className }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div 
      className={`relative inline-block ${className || ''}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div className={`absolute ${positions[position]} px-2 py-1 bg-zinc-800 text-zinc-200 text-xs rounded whitespace-nowrap z-10`}>
          {content}
        </div>
      )}
    </div>
  );
};


export const HostRuntime: React.FC<HostRuntimeProps> = ({ definition, context, setContext, onLog, onInteraction, onRuntimeError }) => {
  const kernelRef = useRef<WasmKernel | null>(null);
  const [isKernelReady, setIsKernelReady] = useState(false);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  
  // Stable ref for onLog to avoid triggering re-init
  const onLogRef = useRef(onLog);
  useEffect(() => { onLogRef.current = onLog; }, [onLog]);

  // Initialize WASM Kernel - only depends on definition identity
  useEffect(() => {
    let disposed = false;
    console.log('[HostRuntime] Boot effect triggered, definition version:', definition?.version);
    
    const boot = async () => {
       console.log('[HostRuntime] boot() starting...');
       setIsKernelReady(false);
       setGovernanceError(null);
       
       // Always create fresh kernel for each boot
       const kernel = new WasmKernel();
       kernelRef.current = kernel;
       
       try {
           console.log('[HostRuntime] About to call kernel.init()...');
           onLogRef.current({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'INFO', message: 'Booting WASM Sandbox...' });
           await kernel.init(context, definition);
           console.log('[HostRuntime] kernel.init() completed successfully');
           
           // Check if we were disposed during async boot
           if (disposed) {
               console.log('[HostRuntime] Disposed during boot, cleaning up');
               kernel.dispose();
               return;
           }
           
           setIsKernelReady(true);
           onLogRef.current({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'SUCCESS', message: 'Sandbox Active. 32MB Cap.' });
       } catch (e: unknown) {
           console.error('[HostRuntime] Boot error:', e);
           if (disposed) return; // Ignore errors after disposal
           const message = e instanceof Error ? e.message : 'Unknown error';
           onLogRef.current({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'ERROR', message: `Boot Failed: ${message}` });
           setGovernanceError(message);
       }
    };
    
    boot();
    
    return () => {
      disposed = true;
      kernelRef.current?.dispose();
      kernelRef.current = null;
    };
  }, [definition]);

  // Restart kernel after termination (e.g., timeout)
  const restartKernel = useCallback(async () => {
    setIsKernelReady(false);
    setGovernanceError(null);
    
    const kernel = new WasmKernel();
    kernelRef.current = kernel;
    
    try {
      onLogRef.current({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'INFO', message: 'Restarting WASM Sandbox...' });
      await kernel.init(context, definition);
      setIsKernelReady(true);
      onLogRef.current({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'SUCCESS', message: 'Sandbox Restarted. 32MB Cap.' });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      onLogRef.current({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'ERROR', message: `Restart Failed: ${message}` });
      setGovernanceError(message);
    }
  }, [context, definition]);

  // --- EVENT DISPATCHER ---
  const sendEvent = useCallback(async (event: string, payload?: any, scopeId: string | 'root' = 'root') => {
    if (!kernelRef.current || !isKernelReady) return;

    if (event !== 'TICK') {
        onLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'INFO', message: `[${scopeId}] Event -> WASM: ${event}` });
    }

    try {
        const start = performance.now();
        // Updated to handle return type { context, traces }
        const result = await kernelRef.current.dispatch(event, payload, scopeId);
        const end = performance.now();
        
        setContext(result.context);
        
        if (event !== 'TICK') {
            onLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'INFO', message: `Computed in ${(end - start).toFixed(2)}ms` });
            
            // Log Pipeline Traces if present
            if (result.traces && result.traces.length > 0) {
                 result.traces.forEach(trace => {
                     const statusIcon = trace.status === 'success' ? '✅' : '❌';
                     const msg = `Pipeline '${trace.pipelineId}': ${statusIcon} in ${trace.totalDurationMs.toFixed(2)}ms. Ops: ${trace.nodeTraces.length}`;
                     onLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: trace.status === 'success' ? 'SUCCESS' : 'ERROR', message: msg, payload: trace });
                 });
            }
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown Error';
        onLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'ERROR', message: `GOVERNANCE: ${msg}` });
        if (msg.includes('terminated')) {
             setGovernanceError("Sandbox Timeout. Restarting...");
             restartKernel(); 
        }
    }
  }, [isKernelReady, onLog, setContext, restartKernel]);

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
    const { id, type, props = {}, children } = node;
    
    // Handle bindings from EITHER node level OR props (AI sometimes puts them in props)
    // Note: AI generates "onEvent" for hierarchical types, but legacy used "onClick"/"onChange"
    const textBinding = node.textBinding || (props as any).textBinding;
    const valueBinding = node.valueBinding || (props as any).valueBinding;
    const onEvent = (node as any).onEvent || (props as any).onEvent; // New hierarchical prop
    const onClick = node.onClick || (props as any).onClick || onEvent; // Fallback to onEvent
    const onChange = node.onChange || (props as any).onChange || onEvent; // Fallback to onEvent
    
    const actor = resolveActorRead(scopeId);
    if (!actor) return <div className="text-red-500 text-xs p-2">Dead Actor: {scopeId}</div>;
    const { data, state } = actor;

    let childrenContent: ReactNode = null;
    if (textBinding && data[textBinding] !== undefined) childrenContent = data[textBinding];
    else if (children && type !== 'list' && type !== 'tabs') childrenContent = children.map(child => <React.Fragment key={child.id}>{renderNode(child, scopeId)}</React.Fragment>);

    // Transform props to React-compatible format
    // Handle common CSS shorthand properties that AI might use
    // Strip NeuroNote-specific props that shouldn't go to DOM
    const { 
      background, color, padding, margin, width, height, style: existingStyle,
      textBinding: _tb, valueBinding: _vb, onClick: _oc, onChange: _och, onEvent: _oe, // Strip these
      text, label, binding, placeholder, // Also strip these UI-specific props
      ...restProps 
    } = props as Record<string, unknown>;
    const computedStyle: React.CSSProperties = {
      ...(existingStyle as React.CSSProperties || {}),
      ...(background ? { backgroundColor: background as string } : {}),
      ...(color ? { color: color as string } : {}),
      ...(padding ? { padding: padding as string | number } : {}),
      ...(margin ? { margin: margin as string | number } : {}),
      ...(width ? { width: width as string | number } : {}),
      ...(height ? { height: height as string | number } : {}),
    };
    const commonProps = { 
      ...restProps,
      ...(Object.keys(computedStyle).length > 0 ? { style: computedStyle } : {}),
      ...(placeholder ? { placeholder: placeholder as string } : {}), // Re-add placeholder for inputs
    };
    const nodeKey = id;
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onInteraction({ id: generateUUID(), timestamp: Date.now(), type: 'click', targetId: id, event: onClick || 'none' });
      if (onClick) sendEvent(onClick, null, scopeId);
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const val = e.target.value;
      onInteraction({ id: generateUUID(), timestamp: Date.now(), type: 'input', targetId: id, event: onChange || 'UPDATE_CONTEXT' });
      if (valueBinding) sendEvent(`UPDATE_CONTEXT:${valueBinding}`, val, scopeId);
      if (onChange) sendEvent(onChange, val, scopeId);
    };

    const handleFileChange = (val: string) => {
        onInteraction({ id: generateUUID(), timestamp: Date.now(), type: 'input', targetId: id, event: onChange || 'UPDATE_CONTEXT' });
        if (valueBinding) sendEvent(`UPDATE_CONTEXT:${valueBinding}`, val, scopeId);
        if (onChange) sendEvent(onChange, val, scopeId);
    };

    switch (type) {
      case 'container': return <div key={nodeKey} {...commonProps}>{childrenContent}</div>;
      case 'card': return <div key={nodeKey} {...commonProps} className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-sm ${props.className || ''}`}>{childrenContent}</div>;
      case 'header': return <h1 key={nodeKey} {...commonProps}>{childrenContent}</h1>;
      
      case 'text':
      case 'text-display': // Map text-display to text (handles textarea/div)
           return (state === 'editing' && textBinding) ? <textarea key={nodeKey} {...commonProps} value={data[textBinding] || ''} onChange={(e) => sendEvent(`UPDATE_CONTEXT:${textBinding}`, e.target.value, scopeId)} /> : <div key={nodeKey} {...commonProps}>{childrenContent}</div>;
      
      case 'button': return <button key={nodeKey} {...commonProps} onClick={handleClick}>{props.label || childrenContent || 'Button'}</button>;
      
      case 'input': 
      case 'text-input': // Map text-input to input
           return <input key={nodeKey} {...commonProps} value={valueBinding ? (data[valueBinding] || '') : undefined} onChange={handleInput} />;
      
      case 'element': { const Tag = (node.tag || 'div') as React.ElementType; return <Tag key={nodeKey} {...commonProps} onClick={handleClick}>{childrenContent}</Tag>; }
      case 'icon': { const iconName = (props.name as string) || 'HelpCircle'; const IconComp = (Icons as Record<string, React.FC>)[iconName] || Icons.HelpCircle; return <IconComp key={nodeKey} {...commonProps} onClick={handleClick} />; }
      case 'clock': return <ClockPrimitive key={nodeKey} {...commonProps} />;
      case 'chart': return <ChartPrimitive key={nodeKey} data={textBinding ? (data[textBinding] || []) : []} {...commonProps} />;
      
      // NEW UI
      case 'file-input': return <FileInputPrimitive key={nodeKey} onChange={handleFileChange} {...commonProps} />;
      case 'slider': return <input key={nodeKey} type="range" {...commonProps} value={valueBinding ? (data[valueBinding] || 0) : 0} onChange={handleInput} />;
      case 'canvas': return <CanvasPrimitive key={nodeKey} src={textBinding ? data[textBinding] : undefined} {...commonProps} />;

      case 'list': {
          const key = (props.binding as string) || textBinding || valueBinding;
          const items = (key && Array.isArray(data[key as keyof typeof data])) ? (data[key as keyof typeof data] as unknown[]) : [];
          return (
              <div key={nodeKey} {...commonProps}>
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
                  <div key={nodeKey} {...commonProps} className={`flex flex-col gap-4 ${props.className || ''}`}>
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
          return <div key={nodeKey} {...commonProps} className="text-red-500">Static Tabs Deprecated</div>;
      }

      // HOST PRIMITIVES - Safe overlay patterns
      case 'modal': {
          const isOpen = valueBinding ? !!data[valueBinding] : false;
          const title = (props.title as string) || '';
          return (
              <ModalPrimitive 
                  isOpen={isOpen} 
                  onClose={() => valueBinding && sendEvent(`UPDATE_CONTEXT:${valueBinding}`, false, scopeId)}
                  title={title}
                  className={props.className as string}
              >
                  {children?.map(child => <React.Fragment key={child.id}>{renderNode(child, scopeId)}</React.Fragment>)}
              </ModalPrimitive>
          );
      }
      case 'toast': {
          const isVisible = valueBinding ? !!data[valueBinding] : false;
          const message = textBinding ? String(data[textBinding] || '') : (props.message as string) || '';
          const toastType = (props.type as 'info' | 'success' | 'error' | 'warning') || 'info';
          return (
              <ToastPrimitive 
                  isVisible={isVisible} 
                  message={message}
                  type={toastType}
                  className={props.className as string}
              />
          );
      }
      case 'dropdown': {
          const isOpen = valueBinding ? !!data[valueBinding] : false;
          const items = textBinding && Array.isArray(data[textBinding]) 
              ? (data[textBinding] as Array<{label: string; event?: string; icon?: string}>).map(item => ({
                  label: item.label || String(item),
                  onClick: () => item.event && sendEvent(item.event, item.label, scopeId),
                  icon: item.icon
              }))
              : [];
          const trigger = children?.[0] ? renderNode(children[0], scopeId) : <button>Menu</button>;
          return (
              <DropdownPrimitive
                  isOpen={isOpen}
                  onToggle={() => valueBinding && sendEvent(`UPDATE_CONTEXT:${valueBinding}`, !isOpen, scopeId)}
                  trigger={trigger}
                  items={items}
                  className={props.className as string}
              />
          );
      }
      case 'tooltip': {
          const content = textBinding ? String(data[textBinding] || '') : (props.content as string) || '';
          const position = (props.position as 'top' | 'bottom' | 'left' | 'right') || 'top';
          return (
              <TooltipPrimitive content={content} position={position} className={props.className as string}>
                  {children?.map(child => <React.Fragment key={child.id}>{renderNode(child, scopeId)}</React.Fragment>)}
              </TooltipPrimitive>
          );
      }
      case 'popover': {
          // Popover is similar to dropdown but with arbitrary content
          const isOpen = valueBinding ? !!data[valueBinding] : false;
          const trigger = children?.[0] ? renderNode(children[0], scopeId) : null;
          const content = children?.slice(1);
          return (
              <div className={`relative inline-block ${props.className || ''}`}>
                  <div onClick={() => valueBinding && sendEvent(`UPDATE_CONTEXT:${valueBinding}`, !isOpen, scopeId)}>
                      {trigger}
                  </div>
                  {isOpen && (
                      <div className="absolute top-full left-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-4 z-20 min-w-[200px]">
                          {content?.map(child => <React.Fragment key={child.id}>{renderNode(child, scopeId)}</React.Fragment>)}
                      </div>
                  )}
              </div>
          );
      }

      // ========================================================================
      // HIERARCHICAL COMPONENT TYPES (Manifest-compatible)
      // ========================================================================
      
      // Layout types
      case 'Layout.Stack': 
      case 'Layout.Container':
      case 'Layout.Card':
          return <div key={nodeKey} {...commonProps}>{childrenContent}</div>;
      
      // Display types
      case 'Display.Text':
      case 'Output.Text':
          return <div key={nodeKey} {...commonProps}>{textBinding ? data[textBinding] : (props.label || childrenContent)}</div>;
      
      case 'Display.Header':
          return <h1 key={nodeKey} {...commonProps}>{textBinding ? data[textBinding] : (props.label || childrenContent)}</h1>;
      
      case 'Display.Canvas':
      case 'Output.Canvas':
      case 'Output.VectorCanvas':
          return <CanvasPrimitive key={nodeKey} src={textBinding ? data[textBinding] : undefined} {...commonProps} />;
      
      case 'Display.Chart':
      case 'Output.Chart':
          return <ChartPrimitive key={nodeKey} data={textBinding ? (data[textBinding] || []) : []} {...commonProps} />;
      
      case 'Display.Clock':
          return <ClockPrimitive key={nodeKey} {...commonProps} />;
      
      case 'Display.Icon':
          { const iconName = (props.name as string) || 'HelpCircle'; const IconComp = (Icons as Record<string, React.FC>)[iconName] || Icons.HelpCircle; return <IconComp key={nodeKey} {...commonProps} onClick={handleClick} />; }
      
      case 'Display.List':
          {
              const key = (props.binding as string) || textBinding || valueBinding;
              const items = (key && Array.isArray(data[key as keyof typeof data])) ? (data[key as keyof typeof data] as unknown[]) : [];
              return (
                  <div key={nodeKey} {...commonProps}>
                      {items.length === 0 && <div className="text-zinc-600 italic p-2">No items</div>}
                      {items.map((item: any, idx: number) => {
                          const isActor = typeof item === 'string' && item.startsWith('actor_');
                          if (isActor && children && children.length > 0) return <div key={item} className="mb-2 last:mb-0">{children.map(child => <React.Fragment key={child.id}>{renderNode(child, item)}</React.Fragment>)}</div>
                          else return <div key={idx} className="p-3 border-b border-zinc-800 last:border-0">{typeof item === 'string' ? item : JSON.stringify(item)}</div>;
                      })}
                  </div>
              );
          }
      
      // Control types
      case 'Control.Button':
          return <button key={nodeKey} {...commonProps} onClick={handleClick}>{props.label || childrenContent || 'Button'}</button>;
      
      // Input types - File inputs
      case 'Input.Image':
      case 'Input.Audio':
      case 'Input.Text':
      case 'Input.CSV':
      case 'Input.JSON':
      case 'Input.File':
      case 'Input.Dropzone':
          {
              const accept = type === 'Input.Image' ? 'image/*' 
                  : type === 'Input.Audio' ? 'audio/*'
                  : type === 'Input.CSV' ? '.csv'
                  : type === 'Input.JSON' ? '.json'
                  : type === 'Input.Text' ? '.txt,.md'
                  : (props.accept as string) || '*/*';
              
              const handleFileEvent = (val: string) => {
                  onInteraction({ id: generateUUID(), timestamp: Date.now(), type: 'input', targetId: id, event: (node.onEvent as string) || onChange || 'FILE_SELECTED' });
                  if (valueBinding) sendEvent(`UPDATE_CONTEXT:${valueBinding}`, val, scopeId);
                  // Dispatch the onEvent (e.g., FILE_SELECTED)
                  const eventName = (node.onEvent as string) || onChange;
                  if (eventName) sendEvent(eventName, val, scopeId);
              };
              
              return <FileInputPrimitive key={nodeKey} onChange={handleFileEvent} accept={accept} {...commonProps} />;
          }
      
      // Input types - Interactive inputs
      case 'Input.TextField':
          return <input key={nodeKey} {...commonProps} type="text" placeholder={(props.placeholder as string) || ''} value={valueBinding ? (data[valueBinding] || '') : undefined} onChange={handleInput} />;
      
      case 'Input.TextArea':
          return <textarea key={nodeKey} {...commonProps} placeholder={(props.placeholder as string) || ''} value={valueBinding ? (data[valueBinding] || '') : undefined} onChange={handleInput} />;
      
      case 'Input.Slider':
          {
              const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = Number(e.target.value);
                  onInteraction({ id: generateUUID(), timestamp: Date.now(), type: 'input', targetId: id, event: (node.onEvent as string) || onChange || 'VALUE_CHANGED' });
                  if (valueBinding) sendEvent(`UPDATE_CONTEXT:${valueBinding}`, val, scopeId);
                  const eventName = (node.onEvent as string) || onChange;
                  if (eventName) sendEvent(eventName, val, scopeId);
              };
              return <input key={nodeKey} type="range" {...commonProps} min={(props.min as number) || 0} max={(props.max as number) || 100} step={(props.step as number) || 1} value={valueBinding ? (data[valueBinding] || 0) : 0} onChange={handleSliderChange} />;
          }
      
      case 'Input.Toggle':
          {
              const checked = valueBinding ? !!data[valueBinding] : false;
              const handleToggle = () => {
                  onInteraction({ id: generateUUID(), timestamp: Date.now(), type: 'input', targetId: id, event: (node.onEvent as string) || onChange || 'VALUE_CHANGED' });
                  if (valueBinding) sendEvent(`UPDATE_CONTEXT:${valueBinding}`, !checked, scopeId);
                  const eventName = (node.onEvent as string) || onChange;
                  if (eventName) sendEvent(eventName, !checked, scopeId);
              };
              return (
                  <label key={nodeKey} className={`flex items-center gap-2 cursor-pointer ${props.className || ''}`}>
                      <div onClick={handleToggle} className={`w-10 h-6 rounded-full relative transition-colors ${checked ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
                      </div>
                      {props.label && <span className="text-sm">{props.label}</span>}
                  </label>
              );
          }
      
      case 'Input.ColorPicker':
          {
              const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = e.target.value;
                  onInteraction({ id: generateUUID(), timestamp: Date.now(), type: 'input', targetId: id, event: (node.onEvent as string) || onChange || 'VALUE_CHANGED' });
                  if (valueBinding) sendEvent(`UPDATE_CONTEXT:${valueBinding}`, val, scopeId);
                  const eventName = (node.onEvent as string) || onChange;
                  if (eventName) sendEvent(eventName, val, scopeId);
              };
              return <input key={nodeKey} type="color" {...commonProps} value={valueBinding ? (data[valueBinding] || '#000000') : '#000000'} onChange={handleColorChange} />;
          }
      
      // Output types (additional)
      case 'Output.Toast':
          {
              const isVisible = valueBinding ? !!data[valueBinding] : false;
              const message = textBinding ? String(data[textBinding] || '') : (props.message as string) || '';
              const toastType = (props.type as 'info' | 'success' | 'error' | 'warning') || 'info';
              return <ToastPrimitive isVisible={isVisible} message={message} type={toastType} className={props.className as string} />;
          }
      
      case 'Output.Progress':
          {
              const value = valueBinding ? Math.min(100, Math.max(0, Number(data[valueBinding]) || 0)) 
                  : textBinding ? Math.min(100, Math.max(0, Number(data[textBinding]) || 0)) : 0;
              const color = (props.color as string) || '#6366f1';
              return (
                  <div key={nodeKey} className={`w-full h-2 bg-zinc-800 rounded-full overflow-hidden ${props.className || ''}`}>
                      <div className="h-full transition-all duration-300 ease-out rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
                  </div>
              );
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