import type { CompanionVariableDefinitions } from '@companion-module/base'
import type NetioInstance from './main.js'
import { NetioState, type NetioGlobalMeasure, type NetioOutput, type NetioStatus } from './api/types.js'

type DeviceVariables = {
	model: string
	device_name: string
	serial_number: string
	mac: string
	firmware_version: string
	json_version: string
	device_time: string
	uptime: number
	uptime_text: string
	num_outputs: number
	num_inputs: number
	outputs_on: number
}

/** Reported by metered devices only, so every entry is optional. */
type GlobalMeasureVariables = {
	voltage?: number
	frequency?: number
	total_current?: number
	total_current_a?: number
	total_load?: number
	total_power_factor?: number
	total_phase?: number
	total_energy?: number
	total_energy_nr?: number
	total_reverse_energy?: number
	total_reverse_energy_nr?: number
	energy_start?: string
}

type OutputVariables = {
	[key: `output_${number}_name`]: string
	[key: `output_${number}_state`]: number
	[key: `output_${number}_state_text`]: string
	[key: `output_${number}_delay`]: number
	[key: `output_${number}_current`]: number
	[key: `output_${number}_current_a`]: number
	[key: `output_${number}_load`]: number
	[key: `output_${number}_power_factor`]: number
	[key: `output_${number}_phase`]: number
	[key: `output_${number}_energy`]: number
	[key: `output_${number}_energy_nr`]: number
	[key: `output_${number}_reverse_energy`]: number
	[key: `output_${number}_reverse_energy_nr`]: number
}

type InputVariables = {
	[key: `input_${number}_name`]: string
	[key: `input_${number}_state`]: number
	[key: `input_${number}_state_text`]: string
	[key: `input_${number}_s0_counter`]: number
}

export type VariablesSchema = DeviceVariables & GlobalMeasureVariables & OutputVariables & InputVariables

/** Numeric per-output measurements, keyed by the variable name suffix. */
type OutputMetricSuffix =
	| 'delay'
	| 'current'
	| 'current_a'
	| 'load'
	| 'power_factor'
	| 'phase'
	| 'energy'
	| 'energy_nr'
	| 'reverse_energy'
	| 'reverse_energy_nr'

interface OutputMetric {
	suffix: OutputMetricSuffix
	label: string
	read: (output: NetioOutput) => number | undefined
}

const OUTPUT_METRICS: readonly OutputMetric[] = [
	{ suffix: 'delay', label: 'short on/off delay (ms)', read: (output) => output.Delay },
	{ suffix: 'current', label: 'current (mA)', read: (output) => output.Current },
	{ suffix: 'current_a', label: 'current (A)', read: (output) => milliampsToAmps(output.Current) },
	{ suffix: 'load', label: 'load (W)', read: (output) => output.Load },
	{ suffix: 'power_factor', label: 'true power factor', read: (output) => output.PowerFactor },
	{ suffix: 'phase', label: 'phase (deg)', read: (output) => output.Phase },
	{ suffix: 'energy', label: 'energy (Wh)', read: (output) => output.Energy },
	{ suffix: 'energy_nr', label: 'energy, not resettable (Wh)', read: (output) => output.EnergyNR },
	{ suffix: 'reverse_energy', label: 'reverse energy (Wh)', read: (output) => output.ReverseEnergy },
	{
		suffix: 'reverse_energy_nr',
		label: 'reverse energy, not resettable (Wh)',
		read: (output) => output.ReverseEnergyNR,
	},
]

type GlobalMetricId = Exclude<keyof GlobalMeasureVariables, 'energy_start'>

interface GlobalMetric {
	id: GlobalMetricId
	label: string
	read: (measure: NetioGlobalMeasure) => number | undefined
}

const GLOBAL_METRICS: readonly GlobalMetric[] = [
	{ id: 'voltage', label: 'Voltage (V)', read: (measure) => measure.Voltage },
	{ id: 'frequency', label: 'Frequency (Hz)', read: (measure) => measure.Frequency },
	{ id: 'total_current', label: 'Total current (mA)', read: (measure) => measure.TotalCurrent },
	{ id: 'total_current_a', label: 'Total current (A)', read: (measure) => milliampsToAmps(measure.TotalCurrent) },
	{ id: 'total_load', label: 'Total load (W)', read: (measure) => measure.TotalLoad },
	{
		id: 'total_power_factor',
		label: 'Total true power factor',
		// Older firmware only reports the "Overall" spelling of these two.
		read: (measure) => measure.TotalPowerFactor ?? measure.OverallPowerFactor,
	},
	{
		id: 'total_phase',
		label: 'Total phase (deg)',
		read: (measure) => measure.TotalPhase ?? measure.Phase ?? measure.OverallPhase,
	},
	{ id: 'total_energy', label: 'Total energy (Wh)', read: (measure) => measure.TotalEnergy },
	{
		id: 'total_energy_nr',
		label: 'Total energy, not resettable (Wh)',
		read: (measure) => measure.TotalEnergyNR,
	},
	{
		id: 'total_reverse_energy',
		label: 'Total reverse energy (Wh)',
		read: (measure) => measure.TotalReverseEnergy,
	},
	{
		id: 'total_reverse_energy_nr',
		label: 'Total reverse energy, not resettable (Wh)',
		read: (measure) => measure.TotalReverseEnergyNR,
	},
]

/**
 * Declare the variables this device actually has.
 *
 * Definitions are derived from the last status document rather than hardcoded,
 * because the JSON API is shared by models with 3 to 8 outputs, with or without
 * energy metering, and with or without digital inputs. Call this again whenever
 * the shape of the document changes.
 */
export function UpdateVariableDefinitions(self: NetioInstance): void {
	const status = self.deviceStatus

	const definitions: CompanionVariableDefinitions<VariablesSchema> = {
		model: { name: 'Device model' },
		device_name: { name: 'Device name' },
		serial_number: { name: 'Serial number' },
		mac: { name: 'MAC address' },
		firmware_version: { name: 'Firmware version' },
		json_version: { name: 'JSON protocol version' },
		device_time: { name: 'Device date and time' },
		uptime: { name: 'Uptime (s)' },
		uptime_text: { name: 'Uptime (formatted)' },
		num_outputs: { name: 'Number of outputs' },
		num_inputs: { name: 'Number of inputs' },
		outputs_on: { name: 'Number of outputs switched on' },
	}

	if (status?.GlobalMeasure) {
		for (const metric of GLOBAL_METRICS) {
			if (metric.read(status.GlobalMeasure) === undefined) continue
			definitions[metric.id] = { name: metric.label }
		}
		if (status.GlobalMeasure.EnergyStart !== undefined) {
			definitions.energy_start = { name: 'Energy counters reset at' }
		}
	}

	for (const output of status?.Outputs ?? []) {
		definitions[`output_${output.ID}_name`] = { name: `Output ${output.ID} name` }
		definitions[`output_${output.ID}_state`] = { name: `Output ${output.ID} state (0/1)` }
		definitions[`output_${output.ID}_state_text`] = { name: `Output ${output.ID} state (On/Off)` }

		for (const metric of OUTPUT_METRICS) {
			if (metric.read(output) === undefined) continue
			definitions[`output_${output.ID}_${metric.suffix}`] = { name: `Output ${output.ID} ${metric.label}` }
		}
	}

	for (const input of status?.Inputs ?? []) {
		definitions[`input_${input.ID}_name`] = { name: `Input ${input.ID} name` }
		definitions[`input_${input.ID}_state`] = { name: `Input ${input.ID} state (0/1)` }
		definitions[`input_${input.ID}_state_text`] = { name: `Input ${input.ID} state (Closed/Open)` }
		if (input.S0Counter !== undefined) {
			definitions[`input_${input.ID}_s0_counter`] = { name: `Input ${input.ID} S0 counter` }
		}
	}

	self.setVariableDefinitions(definitions)
}

/** Push the values from a status document into the variables declared above. */
export function UpdateVariableValues(self: NetioInstance, status: NetioStatus): void {
	const values: Partial<VariablesSchema> = {
		model: status.Agent.Model,
		device_name: status.Agent.DeviceName,
		serial_number: status.Agent.SerialNumber ?? '',
		mac: status.Agent.MAC ?? '',
		firmware_version: status.Agent.Version,
		json_version: status.Agent.JSONVer,
		device_time: status.Agent.Time,
		uptime: status.Agent.Uptime,
		uptime_text: formatUptime(status.Agent.Uptime),
		num_outputs: status.Agent.NumOutputs,
		num_inputs: status.Agent.NumInputs ?? 0,
		outputs_on: status.Outputs.filter((output) => output.State === NetioState.On).length,
	}

	const measure = status.GlobalMeasure
	if (measure) {
		for (const metric of GLOBAL_METRICS) {
			values[metric.id] = metric.read(measure)
		}
		values.energy_start = measure.EnergyStart
	}

	for (const output of status.Outputs) {
		values[`output_${output.ID}_name`] = output.Name
		values[`output_${output.ID}_state`] = output.State
		values[`output_${output.ID}_state_text`] = output.State === NetioState.On ? 'On' : 'Off'

		for (const metric of OUTPUT_METRICS) {
			values[`output_${output.ID}_${metric.suffix}`] = metric.read(output)
		}
	}

	for (const input of status.Inputs ?? []) {
		values[`input_${input.ID}_name`] = input.Name
		values[`input_${input.ID}_state`] = input.State
		values[`input_${input.ID}_state_text`] = input.State === NetioState.On ? 'Closed' : 'Open'
		values[`input_${input.ID}_s0_counter`] = input.S0Counter
	}

	self.setVariableValues(values)
}

/**
 * The API reports current in milliamps, but device front panels, breaker
 * ratings and the gauge presets all work in amps.
 */
function milliampsToAmps(milliamps: number | undefined): number | undefined {
	if (milliamps === undefined) return undefined
	return Math.round(milliamps / 10) / 100
}

/**
 * Formats a number of seconds as `HH:MM:SS`, prefixed with `Nd ` once it passes
 * a day. Done by hand because `Intl.DurationFormat` does not exist on node22,
 * and does not normalise seconds into larger units even where it does.
 */
function formatUptime(seconds: number): string {
	// Old firmware is documented to omit tags, so this is not guaranteed to be
	// a number however the types describe it. Blank beats "NaN:NaN:NaN".
	if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return ''

	const total = Math.floor(seconds)
	const pad = (value: number) => value.toString().padStart(2, '0')

	const days = Math.floor(total / 86400)
	const clock = `${pad(Math.floor(total / 3600) % 24)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`

	return days > 0 ? `${days}d ${clock}` : clock
}
