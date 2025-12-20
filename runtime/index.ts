/**
 * RUNTIME MODULE - The Execution Kernel Components
 * 
 * This module provides:
 * - ComponentRegistry: The "Safe List" of React components
 * - RuntimeAssembler: The "Factory" that hydrates JSON to React
 * 
 * Together they implement the "Host Runtime" that executes validated proposals.
 */

export * from './ComponentRegistry';
export * from './RuntimeAssembler';
