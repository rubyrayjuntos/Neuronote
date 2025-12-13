import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppDefinition, ViewNode, AppContext, SystemLog, InteractionTrace } from '../types';
import { WasmKernel } from '../services/WasmKernel';
import * as Icons from 'lucide-react';

interface HostRuntimeProps {
  definition: AppDefinition;
  context: AppContext;
  setContext: React.Dispatch<React.SetStateAction<AppContext>>;
  onLog: (log: SystemLog) => void;
  onInteraction: (trace: InteractionTrace) => void;
}

export const HostRuntime: React.FC<HostRuntimeProps> = ({ definition, context, setContext, onLog, onInteraction }) => {
  const kernelRef = useRef<WasmKernel | null>(null);
  const [isKernelReady, setIsKernelReady] = useState(false);
  const [governanceError, setGovernanceError] = useState<string | null>(null);

  // Initialize WASM Kernel (Isolated Worker)
  const initKernel = useCallback(async () => {
       setIsKernelReady(false);
       setGovernanceError(null);
       
       if (!kernelRef.current) {
           kernelRef.current = new WasmKernel();
       }
       
       try {
           onLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: 'INFO', message: 'Booting WASM Sandbox (Worker)...' });
           await kernelRef.current.init(context, definition);
           setIsKernelReady(true);
           onLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: 'SUCCESS', message: 'Sandbox Active. RAM: 16MB. Timeout: 100ms.' });
       } catch (e: any) {
           onLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: 'ERROR', message: `WASM Boot Failed: ${e.message}` });
           setGovernanceError(e.message);
       }
  }, [definition, onLog]); 

  useEffect(() => {
    initKernel();
    return () => {
        kernelRef.current?.dispose();
    };
  }, [initKernel]);


  // --- EVENT DISPATCHER (Async & Governed) ---
  const sendEvent = useCallback(async (event: string, payload?: any, scopeId: string | 'root' = 'root') => {
    if (!kernelRef.current || !isKernelReady) {
        console.warn("WASM Kernel not ready");
        return;
    }

    onLog({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      source: 'HOST',
      type: 'INFO',
      message: `[${scopeId}] Event -> WASM: ${event}`
    });

    try {
        const start = performance.now();
        // Await the worker response (enforced by timeout in WasmKernel)
        const newContext = await kernelRef.current.dispatch(event, payload, scopeId);
        const end = performance.now();
        
        // Update React State (Host)
        setContext(newContext);
        
        onLog({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            source: 'HOST',
            type: 'INFO',
            message: `WASM Computed in ${(end - start).toFixed(2)}ms`
        });

    } catch (e: any) {
        // GOVERNANCE VIOLATION HANDLING
        const msg = e.message || 'Unknown Error';
        onLog({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            source: 'HOST',
            type: 'ERROR',
            message: `GOVERNANCE INTERVENTION: ${msg}`
        });

        if (msg.includes('terminated')) {
             setGovernanceError("Execution Timed Out. Sandbox restarted.");
             initKernel(); 
        }
    }
  }, [isKernelReady, onLog, setContext, initKernel]);


  // --- VIEW RENDERING (READ-ONLY) ---
  
  const resolveActorRead = (scopeId: string | 'root') => {
    if (scopeId === 'root') {
      return {
        state: context._sys?.rootState || definition.machine.initial,
        data: context
      };
    }
    const state = context._sys?.actorStates?.[scopeId];
    const data = context.actors?.[scopeId] || {};
    if (!state) return null;
    return { state, data };
  };

  const renderNode = (node: ViewNode, scopeId: string | 'root'): React.ReactNode => {
    const { id, type, props = {}, children, textBinding, valueBinding, onClick, onChange } = node;
    
    const actor = resolveActorRead(scopeId);
    if (!actor) return <div className="text-red-500 text-xs p-2">Dead Actor: {scopeId}</div>;
    const { data, state } = actor;

    let childrenContent: React.ReactNode = null;
    if (textBinding && data[textBinding] !== undefined) {
      childrenContent = data[textBinding];
    } else if (children) {
      if (type !== 'list') {
         childrenContent = children.map(child => <React.Fragment key={child.id}>{renderNode(child, scopeId)}</React.Fragment>);
      }
    }

    const commonProps = { key: id, ...props };

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onInteraction({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: 'click',
          targetId: id,
          event: onClick || 'none'
      });
      if (onClick) sendEvent(onClick, null, scopeId);
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onInteraction({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: 'input',
          targetId: id,
          event: onChange || 'UPDATE_CONTEXT'
      });
      if (onChange) {
         if (valueBinding) sendEvent(`UPDATE_CONTEXT:${valueBinding}`, e.target.value, scopeId);
         sendEvent(onChange, e.target.value, scopeId);
      }
    };

    switch (type) {
      case 'container': return <div {...commonProps}>{childrenContent}</div>;
      case 'card': return <div {...commonProps} className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-sm ${props.className || ''}`}>{childrenContent}</div>;
      case 'header': return <h1 {...commonProps}>{childrenContent}</h1>;
      case 'text':
        if (state === 'editing' && textBinding) {
             return <textarea {...commonProps} value={data[textBinding] || ''} onChange={(e) => sendEvent(`UPDATE_CONTEXT:${textBinding}`, e.target.value, scopeId)} />;
        }
        return <div {...commonProps}>{childrenContent}</div>;
      case 'button': return <button {...commonProps} onClick={handleClick}>{props.label || childrenContent || 'Button'}</button>;
      case 'input': return <input {...commonProps} value={valueBinding ? (data[valueBinding] || '') : undefined} onChange={handleInput} />;
      case 'list':
          const key = props.binding || textBinding;
          const items = (key && Array.isArray(data[key])) ? data[key] : [];
          return (
              <div {...commonProps}>
                  {items.length === 0 && <div className="text-zinc-600 italic p-2">No items</div>}
                  {items.map((item: any, idx: number) => {
                      const isActor = typeof item === 'string' && item.startsWith('actor_');
                      if (isActor && children && children.length > 0) {
                          return <div key={item} className="mb-2 last:mb-0">{children.map(child => <React.Fragment key={child.id}>{renderNode(child, item)}</React.Fragment>)}</div>
                      } else {
                          return <div key={idx} className="p-3 border-b border-zinc-800 last:border-0 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500/50"></div>{typeof item === 'string' ? item : JSON.stringify(item)}</div>;
                      }
                  })}
              </div>
          );
      case 'tabs':
          const activeTabId = valueBinding ? (data[valueBinding] || '') : '';
          return (
            <div {...commonProps} className={`flex flex-col gap-4 ${props.className || ''}`}>
              <div className="flex border-b border-zinc-800">
                {children?.map((child) => {
                   const tabValue = child.props?.value || child.id;
                   const label = child.props?.label || child.id;
                   const isActive = activeTabId === tabValue;
                   return <button key={`tab-btn-${child.id}`} onClick={() => valueBinding && sendEvent(`UPDATE_CONTEXT:${valueBinding}`, tabValue, scopeId)} className={`px-4 py-2 text-sm font-medium transition-all ${isActive ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>{label}</button>
                })}
              </div>
              <div className="min-h-[200px]">{children?.map(child => { if ((child.props?.value || child.id) !== activeTabId) return null; return <React.Fragment key={child.id}>{renderNode(child, scopeId)}</React.Fragment>; })}</div>
            </div>
          );
      default: return <div className="text-red-500">Unknown Node: {type}</div>;
    }
  };

  if (!isKernelReady && !governanceError) {
      return (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 animate-pulse">
              <Icons.ShieldCheck className="w-8 h-8 mb-4 text-indigo-500" />
              <div className="text-xs font-mono uppercase tracking-widest">Initializing Secure Sandbox</div>
              <div className="text-[10px] mt-2 text-zinc-600">Loading Worker & WASM...</div>
          </div>
      )
  }

  return (
    <div className="w-full h-full relative">
        {governanceError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-950/90 border border-rose-800 text-rose-200 px-4 py-2 rounded-lg text-xs shadow-xl flex items-center gap-2">
                <Icons.AlertTriangle className="w-4 h-4" />
                <span>{governanceError}</span>
                <button onClick={() => setGovernanceError(null)} className="ml-2 hover:text-white"><Icons.X className="w-3 h-3" /></button>
            </div>
        )}
        
        {renderNode(definition.view, 'root')}
        
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 text-[10px] text-zinc-500 rounded pointer-events-none flex items-center gap-2">
            <Icons.Lock className="w-3 h-3 text-emerald-500" />
            <span>WASM/Worker</span>
            <span className="w-[1px] h-3 bg-zinc-800 mx-1"></span>
            <span>16MB Cap</span>
        </div>
    </div>
  );
};
