import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateVariableDefinitions, UpdateVariableValues, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { NetioApiError, NetioClient } from './api/client.js'
import type { NetioOutputCommand, NetioStatus } from './api/types.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class NetioInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()

	/**
	 * The most recent status document, or null while the device has not been
	 * reached. Actions, feedbacks, variables and presets all derive from this.
	 */
	deviceStatus: NetioStatus | null = null

	#client: NetioClient | null = null
	/** Aborts every in-flight request belonging to the current client. */
	#abort: AbortController | null = null
	#pollTimer: NodeJS.Timeout | null = null
	#pollInFlight = false

	/** Identifies the connection settings, to detect no-op config updates. */
	#connectionKey = ''
	/** Shape of the last status document, to detect when definitions must be rebuilt. */
	#shape = ''
	/** Last status reported to Companion, so it is only updated on change. */
	#reportedStatus = ''
	/** Last logged failure, so a persistent fault is not logged on every poll. */
	#loggedFailure = ''

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		// Actions and feedbacks are the same for every model, so they can be
		// registered before the device has been contacted.
		this.updateActions()
		this.updateFeedbacks()

		this.#applyConfig(config, secrets)
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
		this.#teardown()
		this.#client = null
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.#applyConfig(config, secrets)
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	/**
	 * Send output commands to the device.
	 *
	 * The device answers a write with its updated status document, so the new
	 * state is applied straight away rather than waiting for the next poll.
	 */
	async sendOutputCommands(commands: NetioOutputCommand[], signal?: AbortSignal): Promise<void> {
		const client = this.#client
		if (!client) {
			this.log('error', 'Cannot control outputs: no device address is configured')
			return
		}

		const accepted = this.#rejectUnknownOutputs(commands)
		if (accepted.length === 0) return

		// Abort on either the connection going away or Companion no longer wanting
		// the result, so a cancelled action does not report a connection failure.
		const connectionSignal = this.#abort?.signal
		const abortOn =
			connectionSignal && signal ? AbortSignal.any([connectionSignal, signal]) : (signal ?? connectionSignal)

		try {
			const status = await client.write(accepted, abortOn)
			this.#applyStatus(status)
		} catch (error) {
			if (abortOn?.aborted) return
			this.#reportFailure(error)
		}
	}

	#applyConfig(config: ModuleConfig, secrets: ModuleSecrets): void {
		const password = secrets?.password ?? ''
		this.config = config

		const connectionKey = JSON.stringify([
			config.host,
			config.port,
			config.useHttps,
			config.useAuth,
			config.username,
			password,
			config.timeout,
		])

		if (connectionKey === this.#connectionKey && this.#client) {
			// Only the label or a polling detail changed. Presets embed the
			// connection label, so they are rebuilt, but the connection is kept.
			this.updatePresets()
			return
		}
		this.#connectionKey = connectionKey

		this.#teardown()
		this.deviceStatus = null
		this.#shape = ''
		this.#reportedStatus = ''
		this.#loggedFailure = ''
		this.updateVariableDefinitions()
		this.updatePresets()

		if (!config.host) {
			this.#client = null
			this.#setStatus(InstanceStatus.BadConfig, 'No device address configured')
			return
		}

		this.#client = new NetioClient({
			host: config.host,
			port: config.port,
			useHttps: config.useHttps,
			username: config.useAuth ? config.username : '',
			password: config.useAuth ? password : '',
			timeout: config.timeout,
		})
		this.#abort = new AbortController()

		this.#setStatus(InstanceStatus.Connecting)
		void this.#poll()
	}

	#teardown(): void {
		if (this.#pollTimer) {
			clearTimeout(this.#pollTimer)
			this.#pollTimer = null
		}
		this.#abort?.abort()
		this.#abort = null
	}

	async #poll(): Promise<void> {
		const client = this.#client
		const abort = this.#abort
		if (!client || !abort || this.#pollInFlight) return

		this.#pollInFlight = true
		try {
			const status = await client.read(abort.signal)
			if (!abort.signal.aborted) this.#applyStatus(status)
		} catch (error) {
			if (!abort.signal.aborted) this.#reportFailure(error)
		} finally {
			this.#pollInFlight = false

			// Only reschedule while this poll loop is still the current one.
			if (!abort.signal.aborted && this.#abort === abort) {
				this.#pollTimer = setTimeout(() => void this.#poll(), this.config.pollInterval)
			}
		}
	}

	#applyStatus(status: NetioStatus): void {
		this.deviceStatus = status

		const shape = describeShape(status)
		if (shape !== this.#shape) {
			// The document changed shape, so the set of variables the device
			// reports - and the outputs presets are generated for - changed too.
			this.#shape = shape
			this.updateVariableDefinitions()
			this.updatePresets()
		}

		UpdateVariableValues(this, status)
		this.checkFeedbacks('output_state', 'input_state')

		if (!this.#reportedStatus.startsWith(InstanceStatus.Ok)) {
			this.log(
				'info',
				`Connected to ${status.Agent.Model} "${status.Agent.DeviceName}" ` +
					`(firmware ${status.Agent.Version}, JSON API ${status.Agent.JSONVer})`,
			)
			this.#loggedFailure = ''
		}
		this.#setStatus(InstanceStatus.Ok)
	}

	#reportFailure(error: unknown): void {
		const instanceStatus = error instanceof NetioApiError ? error.instanceStatus : InstanceStatus.UnknownError
		const message = error instanceof Error ? error.message : String(error)

		if (message !== this.#loggedFailure) {
			this.#loggedFailure = message
			this.log('error', message)
		}
		this.#setStatus(instanceStatus, message)
	}

	/** Drops commands for outputs this device does not have, which is usually a typo. */
	#rejectUnknownOutputs(commands: NetioOutputCommand[]): NetioOutputCommand[] {
		const outputs = this.deviceStatus?.Outputs
		if (!outputs) return commands

		const accepted = commands.filter((command) => outputs.some((output) => output.ID === command.ID))
		if (accepted.length !== commands.length) {
			const unknown = commands
				.filter((command) => !accepted.includes(command))
				.map((command) => command.ID)
				.join(', ')
			this.log('warn', `This device has no output ${unknown}, ignoring. It has ${outputs.length} outputs`)
		}
		return accepted
	}

	#setStatus(status: InstanceStatus, message?: string): void {
		const key = `${status}|${message ?? ''}`
		if (key === this.#reportedStatus) return

		this.#reportedStatus = key
		this.updateStatus(status, message)
	}
}

/**
 * A signature of everything the definitions are derived from: which fields the
 * device reports, and the ids and names of its outputs and inputs.
 */
function describeShape(status: NetioStatus): string {
	return JSON.stringify({
		device: status.Agent.DeviceName,
		global: status.GlobalMeasure ? Object.keys(status.GlobalMeasure).sort() : null,
		outputs: status.Outputs.map((output) => [output.ID, output.Name, Object.keys(output).sort()]),
		inputs: status.Inputs?.map((input) => [input.ID, input.Name, Object.keys(input).sort()]) ?? null,
	})
}
