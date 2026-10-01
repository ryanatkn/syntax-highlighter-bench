<script lang="ts" module>
	// packages/layerchart/src/lib/components/Legend.svelte
  import type { Snippet } from 'svelte';
  import type { Placement } from './types.js';
  import { asAny, type Without } from '$lib/utils/types.js';

  export type LegendItem = {
    value: any;
    color: string;
  };

  export type LegendPropsWithoutHTML = {
    scale?: AnyScale;

    /**
     * The title of the legend.
     *
     * @default ''
     */
    title?: string;

    /**
     * The width of the legend.
     *
     * @default 320
     */
    width?: number;

    /**
     * The height of the legend.
     *
     * @default 10
     */
    height?: number;

    /**
     * The number of ticks to show on the scale.
     * @default width / 64
     */
    ticks?: number;
    tickFormat?: FormatType | FormatConfig;
    tickValues?: any[];
    /**
     * The font size of the tick labels.
     *
     * @default 10
     */
    tickFontSize?: number;

    /**
     * The length of the tick marks.
     *
     * @default 4
     */
    tickLength?: number;

    /**
     * The placement of the legend.
     */
    placement?: Placement;

    /**
     * The orientation of the legend.
     *
     * @default 'horizontal'
     */
    orientation?: 'horizontal' | 'vertical';

    /**
     * Determine display ramp (individual color swatches or continuous ramp)
     *
     * @default 'ramp'
     */
    variant?: 'ramp' | 'swatches';

    /**
     * An array of selected items. If provided, the legend fades unselected items.
     */
    selected?: string[];

    /**
     * Value to indicate on the ramp (e.g. the currently hovered data point).
     * When set, a downward-pointing arrow is drawn above the bar at this value's
     * position. Defaults to auto-detecting from `ctx.tooltip.data` via the
     * chart's color accessor (`ctx.c`).
     */
    value?: number | string | null;

    /**
     * Classes to apply to the elements.
     *
     * @default {}
     */
    classes?: {
      root?: string;
      title?: string;
      label?: string;
      tick?: string;
      items?: string;
      swatch?: string;
      item?: string | ((item: LegendItem) => string);
    };

    onclick?: (e: MouseEvent, detail: LegendItem) => any;
    onpointerenter?: (e: MouseEvent, detail: LegendItem) => any;
    onpointerleave?: (e: MouseEvent, detail: LegendItem) => any;

    /**
     * A bindable reference to the wrapping `<div>` element.
     *
     * @bindable
     */
    ref?: HTMLElement;

    children?: Snippet<
      [
        {
          values: any[];
          scale: AnyScale | null;
          seriesItems: Array<{ key: string; label: string; color: string }> | null;
        },
      ]
    >;
  };

  export type LegendProps = LegendPropsWithoutHTML &
    Without<HTMLAttributes<HTMLElement>, LegendPropsWithoutHTML>;

	// packages/layerchart/src/lib/components/layers/Canvas.svelte
  import type { ComponentNode } from '$lib/contexts/chart.js';
  import type { ChartState } from '$lib/states/chart.svelte.js';

  type SSRCaptureTarget = {
    chartState?: ChartState<any, any, any>;
    rootNode?: ComponentNode;
  };

  export type CanvasPropsWithoutHTML = {
    /**
     * The `<canvas>` tag. Useful for bindings.
     *
     * @bindable
     */
    ref?: HTMLCanvasElement;

    /**
     * The `<canvas>`'s 2d context. Useful for bindings.
     *
     * @bindable
     */
    canvasContext?: CanvasRenderingContext2D;

    /**
     * Force the use of a software (instead of hardware accelerated) 2D canvas, which can
     * save memory when calling getImageData() frequently.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext#willreadfrequently
     *
     * @default false
     */
    willReadFrequently?: boolean;

    /**
     * The `z-index` style to apply to the layer.
     *
     * @default 0
     */
    zIndex?: number;

    /**
     *
     * Whether pointer events should be enabled on the canvas.
     *
     * - `false`: `pointer-events: none;` will be set on the entire layer.
     * - `true`: pointer events will operate normally.
     *
     * @default true
     */
    pointerEvents?: boolean;

    /**
     * The content to display if canvas is not supported or cannot be rendered.
     * This can either be a string or a snippet with custom markup.
     */
    fallback?: string | Snippet;

    /**
     * Translate children to center of the canvas (useful for radial layouts).
     *
     * @default false
     */
    center?: boolean | 'x' | 'y';

    /**
     * Ignore TransformContext.
     *
     * Useful to add static elements such as legends.
     *
     * @default false
     */
    ignoreTransform?: boolean;

    /**
     * Disable the hit canvas (useful when animations are playing)
     *
     * @default false
     */
    disableHitCanvas?: boolean;

    /**
     * Show the hit canvas for debugging purposes.
     *
     * @default false
     */
    debug?: boolean;

    /** @internal Server-side capture target used by layerchart/server. */
    ssrCapture?: SSRCaptureTarget;

    /** @internal Server-side capture callback used by layerchart/server. */
    ssrCaptureCallback?: (data: SSRCaptureTarget) => void;

    children?: Snippet<
      [{ ref: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D | undefined }]
    >;
  };

  export type CanvasProps = CanvasPropsWithoutHTML &
    Without<HTMLCanvasAttributes, CanvasPropsWithoutHTML>;
</script>

<script lang="ts">
	// packages/layerchart/src/lib/components/Legend.svelte
  import type { HTMLAttributes, SVGAttributes } from 'svelte/elements';
  import { scaleBand, scaleLinear } from 'd3-scale';
  import { quantize, interpolate, interpolateRound } from 'd3-interpolate';
  import { quantile, range } from 'd3-array';
  import { format, type FormatType, type FormatConfig } from '@layerstack/utils';

  import ColorRamp from './ColorRamp.svelte';
  import { cls } from '@layerstack/tailwind';
  import type { AnyScale } from '$lib/utils/scales.svelte.js';
  import { getChartContext } from '$lib/contexts/chart.js';
  import { extractLayerProps } from '$lib/utils/attributes.js';
  import { resolveMaybeFn } from '$lib/utils/common.js';

  let {
    scale: scaleProp,
    title = '',
    width = 320,
    height = 10,
    ticks = width / 64,
    tickFormat: tickFormatProp,
    tickValues: tickValuesProp,
    tickFontSize = 10,
    tickLength: tickLengthProp = 4,
    placement,
    orientation = 'horizontal',
    onclick: onclickProp,
    onpointerenter: onpointerenterProp,
    onpointerleave: onpointerleaveProp,
    variant: variantProp,
    selected: selectedProp,
    value: valueProp,
    classes = {},
    ref: refProp = $bindable(),
    class: className,
    children,
    ...restProps
  }: LegendProps = $props();

  let ref = $state<HTMLElement>();
  $effect.pre(() => {
    refProp = ref;
  });

  const ctx = getChartContext();

  // Check if we should use series-based legend (multiple series with colors defined)
  const hasSeriesWithColors = $derived.by(() => {
    if (!ctx.series) return false;
    const allSeries = ctx.series.series ?? [];
    // Check if we have multiple series OR a non-default series with colors
    return allSeries.length > 0 && !ctx.series.isDefaultSeries && allSeries.some((s) => s.color);
  });

  // Use series-based legend if we have series with colors, otherwise use scale
  const scale = $derived(hasSeriesWithColors ? null : (scaleProp ?? ctx.cScale));

  // Create series items for series-based legend
  const seriesItems = $derived.by(() => {
    if (!hasSeriesWithColors || !ctx.series) return null;

    // Get ALL series (not just visible) so legend items remain visible when deselected
    const allSeries = ctx.series.series ?? [];
    if (allSeries.length === 0) return null;

    return allSeries
      .filter((s) => s && s.key) // Filter out any invalid series
      .map((s) => {
        // Get label - prefer explicit label, then key
        let label = s.label ?? s.key;

        // If label is somehow not a string, convert it to string or use key
        if (typeof label !== 'string') {
          label = String(s.key);
        }

        return {
          key: s.key,
          label,
          color: s.color ?? 'currentColor',
        };
      });
  });

  type ScaleConfig = {
    xScale: AnyScale | undefined;
    interpolator: ((t: number) => string) | undefined;
    swatches: SVGAttributes<SVGRectElement>[] | undefined;
    tickLabelOffset: number;
    tickLine: boolean;
    tickValues: any[] | undefined;
    tickLength: number;
  };

  const scaleConfig: ScaleConfig = $derived.by(() => {
    if (!scale) {
      return {
        xScale: undefined,
        interpolator: undefined,
        swatches: undefined,
        tickLabelOffset: 0,
        tickLine: true,
        tickLength: tickLengthProp,
        tickFormat: tickFormatProp,
        tickValues: tickValuesProp,
      };
    } else if (scale.interpolate) {
      // Continuous
      const n = Math.min(scale.domain().length, scale.range().length);
      const xScale = scale.copy().rangeRound?.(quantize(interpolate(0, width), n));
      const interpolator = scale.copy().domain(quantize(interpolate(0, 1), n));
      const _tickFormat = tickFormatProp ?? xScale?.tickFormat?.();

      return {
        xScale,
        interpolator,
        tickFormat: _tickFormat,
        tickLabelOffset: 0,
        tickLine: true,
        tickValues: tickValuesProp,
        tickLength: tickLengthProp,
        swatches: undefined,
      };
    } else if (scale.interpolator) {
      // Sequential
      const xScale = Object.assign(scale.copy().interpolator!(interpolateRound(0, width)), {
        range() {
          return [0, width];
        },
      });
      const interpolator = scale.interpolator();
      let tickValues: any[] | undefined = tickValuesProp;

      if (!xScale.ticks) {
        if (tickValues === undefined) {
          const n = Math.round(ticks + 1);
          tickValues = range(n).map((i) => quantile(scale.domain(), i / (n - 1)));
        }

        // if (typeof tickFormat !== "function") {
        //   tickFormat = d3.format(tickFormat === undefined ? ",f" : tickFormat);
        // }
      }

      const tickFormat = tickFormatProp ?? xScale.tickFormat?.();

      return {
        interpolator,
        tickValues: tickValues,
        tickFormat: tickFormat,
        swatches: undefined,
        tickLabelOffset: 0,
        tickLine: true,
        tickLength: tickLengthProp,
        xScale: xScale,
      };
    } else if (scale.invertExtent) {
      // Threshold
      const thresholds = scale.thresholds
        ? scale.thresholds() // scaleQuantize
        : scale.quantiles
          ? scale.quantiles() // scaleQuantile
          : scale.domain(); // scaleThreshold

      const xScale = scaleLinear()
        .domain([-1, scale.range().length - 1])
        .rangeRound([0, width]);
      const swatches = scale.range().map((d: any, i: number) => {
        return {
          x: xScale(i - 1),
          y: 0,
          width: xScale(i) - xScale(i - 1),
          height,
          fill: d,
        };
      });
      const tickValues = range(thresholds.length);
      const tickFormat = (i: number) => {
        const value = thresholds[i];
        // @ts-expect-error - improve types
        return tickFormatProp ? format(value, tickFormatProp) : value;
      };

      return {
        xScale,
        swatches,
        tickValues: tickValues,
        tickFormat: tickFormat,
        tickLabelOffset: 0,
        tickLine: true,
        tickLength: tickLengthProp,
        interpolator: undefined,
      };
    } else {
      // Ordinal

      const xScale = scaleBand().domain(scale.domain()).rangeRound([0, width]);

      const swatches = scale.domain().map((d: any) => {
        return {
          x: xScale(d),
          y: 0,
          width: Math.max(0, xScale.bandwidth() - 1),
          height,
          fill: scale(d),
        };
      });

      const tickValues = scale.domain();
      const tickLabelOffset = xScale.bandwidth() / 2;
      const tickLine = false;
      const tickLength = 0;
      return {
        xScale,
        tickFormat: tickFormatProp,
        tickLabelOffset,
        tickLine,
        tickLength,
        tickValues,
        swatches,
        interpolator: undefined,
      };
    }
  });

  const variant = $derived(variantProp ?? (seriesItems ? 'swatches' : 'ramp'));
  const selected = $derived(selectedProp ?? ctx.series?.selectedKeys?.current ?? []);

  // Position indicator for the currently hovered value on the ramp. If `value`
  // is explicitly provided, use it; otherwise fall back to `ctx.tooltip.data`
  // piped through the chart's color accessor (`ctx.c`).
  const indicatorX = $derived.by(() => {
    if (variant !== 'ramp' || !scale) return null;
    let value: any = valueProp;
    if (value == null) {
      const data = ctx.tooltip?.data;
      if (data == null) return null;
      value = ctx.c?.(data);
    }
    if (value == null) return null;

    // Threshold / quantize / quantile scales — scaleConfig.xScale maps swatch
    // *indices* to pixels, not the raw domain value. Find which bucket the
    // value falls into and center on that swatch.
    if ((scale as any).invertExtent) {
      const i = scale.range().indexOf(scale(value));
      if (i < 0) return null;
      const x0 = scaleConfig.xScale?.(i - 1);
      const x1 = scaleConfig.xScale?.(i);
      if (typeof x0 !== 'number' || typeof x1 !== 'number') return null;
      return (x0 + x1) / 2;
    }

    const x = scaleConfig.xScale?.(value);
    if (typeof x !== 'number' || !Number.isFinite(x)) return null;
    return x + scaleConfig.tickLabelOffset;
  });

  const swatchItems = $derived.by(() => {
    if (seriesItems) {
      // Series-based legend items
      return seriesItems.map((series) => ({
        value: series.key,
        label: series.label,
        color: series.color,
        onclick: (e: MouseEvent) => ctx.series?.selectedKeys?.toggle?.(series.key),
        onpointerenter: (e: MouseEvent) => {
          ctx.series!.highlightKey = series.key;
        },
        onpointerleave: (e: MouseEvent) => {
          ctx.series!.highlightKey = null;
        },
        selected: selected.length === 0 || selected.includes(series.key),
      }));
    } else {
      // Scale-based legend items
      const tickValues = scaleConfig.tickValues ?? scaleConfig.xScale?.ticks?.(ticks) ?? [];
      return tickValues.map((tick) => ({
        value: tick,
        label: tickFormatProp ? format(tick, asAny(tickFormatProp)) : tick,
        color: scale?.(tick) ?? '',
        onclick: (e: MouseEvent) => ctx.series?.selectedKeys?.toggle?.(tick),
        onpointerenter: (e: MouseEvent) => {
          ctx.series!.highlightKey = tick;
        },
        onpointerleave: (e: MouseEvent) => {
          ctx.series!.highlightKey = null;
        },
        selected: selected.length === 0 || selected.includes(tick),
      }));
    }
  });

	// packages/layerchart/src/lib/components/layers/Canvas.svelte
  import { onMount, untrack, type Snippet } from 'svelte';
  import { Logger, localPoint } from '@layerstack/utils';
  import { MediaQueryPresets } from '@layerstack/svelte-state';

  import { getChartContext } from '$lib/contexts/chart.js';
  import { setLayerContext } from '$lib/contexts/layer.js';
  import { getPixelColor, scaleCanvas } from '../../utils/canvas.js';
  import { getColorStr, rgbColorGenerator } from '../../utils/color.js';
  import { useMutationObserver, watch } from 'runed';
  import type { HTMLCanvasAttributes, PointerEventHandler } from 'svelte/elements';
  import type { Without } from '$lib/utils/types.js';
  import {
    setCanvasContext,
    type CanvasContextValue,
    type ComponentRender,
  } from '$lib/contexts/canvas.js';
  import { renderTree } from '$lib/server/renderTree.js';

  let {
    ref: refProp = $bindable(),
    canvasContext: canvasContextProp = $bindable(),
    ssrCapture,
    ssrCaptureCallback,
    willReadFrequently = false,
    debug = false,
    zIndex = 0,
    pointerEvents = true,
    fallback,
    center = false,
    ignoreTransform = false,
    disableHitCanvas = false,
    class: className,
    children,
    onclick,
    ondblclick,
    onpointerenter,
    onpointermove,
    onpointerleave,
    onpointerdown,
    ontouchmove,
    ...restProps
  }: CanvasProps = $props();

  let ref = $state<HTMLCanvasElement>();
  let context = $state<CanvasRenderingContext2D>();

  $effect.pre(() => {
    refProp = ref;
  });

  $effect.pre(() => {
    canvasContextProp = context;
  });

  const ctx = getChartContext();

  const logger = new Logger('Canvas');

  // Root node for the component tree — children register via ctx.registerComponent
  const rootNode = ctx.registerComponent({ name: 'Canvas', kind: 'group' });
  let pendingInvalidation = false;
  let frameId: number | undefined;

  /**
   * HitCanvas
   */
  let hitCanvasElement = $state<HTMLCanvasElement>();
  let hitCanvasContext = $state<CanvasRenderingContext2D>();
  let colorGenerator = rgbColorGenerator();
  let activeCanvas = $state(false);
  let lastActiveNode: ComponentNode | null | undefined = null;

  const nodeByColor = new Map<string, ComponentNode>();

  function getPointerNode(e: PointerEvent | MouseEvent | TouchEvent) {
    const { x, y } = localPoint(e);
    const color = getPixelColor(hitCanvasContext!, x, y);
    const colorKey = getColorStr(color);
    const node = nodeByColor.get(colorKey);
    logger.debug({ colorKey, node, nodeByColor });
    return node;
  }

  type EventName = keyof NonNullable<ComponentRender['events']>;

  /**
   * Walk up the component tree from a node and call the given event on any
   * ancestor groups that have a handler for it, simulating DOM event bubbling.
   */
  function bubbleEvent(node: ComponentNode | null | undefined, eventName: EventName, e: Event) {
    // Fire event on the hit node itself
    (node?.canvasRender?.events?.[eventName] as ((e: Event) => void) | null | undefined)?.(e);
    // Bubble up to ancestor groups
    let ancestor = node?.parent;
    while (ancestor) {
      const handler =
        ancestor.kind === 'group'
          ? (ancestor.canvasRender?.events?.[eventName] as ((e: Event) => void) | null | undefined)
          : undefined;
      handler?.(e);
      ancestor = ancestor.parent;
    }
  }

  const onPointerMove: PointerEventHandler<Element> = (e) => {
    activeCanvas = true;
    const node = getPointerNode(e);

    if (node != lastActiveNode) {
      // TODO: Should `pointerleave`/`pointerout` and `pointerenter`/`pointerover` be handled differently?
      if (lastActiveNode) {
        bubbleEvent(lastActiveNode, 'pointerleave', e);
        bubbleEvent(lastActiveNode, 'pointerout', e);
      }

      bubbleEvent(node, 'pointerenter', e);
      bubbleEvent(node, 'pointerover', e);
    }
    bubbleEvent(node, 'pointermove', e);

    lastActiveNode = node;
  };

  const onPointerLeave: PointerEventHandler<Element> = (e) => {
    // Pointer outside of canvas

    // Call last active component `pointerleave` event in case it was not triggered by hit canvas (quickly exiting canvas element before `pointermove` is triggered)
    bubbleEvent(lastActiveNode, 'pointerleave', e);
    bubbleEvent(lastActiveNode, 'pointerout', e);

    lastActiveNode = null;
    activeCanvas = false;
  };
  /**
   * end HitCanvas
   */

  // Invalidate/redraw if color scheme changes, either via browser `prefers-color-scheme` (including emulation) or by changing `<html class="dark">` or `<html data-theme="...">`
  if (typeof window !== 'undefined') {
    const { dark } = new MediaQueryPresets();
    watch(
      () => dark.current,
      () => {
        canvasContext.invalidate();
      }
    );
    useMutationObserver(
      () => document.documentElement,
      () => canvasContext.invalidate(),
      {
        attributes: true,
        attributeFilter: ['class', 'data-theme'],
      }
    );
  }

  onMount(() => {
    context = ref?.getContext('2d', { willReadFrequently }) as CanvasRenderingContext2D;

    hitCanvasContext = hitCanvasElement?.getContext('2d', {
      willReadFrequently: false, // Explicitly set to `false` to resolve pixel artifacts between fill and stroke with the same color (issue #372)
    }) as CanvasRenderingContext2D;

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  });

  function update() {
    if (!context) return;

    // scale main canvas
    scaleCanvas(context, ctx.containerWidth, ctx.containerHeight);
    context.clearRect(0, 0, ctx.containerWidth, ctx.containerHeight);

    // apply padding translation
    context.translate(ctx.padding.left ?? 0, ctx.padding.top ?? 0);

    let newTranslate: undefined | { x: number; y: number };

    // apply centering or transform
    if (center) {
      newTranslate = {
        x: center === 'x' || center === true ? ctx.width / 2 : 0,
        y: center === 'y' || center === true ? ctx.height / 2 : 0,
      };
      context.translate(newTranslate.x, newTranslate.y);
    } else if (ctx.transform.mode === 'canvas' && !ignoreTransform) {
      context.translate(ctx.transform.translate.x, ctx.transform.translate.y);
      context.scale(ctx.transform.scale, ctx.transform.scale);
    }

    // Recursively render the component tree with proper save/restore scoping
    renderTree(context, rootNode);

    /*
     * Sync hit canvas with main canvas
     */
    if (hitCanvasContext) {
      const inactiveMoving = !activeCanvas && ctx.transform.moving;
      if (disableHitCanvas || ctx.transform.dragging || inactiveMoving) {
        // Skip rendering hit canvas
        hitCanvasContext.clearRect(0, 0, ctx.containerWidth, ctx.containerHeight);
      } else {
        // scale hit canvas to match main canvas
        scaleCanvas(hitCanvasContext, ctx.containerWidth, ctx.containerHeight);
        hitCanvasContext.clearRect(0, 0, ctx.containerWidth, ctx.containerHeight);

        // sync transform with main canvas (padding, center, zoom already applied)
        hitCanvasContext.setTransform(context.getTransform());

        // reset color generator and node map
        colorGenerator = rgbColorGenerator();
        nodeByColor.clear();

        // render hit canvas tree
        renderHitTree(hitCanvasContext, rootNode);
      }
    }

    pendingInvalidation = false;
  }

  function nodeHasEvents(node: ComponentNode) {
    return node.canvasRender?.events && Object.values(node.canvasRender.events).some((d) => d);
  }

  /**
   * Recursively render the hit canvas tree for pointer event detection.
   * Renders components that have event handlers (or whose ancestor group does), using unique colors.
   */
  function renderHitTree(
    hitCtx: CanvasRenderingContext2D,
    node: ComponentNode,
    ancestorHasEvents = false
  ) {
    if (node.kind === 'group' && node.canvasRender) {
      const groupHasEvents = ancestorHasEvents || nodeHasEvents(node);
      // Group: apply transform, recurse children (scoped by save/restore)
      hitCtx.save();
      node.canvasRender.render(hitCtx);
      for (const child of node.children) {
        renderHitTree(hitCtx, child, groupHasEvents);
      }
      hitCtx.restore();
    } else if (node.canvasRender) {
      if (nodeHasEvents(node) || ancestorHasEvents) {
        const color = getColorStr(colorGenerator.next().value);
        const styleOverrides = { styles: { fill: color, stroke: color, _fillOpacity: 0.1 } };

        hitCtx.save();
        node.canvasRender.render(hitCtx, styleOverrides);
        hitCtx.restore();

        nodeByColor.set(color, node);
      }
    } else {
      // Non-rendering node: recurse children
      for (const child of node.children) {
        renderHitTree(hitCtx, child, ancestorHasEvents);
      }
    }
  }

  function createCanvasContext(): CanvasContextValue {
    // Legacy register method — registration is now handled by the component tree
    // via registerComponent. Keep for interface compatibility.
    function register<T extends Element>(_component: ComponentRender<T>) {
      return () => {};
    }

    function invalidate() {
      if (pendingInvalidation) return;
      if (typeof requestAnimationFrame === 'undefined') return;
      pendingInvalidation = true;
      frameId = requestAnimationFrame(update);
    }

    function getRootNode() {
      return rootNode;
    }

    return { register, invalidate, getRootNode };
  }

  function captureSSR() {
    if (typeof window !== 'undefined') return '';
    if (!ssrCapture && !ssrCaptureCallback) return '';

    const captured: SSRCaptureTarget = {
      chartState: ctx,
      rootNode,
    };

    if (ssrCapture) {
      Object.assign(ssrCapture, captured);
    }

    ssrCaptureCallback?.(captured);
    return '';
  }

  const canvasContext = createCanvasContext();

  $effect.pre(() => {
    [ctx.height, ctx.width, ctx.containerHeight, ctx.containerWidth, ctx.transform.dragging];
    canvasContext.invalidate();
  });

  setCanvasContext(canvasContext);
  setLayerContext('canvas');

	// packages/svelte-ux/src/lib/components/Button.svelte
  import { slide } from 'svelte/transition';
  import { cls } from '@layerstack/tailwind';
  import { multi, type Actions } from '@layerstack/svelte-actions';

  import Icon from './Icon.svelte';
  import ProgressCircle from './ProgressCircle.svelte';
  import type { ButtonColor, ButtonRounded, ButtonSize, ButtonVariant } from '../types/index.js';
  import { getButtonGroup } from './ButtonGroup.svelte';
  import { asIconData, type IconInput } from '../utils/icons.js';
  import { getComponentSettings } from './settings.js';

  const { classes: settingsClasses, defaults } = getComponentSettings('Button');

  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let href: string | undefined = undefined;
  export let target: string | undefined = undefined;
  export let fullWidth: boolean = false;
  export let icon: IconInput = undefined;
  export let iconOnly = icon !== undefined && !$$slots.default;
  export let actions: Actions<HTMLAnchorElement | HTMLButtonElement> | undefined = undefined;

  export let loading: boolean = false;
  export let disabled: boolean = false;
  export let rounded: ButtonRounded | undefined = undefined; // default in reactive groupContext below
  export let variant: ButtonVariant | undefined = undefined; // default in reactive groupContext below
  export let size: ButtonSize | undefined = undefined; // default in reactive groupContext below
  export let color: ButtonColor | undefined = undefined; // default in reactive groupContext below

  /** @type {{root?: string, icon?: string, loading?: string}} */
  export let classes: {
    root?: string;
    icon?: string;
    loading?: string;
  } = {};

  // Override default from `ButtonGroup` if set
  const groupContext = getButtonGroup();
  $: variant = variant ?? groupContext?.variant ?? defaults.variant ?? 'default';
  $: size = size ?? groupContext?.size ?? defaults.size ?? 'md';
  $: color = color ?? groupContext?.color ?? defaults.color ?? 'default';
  $: rounded = rounded ?? groupContext?.rounded ?? defaults.rounded ?? (iconOnly ? 'full' : true);

  $: _class = cls(
    'Button',
    'transition duration-200 ring-surface-content/60 touch-manipulation',
    'focus:outline-none focus-visible:ring-1',
    fullWidth ? 'flex w-full' : 'inline-flex',
    loading ? 'gap-2' : 'gap-1',
    variant === 'none' || !rounded ? '' : rounded === 'full' ? 'rounded-full' : 'rounded',
    variant !== 'none' && [
      'items-center justify-center',
      'font-medium tracking-wider whitespace-nowrap',
      iconOnly
        ? {
            sm: 'text-xs p-1',
            md: 'text-sm p-2',
            lg: 'text-base p-3',
          }[size!]
        : {
            sm: 'text-xs px-2 py-1',
            md: 'text-sm px-4 py-2',
            lg: 'text-base px-6 py-3',
          }[size!],
    ],
    disabled && 'opacity-50 pointer-events-none',
    // Variant specific styles
    `variant-${variant}`,
    {
      default: '',
      outline: 'border focus-visible:ring-offset-1',
      fill: 'focus-visible:ring-offset-1',
      'fill-outline': 'border focus-visible:ring-offset-1',
      'fill-light': '',
      text: 'p-0',
      none: '',
    }[variant ?? 'none'],

    // Variant specific colors
    {
      default: {
        default: [
          'hover:[--bg-color:theme(colors.surface-content/10%)]',
          // '[--text-color:theme(colors.surface-content)]', // inherit
          '[--ring-color:theme(colors.surface-content/60%)]',
        ],
        primary: [
          'hover:[--bg-color:theme(colors.primary/10%)]',
          '[--text-color:theme(colors.primary)]',
          '[--ring-color:theme(colors.primary/60%)]',
        ],
        secondary: [
          'hover:[--bg-color:theme(colors.secondary/10%)]',
          '[--text-color:theme(colors.secondary)]',
          '[--ring-color:theme(colors.secondary/60%)]',
        ],
        accent: [
          'hover:[--bg-color:theme(colors.accent/10%)]',
          '[--text-color:theme(colors.accent)]',
          '[--ring-color:theme(colors.accent/60%)]',
        ],
        neutral: [
          'hover:[--bg-color:theme(colors.neutral/10%)]',
          '[--text-color:theme(colors.neutral)]',
          '[--ring-color:theme(colors.neutral/60%)]',
        ],
        info: [
          'hover:[--bg-color:theme(colors.info/10%)]',
          '[--text-color:theme(colors.info)]',
          '[--ring-color:theme(colors.info/60%)]',
        ],
        success: [
          'hover:[--bg-color:theme(colors.success/10%)]',
          '[--text-color:theme(colors.success)]',
          '[--ring-color:theme(colors.success/60%)]',
        ],
        warning: [
          'hover:[--bg-color:theme(colors.warning/10%)]',
          '[--text-color:theme(colors.warning)]',
          '[--ring-color:theme(colors.warning/60%)]',
        ],
        danger: [
          'hover:[--bg-color:theme(colors.danger/10%)]',
          '[--text-color:theme(colors.danger)]',
          '[--ring-color:theme(colors.danger/60%)]',
        ],
      },
      outline: {
        default: [
          'hover:[--bg-color:theme(colors.surface-content/10%)]',
          '[--border-color:theme(colors.surface-content)]',
          '[--text-color:theme(colors.surface-content)]',
          '[--ring-color:theme(colors.surface-content/60%)]',
        ],
        primary: [
          'hover:[--bg-color:theme(colors.primary/10%)]',
          '[--border-color:theme(colors.primary)]',
          '[--text-color:theme(colors.primary)]',
          '[--ring-color:theme(colors.primary/60%)]',
        ],
        secondary: [
          'hover:[--bg-color:theme(colors.secondary/10%)]',
          '[--border-color:theme(colors.secondary)]',
          '[--text-color:theme(colors.secondary)]',
          '[--ring-color:theme(colors.secondary/60%)]',
        ],
        accent: [
          'hover:[--bg-color:theme(colors.accent/10%)]',
          '[--border-color:theme(colors.accent)]',
          '[--text-color:theme(colors.accent)]',
          '[--ring-color:theme(colors.accent/60%)]',
        ],
        neutral: [
          'hover:[--bg-color:theme(colors.neutral/10%)]',
          '[--border-color:theme(colors.neutral)]',
          '[--text-color:theme(colors.neutral)]',
          '[--ring-color:theme(colors.neutral/60%)]',
        ],
        info: [
          'hover:[--bg-color:theme(colors.info/10%)]',
          '[--border-color:theme(colors.info)]',
          '[--text-color:theme(colors.info)]',
          '[--ring-color:theme(colors.info/60%)]',
        ],
        success: [
          'hover:[--bg-color:theme(colors.success/10%)]',
          '[--border-color:theme(colors.success)]',
          '[--text-color:theme(colors.success)]',
          '[--ring-color:theme(colors.success/60%)]',
        ],
        warning: [
          'hover:[--bg-color:theme(colors.warning/10%)]',
          '[--border-color:theme(colors.warning)]',
          '[--text-color:theme(colors.warning)]',
          '[--ring-color:theme(colors.warning/60%)]',
        ],
        danger: [
          'hover:[--bg-color:theme(colors.danger/10%)]',
          '[--border-color:theme(colors.danger)]',
          '[--text-color:theme(colors.danger)]',
          '[--ring-color:theme(colors.danger/60%)]',
        ],
      },
      fill: {
        default: [
          `[--bg-color:theme(colors.surface-content)]`,
          'hover:[--bg-color:theme(colors.surface-content/80%)]',
          '[--text-color:theme(colors.surface-200)]',
          '[--ring-color:theme(colors.surface-content/60%)]',
        ],
        primary: [
          `[--bg-color:theme(colors.primary)]`,
          'hover:[--bg-color:theme(colors.primary-600)]',
          '[--text-color:theme(colors.primary-content)]',
          '[--ring-color:theme(colors.primary/60%)]',
        ],
        secondary: [
          '[--bg-color:theme(colors.secondary)]',
          'hover:[--bg-color:theme(colors.secondary-600)]',
          '[--text-color:theme(colors.secondary-content)]',
          '[--ring-color:theme(colors.secondary/60%)]',
        ],
        accent: [
          '[--bg-color:theme(colors.accent)]',
          'hover:[--bg-color:theme(colors.accent-600)]',
          '[--text-color:theme(colors.accent-content)]',
          '[--ring-color:theme(colors.accent/60%)]',
        ],
        neutral: [
          '[--bg-color:theme(colors.neutral)]',
          'hover:[--bg-color:theme(colors.neutral-600)]',
          '[--text-color:theme(colors.neutral-content)]',
          '[--ring-color:theme(colors.neutral/60%)]',
        ],
        info: [
          `[--bg-color:theme(colors.info)]`,
          'hover:[--bg-color:theme(colors.info-600)]',
          '[--text-color:theme(colors.info-content)]',
          '[--ring-color:theme(colors.info/60%)]',
        ],
        success: [
          `[--bg-color:theme(colors.success)]`,
          'hover:[--bg-color:theme(colors.success-600)]',
          '[--text-color:theme(colors.success-content)]',
          '[--ring-color:theme(colors.success/60%)]',
        ],
        warning: [
          `[--bg-color:theme(colors.warning)]`,
          'hover:[--bg-color:theme(colors.warning-600)]',
          '[--text-color:theme(colors.warning-content)]',
          '[--ring-color:theme(colors.warning/60%)]',
        ],
        danger: [
          `[--bg-color:theme(colors.danger)]`,
          'hover:[--bg-color:theme(colors.danger-600)]',
          '[--text-color:theme(colors.danger-content)]',
          '[--ring-color:theme(colors.danger/60%)]',
        ],
      },
      'fill-light': {
        default: [
          '[--bg-color:theme(colors.surface-content/10%)]',
          'hover:[--bg-color:theme(colors.surface-content/20%)]',
          '[--text-color:theme(colors.surface-content)]',
          '[--ring-color:theme(colors.surface-content/60%)]',
        ],
        primary: [
          '[--bg-color:theme(colors.primary/10%)]',
          'hover:[--bg-color:theme(colors.primary/20%)]',
          '[--text-color:theme(colors.primary)]',
          '[--ring-color:theme(colors.primary/60%)]',
        ],
        secondary: [
          '[--bg-color:theme(colors.secondary/10%)]',
          'hover:[--bg-color:theme(colors.secondary/20%)]',
          '[--text-color:theme(colors.secondary)]',
          '[--ring-color:theme(colors.secondary/60%)]',
        ],
        accent: [
          '[--bg-color:theme(colors.accent/10%)]',
          'hover:[--bg-color:theme(colors.accent/20%)]',
          '[--text-color:theme(colors.accent)]',
          '[--ring-color:theme(colors.secondary/60%)]',
        ],
        neutral: [
          '[--bg-color:theme(colors.neutral/10%)]',
          'hover:[--bg-color:theme(colors.neutral/20%)]',
          '[--text-color:theme(colors.neutral)]',
          '[--ring-color:theme(colors.neutral/60%)]',
        ],
        info: [
          '[--bg-color:theme(colors.info/10%)]',
          'hover:[--bg-color:theme(colors.info/20%)]',
          '[--text-color:theme(colors.info)]',
          '[--ring-color:theme(colors.info/60%)]',
        ],
        success: [
          '[--bg-color:theme(colors.success/10%)]',
          'hover:[--bg-color:theme(colors.success/20%)]',
          '[--text-color:theme(colors.success)]',
          '[--ring-color:theme(colors.success/60%)]',
        ],
        warning: [
          '[--bg-color:theme(colors.warning/10%)]',
          'hover:[--bg-color:theme(colors.warning/20%)]',
          '[--text-color:theme(colors.warning)]',
          '[--ring-color:theme(colors.warning/60%)]',
        ],
        danger: [
          '[--bg-color:theme(colors.danger/10%)]',
          'hover:[--bg-color:theme(colors.danger/20%)]',
          '[--text-color:theme(colors.danger)]',
          '[--ring-color:theme(colors.danger/60%)]',
        ],
      },
      'fill-outline': {
        default: [
          '[--bg-color:theme(colors.surface-content/10%)]',
          'hover:[--bg-color:theme(colors.surface-content/20%)]',
          '[--border-color:theme(colors.surface-content)]',
          '[--text-color:theme(colors.surface-content)]',
          '[--ring-color:theme(colors.surface-content/60%)]',
        ],
        primary: [
          '[--bg-color:theme(colors.primary/10%)]',
          'hover:[--bg-color:theme(colors.primary/20%)]',
          '[--border-color:theme(colors.primary)]',
          '[--text-color:theme(colors.primary)]',
          '[--ring-color:theme(colors.primary/60%)]',
        ],
        secondary: [
          '[--bg-color:theme(colors.secondary/10%)]',
          'hover:[--bg-color:theme(colors.secondary/20%)]',
          '[--border-color:theme(colors.secondary)]',
          '[--text-color:theme(colors.secondary)]',
          '[--ring-color:theme(colors.secondary/60%)]',
        ],
        accent: [
          '[--bg-color:theme(colors.accent/10%)]',
          'hover:[--bg-color:theme(colors.accent/20%)]',
          '[--border-color:theme(colors.accent)]',
          '[--text-color:theme(colors.accent)]',
          '[--ring-color:theme(colors.accent/60%)]',
        ],
        neutral: [
          '[--bg-color:theme(colors.neutral/10%)]',
          'hover:[--bg-color:theme(colors.neutral/20%)]',
          '[--border-color:theme(colors.neutral)]',
          '[--text-color:theme(colors.neutral)]',
          '[--ring-color:theme(colors.neutral/60%)]',
        ],
        info: [
          '[--bg-color:theme(colors.info/10%)]',
          'hover:[--bg-color:theme(colors.info/20%)]',
          '[--border-color:theme(colors.info)]',
          '[--text-color:theme(colors.info)]',
          '[--ring-color:theme(colors.info/60%)]',
        ],
        success: [
          '[--bg-color:theme(colors.success/10%)]',
          'hover:[--bg-color:theme(colors.success/20%)]',
          '[--border-color:theme(colors.success)]',
          '[--text-color:theme(colors.success)]',
          '[--ring-color:theme(colors.success/60%)]',
        ],
        warning: [
          '[--bg-color:theme(colors.warning/10%)]',
          'hover:[--bg-color:theme(colors.warning/20%)]',
          '[--border-color:theme(colors.warning)]',
          '[--text-color:theme(colors.warning)]',
          '[--ring-color:theme(colors.warning/60%)]',
        ],
        danger: [
          '[--bg-color:theme(colors.danger/10%)]',
          'hover:[--bg-color:theme(colors.danger/20%)]',
          '[--border-color:theme(colors.danger)]',
          '[--text-color:theme(colors.danger)]',
          '[--ring-color:theme(colors.danger/60%)]',
        ],
      },
      text: {
        default: [
          '[--text-color:theme(colors.surface-content)]',
          'hover:[--text-color:theme(colors.surface-content/80%)]',
          '[--ring-color:theme(colors.surface-content/60%)]',
        ],
        primary: [
          '[--text-color:theme(colors.primary)]',
          'hover:[--text-color:theme(colors.primary-700)]',
          '[--ring-color:theme(colors.primary/60%)]',
        ],
        secondary: [
          '[--text-color:theme(colors.secondary)]',
          'hover:[--text-color:theme(colors.secondary-700)]',
          '[--ring-color:theme(colors.secondary/60%)]',
        ],
        accent: [
          '[--text-color:theme(colors.accent)]',
          'hover:[--text-color:theme(colors.accent-700)]',
          '[--ring-color:theme(colors.accent/60%)]',
        ],
        neutral: [
          '[--text-color:theme(colors.neutral)]',
          'hover:[--text-color:theme(colors.neutral-700)]',
          '[--ring-color:theme(colors.neutral/60%)]',
        ],
        info: [
          '[--text-color:theme(colors.info)]',
          'hover:[--text-color:theme(colors.info-700)]',
          '[--ring-color:theme(colors.info/60%)]',
        ],
        success: [
          '[--text-color:theme(colors.success)]',
          'hover:[--text-color:theme(colors.success-700)]',
          '[--ring-color:theme(colors.success/60%)]',
        ],
        warning: [
          '[--text-color:theme(colors.warning)]',
          'hover:[--text-color:theme(colors.warning-700)]',
          '[--ring-color:theme(colors.warning/60%)]',
        ],
        danger: [
          '[--text-color:theme(colors.danger)]',
          'hover:[--text-color:theme(colors.danger-700)]',
          '[--ring-color:theme(colors.danger/60%)]',
        ],
      },
      none: {
        default: '',
        primary: '',
        secondary: '',
        accent: '',
        neutral: '',
        info: '',
        success: '',
        warning: '',
        danger: '',
      },
    }[variant ?? 'none']?.[color ?? 'default'],

    // text color
    ['default', 'outline', 'fill', 'fill-outline', 'fill-light', 'text'].includes(
      variant ?? 'none'
    ) && 'text-[var(--text-color)]',

    // background color
    ['default', 'outline', 'fill', 'fill-outline', 'fill-light'].includes(variant ?? 'none') &&
      'bg-[var(--bg-color)] ',

    // border color
    ['outline', 'fill-outline'].includes(variant ?? 'none') && 'border-[var(--border-color)]',

    // ring color
    ['default', 'outline', 'fill', 'fill-outline', 'fill-light', 'text'].includes(
      variant ?? 'none'
    ) && 'ring-[var(--ring-color)]',

    settingsClasses.root,
    classes?.root,
    $$props.class
  );

	// packages/svelte-ux/src/lib/components/TextField.svelte
  import { createEventDispatcher, type ComponentProps } from 'svelte';
  import type { AriaRole, HTMLInputAttributes } from 'svelte/elements';
  import { mdiClose, mdiCurrencyUsd, mdiEye, mdiInformationOutline, mdiPercent } from '@mdi/js';
  import { uniqueId } from 'lodash-es';
  import { cls } from '@layerstack/tailwind';
  import { isLiteralObject } from '@layerstack/utils/object';
  import { autoFocus, multi, type Actions } from '@layerstack/svelte-actions';

  import { DEFAULT_LABEL_PLACEMENT, type LabelPlacement } from '../types/index.js';
  import { getComponentSettings } from './settings.js';

  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Input from './Input.svelte';
  import { type IconInput, asIconData } from '../utils/icons.js';

  type InputValue = string | number;

  const dispatch = createEventDispatcher<{
    clear: null;
    change: { value: typeof value; inputValue: InputValue | null; operator?: string };
  }>();

  const { classes: settingsClasses, defaults } = getComponentSettings('TextField');
  const { defaults: fieldDefaults } = getComponentSettings('Field');

  export let name: string | undefined = undefined;
  export let label = '';
  export let labelPlacement: LabelPlacement =
    defaults.labelPlacement ?? fieldDefaults.labelPlacement ?? DEFAULT_LABEL_PLACEMENT;
  export let value: InputValue | { [operator: string]: InputValue | null } | null = ''; // TODO: Can also include operator: { "operator": "value" }
  export let type:
    | 'text'
    | 'password'
    | 'integer'
    | 'decimal'
    | 'currency'
    | 'percent'
    | 'search'
    | 'email' = 'text';
  export let placeholder: string | undefined = undefined;
  export let error: string | string[] | boolean | undefined = '';
  export let hint = '';
  export let autocomplete: HTMLTextAreaElement['autocomplete'] = 'off'; // https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete
  export let multiline = false;
  export let required = false;
  export let disabled = false;
  export let clearable = false;
  export let base = false;
  export let rounded = false;
  export let dense = false;
  export let icon: IconInput = null;
  export let iconRight: IconInput = null;
  export let align: 'left' | 'center' | 'right' = 'left';
  export let autofocus: boolean | Parameters<typeof autoFocus>[1] = false;
  // TODO: Find way to conditionally set type based on `multiline` value
  export let actions: Actions<HTMLInputElement | HTMLTextAreaElement> | undefined = autofocus
    ? (node) => [autoFocus(node, typeof autofocus === 'object' ? autofocus : undefined)]
    : undefined;
  export let operators: { label: string; value: string }[] | undefined = undefined;
  export let inputEl: HTMLInputElement | HTMLTextAreaElement | null = null;
  export let debounceChange: boolean | number = false;
  export let classes: {
    root?: string;
    container?: string;
    label?: string;
    input?: string;
    error?: string;
    prepend?: string;
    append?: string;
  } = {};

  // Input props
  export let mask: string | undefined = undefined;
  export let replace: string | undefined = undefined;
  export let accept: string | RegExp | undefined = undefined;
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/autocapitalize
  export let autocapitalize: ComponentProps<Input>['autocapitalize'] = undefined;
  export let role: AriaRole | undefined = undefined;

  /**
   * see: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#min
   */
  export let min: number | undefined = undefined;
  /**
   * see: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#max
   */
  export let max: number | undefined = undefined;
  /**
   * see: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#step
   */
  export let step: number | undefined = type === 'decimal' ? 0.1 : 1;

  let inputType = 'text';
  $: switch (type) {
    case 'integer':
    case 'decimal':
    case 'currency':
    case 'percent':
      // TODO: typing '.' on iOS appears to clear input when using type="number"
      inputType = 'number';
      break;
    case 'password':
      inputType = 'password';
      break;
    case 'email':
      inputType = 'email';
      break;
    case 'search':
      inputType = 'search';
      break;
    case 'text':
    default:
      inputType = 'text';
  }
  let inputMode: HTMLInputAttributes['inputmode'] = undefined;
  $: switch (type) {
    case 'integer':
      inputMode = 'numeric';
      break;
    case 'decimal':
    case 'currency':
    case 'percent':
      inputMode = 'decimal';
      break;
    case 'email':
      inputMode = 'email';
      break;
    case 'search':
      inputMode = 'search';
      break;
    case 'text':
    case 'password':
    default:
      inputMode = 'text';
  }

  let inputValue: InputValue | null = value == null ? '' : String(value);
  $: potentialInputValue = isLiteralObject(value) ? Object.values(value)[0] : (value ?? null);
  $: if (inputType !== 'number' || inputValue != potentialInputValue) {
    // Update the inputValue, but when the input type is number only do it if the values are actually different.
    // This avoids the cursor jumping around when backspacing numbers around a decimal point, since
    // e.g. "123" and "123." are both 123.
    inputValue = potentialInputValue;
  }

  $: operator = isLiteralObject(value) ? Object.keys(value)[0] : operators?.[0].value;

  let lastTimeoutId: ReturnType<typeof setTimeout>;
  function updateValue() {
    let newValue: typeof value;
    const valueAsType = inputType === 'number' ? Number(inputValue) : inputValue;
    if (inputValue && operator) {
      // Add with operator if used
      newValue = { [operator]: valueAsType };
    } else {
      newValue = inputValue === '' ? null : valueAsType;
    }

    value = newValue;
    if (debounceChange) {
      clearTimeout(lastTimeoutId);
      lastTimeoutId = setTimeout(
        () => {
          dispatch('change', { value, inputValue, operator });
        },
        debounceChange === true ? 300 : debounceChange
      );
    } else {
      dispatch('change', { value, inputValue, operator });
    }
  }

  function handleInput(e: Event) {
    const elm = e.target as HTMLTextAreaElement | HTMLInputElement;
    if (accept) {
      // filter input based on accepted characters
      const regex = new RegExp(accept, 'g');
      inputValue = elm.value.match(regex)?.[0] ?? '';
      elm.value = inputValue;
    } else {
      inputValue = elm.value;
    }
    updateValue();
  }

  function textAreaMultiAction(n: HTMLTextAreaElement) {
    if (actions) {
      return actions(n);
    }
    return [];
  }

  function onSelectChange(e: Event) {
    operator = (e.target as HTMLSelectElement).value;
    updateValue();
  }

  $: hasInputValue = inputValue != null && inputValue !== '';
  $: hasInsetLabel = ['inset', 'float'].includes(labelPlacement) && label !== '';

  $: hasPrepend = $$slots.prepend || !!icon;
  $: hasAppend =
    $$slots.append || iconRight != null || clearable || error || operators || type === 'password';
  $: hasPrefix = $$slots.prefix || type === 'currency';
  $: hasSuffix = $$slots.suffix || type === 'percent';

  export let id = uniqueId('textfield-');
  let labelEl: HTMLLabelElement | null = null;

	// src/lib/datepicker/Datepicker.svelte
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import clsx from "clsx";
  import type { DatepickerProps } from "$lib";
  import Button from "$lib/buttons/Button.svelte";
  import ToolbarButton from "$lib/toolbar/ToolbarButton.svelte";
  import { datepicker } from "./theme";
  import { parse, isValid, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isWithinInterval } from "date-fns";
  import { getTheme } from "$lib/theme/themeUtils";

  let {
    value = $bindable(),
    defaultDate = null,
    range = false,
    rangeFrom = $bindable(),
    rangeTo = $bindable(),
    availableFrom = null,
    availableTo = null,
    locale = "default",
    translationLocale,
    firstDayOfWeek = 0,
    dateFormat,
    placeholder = "Select date",
    disabled = false,
    required = false,
    inputClass = "",
    color = "primary",
    inline = false,
    autohide = true,
    showActionButtons = false,
    title = "",
    onselect,
    onclear,
    onapply,
    btnClass,
    inputmode = "none",
    classes,
    monthColor = "alternative",
    monthBtnSelected = "bg-primary-500 text-white",
    monthBtn = "text-gray-700 dark:text-gray-300",
    class: className,
    elementRef = $bindable(),
    actionSlot,
    inputProps = {}
  }: DatepickerProps = $props();

  const theme = $derived(getTheme("datepicker"));

  // If translationLocale is not explicitly provided, it will default to the value of locale. This ensures reactivity as both are directly exposed as props.
  const finalTranslationLocale = $derived(translationLocale ?? locale);

  let isOpen: boolean = $state(false);
  $effect(() => {
    isOpen = inline;
  });
  let showMonthSelector: boolean = $state(false);
  let datepickerContainerElement: HTMLDivElement;
  let currentMonth: Date = $state(new Date());
  $effect(() => {
    currentMonth = value || defaultDate || new Date();
  });
  let focusedDate: Date | null = null;
  let calendarRef: HTMLDivElement | null = $state(null);

  let daysInMonth = $derived(getDaysInMonth(currentMonth));

  onMount(() => {
    if (!inline) {
      datepickerContainerElement?.ownerDocument.addEventListener("click", handleClickOutside);
      return () => {
        datepickerContainerElement?.ownerDocument.removeEventListener("click", handleClickOutside);
      };
    }
  });

  function getDaysInMonth(date: Date): Date[] {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: firstDayOfWeek });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: firstDayOfWeek });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }

  const getWeekdayNames = (): string[] => {
    const referenceDate = new Date(1970, 0, 4 + firstDayOfWeek);
    return Array.from({ length: 7 }, (_, i) => addDays(referenceDate, i).toLocaleDateString(finalTranslationLocale, { weekday: "short" }));
  };

  let weekdays = $derived(getWeekdayNames());

  const getMonthNames = (): string[] => {
    return Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(finalTranslationLocale, { month: "short" }));
  };
  let monthNames = $derived(getMonthNames());

  const addDay = (date: Date, increment: number): Date => addDays(date, increment);

  function changeMonth(increment: number) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + increment, 1);
  }

  function changeYear(increment: number) {
    currentMonth = new Date(currentMonth.getFullYear() + increment, currentMonth.getMonth(), 1);
  }

  function selectMonth(monthIndex: number, event: MouseEvent) {
    event.stopPropagation();
    currentMonth = new Date(currentMonth.getFullYear(), monthIndex, 1);
    showMonthSelector = false;
  }

  function toggleMonthSelector(event: MouseEvent) {
    event.stopPropagation();
    showMonthSelector = !showMonthSelector;
  }

  function isDateAvailable(date: Date): boolean {
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (availableFrom) {
      const fromDate = new Date(availableFrom.getFullYear(), availableFrom.getMonth(), availableFrom.getDate());
      if (dateOnly < fromDate) return false;
    }

    if (availableTo) {
      const toDate = new Date(availableTo.getFullYear(), availableTo.getMonth(), availableTo.getDate());
      if (dateOnly > toDate) return false;
    }

    return true;
  }

  function handleDaySelect(day: Date) {
    if (!isDateAvailable(day)) return;

    if (range) {
      if (!rangeFrom || (rangeFrom && rangeTo)) {
        rangeFrom = day;
        rangeTo = undefined;
      } else if (day < rangeFrom) {
        const oldRangeFrom = rangeFrom;
        rangeFrom = day;
        rangeTo = oldRangeFrom;
      } else {
        rangeTo = day;
      }
      onselect?.({ from: rangeFrom, to: rangeTo });
    } else {
      value = day;
      onselect?.(value);
      if (autohide && !inline) isOpen = false;
    }
  }

  function handleInputChangeWithDateFns() {
    const inputValue = elementRef?.value?.trim();
    if (!inputValue) {
      rangeFrom = undefined;
      rangeTo = undefined;
      elementRef?.setCustomValidity("");
      return;
    }

    elementRef?.setCustomValidity("");

    if (range) {
      const parts = inputValue.split(" - ");
      if (parts.length === 2) {
        const parsedFrom = tryParseDate(parts[0]);
        const parsedTo = tryParseDate(parts[1]);

        if (parsedFrom && isValid(parsedFrom) && isDateAvailable(parsedFrom) && parsedTo && isValid(parsedTo) && isDateAvailable(parsedTo)) {
          [rangeFrom, rangeTo] = parsedFrom > parsedTo ? [parsedTo, parsedFrom] : [parsedFrom, parsedTo];
          onselect?.({ from: rangeFrom, to: rangeTo });
          return;
        } else {
          elementRef?.setCustomValidity(`Please enter date range in format: ${getDateFormatPattern()} - ${getDateFormatPattern()}`);
          return;
        }
      }
    }

    const parsedDate = tryParseDate(inputValue);

    if (!parsedDate || !isValid(parsedDate)) {
      const formatPattern = getDateFormatPattern();
      elementRef?.setCustomValidity(`Please enter date in format: ${formatPattern}`);
      return;
    }

    if (!isDateAvailable(parsedDate)) {
      elementRef?.setCustomValidity("Selected date is not available");
      return;
    }

    handleDaySelect(parsedDate);
  }

  function tryParseDate(inputValue: string): Date | null {
    const formatPattern = getDateFormatPattern();
    try {
      const parsedDate = parse(inputValue, formatPattern, new Date());
      if (isValid(parsedDate)) {
        return parsedDate;
      }
    } catch (error) {
      // Continue to next strategy
    }

    const commonFormats = [
      "d.M.yyyy", // German: 17.7.2025
      "dd.MM.yyyy", // German: 17.07.2025
      "M/d/yyyy", // US: 7/17/2025
      "MM/dd/yyyy", // US: 07/17/2025
      "d/M/yyyy", // UK: 17/7/2025
      "dd/MM/yyyy", // UK: 17/07/2025
      "yyyy-MM-dd", // ISO: 2025-07-17
      "yyyy-M-d", // ISO: 2025-7-17
      "M-d-yyyy", // US with dashes: 7-17-2025
      "d-M-yyyy" // EU with dashes: 17-7-2025
    ];

    for (const format of commonFormats) {
      try {
        const parsedDate = parse(inputValue, format, new Date());
        if (isValid(parsedDate)) {
          return parsedDate;
        }
      } catch (error) {
        // Continue to next format
      }
    }

    try {
      const nativeDate = new Date(inputValue);
      if (isValid(nativeDate) && !isNaN(nativeDate.getTime())) {
        return nativeDate;
      }
    } catch (error) {
      // Continue
    }

    return null;
  }

  function getDateFormatPattern(): string {
    const actualLocale = locale === "default" ? navigator.language : locale;
    const testDate = new Date(2025, 0, 15); // January 15, 2025
    const formatted = testDate.toLocaleDateString(actualLocale, dateFormat || { year: "numeric", month: "numeric", day: "numeric" });

    if (formatted.includes(".")) {
      // German/European format with dots
      if (formatted.startsWith("15.")) {
        return "d.M.yyyy";
      } else if (formatted.startsWith("01.")) {
        return "M.d.yyyy";
      }
      return "d.M.yyyy"; // Default to day first
    } else if (formatted.includes("/")) {
      // US/UK format with slashes
      if (formatted.startsWith("1/")) {
        return "M/d/yyyy"; // US format
      } else if (formatted.startsWith("15/")) {
        return "d/M/yyyy"; // UK format
      }

      const testDate2 = new Date(2025, 11, 3); // December 3, 2025
      const formatted2 = testDate2.toLocaleDateString(actualLocale, dateFormat || { year: "numeric", month: "numeric", day: "numeric" });
      if (formatted2.startsWith("3/") || formatted2.startsWith("03/")) {
        return "d/M/yyyy";
      } else {
        return "M/d/yyyy";
      }
    } else if (formatted.includes("-")) {
      // ISO or other dash format
      if (formatted.startsWith("2025-")) {
        return "yyyy-M-d";
      } else if (formatted.startsWith("1-")) {
        return "M-d-yyyy";
      } else {
        return "d-M-yyyy";
      }
    }

    // Default fallback - try to detect based on locale
    if (actualLocale.startsWith("en-US")) {
      return "M/d/yyyy";
    } else if (actualLocale.startsWith("de") || actualLocale.startsWith("at") || actualLocale.startsWith("ch")) {
      return "d.M.yyyy";
    } else if (actualLocale.startsWith("en-GB") || actualLocale.startsWith("en-AU")) {
      return "d/M/yyyy";
    }

    return "M/d/yyyy";
  }

  function handleClickOutside(event: MouseEvent) {
    if (isOpen && datepickerContainerElement && !datepickerContainerElement.contains(event.target as Node)) {
      isOpen = false;
      showMonthSelector = false;
    }
  }

  // Use locale for formatting (not finalTranslationLocale)
  const formatDate = (date?: Date): string => date?.toLocaleDateString(locale, dateFormat) ?? "";
  const isSameDate = (date1?: Date, date2?: Date): boolean => (date1 && date2 ? isSameDay(date1, date2) : false);
  const isToday = (day: Date): boolean => isSameDate(day, new Date());
  const isInRange = (day: Date): boolean => !!(range && rangeFrom && rangeTo && isWithinInterval(day, { start: rangeFrom, end: rangeTo }));

  let isSelected = $derived((day: Date): boolean => (range ? isSameDate(day, rangeFrom) || isSameDate(day, rangeTo) : isSameDate(day, value)));

  function handleCalendarKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    if (!focusedDate) {
      focusedDate = value || new Date();
    }

    switch (event.key) {
      case "ArrowLeft":
        focusedDate = addDay(focusedDate, -1);
        break;
      case "ArrowRight":
        focusedDate = addDay(focusedDate, 1);
        break;
      case "ArrowUp":
        focusedDate = addDay(focusedDate, -7);
        break;
      case "ArrowDown":
        focusedDate = addDay(focusedDate, 7);
        break;
      case "Enter":
        if (range) {
          if (rangeFrom && rangeTo) {
            if (autohide && !inline) isOpen = false;
          } else {
            handleDaySelect(focusedDate);
          }
        } else {
          handleDaySelect(focusedDate);
          if (autohide && !inline) isOpen = false;
        }
        break;
      case "Escape":
        isOpen = false;
        showMonthSelector = false;
        elementRef?.focus();
        break;
      default:
        return;
    }

    event.preventDefault();
    if (focusedDate.getMonth() !== currentMonth.getMonth()) {
      currentMonth = new Date(focusedDate.getFullYear(), focusedDate.getMonth(), 1);
    }

    // Use finalTranslationLocale for aria-label
    setTimeout(() => {
      const focusedButton = calendarRef?.querySelector(
        `button[aria-label="${focusedDate!.toLocaleDateString(finalTranslationLocale, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}"]`
      ) as HTMLButtonElement | null;
      focusedButton?.focus();
    }, 0);
  }

  function handleInputKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleInputChangeWithDateFns();
      if (autohide && !inline) {
        isOpen = false;
      }
    } else if (event.key === " ") {
      event.preventDefault();
      isOpen = !isOpen;
    }
  }

  function handleClear() {
    value = rangeFrom = rangeTo = undefined;
    onclear?.();
  }

  function handleApply() {
    const result = range ? { from: rangeFrom, to: rangeTo } : value;
    if (result) onapply?.(result);
    if (!inline) isOpen = false;
  }

  let { base, input, button, titleVariant, actionButtons, columnHeader, polite, grid, nav, dayButton, monthButton } = datepicker();

	// src/lib/clipboard-manager/ClipboardManager.svelte
  import { Badge, Modal } from "$lib";
  import { formatDistanceToNow } from "date-fns";
  import { clipboardManager } from "./theme";
  import type { ClipboardItem, ClipboardManagerProps } from "$lib/types";
  import { getTheme } from "$lib/theme/themeUtils";
  import clsx from "clsx";

  let {
    items: initialItems = [],
    placeholder = "Type and save to clipboard",
    saveLabel = "Save",
    clearLabel = "Clear All",
    limit = 20,
    saveToStorage = true,
    toastDuration = 2000,
    filterSensitive = true,
    maxLength = 10000,
    enableSelectionMenu = false,
    selectionTarget = "body",
    showInput = true,
    class: className = "",
    classes,
    storageKey,
    children,
    emptyState,
    open = $bindable(), // If undefined, renders inline; if defined, renders as modal
    badgeProps = { color: "blue", class: "text-xs" },
    modalProps,
    detectSensitiveData
  }: ClipboardManagerProps = $props();

  const theme = $derived(getTheme("clipboardManager"));

  const isModal = $derived(open !== undefined);

  const styles = $derived(clipboardManager());

  let items = $state<ClipboardItem[]>([]);
  $effect(() => {
    if (initialItems.length > 0) {
      items = initialItems;
    }
  });
  let newText = $state("");
  let searchQuery = $state("");
  let toast = $state<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Selection menu state
  let selectionMenu = $state<{
    show: boolean;
    x: number;
    y: number;
    text: string;
  }>({ show: false, x: 0, y: 0, text: "" });

  const STORAGE_KEY = $derived(storageKey ?? "flowbite-clipboard-manager");

  // Save to localStorage whenever items change (but skip the initial load)
  let isFirstLoad = true;

  $effect(() => {
    if (saveToStorage && typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (initialItems.length === 0) {
            items = parsed;
          } else if (isFirstLoad) {
            // First load: use initial items and save them
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
          }
        } catch (e) {
          console.error("Failed to parse clipboard data:", e);
        }
      } else if (initialItems.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      }

      isFirstLoad = false;
    }
  });
  $effect(() => {
    if (saveToStorage && typeof window !== "undefined") {
      if (isFirstLoad) {
        isFirstLoad = false;
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  });

  // --- Selection Menu Logic ---
  $effect(() => {
    if (!enableSelectionMenu || typeof window === "undefined") return;

    const targetElements = document.querySelectorAll(selectionTarget);
    const elements = targetElements.length > 0 ? Array.from(targetElements) : [document.body];

    const handleMouseUp = () => {
      setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        if (selectedText && selectedText.length > 0) {
          const range = selection!.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          selectionMenu = {
            show: true,
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
            text: selectedText
          };
        } else {
          selectionMenu = { show: false, x: 0, y: 0, text: "" };
        }
      }, 10);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Close menu if clicking outside
      if (selectionMenu.show && !(e.target as HTMLElement).closest(".selection-menu")) {
        selectionMenu = { show: false, x: 0, y: 0, text: "" };
      }
    };

    elements.forEach((el) => el.addEventListener("mouseup", handleMouseUp));
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      elements.forEach((el) => el.removeEventListener("mouseup", handleMouseUp));
      document.removeEventListener("mousedown", handleMouseDown);
    };
  });

  // --- Sensitive data detection ---
  const defaultContainsSensitiveData = (text: string): boolean => {
    if (!filterSensitive) return false;

    const ccPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/;
    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{12,}$/;
    const apiKeyPattern = /\b[A-Za-z0-9_-]{32,}\b/;
    const credentialPattern = /(password|passwd|pwd|token|secret|api[_-]?key)[\s:=]/i;

    return ccPattern.test(text) || passwordPattern.test(text) || apiKeyPattern.test(text) || credentialPattern.test(text);
  };

  // Use user-provided function if available, otherwise fallback
  const containsSensitiveData = (text: string) => {
    if (typeof detectSensitiveData === "function") {
      return detectSensitiveData(text);
    }
    return defaultContainsSensitiveData(text);
  };

  // --- Helpers ---
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    toast = { message, type };
    setTimeout(() => (toast = null), toastDuration);
  };

  const sortItems = (itemsList: ClipboardItem[]): ClipboardItem[] => {
    const pinned = itemsList.filter((i) => i.pinned).sort((a, b) => b.timestamp - a.timestamp);
    const unpinned = itemsList.filter((i) => !i.pinned).sort((a, b) => b.timestamp - a.timestamp);
    return [...pinned, ...unpinned];
  };

  const filteredItems = $derived(searchQuery.trim() ? items.filter((i) => i.text.toLowerCase().includes(searchQuery.toLowerCase())) : items);

  // --- Save from selection menu ---
  const saveSelection = async () => {
    const text = selectionMenu.text;
    if (!text) return;

    if (text.length > maxLength) {
      showToast(`Text too long (max ${maxLength} characters)`, "error");
      selectionMenu = { show: false, x: 0, y: 0, text: "" };
      return;
    }

    if (containsSensitiveData(text)) {
      showToast("Sensitive data detected. Not saved for security.", "error");
      selectionMenu = { show: false, x: 0, y: 0, text: "" };
      return;
    }

    const duplicate = items.find((i) => i.text === text);
    if (duplicate) {
      showToast("Already saved", "info");
      selectionMenu = { show: false, x: 0, y: 0, text: "" };
      return;
    }

    const item: ClipboardItem = {
      id: Date.now(),
      text,
      timestamp: Date.now()
    };

    items = sortItems([item, ...items]).slice(0, limit);
    showToast("Saved to clipboard manager");
    selectionMenu = { show: false, x: 0, y: 0, text: "" };
  };

  // --- Clipboard actions ---
  const addToClipboard = async () => {
    const trimmed = newText.trim();
    if (!trimmed) return;

    if (trimmed.length > maxLength) {
      showToast(`Text too long (max ${maxLength} characters)`, "error");
      return;
    }

    if (containsSensitiveData(trimmed)) {
      showToast("Sensitive data detected. Not saved for security.", "error");
      newText = "";
      return;
    }

    const duplicate = items.find((i) => i.text === trimmed);
    if (duplicate) {
      showToast("This text is already in your clipboard", "info");
      newText = "";
      return;
    }

    const item: ClipboardItem = {
      id: Date.now(),
      text: trimmed,
      timestamp: Date.now()
    };

    items = sortItems([item, ...items]).slice(0, limit);
    newText = "";

    try {
      await navigator.clipboard.writeText(item.text);
      showToast("Saved and copied to clipboard");
    } catch (e) {
      console.error("Clipboard write failed:", e);
      showToast("Saved but clipboard access denied", "error");
    }
  };

  const copyItem = async (item: ClipboardItem) => {
    try {
      await navigator.clipboard.writeText(item.text);
      showToast("Copied to clipboard");
    } catch (e) {
      showToast("Clipboard access denied", "error");
    }
  };

  const deleteItem = (id: number) => {
    items = items.filter((i) => i.id !== id);
    showToast("Deleted");
  };

  const togglePin = (id: number) => {
    items = items.map((i) => (i.id === id ? { ...i, pinned: !i.pinned } : i));
    items = sortItems(items);
  };

  const clearAll = () => {
    if (confirm("Clear all clipboard items?")) {
      items = [];
      showToast("All items cleared");
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addToClipboard();
    }
  };
</script>

<!-- packages/layerchart/src/lib/components/Legend.svelte -->
<div
  bind:this={ref}
  {...restProps}
  data-placement={placement}
  class={cls('lc-legend-container', className, classes.root)}
>
  <div class={cls('lc-legend-title', classes.title)}>
    {title}
  </div>
  {#if children}
    {@render children({
      values: scaleConfig.tickValues ?? scaleConfig.xScale?.ticks?.(ticks) ?? [],
      scale,
      seriesItems,
    })}
  {:else if variant === 'ramp'}
    {@const indicatorSize = 6}
    {@const tickLabelY = height + tickLengthProp + tickFontSize}
    {@const svgHeight = tickLabelY}
    <svg
      {width}
      height={svgHeight}
      viewBox="0 0 {width} {svgHeight}"
      class={cls('lc-legend-ramp-svg')}
    >
      <g class="lc-legend-ramp-g">
        {#if scaleConfig.interpolator}
          <ColorRamp
            {width}
            {height}
            interpolator={scaleConfig.interpolator}
            class="lc-legend-color-ramp"
          />
        {:else if scaleConfig.swatches}
          {#each scaleConfig.swatches as swatch, i}
            <rect {...extractLayerProps(swatch, 'lc-legend-ramp-swatch')} />
          {/each}
        {/if}
      </g>

      <g class="lc-legend-tick-group">
        {#each tickValuesProp ?? scaleConfig.xScale?.ticks?.(ticks) ?? [] as tick, i}
          <text
            text-anchor="middle"
            x={scaleConfig.xScale?.(tick) + scaleConfig.tickLabelOffset}
            y={tickLabelY}
            style:font-size={tickFontSize}
            class={cls('lc-legend-tick-text', classes.label)}
          >
            <!-- @ts-expect-error - improve types -->
            {tickFormatProp ? format(tick, asAny(tickFormatProp)) : tick}
          </text>

          {#if scaleConfig.tickLine}
            <line
              x1={scaleConfig.xScale?.(tick)}
              y1={0}
              x2={scaleConfig.xScale?.(tick)}
              y2={height + tickLengthProp}
              class={cls('lc-legend-tick-line', classes.tick)}
            />
          {/if}
        {/each}
      </g>

      {#if indicatorX != null}
        <path
          d="M{indicatorX - 4},{height + indicatorSize + 1} L{indicatorX + 4},{height +
            indicatorSize +
            1} L{indicatorX},{height} Z"
          class={cls('lc-legend-indicator')}
        />
      {/if}
    </svg>
  {:else if variant === 'swatches'}
    <div class={cls('lc-legend-swatch-group', classes.items)} data-orientation={orientation}>
      {#each swatchItems as item}
        <button
          type="button"
          class={cls('lc-legend-swatch-button', resolveMaybeFn(classes?.item, item))}
          style:opacity={selected.length === 0 || selected.includes(item.value) ? 1 : 0.3}
          onclick={(e) => onclickProp?.(e, item) ?? item.onclick?.(e)}
          onpointerenter={(e) => onpointerenterProp?.(e, item) ?? item.onpointerenter?.(e)}
          onpointerleave={(e) => onpointerleaveProp?.(e, item) ?? item.onpointerleave?.(e)}
        >
          <div
            class={cls('lc-legend-swatch', classes.swatch)}
            style:background-color={item.color}
          ></div>
          <div class={cls('lc-legend-swatch-label', classes.label)}>
            {item.label}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<!-- packages/layerchart/src/lib/components/layers/Canvas.svelte -->
<canvas
  bind:this={ref}
  style:z-index={zIndex}
  class={['lc-layout-canvas', className]}
  class:disablePointerEvents={pointerEvents === false}
  onclick={(e) => {
    const node = getPointerNode(e);
    bubbleEvent(node, 'click', e);
    onclick?.(e);
  }}
  ondblclick={(e) => {
    const node = getPointerNode(e);
    bubbleEvent(node, 'dblclick', e);
    ondblclick?.(e);
  }}
  onpointerdown={(e) => {
    const node = getPointerNode(e);
    bubbleEvent(node, 'pointerdown', e);
    onpointerdown?.(e);
  }}
  onpointerenter={(e) => {
    onpointerenter?.(e);
    onPointerMove(e);
  }}
  onpointermove={(e) => {
    onpointermove?.(e);
    onPointerMove(e);
  }}
  onpointerleave={(e) => {
    onpointerleave?.(e);
    onPointerLeave(e);
  }}
  ontouchmove={(e) => {
    // Prevent touch from interfering with pointer if over data
    if (lastActiveNode) {
      e.preventDefault();
    }

    const node = getPointerNode(e);
    bubbleEvent(node, 'touchmove', e);
  }}
  {...restProps}
>
  {#if fallback}
    {#if typeof fallback === 'function'}
      {@render fallback()}
    {:else}
      {fallback}
    {/if}
  {/if}
</canvas>

<!-- Hit canvas used for hidden context -->
<canvas bind:this={hitCanvasElement} class="lc-hit-canvas" class:debug></canvas>

{@render children?.({ ref, canvasContext: context })}
{captureSSR()}

<!-- packages/svelte-ux/src/lib/components/Button.svelte -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<svelte:element
  this={href ? 'a' : 'button'}
  {href}
  {target}
  {type}
  {...$$restProps}
  class={_class}
  style={$$props.style ?? ''}
  {disabled}
  aria-disabled={disabled ? 'true' : 'false'}
  use:multi={actions}
  on:click
  on:mouseover
  on:mouseout
  on:focus
  on:blur
>
  {#if loading}
    <span transition:slide={{ axis: 'x', duration: 200 }}>
      <ProgressCircle size={16} width={2} class={cls(settingsClasses.loading, classes.loading)} />
    </span>
  {:else if icon}
    <span in:slide={{ axis: 'x', duration: 200 }}>
      {#if typeof icon === 'string' || 'icon' in icon}
        <!-- font path/url/etc or font-awesome IconDefinition -->
        <Icon
          data={asIconData(icon)}
          class={cls('pointer-events-none', settingsClasses.icon, classes.icon)}
        />
      {:else}
        <Icon class={cls('pointer-events-none', settingsClasses.icon, classes.icon)} {...icon} />
      {/if}
    </span>
  {/if}

  <slot />
</svelte:element>

<!-- packages/svelte-ux/src/lib/components/TextField.svelte -->
<label
  for={id}
  role="group"
  class={cls(
    'TextField',
    'group flex gap-1',
    labelPlacement !== 'left' ? 'flex-col' : 'items-center',
    error ? '[--color:theme(colors.danger)]' : '[--color:theme(colors.primary)]',
    disabled && 'opacity-50 pointer-events-none',
    !base && (rounded ? 'rounded-full' : 'rounded'),
    settingsClasses.root,
    classes.root,
    $$props.class
  )}
  bind:this={labelEl}
>
  {#if label && ['top', 'left'].includes(labelPlacement)}
    <span
      class={cls(
        'label',
        'block text-sm font-medium',
        'truncate group-hover:text-surface-content/70 group-focus-within:text-[var(--color)] group-hover:group-focus-within:text-[var(--color)] cursor-pointer',
        error ? 'text-danger/80' : 'text-surface-content/50',
        `placement-${labelPlacement}`,
        settingsClasses.label,
        classes.label
      )}
    >
      {label}
    </span>
  {/if}

  <div class="flex-1">
    <div
      class={cls(
        'border py-0 transition-shadow',
        disabled ? '' : 'hover:shadow',
        disabled ? '' : error ? 'hover:border-danger' : 'hover:border-surface-content',
        {
          'px-2': !rounded,
          'px-6': rounded && !hasPrepend, // TODO: `hasPrepend` always true for SelectField, etc.  See: https://github.com/sveltejs/svelte/issues/6059
        },
        !base && ['bg-surface-100', rounded ? 'rounded-full' : 'rounded'],
        error && 'border-danger',
        'group-focus-within:shadow-md group-focus-within:border-[var(--color)]',
        settingsClasses.container,
        classes.container
      )}
    >
      <div class="flex items-center">
        {#if hasPrepend}
          <div
            class={cls(
              'prepend flex items-center whitespace-nowrap',
              rounded && 'pl-3',
              settingsClasses.prepend,
              classes.prepend
            )}
          >
            <slot name="prepend" />
            {#if icon}
              <span class="mr-3">
                <Icon data={asIconData(icon)} class="text-surface-content/50" />
              </span>
            {/if}
          </div>
        {/if}

        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div role={role === 'combobox' ? role : undefined} class="flex-grow inline-grid" on:click>
          {#if label && ['inset', 'float'].includes(labelPlacement)}
            <span
              class={cls(
                'label',
                'col-span-full row-span-full z-[1] flex items-center h-full truncate origin-top-left transition-all duration-200 group-hover:text-surface-content/70 group-focus-within:text-[var(--color)] group-hover:group-focus-within:text-[var(--color)] cursor-pointer',
                error ? 'text-danger/80' : 'text-surface-content/50',
                `placement-${labelPlacement}`,
                (labelPlacement === 'inset' || hasInputValue) && 'shrink',
                settingsClasses.label,
                classes.label
              )}
            >
              {label}
            </span>
          {/if}

          <div
            class={cls(
              'input col-span-full row-span-full flex items-center',
              hasInsetLabel && 'pt-4',
              dense ? 'my-1' : 'my-2',
              (hasPrefix || hasSuffix) &&
                label &&
                labelPlacement === 'float' &&
                !hasInputValue &&
                'opacity-0 transition-opacity',
              'group-focus-within:opacity-100'
            )}
          >
            <slot name="prefix" />

            {#if type === 'currency'}
              <Icon data={mdiCurrencyUsd} size="1.1em" class="text-surface-content/50 -mt-1" />
            {/if}

            {#if multiline}
              <textarea
                {id}
                {name}
                {placeholder}
                {autocomplete}
                {required}
                {disabled}
                value={inputValue}
                {autocapitalize}
                bind:this={inputEl}
                on:input={handleInput}
                on:focus
                on:blur
                on:keydown
                on:keypress
                class={cls(
                  'text-sm border-none w-full bg-transparent outline-none resize-none',
                  'placeholder-surface-content placeholder-opacity-0 group-focus-within:placeholder-opacity-50',
                  error && 'placeholder-danger',
                  (labelPlacement !== 'float' || !hasInsetLabel) && 'placeholder-opacity-50',
                  {
                    'text-left': align === 'left',
                    'text-center': align === 'center',
                    'text-right': align === 'right',
                  },
                  settingsClasses.input,
                  classes.input
                )}
                use:multi={textAreaMultiAction}
              ></textarea>
            {:else}
              <Input
                {id}
                {name}
                {placeholder}
                {required}
                {disabled}
                {autocomplete}
                type={inputType}
                inputmode={inputMode}
                value={String(inputValue ?? '')}
                {mask}
                {replace}
                {accept}
                {autocapitalize}
                {min}
                {max}
                {step}
                {actions}
                bind:inputEl
                on:input={handleInput}
                on:focus
                on:blur
                on:keydown
                on:keypress
                class={cls(
                  'text-sm border-none w-full bg-transparent outline-none truncate',
                  'selection:bg-surface-content/30',
                  'placeholder-surface-content placeholder-opacity-0 group-focus-within:placeholder-opacity-50',
                  error && 'placeholder-danger',
                  (labelPlacement !== 'float' || !hasInsetLabel) && 'placeholder-opacity-50',
                  {
                    'text-left': align === 'left',
                    'text-center': align === 'center',
                    'text-right': align === 'right',
                  },
                  settingsClasses.input,
                  classes.input
                )}
              />
            {/if}

            {#if type === 'percent'}
              <Icon data={mdiPercent} size="1.1em" class="text-surface-content/50 -mt-1 ml-1" />
            {/if}

            <slot name="suffix" />
          </div>
        </div>

        {#if hasAppend}
          <div
            class={cls(
              'append flex items-center whitespace-nowrap',
              settingsClasses.append,
              classes.append
            )}
          >
            {#if clearable && hasInputValue}
              <Button
                icon={mdiClose}
                {disabled}
                class="text-surface-content/50 p-1"
                on:click={() => {
                  inputValue = '';
                  operator = operators?.[0].value;
                  updateValue();
                  dispatch('clear');
                  labelEl?.focus();
                }}
              />
            {/if}

            {#if operators}
              <select
                {disabled}
                value={operator}
                on:change={onSelectChange}
                class="appearance-none bg-surface-content/5 border rounded-full mr-2 px-2 text-sm outline-none focus:border-opacity-50 focus:shadow-md"
                style="text-align-last: center;"
              >
                {#each operators ?? [] as { label, value }}
                  <option {value}>{label}</option>
                {/each}
              </select>
            {/if}

            {#if type === 'password'}
              <Button
                icon={mdiEye}
                {disabled}
                class="text-surface-content/50 p-2"
                on:click={() => {
                  if (inputType === 'password') {
                    inputType = 'text';
                  } else {
                    inputType = 'password';
                  }
                }}
              />
            {/if}

            <slot name="append" />

            {#if error}
              <Icon data={mdiInformationOutline} class="text-danger" />
            {:else if iconRight}
              <Icon data={asIconData(iconRight)} class="text-surface-content/50" />
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div
      class={cls(
        error ? 'error' : 'hint',
        'text-xs ml-2 transition-transform ease-out overflow-hidden origin-top transform group-focus-within:scale-y-100',
        error ? 'text-danger' : 'text-surface-content/50 scale-y-0',
        settingsClasses.error,
        classes.error
      )}
    >
      {error && error != true ? error : hint}
    </div>
  </div>
</label>

<!-- src/lib/datepicker/Datepicker.svelte -->
{#snippet navButton(forward: boolean)}
  <ToolbarButton color="dark" onclick={() => changeMonth(forward ? 1 : -1)} size="lg" aria-label={forward ? "Next month" : "Previous month"}>
    <svg class="h-3 w-3 rtl:rotate-180" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 10">
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={forward ? "M1 5h12m0 0L9 1m4 4L9 9" : "M13 5H1m0 0 4 4M1 5l4-4"}></path>
    </svg>
  </ToolbarButton>
{/snippet}

{#snippet yearNavButton(forward: boolean)}
  <ToolbarButton color="dark" onclick={() => changeYear(forward ? 1 : -1)} size="lg" aria-label={forward ? "Next year" : "Previous year"}>
    <svg class="h-3 w-3 rtl:rotate-180" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 10">
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={forward ? "M1 5h12m0 0L9 1m4 4L9 9" : "M13 5H1m0 0 4 4M1 5l4-4"}></path>
    </svg>
  </ToolbarButton>
{/snippet}

<div bind:this={datepickerContainerElement} class={["relative", inline && "inline-block"]}>
  {#if !inline}
    <div class="relative">
      <input
        {...inputProps}
        bind:this={elementRef}
        type="text"
        class={input({ color, class: clsx(theme?.input, inputClass) })}
        {placeholder}
        value={range ? `${formatDate(rangeFrom)} - ${formatDate(rangeTo)}` : formatDate(value)}
        onfocus={() => (isOpen = true)}
        onchange={handleInputChangeWithDateFns}
        onkeydown={handleInputKeydown}
        {disabled}
        {required}
        {inputmode}
        aria-haspopup="dialog"
      />
      <button
        type="button"
        class={button({ class: clsx(btnClass, theme?.button, classes?.button) })}
        onclick={() => (isOpen = !isOpen)}
        {disabled}
        aria-label={isOpen ? "Close date picker" : "Open date picker"}
      >
        <svg class="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
          <path
            d="M20 4a2 2 0 0 0-2-2h-2V1a1 1 0 0 0-2 0v1h-3V1a1 1 0 0 0-2 0v1H6V1a1 1 0 0 0-2 0v1H2a2 2 0 0 0-2 2v2h20V4ZM0 18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8H0v10Zm5-8h10a1 1 0 0 1 0 2H5a1 1 0 0 1 0-2Z"
          ></path>
        </svg>
      </button>
    </div>
  {/if}

  {#if isOpen || inline}
    <div bind:this={calendarRef} id="datepicker-dropdown" class={base({ inline, class: clsx(theme?.base, className) })} transition:fade={{ duration: 100 }} role="dialog" aria-label="Calendar">
      {#if title}
        <h2 class={titleVariant({ class: clsx(theme?.titleVariant, classes?.titleVariant) })}>{title}</h2>
      {/if}

      {#if showMonthSelector}
        <!-- Month/Year Selector View -->
        <div class={nav({ class: clsx(theme?.nav, classes?.nav) })}>
          {@render yearNavButton(false)}
          <h3 class={polite({ class: clsx(theme?.polite, classes?.polite) })} aria-live="polite">
            {currentMonth.getFullYear()}
          </h3>
          {@render yearNavButton(true)}
        </div>
        <div class="grid grid-cols-4 gap-2 p-4">
          {#each monthNames as month, index (index)}
            <Button
              type="button"
              color={monthColor}
              class={monthButton({
                class: clsx(currentMonth.getMonth() === index ? monthBtnSelected : monthBtn, classes?.monthButton, theme?.monthButton)
              })}
              onclick={(event: MouseEvent) => selectMonth(index, event)}
            >
              {month}
            </Button>
          {/each}
        </div>
      {:else}
        <div class={nav({ class: clsx(classes?.nav) })}>
          {@render navButton(false)}
          <Button
            type="button"
            class={polite({ class: clsx("cursor-pointer rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700", classes?.polite) })}
            aria-live="polite"
            onclick={(event: MouseEvent) => toggleMonthSelector(event)}
          >
            {currentMonth.toLocaleString(finalTranslationLocale, { month: "long", year: "numeric" })}
          </Button>
          {@render navButton(true)}
        </div>
        <div class={grid({ class: clsx(theme?.grid, classes?.grid) })} role="grid">
          {#each weekdays as day (day)}
            <div class={columnHeader({ class: clsx(theme?.columnHeader, classes?.columnHeader) })} role="columnheader">{day}</div>
          {/each}
          {#each daysInMonth as day (day)}
            {@const current = day.getMonth() !== currentMonth.getMonth()}
            {@const available = isDateAvailable(day)}
            <Button
              type="button"
              color={isSelected(day) ? color : "alternative"}
              class={dayButton({
                current,
                today: isToday(day),
                color: isInRange(day) ? color : undefined,
                unavailable: !available,
                class: clsx(theme?.dayButton, classes?.dayButton, !available && "cursor-not-allowed opacity-50")
              })}
              onclick={() => handleDaySelect(day)}
              onkeydown={handleCalendarKeydown}
              aria-label={day.toLocaleDateString(finalTranslationLocale, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              aria-selected={isSelected(day)}
              aria-disabled={!available}
              disabled={!available}
              role="gridcell"
            >
              {day.getDate()}
            </Button>
          {/each}
        </div>
      {/if}

      {#if showActionButtons && !showMonthSelector}
        <div class={actionButtons({ class: clsx(theme?.actionButtons, classes?.actionButtons) })}>
          <Button onclick={() => handleDaySelect(new Date())} {color} size="sm" disabled={!isDateAvailable(new Date())}>Today</Button>
          <Button onclick={handleClear} color="red" size="sm">Clear</Button>
          <Button onclick={handleApply} {color} size="sm">Apply</Button>
        </div>
      {/if}

      {#if actionSlot}
        <div class={clsx(classes?.actionSlot, theme?.actionSlot)}>
          {@render actionSlot({
            selectedDate: range ? { from: rangeFrom, to: rangeTo } : value,
            handleClear,
            handleApply,
            close: () => {
              isOpen = false;
              showMonthSelector = false;
            }
          })}
        </div>
      {/if}
    </div>
  {/if}
</div>

<!--
@component
[Go to docs](https://flowbite-svelte.com/)
## Type
[DatepickerProps](https://github.com/themesberg/flowbite-svelte/blob/main/src/lib/types.ts#L457)
## Props
@prop value = $bindable()
@prop defaultDate = null
@prop range = false
@prop rangeFrom = $bindable()
@prop rangeTo = $bindable()
@prop availableFrom = null
@prop availableTo = null
@prop locale = "default"
@prop translationLocale = locale
@prop firstDayOfWeek = 0
@prop dateFormat
@prop placeholder = "Select date"
@prop disabled = false
@prop required = false
@prop inputClass = ""
@prop color = "primary"
@prop inline = false
@prop autohide = true
@prop showActionButtons = false
@prop title = ""
@prop onselect
@prop onclear
@prop onapply
@prop btnClass
@prop inputmode = "none"
@prop classes
@prop monthColor = "alternative"
@prop monthBtnSelected = "bg-primary-500 text-white"
@prop monthBtn = "text-gray-700 dark:text-gray-300"
@prop class: className
@prop elementRef = $bindable()
@prop actionSlot
-->

<!-- src/lib/clipboard-manager/ClipboardManager.svelte -->
{#snippet inputArea()}
  <div class={styles.inputSection({ class: clsx(theme?.inputSection, classes?.inputSection) })}>
    <div class={styles.inputWrapper({ class: clsx(theme?.inputWrapper, classes?.inputWrapper) })}>
      <input type="text" bind:value={newText} onkeydown={handleKeydown} {placeholder} class={styles.input({ class: clsx(theme?.input, classes?.input) })} />
      <button onclick={addToClipboard} disabled={!newText.trim()} class={styles.addToClipboard({ class: clsx(theme?.addToClipboard, classes?.addToClipboard) })}>
        {saveLabel}
      </button>
    </div>

    <!-- Search and Clear -->
    {#if items.length > 0}
      <div class={styles.searchWrapper({ class: clsx(theme?.searchWrapper, classes?.searchWrapper) })}>
        <div class={styles.searchContainer({ class: clsx(theme?.searchContainer, classes?.searchContainer) })}>
          <input type="text" bind:value={searchQuery} placeholder="Search clipboard..." class={styles.searchInput({ class: clsx(theme?.searchInput, classes?.searchInput) })} />
          <svg class={styles.searchIcon({ class: clsx(theme?.searchIcon, classes?.searchIcon) })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <button onclick={clearAll} class={styles.clearAll({ class: clsx(theme?.clearAll, classes?.clearAll) })}>
          {clearLabel}
        </button>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet searchClear()}
  <!-- Show only search and clear when input is hidden -->
  <div class={styles.inputSection({ class: clsx(theme?.inputSection, classes?.inputSection) })}>
    <div class={styles.searchWrapper({ class: clsx(theme?.searchWrapper, classes?.searchWrapper) })}>
      <div class={styles.searchContainer({ class: clsx(theme?.searchContainer, classes?.searchContainer) })}>
        <input type="text" bind:value={searchQuery} placeholder="Search clipboard..." class={styles.searchInput({ class: clsx(theme?.searchInput, classes?.searchInput) })} />
        <svg class={styles.searchIcon({ class: clsx(theme?.searchIcon, classes?.searchIcon) })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </div>
      <button onclick={clearAll} class={styles.clearAll({ class: clsx(theme?.clearAll, classes?.clearAll) })}>
        {clearLabel}
      </button>
    </div>
  </div>
{/snippet}

{#snippet itemList()}
  <!-- Items list -->
  <div class={styles.itemsList({ class: clsx(theme?.itemsList, classes?.itemsList) })}>
    {#if filteredItems.length === 0}
      {#if emptyState}
        {@render emptyState()}
      {:else}
        <div class={styles.emptyState({ class: clsx(theme?.emptyState, classes?.emptyState) })}>
          {#if items.length === 0}
            <svg class={styles.emptyIcon({ class: clsx(theme?.emptyIcon, classes?.emptyIcon) })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p class={styles.emptyText({ class: clsx(theme?.emptyText, classes?.emptyText) })}>No clipboard items yet.</p>
            <p class={styles.emptySubtext({ class: clsx(theme?.emptySubtext, classes?.emptySubtext) })}>
              {#if enableSelectionMenu}
                Select any text and click "Save" to add it here
              {:else}
                Start typing above to save text
              {/if}
            </p>
          {:else}
            <p class={styles.emptyText({ class: clsx(theme?.emptyText, classes?.emptyText) })}>No items match "{searchQuery}"</p>
          {/if}
        </div>
      {/if}
    {:else}
      {#each filteredItems as item (item.id)}
        {#if children}
          {@render children({ item, copyItem, deleteItem, togglePin })}
        {:else}
          <div class={styles.item({ class: clsx(theme?.item, classes?.item) })}>
            <!-- Content -->
            <div class={styles.itemContent({ class: clsx(theme?.itemContent, classes?.itemContent) })}>
              <div class={styles.itemHeader({ class: clsx(theme?.itemHeader, classes?.itemHeader) })}>
                {#if item.pinned}
                  <Badge {...badgeProps}>Pinned</Badge>
                {/if}
                <span class={styles.itemTimestamp({ class: clsx(theme?.itemTimestamp, classes?.itemTimestamp) })}>
                  {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                </span>
              </div>
              <p class={styles.itemText({ class: clsx(theme?.itemText, classes?.itemText) })}>
                {item.text}
              </p>
            </div>

            <!-- Actions -->
            <div class={styles.itemActions({ class: clsx(theme?.itemActions, classes?.itemActions) })}>
              <!-- Copy -->
              <button onclick={() => copyItem(item)} class={styles.actionButton({ class: clsx(theme?.actionButton, classes?.actionButton) })} aria-label="Copy">
                <svg
                  class={styles.actionIcon({ class: clsx(theme?.actionIcon, classes?.actionIcon) })}
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  viewBox="0 0 24 24"
                >
                  <rect width="8" height="8" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 12V4a2 2 0 0 1 2-2h8" />
                </svg>
              </button>

              <!-- Pin / Unpin -->
              <button
                onclick={() => togglePin(item.id)}
                class={styles.pinButton({ pinned: item.pinned, class: clsx(theme?.pinButton, classes?.pinButton) })}
                aria-label={item.pinned ? "Unpin" : "Pin"}
              >
                <svg
                  class={styles.actionIcon({ class: clsx(theme?.actionIcon, classes?.actionIcon) })}
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 17v5" />
                  <path d="M8 13h8l1-5h-10z" />
                  <path d="M10 3h4v5h-4z" />
                </svg>
              </button>

              <!-- Delete -->
              <button onclick={() => deleteItem(item.id)} class={styles.deleteButton({ class: clsx(theme?.deleteButton, classes?.deleteButton) })} aria-label="Delete">
                <svg
                  class={styles.actionIcon({ class: clsx(theme?.actionIcon, classes?.actionIcon) })}
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  viewBox="0 0 24 24"
                >
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
          </div>
        {/if}
      {/each}
    {/if}
  </div>
{/snippet}

{#if isModal}
  <Modal title="Clipboard Manager" bind:open {...modalProps}>
    <div class={styles.base({ class: clsx(theme?.base, className) })}>
      {#if showInput}
        {@render inputArea()}
      {:else if items.length > 0}
        {@render searchClear()}
      {/if}

      {@render itemList()}
    </div>
  </Modal>
{:else}
  <div class={styles.base({ class: clsx(theme?.base, className) })}>
    {#if showInput}
      {@render inputArea()}
    {:else if items.length > 0}
      {@render searchClear()}
    {/if}

    {@render itemList()}
  </div>
{/if}

<!-- Selection Bubble Menu -->
{#if selectionMenu.show}
  <div class={styles.selectionMenu({ class: clsx(theme?.selectionMenu, classes?.selectionMenu) })} style="left: {selectionMenu.x}px; top: {selectionMenu.y}px;">
    <div class={styles.selectionBubble({ class: clsx(theme?.selectionBubble, classes?.selectionBubble) })}>
      <span class={styles.selectionText({ class: clsx(theme?.selectionText, classes?.selectionText) })}>
        {selectionMenu.text.slice(0, 50)}{selectionMenu.text.length > 50 ? "..." : ""}
      </span>
      <button onclick={saveSelection} class={styles.selectionButton()}>Save to Clipboard</button>
    </div>
    <!-- Arrow -->
    <div class={styles.selectionArrow({ class: clsx(theme?.selectionArrow, classes?.selectionArrow) })}></div>
  </div>
{/if}

<!-- Toast notification -->
{#if toast}
  <div class={styles.toastContainer({ class: clsx(theme?.toastContainer, classes?.toastContainer) })}>
    <div class={styles.toast({ type: toast.type, class: clsx(theme?.toast, classes?.toast) })}>
      <svg class={styles.toastIcon({ class: clsx(theme?.toastIcon, classes?.toastIcon) })} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        {#if toast.type === "success"}
          <path d="M5 13l4 4L19 7" />
        {:else if toast.type === "error"}
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9l-6 6M9 9l6 6" />
        {:else}
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        {/if}
      </svg>
      <span class={styles.toastText({ class: clsx(theme?.toastText, classes?.toastText) })}>{toast.message}</span>
    </div>
  </div>
{/if}

<style>
	/* packages/layerchart/src/lib/components/Legend.svelte */
  @layer components {
    :where(.lc-legend-container) {
      display: inline-block;
      z-index: 1; /*stack above tooltip context layers (band rects, voronoi, ...) */

      &[data-placement] {
        position: absolute;
      }

      &[data-placement='top-left'] {
        top: 0;
        left: 0;
      }
      &[data-placement='top'] {
        top: 0;
        left: 50%;
        transform: translateX(-50%);
      }
      &[data-placement='top-right'] {
        top: 0;
        right: 0;
      }
      &[data-placement='left'] {
        top: 50%;
        left: 0;
        transform: translateY(-50%);
      }
      &[data-placement='center'] {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }
      &[data-placement='right'] {
        top: 50%;
        right: 0;
        transform: translateY(-50%);
      }
      &[data-placement='bottom-left'] {
        bottom: 0;
        left: 0;
      }
      &[data-placement='bottom'] {
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
      }
      &[data-placement='bottom-right'] {
        bottom: 0;
        right: 0;
      }
    }

    :where(.lc-legend-title) {
      font-size: 10px;
      font-weight: 600;
    }

    :where(.lc-legend-ramp-svg) {
      overflow: visible;
    }

    :where(.lc-legend-tick-text) {
      font-size: 10px;
      fill: var(--color-surface-content, currentColor);
    }

    :where(.lc-legend-tick-line) {
      stroke: var(--color-surface-content, currentColor);
    }

    :where(.lc-legend-indicator) {
      fill: var(--color-surface-content, currentColor);
    }

    :where(.lc-legend-swatch-group) {
      display: flex;
      gap: 0.25rem 1rem;

      &[data-orientation='vertical'] {
        flex-direction: column;
      }
    }

    :where(.lc-legend-swatch-button) {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    :where(.lc-legend-swatch) {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      border-radius: 9999px; /* full */
    }

    :where(.lc-legend-swatch-label) {
      font-size: 0.75rem; /* text-xs */
      line-height: calc(1 / 0.75);
      color: var(--color-surface-content, currentColor);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

	/* packages/layerchart/src/lib/components/layers/Canvas.svelte */
  @layer base {
    :where(.lc-layout-canvas) {
      position: absolute;
      inset: 0;

      &.disablePointerEvents {
        pointer-events: none;
      }
    }

    :where(.lc-hit-canvas) {
      position: absolute;
      inset: 0;
      pointer-events: none; /* events handled by main canvas */
      image-rendering: pixelated; /* https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering */

      opacity: 0;
      &.debug {
        border: 1px solid var(--color-danger, red);
        opacity: 1;
      }
    }
  }

	/* packages/svelte-ux/src/lib/components/TextField.svelte */
  .TextField:focus-within .label.placement-float,
  .label.shrink {
    transform: scale(0.75);
    width: 133%; /* offset 75% scale */
    height: 32px;
  }

  :global(input::placeholder),
  textarea::placeholder {
    transition: color 200ms; /* Move to tailwind plugin? */
  }
</style>
