/**
 * Single aggregation point for all `autk-core` re-exports used within `@urban-toolkit/autk-plot`.
 *
 * Internal modules import from here instead of directly from `autk-core`,
 * keeping the dependency edge explicit and centralized.
 */

// ─── Color mapping ───────────────────────────────────────────────────────────

/** Strategy enum controlling how a colormap domain is derived from data. */
export { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';
/** Colormap utility with conversions and data-to-color sampling helpers. */
export { ColorMap } from '@urban-toolkit/autk-core';

/** Core color and colormap type re-exports consumed by `@urban-toolkit/autk-plot`. */
export type { ColorHEX, ColorRGB, ColorTEX } from '@urban-toolkit/autk-core';
/** Core color-domain type re-exports consumed by `@urban-toolkit/autk-plot`. */
export type { ColorMapConfig, ColorMapDomainSpec, ResolvedDomain } from '@urban-toolkit/autk-core';

// ─── Events ──────────────────────────────────────────────────────────────────

/** Typed event emitter re-export used by plot event APIs. */
export { EventEmitter } from '@urban-toolkit/autk-core';
/** Event helper type re-exports used throughout the package. */
export type { EventListener, SelectionData } from '@urban-toolkit/autk-core';

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Dot-path accessor re-export used for plot and transform data lookup. */
export { valueAtPath } from '@urban-toolkit/autk-core';
