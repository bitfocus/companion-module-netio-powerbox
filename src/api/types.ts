/**
 * Types for the NETIO M2M JSON API (`netio.json`), protocol version 2.4.
 *
 * The same document is returned by a GET (read) and by a POST (write), so a
 * write response can be used to refresh state without a follow-up read.
 *
 * Which fields are present depends on the model: only metered devices report
 * `GlobalMeasure` and the per-output energy values, and only devices with
 * digital inputs report `Inputs`. Everything optional here is genuinely absent
 * on some supported device.
 */

/** Action to apply to an output ("write" function). */
export enum NetioOutputAction {
	Off = 0,
	On = 1,
	/** Switch off for the output's short delay, then back on (restart). */
	ShortOff = 2,
	/** Switch on for the output's short delay, then back off. */
	ShortOn = 3,
	Toggle = 4,
	NoChange = 5,
	/** Placeholder meaning "use the State tag instead". Always returned on read. */
	Ignore = 6,
}

/** State of an output or input. */
export enum NetioState {
	Off = 0,
	On = 1,
}

export interface NetioAgent {
	Model: string
	Version: string
	JSONVer: string
	DeviceName: string
	VendorID: number
	OemID: number
	/** Only present on LAN/WiFi devices. */
	MAC?: string
	/** Preferred identifier, matches the label on the device. Absent on old firmware. */
	SerialNumber?: string
	/** Seconds since power-up. */
	Uptime: number
	Time: string
	NumOutputs: number
	NumInputs?: number
}

/** Device wide measurements. Only reported by metered devices. */
export interface NetioGlobalMeasure {
	/** Volts. */
	Voltage?: number
	/** Hertz. */
	Frequency?: number
	/** Milliamps, through all outputs. */
	TotalCurrent?: number
	/** Watts, all outputs (excludes the device's own consumption). */
	TotalLoad?: number
	TotalPowerFactor?: number
	/** Degrees. */
	TotalPhase?: number
	/** Watt hours, resettable. */
	TotalEnergy?: number
	/** Watt hours, not resettable. */
	TotalEnergyNR?: number
	/** Watt hours of produced energy, resettable. */
	TotalReverseEnergy?: number
	/** Watt hours of produced energy, not resettable. */
	TotalReverseEnergyNR?: number
	/** Timestamp of the last counter reset. */
	EnergyStart?: string

	/** Superseded by `TotalPowerFactor`, kept for older firmware. */
	OverallPowerFactor?: number
	/** Superseded by `TotalPhase`, kept for older firmware. */
	OverallPhase?: number
	/** Superseded by `TotalPhase`, kept for older firmware. */
	Phase?: number
}

export interface NetioOutput {
	ID: number
	Name: string
	State: NetioState
	/** Always `Ignore` on read. */
	Action: NetioOutputAction
	/** Milliseconds used by the short on/off actions. */
	Delay?: number
	/** Milliamps. */
	Current?: number
	PowerFactor?: number
	/** Degrees. */
	Phase?: number
	/** Watts. */
	Load?: number
	/** Watt hours, resettable. */
	Energy?: number
	/** Watt hours, not resettable. */
	EnergyNR?: number
	/** Watt hours of produced energy, resettable. */
	ReverseEnergy?: number
	/** Watt hours of produced energy, not resettable. */
	ReverseEnergyNR?: number
}

export interface NetioInput {
	ID: number
	Name: string
	/** 0 = open, 1 = closed. */
	State: NetioState
	/** Count of S0 pulses. */
	S0Counter?: number
}

/** The `netio.json` document. */
export interface NetioStatus {
	Agent: NetioAgent
	GlobalMeasure?: NetioGlobalMeasure
	Outputs: NetioOutput[]
	Inputs?: NetioInput[]
}

/** A single entry of the `Outputs` array sent to control the device. */
export interface NetioOutputCommand {
	ID: number
	Action: NetioOutputAction
	/**
	 * Overrides the output's configured short on/off delay, in milliseconds.
	 * Only meaningful together with `ShortOff` / `ShortOn`, and only for the
	 * request it is sent with.
	 */
	Delay?: number
	/** Only honoured when `Action` is `Ignore`. */
	State?: NetioState
}
