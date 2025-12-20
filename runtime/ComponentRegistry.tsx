/**
 * COMPONENT REGISTRY - The Host's "Lego Box"
 * 
 * This is the hard-coded dictionary mapping string IDs (from AI proposals)
 * to actual React component factories. The AI cannot add to this registry,
 * only reference IDs that exist in it.
 * 
 * This is the "Safe List" that prevents Remote Code Execution (RCE).
 * 
 * SECURITY MODEL:
 * - AI sends: { "type": "Input.Slider", "props": { "min": 0, "max": 255 } }
 * - Registry returns: The actual <input type="range"> React component
 * - If ID not found: Render error placeholder (no crash, no code injection)
 */

import React from 'react';
import * as Icons from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Props that every registered component receives from the Assembler.
 */
export interface AssemblerProps {
  /** Unique node ID */
  id: string;
  
  /** Dispatch function for sending events to the state machine */
  dispatch: (event: string, payload?: unknown) => void;
  
  /** Current context data for this scope */
  data: Record<string, unknown>;
  
  /** Current state machine state */
  state: string;
  
  /** Scope ID (root or actor ID) */
  scopeId: string;
  
  /** Child renderer function */
  renderChildren?: () => React.ReactNode;
}

/**
 * Additional props from the AI proposal (visual, bindings, events).
 */
export interface NodeProps {
  /** CSS class name */
  className?: string;
  
  /** Inline styles */
  style?: React.CSSProperties;
  
  /** Data binding: reads from this context key */
  binding?: string;
  
  /** Value binding: two-way binding for inputs */
  valueBinding?: string;
  
  /** Text binding: reads text from this context key */
  textBinding?: string;
  
  /** Event to dispatch on click */
  onClick?: string;
  
  /** Event to dispatch on change */
  onChange?: string;
  
  /** Label for buttons, inputs */
  label?: string;
  
  /** Placeholder for inputs */
  placeholder?: string;
  
  /** Any additional props */
  [key: string]: unknown;
}

/**
 * Combined props type for component factories.
 */
export type ComponentProps = AssemblerProps & NodeProps;

/**
 * Component factory signature.
 */
export type ComponentFactory = (props: ComponentProps) => React.ReactElement | null;

/**
 * Prop schema for documentation and validation.
 */
export interface PropSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'function';
  required?: boolean;
  description?: string;
  default?: unknown;
}

/**
 * Component registration entry.
 */
export interface ComponentRegistration {
  /** The component factory */
  factory: ComponentFactory;
  
  /** Human-readable description */
  description: string;
  
  /** Allowed props schema */
  props: PropSchema[];
  
  /** Events this component can emit */
  events?: string[];
  
  /** Data type this component produces (for inputs) */
  outputType?: string;
  
  /** Data type this component consumes (for outputs) */
  inputType?: string;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

/**
 * Error placeholder for unknown component types.
 */
const UnknownComponent: React.FC<{ type: string; id: string }> = ({ type, id }) => (
  <div className="border border-red-800 bg-red-950/50 rounded p-2 text-red-400 text-xs">
    <span className="font-bold">Unknown Component:</span> {type} (id: {id})
  </div>
);

/**
 * Clock component with live updating.
 */
const ClockComponent: React.FC<{ className?: string }> = ({ className }) => {
  const [time, setTime] = React.useState(new Date());
  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className={`font-mono ${className || ''}`}>{time.toLocaleTimeString()}</span>;
};

/**
 * Chart component for data visualization.
 */
const ChartComponent: React.FC<{ data: unknown[]; color?: string; height?: number; className?: string }> = ({ 
  data, color = '#6366f1', height = 100, className 
}) => {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-[100px] w-full flex items-center justify-center bg-zinc-900/50 rounded border border-zinc-800 text-zinc-600 text-[10px]">
        No Data
      </div>
    );
  }
  
  const values = data.map(d => typeof d === 'number' ? d : ((d as {value?: number}).value || 0));
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
};

// ============================================================================
// COMPONENT FACTORIES
// ============================================================================

/**
 * Layout.Stack - Flexbox container
 */
const StackFactory: ComponentFactory = (props) => {
  const { className, renderChildren, style } = props;
  const direction = (props.direction as string) || 'column';
  const gap = (props.gap as string | number) || '1rem';
  
  return (
    <div 
      className={className}
      style={{ 
        display: 'flex', 
        flexDirection: direction as 'row' | 'column', 
        gap,
        ...style 
      }}
    >
      {renderChildren?.()}
    </div>
  );
};

/**
 * Layout.Container - Generic div container
 */
const ContainerFactory: ComponentFactory = (props) => {
  const { className, renderChildren, style } = props;
  return <div className={className} style={style}>{renderChildren?.()}</div>;
};

/**
 * Layout.Card - Styled card container
 */
const CardFactory: ComponentFactory = (props) => {
  const { className, renderChildren, style } = props;
  return (
    <div 
      className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-sm ${className || ''}`}
      style={style}
    >
      {renderChildren?.()}
    </div>
  );
};

/**
 * Display.Text - Text display
 */
const TextFactory: ComponentFactory = (props) => {
  const { className, style, data, textBinding, label } = props;
  const content = textBinding && data[textBinding] !== undefined 
    ? String(data[textBinding]) 
    : (label || props.renderChildren?.());
  return <div className={className} style={style}>{content}</div>;
};

/**
 * Display.Header - Header text
 */
const HeaderFactory: ComponentFactory = (props) => {
  const { className, style, data, textBinding, label, renderChildren } = props;
  const content = textBinding && data[textBinding] !== undefined 
    ? String(data[textBinding]) 
    : (label || renderChildren?.());
  return <h1 className={`text-xl font-bold ${className || ''}`} style={style}>{content}</h1>;
};

/**
 * Control.Button - Clickable button
 */
const ButtonFactory: ComponentFactory = (props) => {
  const { id, className, style, dispatch, onClick, label, scopeId, renderChildren } = props;
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      dispatch(onClick);
    }
  };
  
  return (
    <button 
      className={className} 
      style={style}
      onClick={handleClick}
    >
      {label || renderChildren?.() || 'Button'}
    </button>
  );
};

/**
 * Input.Text - Text input field
 */
const TextInputFactory: ComponentFactory = (props) => {
  const { className, style, data, valueBinding, onChange, dispatch, placeholder } = props;
  
  const value = valueBinding && data[valueBinding] !== undefined 
    ? String(data[valueBinding]) 
    : '';
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (valueBinding) {
      dispatch(`UPDATE_CONTEXT:${valueBinding}`, val);
    }
    if (onChange) {
      dispatch(onChange, val);
    }
  };
  
  return (
    <input 
      type="text"
      className={className}
      style={style}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
    />
  );
};

/**
 * Input.Slider - Range slider
 */
const SliderFactory: ComponentFactory = (props) => {
  const { className, style, data, valueBinding, onChange, dispatch } = props;
  const min = (props.min as number) ?? 0;
  const max = (props.max as number) ?? 100;
  const step = (props.step as number) ?? 1;
  
  const value = valueBinding && data[valueBinding] !== undefined 
    ? Number(data[valueBinding]) 
    : min;
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (valueBinding) {
      dispatch(`UPDATE_CONTEXT:${valueBinding}`, val);
    }
    if (onChange) {
      dispatch(onChange, val);
    }
  };
  
  return (
    <input 
      type="range"
      className={className}
      style={style}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={handleChange}
    />
  );
};

/**
 * Input.Toggle - Boolean toggle switch
 */
const ToggleFactory: ComponentFactory = (props) => {
  const { className, style, data, valueBinding, onChange, dispatch, label } = props;
  
  const checked = valueBinding && data[valueBinding] !== undefined 
    ? Boolean(data[valueBinding]) 
    : false;
  
  const handleChange = () => {
    if (valueBinding) {
      dispatch(`UPDATE_CONTEXT:${valueBinding}`, !checked);
    }
    if (onChange) {
      dispatch(onChange, !checked);
    }
  };
  
  return (
    <label className={`flex items-center gap-2 cursor-pointer ${className || ''}`} style={style}>
      <div 
        onClick={handleChange}
        className={`w-10 h-6 rounded-full relative transition-colors ${checked ? 'bg-indigo-600' : 'bg-zinc-700'}`}
      >
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </div>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
};

/**
 * Input.File - File upload input
 */
const FileInputFactory: ComponentFactory = (props) => {
  const { className, style, valueBinding, onChange, dispatch } = props;
  const accept = (props.accept as string) || '*/*';
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (typeof ev.target?.result === 'string') {
          if (valueBinding) {
            dispatch(`UPDATE_CONTEXT:${valueBinding}`, ev.target.result);
          }
          if (onChange) {
            dispatch(onChange, ev.target.result);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };
  
  return (
    <input 
      type="file"
      accept={accept}
      onChange={handleChange}
      className={`block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 ${className || ''}`}
      style={style}
    />
  );
};

/**
 * Display.Canvas - Image/vector display
 */
const CanvasFactory: ComponentFactory = (props) => {
  const { className, style, data, textBinding, binding } = props;
  const src = (textBinding && data[textBinding]) || (binding && data[binding]);
  
  if (!src) {
    return (
      <div 
        className={`bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center text-zinc-700 text-xs ${className || 'h-32'}`}
        style={style}
      >
        No Image
      </div>
    );
  }
  
  return (
    <img 
      src={String(src)} 
      alt="Output" 
      className={`rounded border border-zinc-800 object-contain bg-black ${className || ''}`}
      style={style}
    />
  );
};

/**
 * Display.Chart - Data visualization
 */
const ChartFactory: ComponentFactory = (props) => {
  const { className, style, data, textBinding, binding } = props;
  const chartData = (textBinding && data[textBinding]) || (binding && data[binding]) || [];
  const color = (props.color as string) || '#6366f1';
  const height = (props.height as number) || 100;
  
  return (
    <ChartComponent 
      data={Array.isArray(chartData) ? chartData : []}
      color={color}
      height={height}
      className={className}
    />
  );
};

/**
 * Display.Clock - Live clock
 */
const ClockFactory: ComponentFactory = (props) => {
  const { className } = props;
  return <ClockComponent className={className} />;
};

/**
 * Display.Icon - Lucide icon
 */
const IconFactory: ComponentFactory = (props) => {
  const { className, style, dispatch, onClick } = props;
  const iconName = (props.name as string) || 'HelpCircle';
  const IconComp = (Icons as Record<string, React.FC<{className?: string; style?: React.CSSProperties}>>)[iconName] || Icons.HelpCircle;
  
  const handleClick = onClick ? (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(onClick);
  } : undefined;
  
  return <IconComp className={className} style={style} onClick={handleClick} />;
};

/**
 * Display.List - List rendering
 */
const ListFactory: ComponentFactory = (props) => {
  const { className, style, data, textBinding, binding, renderChildren } = props;
  const key = binding || textBinding;
  const items = (key && Array.isArray(data[key])) ? data[key] as unknown[] : [];
  
  return (
    <div className={className} style={style}>
      {items.length === 0 && (
        <div className="text-zinc-600 italic p-2">No items</div>
      )}
      {items.map((item, idx) => {
        const isActor = typeof item === 'string' && item.startsWith('actor_');
        if (isActor && renderChildren) {
          return (
            <div key={String(item)} className="mb-2 last:mb-0">
              {renderChildren()}
            </div>
          );
        }
        return (
          <div key={idx} className="p-3 border-b border-zinc-800 last:border-0">
            {typeof item === 'string' ? item : JSON.stringify(item)}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Overlay.Modal - Modal dialog
 */
const ModalFactory: ComponentFactory = (props) => {
  const { data, valueBinding, dispatch, renderChildren } = props;
  const title = (props.title as string) || '';
  const isOpen = valueBinding ? !!data[valueBinding] : false;
  
  if (!isOpen) return null;
  
  const handleClose = () => {
    if (valueBinding) {
      dispatch(`UPDATE_CONTEXT:${valueBinding}`, false);
    }
  };
  
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" 
      onClick={handleClose}
    >
      <div 
        className={`bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-auto ${props.className || ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
            <button onClick={handleClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <Icons.X className="w-5 h-5" />
            </button>
          </div>
        )}
        {renderChildren?.()}
      </div>
    </div>
  );
};

/**
 * Overlay.Toast - Toast notification
 */
const ToastFactory: ComponentFactory = (props) => {
  const { data, valueBinding, textBinding } = props;
  const isVisible = valueBinding ? !!data[valueBinding] : false;
  const message = textBinding ? String(data[textBinding] || '') : (props.message as string) || '';
  const toastType = (props.type as 'info' | 'success' | 'error' | 'warning') || 'info';
  
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
    <div className={`fixed bottom-4 right-4 z-40 px-4 py-3 rounded-lg border shadow-lg flex items-center gap-2 ${colors[toastType]} ${props.className || ''}`}>
      {icons[toastType]}
      <span className="text-sm">{message}</span>
    </div>
  );
};

// ============================================================================
// THE COMPONENT REGISTRY
// ============================================================================

/**
 * The Component Registry - maps string IDs to React component factories.
 * 
 * This is the "Rosetta Stone" between the AI's JSON and React.
 * The AI can only reference IDs that exist in this registry.
 */
export const COMPONENT_REGISTRY: Record<string, ComponentRegistration> = {
  // === LAYOUT COMPONENTS ===
  'Layout.Stack': {
    factory: StackFactory,
    description: 'Flexbox container with configurable direction and gap',
    props: [
      { name: 'direction', type: 'string', description: 'row | column', default: 'column' },
      { name: 'gap', type: 'string', description: 'Gap between children', default: '1rem' },
    ],
  },
  'Layout.Container': {
    factory: ContainerFactory,
    description: 'Generic container div',
    props: [],
  },
  'Layout.Card': {
    factory: CardFactory,
    description: 'Styled card with border and shadow',
    props: [],
  },
  // Legacy aliases
  'container': { factory: ContainerFactory, description: 'Alias for Layout.Container', props: [] },
  'card': { factory: CardFactory, description: 'Alias for Layout.Card', props: [] },
  
  // === DISPLAY COMPONENTS ===
  'Display.Text': {
    factory: TextFactory,
    description: 'Text display, can bind to context',
    props: [
      { name: 'textBinding', type: 'string', description: 'Context key to display' },
      { name: 'label', type: 'string', description: 'Static text if no binding' },
    ],
    inputType: 'string',
  },
  'Display.Header': {
    factory: HeaderFactory,
    description: 'Header text (h1)',
    props: [
      { name: 'textBinding', type: 'string', description: 'Context key to display' },
      { name: 'label', type: 'string', description: 'Static text if no binding' },
    ],
    inputType: 'string',
  },
  'Display.Canvas': {
    factory: CanvasFactory,
    description: 'Image/vector display canvas',
    props: [
      { name: 'textBinding', type: 'string', description: 'Context key with image data' },
    ],
    inputType: 'image',
  },
  'Display.Chart': {
    factory: ChartFactory,
    description: 'Line chart for data visualization',
    props: [
      { name: 'textBinding', type: 'string', description: 'Context key with data array' },
      { name: 'color', type: 'string', description: 'Line color', default: '#6366f1' },
      { name: 'height', type: 'number', description: 'Chart height in pixels', default: 100 },
    ],
    inputType: 'array',
  },
  'Display.Clock': {
    factory: ClockFactory,
    description: 'Live clock display',
    props: [],
  },
  'Display.Icon': {
    factory: IconFactory,
    description: 'Lucide icon',
    props: [
      { name: 'name', type: 'string', required: true, description: 'Icon name from Lucide' },
    ],
  },
  'Display.List': {
    factory: ListFactory,
    description: 'List rendering for arrays',
    props: [
      { name: 'binding', type: 'string', description: 'Context key with array data' },
    ],
    inputType: 'array',
  },
  // Legacy aliases
  'text': { factory: TextFactory, description: 'Alias for Display.Text', props: [] },
  'text-display': { factory: TextFactory, description: 'Alias for Display.Text', props: [] },
  'header': { factory: HeaderFactory, description: 'Alias for Display.Header', props: [] },
  'canvas': { factory: CanvasFactory, description: 'Alias for Display.Canvas', props: [] },
  'chart': { factory: ChartFactory, description: 'Alias for Display.Chart', props: [] },
  'clock': { factory: ClockFactory, description: 'Alias for Display.Clock', props: [] },
  'icon': { factory: IconFactory, description: 'Alias for Display.Icon', props: [] },
  'list': { factory: ListFactory, description: 'Alias for Display.List', props: [] },
  
  // === CONTROL COMPONENTS ===
  'Control.Button': {
    factory: ButtonFactory,
    description: 'Clickable button that dispatches events',
    props: [
      { name: 'onClick', type: 'string', description: 'Event to dispatch on click' },
      { name: 'label', type: 'string', description: 'Button text' },
    ],
    events: ['onClick'],
  },
  // Legacy alias
  'button': { factory: ButtonFactory, description: 'Alias for Control.Button', props: [], events: ['onClick'] },
  
  // === INPUT COMPONENTS ===
  'Input.Text': {
    factory: TextInputFactory,
    description: 'Text input field',
    props: [
      { name: 'valueBinding', type: 'string', description: 'Context key for two-way binding' },
      { name: 'placeholder', type: 'string', description: 'Placeholder text' },
      { name: 'onChange', type: 'string', description: 'Event to dispatch on change' },
    ],
    events: ['onChange'],
    outputType: 'string',
  },
  'Input.Slider': {
    factory: SliderFactory,
    description: 'Numeric range slider',
    props: [
      { name: 'valueBinding', type: 'string', description: 'Context key for two-way binding' },
      { name: 'min', type: 'number', description: 'Minimum value', default: 0 },
      { name: 'max', type: 'number', description: 'Maximum value', default: 100 },
      { name: 'step', type: 'number', description: 'Step increment', default: 1 },
      { name: 'onChange', type: 'string', description: 'Event to dispatch on change' },
    ],
    events: ['onChange'],
    outputType: 'number',
  },
  'Input.Toggle': {
    factory: ToggleFactory,
    description: 'Boolean toggle switch',
    props: [
      { name: 'valueBinding', type: 'string', description: 'Context key for two-way binding' },
      { name: 'label', type: 'string', description: 'Label text' },
      { name: 'onChange', type: 'string', description: 'Event to dispatch on change' },
    ],
    events: ['onChange'],
    outputType: 'boolean',
  },
  'Input.File': {
    factory: FileInputFactory,
    description: 'File upload input',
    props: [
      { name: 'valueBinding', type: 'string', description: 'Context key to store file data' },
      { name: 'accept', type: 'string', description: 'Accepted file types', default: '*/*' },
      { name: 'onChange', type: 'string', description: 'Event to dispatch on file select' },
    ],
    events: ['onChange'],
    outputType: 'string', // DataURL
  },
  // Legacy aliases
  'input': { factory: TextInputFactory, description: 'Alias for Input.Text', props: [], events: ['onChange'], outputType: 'string' },
  'text-input': { factory: TextInputFactory, description: 'Alias for Input.Text', props: [], events: ['onChange'], outputType: 'string' },
  'slider': { factory: SliderFactory, description: 'Alias for Input.Slider', props: [], events: ['onChange'], outputType: 'number' },
  'file-input': { factory: FileInputFactory, description: 'Alias for Input.File', props: [], events: ['onChange'], outputType: 'string' },
  
  // === OVERLAY COMPONENTS ===
  'Overlay.Modal': {
    factory: ModalFactory,
    description: 'Modal dialog overlay',
    props: [
      { name: 'valueBinding', type: 'string', description: 'Context key controlling open state' },
      { name: 'title', type: 'string', description: 'Modal title' },
    ],
    events: ['onClose'],
  },
  'Overlay.Toast': {
    factory: ToastFactory,
    description: 'Toast notification',
    props: [
      { name: 'valueBinding', type: 'string', description: 'Context key controlling visibility' },
      { name: 'textBinding', type: 'string', description: 'Context key for message' },
      { name: 'type', type: 'string', description: 'info | success | error | warning', default: 'info' },
    ],
  },
  // Legacy aliases
  'modal': { factory: ModalFactory, description: 'Alias for Overlay.Modal', props: [] },
  'toast': { factory: ToastFactory, description: 'Alias for Overlay.Toast', props: [] },
};

// ============================================================================
// REGISTRY HELPERS
// ============================================================================

/**
 * Get a component factory by type ID.
 */
export function getComponentFactory(type: string): ComponentFactory | null {
  return COMPONENT_REGISTRY[type]?.factory || null;
}

/**
 * Check if a component type is registered.
 */
export function isValidComponentType(type: string): boolean {
  return type in COMPONENT_REGISTRY;
}

/**
 * Get all registered component type IDs.
 */
export function getRegisteredTypes(): string[] {
  return Object.keys(COMPONENT_REGISTRY);
}

/**
 * Generate documentation for the AI prompt.
 */
export function generateComponentDocsForPrompt(): string {
  const lines: string[] = [
    '# UI COMPONENT REGISTRY',
    'These are the available UI components. Use the type ID in your ui_schema.',
    '',
  ];
  
  // Group by prefix
  const groups: Record<string, string[]> = {
    'Layout': [],
    'Display': [],
    'Control': [],
    'Input': [],
    'Overlay': [],
  };
  
  for (const [type, reg] of Object.entries(COMPONENT_REGISTRY)) {
    // Skip legacy aliases (lowercase)
    if (type[0] === type[0].toLowerCase()) continue;
    
    const prefix = type.split('.')[0];
    if (groups[prefix]) {
      const propsStr = reg.props
        .filter(p => p.required || !p.default)
        .map(p => `${p.name}: ${p.type}${p.required ? ' (required)' : ''}`)
        .join(', ');
      groups[prefix].push(`- ${type}: ${reg.description}${propsStr ? ` [${propsStr}]` : ''}`);
    }
  }
  
  for (const [group, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    lines.push(`## ${group}`);
    lines.push(...items);
    lines.push('');
  }
  
  return lines.join('\n');
}
