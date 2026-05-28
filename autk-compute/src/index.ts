/**
 * @module AutkCompute
 * Public entry point for the `@urban-toolkit/autk-compute` package.
 *
 * This module re-exports the compute engine, pipeline helpers, viewpoint
 * utilities, and shared types used by package consumers.
 */

/** Unified compute engine. */
export { AutkComputeEngine } from './compute';

/** GPGPU compute pipeline. */
export { ComputeGpgpu } from './compute-gpgpu';

/** Render compute pipeline. */
export { ComputeRender } from './compute-render';

/** Viewpoint utilities. */
export {
    generateViewOrigins,
    expandCameraSamples,
    buildCameraMatrices,
} from './viewpoint';

/** Public pipeline parameter types. */
export type {
    RenderLayer,
    RenderCameraOptions,
    RenderPipelineParams,
    RenderViewpoints,
    RenderViewpointStrategy,
    GpgpuPipelineParams,
} from './api';

