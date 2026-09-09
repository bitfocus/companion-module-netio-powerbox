import {
	combineRgb,
	type ButtonGraphicsGaugeStop,
	type CompanionPresetAlternatives,
	type SomeButtonGraphicsElement,
} from '@companion-module/base'
import type { ModuleSchema } from './main.js'
import { NetioOutputAction } from './api/types.js'

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

/** Gauge fill colours, stepping up as the reading approaches the rating. */
const GAUGE_NORMAL = combineRgb(0, 179, 0)
const GAUGE_HIGH = combineRgb(240, 170, 0)
const GAUGE_OVER = combineRgb(216, 0, 0)

/**
 * Background of a layered output button while that output is switched on.
 *
 * Deliberately darker than `GAUGE_NORMAL`: the ring is drawn on top of this, so
 * a background as bright as the gauge fill would hide the reading. The button
 * also spells out On/Off in its text, because an output that is on but idle
 * reads zero on the gauge and would otherwise look identical to one that is off.
 */
export const OUTPUT_ON_BACKGROUND = combineRgb(0, 90, 0)

/** Fractions of full scale at which the gauge changes colour. */
const HIGH_THRESHOLD = 0.75
const OVER_THRESHOLD = 0.9

const GAUGE_ELEMENT_ID = 'gauge'
const BACKGROUND_ELEMENT_ID = 'background'

/**
 * Colour stops for a gauge running 0..max.
 *
 * Stop values are absolute, in the same units as the gauge's min/max, so they
 * are derived from the configured rating rather than being percentages.
 */
function ratingStops(max: number): ButtonGraphicsGaugeStop[] {
	return [
		{ value: 0, color: GAUGE_NORMAL, gradient: false },
		{ value: max * HIGH_THRESHOLD, color: GAUGE_HIGH, gradient: false },
		{ value: max * OVER_THRESHOLD, color: GAUGE_OVER, gradient: false },
	]
}

function ringGauge(valueExpression: string, max: number): SomeButtonGraphicsElement {
	return {
		type: 'gauge',
		id: GAUGE_ELEMENT_ID,
		orientation: 'ring',
		min: 0,
		max,
		value: { isExpression: true, value: valueExpression },
		multiColour: true,
		stops: ratingStops(max),
		roundedEnds: true,
		trackStyle: 'dimmed',
	}
}

function centredText(id: string, text: string): SomeButtonGraphicsElement {
	return {
		type: 'text',
		id,
		text,
		color: WHITE,
		halign: 'center',
		valign: 'center',
		fontsizeAllowShrink: true,
	}
}

export interface GaugeReadoutOptions {
	name: string
	keywords?: string[]
	/** Expression evaluated for the gauge needle, e.g. `$(netio:total_current_a)`. */
	valueExpression: string
	/** Button text, which may contain variable references. */
	text: string
	/** Text shown in the preset browser, where variables are not resolved. */
	previewText: string
	/** Full scale of the gauge, in the same unit as the value. */
	max: number
}

/**
 * A read-only gauge, paired with the plain text button it replaces.
 *
 * Returned as an `alternatives` group so hosts that cannot render layered
 * buttons fall back to the text variant instead of showing nothing.
 */
export function GaugeReadoutPreset(options: GaugeReadoutOptions): CompanionPresetAlternatives<ModuleSchema> {
	return {
		type: 'alternatives',
		variants: [
			{
				type: 'layered',
				name: options.name,
				keywords: options.keywords,
				elements: [ringGauge(options.valueExpression, options.max), centredText('value', options.text)],
				steps: [],
				feedbacks: [],
			},
			{
				type: 'simple',
				name: options.name,
				keywords: options.keywords,
				style: { text: options.text, size: 'auto', color: WHITE, bgcolor: BLACK },
				previewStyle: { text: options.previewText, size: 'auto', color: WHITE, bgcolor: BLACK },
				steps: [],
				feedbacks: [],
			},
		],
	}
}

export interface GaugeOutputButtonOptions extends GaugeReadoutOptions {
	output: number
	/** Style applied by the output-state feedback on the simple fallback. */
	onStyle: { bgcolor: number; color: number }
}

/**
 * An output button that toggles the output, shows its live current on a ring
 * gauge, and turns green while the output is on.
 *
 * The layered variant recolours the background element via a style override;
 * the fallback recolours the whole button the old way.
 */
export function GaugeOutputPreset(options: GaugeOutputButtonOptions): CompanionPresetAlternatives<ModuleSchema> {
	const toggle = {
		actionId: 'output_action' as const,
		options: { output: options.output, action: NetioOutputAction.Toggle, overrideDelay: false, delay: 5000 },
	}

	return {
		type: 'alternatives',
		variants: [
			{
				type: 'layered',
				name: options.name,
				keywords: options.keywords,
				elements: [
					{ type: 'box', id: BACKGROUND_ELEMENT_ID, color: BLACK },
					ringGauge(options.valueExpression, options.max),
					centredText('value', options.text),
				],
				steps: [{ down: [toggle], up: [] }],
				feedbacks: [
					{
						feedbackId: 'output_state',
						options: { output: options.output },
						styleOverrides: [
							{
								elementId: BACKGROUND_ELEMENT_ID,
								elementProperty: 'color',
								override: OUTPUT_ON_BACKGROUND,
							},
						],
					},
				],
			},
			{
				type: 'simple',
				name: options.name,
				keywords: options.keywords,
				style: { text: options.text, size: 'auto', color: WHITE, bgcolor: BLACK },
				previewStyle: { text: options.previewText, size: 'auto', color: WHITE, bgcolor: BLACK },
				steps: [{ down: [toggle], up: [] }],
				feedbacks: [
					{
						feedbackId: 'output_state',
						options: { output: options.output },
						style: options.onStyle,
					},
				],
			},
		],
	}
}

/**
 * Mains voltage snapped to the nearest nominal value, used to turn an amp
 * rating into a watt full scale. Snapped rather than used directly so the
 * gauge scale does not drift with every voltage reading.
 */
export function nominalVoltage(measured: number | undefined): number {
	if (measured === undefined || !Number.isFinite(measured) || measured <= 0) return 230
	return measured < 160 ? 120 : 230
}
