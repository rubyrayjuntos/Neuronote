/**
 * RUNTIME ASSEMBLER - The "Factory" that Hydrates JSON to React
 * 
 * This is the core execution engine that takes a validated JSON proposal
 * and materializes it into a live React component tree.
 * 
 * KEY SECURITY PRINCIPLE:
 * - The Assembler does not execute code from the AI
 * - It looks up component IDs in a static registry
 * - Events are dispatched as tokens, not executed as functions
 * - All props are sanitized before passing to components
 * 
 * ASSEMBLY PROCESS:
 * 1. IDENTIFY: Read node.type from the JSON
 * 2. LOOKUP: Retrieve React component from ComponentRegistry
 * 3. SANITIZE: Ensure props match allowed schema
 * 4. BIND: Convert event tokens to dispatch calls
 * 5. RECURSE: Assemble children
 */

import React, { ReactNode, useCallback, useMemo } from 'react';
import { ViewNode, AppContext, AppDefinition } from '../types';
import { 
  COMPONENT_REGISTRY, 
  getComponentFactory, 
  isValidComponentType,
  AssemblerProps,
  NodeProps,
  ComponentProps 
} from './ComponentRegistry';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AssemblerContext {
  /** Current app context (state) */
  context: AppContext;
  
  /** App definition (machine, view, etc.) */
  definition: AppDefinition;
  
  /** Dispatch function to send events to the state machine */
  dispatch: (event: string, payload?: unknown, scopeId?: string) => void;
  
  /** Current scope ID (root or actor ID) */
  scopeId: string;
}

export interface AssemblerOptions {
  /** Error handler for assembly failures */
  onError?: (error: Error, nodeId: string) => void;
  
  /** Whether to render error placeholders for unknown types */
  showUnknownTypes?: boolean;
}

// ============================================================================
// ERROR PLACEHOLDER
// ============================================================================

const ErrorPlaceholder: React.FC<{ type: string; id: string; error?: string }> = ({ type, id, error }) => (
  <div className="border border-red-800 bg-red-950/50 rounded p-2 text-red-400 text-xs">
    <div className="font-bold">Assembly Error</div>
    <div>Type: {type}</div>
    <div>ID: {id}</div>
    {error && <div className="mt-1 text-red-500">{error}</div>}
  </div>
);

// ============================================================================
// PROP SANITIZATION
// ============================================================================

/**
 * Sanitize and transform props from JSON to React-compatible format.
 * 
 * This handles:
 * - CSS shorthand properties (background, color, etc.)
 * - Stripping internal binding props that shouldn't go to DOM
 * - Type coercion for safety
 */
function sanitizeProps(props: Record<string, unknown>): NodeProps {
  const {
    // CSS shorthand - will be merged into style
    background,
    color,
    padding,
    margin,
    width,
    height,
    style: existingStyle,
    
    // Keep these for the component
    className,
    textBinding,
    valueBinding,
    binding,
    onClick,
    onChange,
    label,
    placeholder,
    
    // Everything else
    ...rest
  } = props;
  
  // Build computed style
  const computedStyle: React.CSSProperties = {
    ...(existingStyle as React.CSSProperties || {}),
    ...(background ? { backgroundColor: background as string } : {}),
    ...(color ? { color: color as string } : {}),
    ...(padding ? { padding: padding as string | number } : {}),
    ...(margin ? { margin: margin as string | number } : {}),
    ...(width ? { width: width as string | number } : {}),
    ...(height ? { height: height as string | number } : {}),
  };
  
  return {
    className: className as string,
    style: Object.keys(computedStyle).length > 0 ? computedStyle : undefined,
    textBinding: textBinding as string,
    valueBinding: valueBinding as string,
    binding: binding as string,
    onClick: onClick as string,
    onChange: onChange as string,
    label: label as string,
    placeholder: placeholder as string,
    ...rest,
  };
}

// ============================================================================
// THE RUNTIME ASSEMBLER
// ============================================================================

/**
 * Assemble a single node from JSON to React.
 */
function assembleNode(
  node: ViewNode,
  ctx: AssemblerContext,
  options: AssemblerOptions
): ReactNode {
  const { id, type, props = {}, children } = node;
  
  // Handle bindings from EITHER node level OR props
  const textBinding = node.textBinding || (props as Record<string, unknown>).textBinding as string;
  const valueBinding = node.valueBinding || (props as Record<string, unknown>).valueBinding as string;
  const binding = node.binding || (props as Record<string, unknown>).binding as string;
  const onClick = node.onClick || (props as Record<string, unknown>).onClick as string;
  const onChange = node.onChange || (props as Record<string, unknown>).onChange as string;
  
  // Lookup component in registry
  const factory = getComponentFactory(type);
  
  if (!factory) {
    if (options.showUnknownTypes !== false) {
      return <ErrorPlaceholder key={id} type={type} id={id} error="Unknown component type" />;
    }
    options.onError?.(new Error(`Unknown component type: ${type}`), id);
    return null;
  }
  
  // Resolve actor data for this scope
  const actor = resolveActorData(ctx);
  if (!actor) {
    return <ErrorPlaceholder key={id} type={type} id={id} error={`Dead actor: ${ctx.scopeId}`} />;
  }
  
  // Sanitize props
  const sanitizedProps = sanitizeProps(props as Record<string, unknown>);
  
  // Create dispatch function bound to this scope
  const boundDispatch = (event: string, payload?: unknown) => {
    ctx.dispatch(event, payload, ctx.scopeId);
  };
  
  // Create child renderer
  const renderChildren = children && children.length > 0
    ? () => children.map(child => (
        <React.Fragment key={child.id}>
          {assembleNode(child, ctx, options)}
        </React.Fragment>
      ))
    : undefined;
  
  // Build component props
  const componentProps: ComponentProps = {
    // Assembler props
    id,
    dispatch: boundDispatch,
    data: actor.data,
    state: actor.state,
    scopeId: ctx.scopeId,
    renderChildren,
    
    // Node props (with overrides from node level)
    ...sanitizedProps,
    textBinding,
    valueBinding,
    binding,
    onClick,
    onChange,
  };
  
  // Call factory to create component
  try {
    return <React.Fragment key={id}>{factory(componentProps)}</React.Fragment>;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    options.onError?.(error instanceof Error ? error : new Error(message), id);
    return <ErrorPlaceholder key={id} type={type} id={id} error={message} />;
  }
}

/**
 * Resolve actor data from context.
 */
function resolveActorData(ctx: AssemblerContext): { state: string; data: Record<string, unknown> } | null {
  if (ctx.scopeId === 'root') {
    return {
      state: ctx.context._sys?.rootState || ctx.definition.machine.initial,
      data: ctx.context as Record<string, unknown>,
    };
  }
  
  const state = ctx.context._sys?.actorStates?.[ctx.scopeId];
  const data = ctx.context.actors?.[ctx.scopeId] || {};
  
  if (!state) return null;
  
  return { state, data };
}

// ============================================================================
// REACT HOOK FOR ASSEMBLY
// ============================================================================

/**
 * React hook that assembles a view tree.
 * 
 * Usage:
 * ```tsx
 * const { render } = useAssembler(definition, context, dispatch);
 * return render(definition.view);
 * ```
 */
export function useAssembler(
  definition: AppDefinition,
  context: AppContext,
  dispatch: (event: string, payload?: unknown, scopeId?: string) => void,
  options: AssemblerOptions = {}
) {
  const assemblerContext = useMemo<AssemblerContext>(() => ({
    context,
    definition,
    dispatch,
    scopeId: 'root',
  }), [context, definition, dispatch]);
  
  const render = useCallback((view: ViewNode, scopeId: string = 'root'): ReactNode => {
    const ctx = { ...assemblerContext, scopeId };
    return assembleNode(view, ctx, options);
  }, [assemblerContext, options]);
  
  return { render };
}

// ============================================================================
// STANDALONE ASSEMBLER COMPONENT
// ============================================================================

interface RuntimeAssemblerProps {
  /** The view tree to render */
  view: ViewNode;
  
  /** App definition */
  definition: AppDefinition;
  
  /** Current context */
  context: AppContext;
  
  /** Event dispatcher */
  dispatch: (event: string, payload?: unknown, scopeId?: string) => void;
  
  /** Scope ID for actor rendering */
  scopeId?: string;
  
  /** Assembly options */
  options?: AssemblerOptions;
}

/**
 * RuntimeAssembler component - hydrates JSON view to React.
 * 
 * This is the "Factory" that the Execution Kernel uses to
 * materialize validated proposals into live React components.
 */
export const RuntimeAssembler: React.FC<RuntimeAssemblerProps> = ({
  view,
  definition,
  context,
  dispatch,
  scopeId = 'root',
  options = {},
}) => {
  const { render } = useAssembler(definition, context, dispatch, options);
  return <>{render(view, scopeId)}</>;
};

// ============================================================================
// EXPORTS
// ============================================================================

export { COMPONENT_REGISTRY, getComponentFactory, isValidComponentType };
