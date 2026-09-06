import { combineRgb, type CompanionPresetDefinitions, type CompanionPresetSection } from '@companion-module/base'
import type NetioInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { NetioOutputAction } from './api/types.js'
import { DEFAULT_CONFIG } from './config.js'
import { INPUT_CLOSED_STYLE, OUTPUT_ON_STYLE } from './feedbacks.js'
import { GaugeOutputPreset, GaugeReadoutPreset, nominalVoltage } from './gauges.js'

const BASE_STYLE = {
	size: 'auto',
	color: combineRgb(255, 255, 255),
	bgcolor: combineRgb(0, 0, 0),
} as const

/** Shown before the device has been reached, so the preset list is never empty. */
const ASSUMED_OUTPUT_COUNT = 4

/** Output actions that get a generated preset per output. */
const OUTPUT_PRESET_KINDS = [
	{
		id: 'toggle',
		groupName: 'Toggle',
		groupDescription: 'Toggle a power output on or off',
		buttonLabel: 'Toggle',
		action: NetioOutputAction.Toggle,
	},
	{
		id: 'on',
		groupName: 'Switch on',
		groupDescription: 'Switch a power output on',
		buttonLabel: 'On',
		action: NetioOutputAction.On,
	},
	{
		id: 'off',
		groupName: 'Switch off',
		groupDescription: 'Switch a power output off',
		buttonLabel: 'Off',
		action: NetioOutputAction.Off,
	},
	{
		id: 'restart',
		groupName: 'Power cycle',
		groupDescription: 'Switch a power output off for the delay configured on the device, then back on',
		buttonLabel: 'Restart',
		action: NetioOutputAction.ShortOff,
	},
] as const

export function UpdatePresets(self: NetioInstance): void {
	const status = self.deviceStatus
	const outputs = status?.Outputs ?? placeholderOutputs()
	const inputs = status?.Inputs ?? []
	const measure = status?.GlobalMeasure

	// Guards a config predating this field, and a stored zero.
	const rating = Number(self.config.currentRating) || DEFAULT_CONFIG.currentRating

	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const sections: CompanionPresetSection<ModuleSchema>[] = []

	// Variables are referenced through the connection label so that the button
	// text keeps updating after the preset has been placed on a page.
	const variable = (name: string) => `$(${self.label}:${name})`

	const outputGroups = OUTPUT_PRESET_KINDS.map((kind) => {
		const references: string[] = []

		for (const output of outputs) {
			const reference = `output_${output.ID}_${kind.id}`
			references.push(reference)

			presets[reference] = {
				type: 'simple',
				name: `${output.Name} - ${kind.buttonLabel}`,
				keywords: [kind.buttonLabel, output.Name, `output ${output.ID}`],
				style: {
					...BASE_STYLE,
					text: `${variable(`output_${output.ID}_name`)}\n${kind.buttonLabel}`,
				},
				previewStyle: {
					...BASE_STYLE,
					text: `Output ${output.ID}\n${kind.buttonLabel}`,
				},
				steps: [
					{
						down: [
							{
								actionId: 'output_action',
								options: {
									output: output.ID,
									action: kind.action,
									overrideDelay: false,
									delay: 5000,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'output_state',
						options: { output: output.ID },
						style: OUTPUT_ON_STYLE,
					},
				],
			}
		}

		return {
			id: `outputs_${kind.id}`,
			name: kind.groupName,
			description: kind.groupDescription,
			type: 'simple' as const,
			presets: references,
		}
	})

	// Only outputs that actually report a current can drive a gauge. On an 8QS
	// that is output 1 only; on a PowerBOX 3Px it is none, and the group is
	// left out entirely.
	const meteredOutputs = outputs.filter((output) => 'Current' in output && output.Current !== undefined)
	const gaugeReferences: string[] = []

	for (const output of meteredOutputs) {
		const reference = `output_${output.ID}_gauge`
		gaugeReferences.push(reference)

		presets[reference] = GaugeOutputPreset({
			output: output.ID,
			name: `${output.Name} - Toggle with current gauge`,
			keywords: ['Toggle', 'gauge', 'current', output.Name, `output ${output.ID}`],
			valueExpression: `$(${self.label}:output_${output.ID}_current_a)`,
			text:
				`${variable(`output_${output.ID}_name`)}\n` +
				`${variable(`output_${output.ID}_state_text`)}\n` +
				`${variable(`output_${output.ID}_current_a`)}A`,
			previewText: `Output ${output.ID}\nOff\n0A`,
			max: rating,
			onStyle: OUTPUT_ON_STYLE,
		})
	}

	presets['outputs_all_off'] = {
		type: 'simple',
		name: 'All outputs - Off',
		style: { ...BASE_STYLE, text: 'All\nOff' },
		steps: [{ down: [{ actionId: 'outputs_all_action', options: { action: NetioOutputAction.Off } }], up: [] }],
		feedbacks: [],
	}
	presets['outputs_all_on'] = {
		type: 'simple',
		name: 'All outputs - On',
		style: { ...BASE_STYLE, text: 'All\nOn' },
		steps: [{ down: [{ actionId: 'outputs_all_action', options: { action: NetioOutputAction.On } }], up: [] }],
		feedbacks: [],
	}

	sections.push({
		id: 'outputs',
		name: 'Outputs',
		description: status
			? `Power outputs of ${status.Agent.DeviceName}`
			: 'Connect to the device to generate presets for its actual outputs',
		definitions: [
			...outputGroups,
			...(gaugeReferences.length > 0
				? [
						{
							id: 'outputs_gauge',
							name: 'Toggle with current gauge',
							description: 'Toggles the output and shows its live current on a ring gauge',
							type: 'simple' as const,
							presets: gaugeReferences,
						},
					]
				: []),
			{
				id: 'outputs_all',
				name: 'All outputs',
				description: 'Switch every output at once',
				type: 'simple',
				presets: ['outputs_all_on', 'outputs_all_off'],
			},
		],
	})

	if (inputs.length > 0) {
		const references: string[] = []

		for (const input of inputs) {
			const reference = `input_${input.ID}`
			references.push(reference)

			presets[reference] = {
				type: 'simple',
				name: `${input.Name} - state`,
				style: {
					...BASE_STYLE,
					text: `${variable(`input_${input.ID}_name`)}\n${variable(`input_${input.ID}_state_text`)}`,
				},
				previewStyle: { ...BASE_STYLE, text: `Input ${input.ID}\nOpen` },
				steps: [],
				feedbacks: [
					{
						feedbackId: 'input_state',
						options: { input: input.ID },
						style: INPUT_CLOSED_STYLE,
					},
				],
			}
		}

		sections.push({
			id: 'inputs',
			name: 'Inputs',
			description: 'Indicators for the digital inputs',
			definitions: references,
		})
	}

	const deviceReferences: string[] = ['device_info']
	presets['device_info'] = {
		type: 'simple',
		name: 'Device name and uptime',
		style: {
			...BASE_STYLE,
			text: `${variable('device_name')}\n${variable('uptime_text')}`,
		},
		previewStyle: { ...BASE_STYLE, text: 'Device\nuptime' },
		steps: [],
		feedbacks: [],
	}

	if (measure) {
		// Current is gauged against the configured rating directly. Load has no
		// rating of its own, so it is scaled by the rating at nominal mains
		// voltage - 16 A at 230 V is 3680 W.
		if (measure.TotalCurrent !== undefined) {
			deviceReferences.push('device_current')
			presets['device_current'] = GaugeReadoutPreset({
				name: 'Total current',
				keywords: ['current', 'gauge', 'amps'],
				valueExpression: `$(${self.label}:total_current_a)`,
				text: `Total\n${variable('total_current_a')}A`,
				previewText: 'Total\n0A',
				max: rating,
			})
		}

		if (measure.TotalLoad !== undefined) {
			deviceReferences.push('device_load')
			presets['device_load'] = GaugeReadoutPreset({
				name: 'Total load',
				keywords: ['load', 'power', 'gauge', 'watts'],
				valueExpression: `$(${self.label}:total_load)`,
				text: `Load\n${variable('total_load')}W`,
				previewText: 'Load\n0W',
				max: rating * nominalVoltage(measure.Voltage),
			})
		}

		const readouts: { id: string; name: string; label: string; variable: string }[] = []
		if (measure.Voltage !== undefined) {
			readouts.push({ id: 'device_voltage', name: 'Voltage', label: 'Voltage', variable: 'voltage' })
		}
		if (measure.TotalEnergy !== undefined) {
			readouts.push({ id: 'device_energy', name: 'Total energy', label: 'Wh', variable: 'total_energy' })
		}

		for (const readout of readouts) {
			deviceReferences.push(readout.id)
			presets[readout.id] = {
				type: 'simple',
				name: readout.name,
				style: { ...BASE_STYLE, text: `${readout.label}\n${variable(readout.variable)}` },
				previewStyle: { ...BASE_STYLE, text: `${readout.label}\n0` },
				steps: [],
				feedbacks: [],
			}
		}
	}

	sections.push({
		id: 'device',
		name: 'Device',
		description: 'Read-only indicators for the device itself',
		definitions: deviceReferences,
	})

	self.setPresetDefinitions(sections, presets)
}

function placeholderOutputs(): { ID: number; Name: string }[] {
	return Array.from({ length: ASSUMED_OUTPUT_COUNT }, (_unused, index) => ({
		ID: index + 1,
		Name: `Output ${index + 1}`,
	}))
}
