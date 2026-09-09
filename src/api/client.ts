import { InstanceStatus } from '@companion-module/base'
import type { NetioOutputCommand, NetioStatus } from './types.js'

/**
 * Why a request failed, in the terms the module cares about: each kind maps to
 * exactly one Companion connection status.
 */
export type NetioErrorKind = 'network' | 'timeout' | 'auth' | 'forbidden' | 'request' | 'server' | 'protocol'

const STATUS_FOR_KIND: Record<NetioErrorKind, InstanceStatus> = {
	network: InstanceStatus.ConnectionFailure,
	timeout: InstanceStatus.ConnectionFailure,
	auth: InstanceStatus.AuthenticationFailure,
	forbidden: InstanceStatus.InsufficientPermissions,
	request: InstanceStatus.UnknownError,
	server: InstanceStatus.ConnectionFailure,
	protocol: InstanceStatus.UnknownError,
}

export class NetioApiError extends Error {
	readonly kind: NetioErrorKind
	readonly httpStatus: number | undefined

	constructor(kind: NetioErrorKind, message: string, httpStatus?: number) {
		super(message)
		this.name = 'NetioApiError'
		this.kind = kind
		this.httpStatus = httpStatus
	}

	/** The connection status this failure should put the instance into. */
	get instanceStatus(): InstanceStatus {
		return STATUS_FOR_KIND[this.kind]
	}
}

export interface NetioClientOptions {
	host: string
	port: number
	useHttps: boolean
	username: string
	password: string
	/** Request timeout in milliseconds. */
	timeout: number
}

/** Shape of the error body documented for non-200 responses. */
interface NetioErrorBody {
	result?: {
		error?: {
			code?: number
			message?: string
		}
	}
}

/**
 * Client for a single NETIO device's `netio.json` endpoint.
 *
 * Immutable: build a new one when the config changes rather than mutating it,
 * so an in-flight request can never see half-applied settings.
 */
export class NetioClient {
	readonly url: string
	readonly #headers: Record<string, string>
	readonly #timeout: number

	constructor(options: NetioClientOptions) {
		const scheme = options.useHttps ? 'https' : 'http'
		this.url = `${scheme}://${options.host}:${options.port}/netio.json`
		this.#timeout = options.timeout

		this.#headers = { Accept: 'application/json' }
		if (options.username || options.password) {
			// The device uses HTTP Basic authentication, and may have separate
			// credentials for read and write access.
			const credentials = Buffer.from(`${options.username}:${options.password}`).toString('base64')
			this.#headers.Authorization = `Basic ${credentials}`
		}
	}

	/** Read the current device status. */
	async read(signal?: AbortSignal): Promise<NetioStatus> {
		return this.#request(undefined, signal)
	}

	/**
	 * Apply commands to one or more outputs. The device replies with its
	 * updated status, which is returned here so callers can refresh state
	 * without a second round trip.
	 */
	async write(outputs: NetioOutputCommand[], signal?: AbortSignal): Promise<NetioStatus> {
		return this.#request({ Outputs: outputs }, signal)
	}

	async #request(
		body: { Outputs: NetioOutputCommand[] } | undefined,
		signal: AbortSignal | undefined,
	): Promise<NetioStatus> {
		const timeout = AbortSignal.timeout(this.#timeout)
		const response = await this.#fetch(body, signal ? AbortSignal.any([signal, timeout]) : timeout, timeout)

		if (!response.ok) throw await this.#describeErrorResponse(response)

		let parsed: unknown
		try {
			parsed = await response.json()
		} catch (error) {
			throw new NetioApiError('protocol', `Device returned a malformed JSON document: ${describe(error)}`)
		}

		if (!isNetioStatus(parsed)) {
			throw new NetioApiError(
				'protocol',
				'Device response is not a netio.json document. Is the JSON API enabled on this port?',
			)
		}
		return parsed
	}

	async #fetch(
		body: { Outputs: NetioOutputCommand[] } | undefined,
		signal: AbortSignal,
		timeout: AbortSignal,
	): Promise<Response> {
		try {
			return await fetch(this.url, {
				method: body ? 'POST' : 'GET',
				headers: body ? { ...this.#headers, 'Content-Type': 'application/json' } : this.#headers,
				body: body ? JSON.stringify(body) : undefined,
				signal,
			})
		} catch (error) {
			// A caller-driven abort (config change, shutdown) must stay an abort so
			// the caller can discard it, rather than being reported as a failure.
			if (isAbortError(error) && !timeout.aborted) throw error

			if (timeout.aborted) {
				throw new NetioApiError('timeout', `No response from ${this.url} within ${this.#timeout}ms`)
			}
			throw new NetioApiError('network', `Could not reach ${this.url}: ${describe(error)}`)
		}
	}

	async #describeErrorResponse(response: Response): Promise<NetioApiError> {
		const detail = await this.#readErrorMessage(response)
		const suffix = detail ? ` (${detail})` : ''

		switch (response.status) {
			case 400:
				return new NetioApiError('request', `Device rejected the command as invalid${suffix}`, 400)
			case 401:
				return new NetioApiError(
					'auth',
					`Invalid username or password${suffix}. Check the credentials configured for the JSON API`,
					401,
				)
			case 403:
				return new NetioApiError(
					'forbidden',
					`Access denied${suffix}. Enable WRITE for the JSON API on the device to control outputs`,
					403,
				)
			case 500:
				return new NetioApiError(
					'server',
					`Device reported an internal error${suffix}. It may still be starting up`,
					500,
				)
			default:
				return new NetioApiError(
					'protocol',
					`Unexpected response ${response.status} ${response.statusText}${suffix}`,
					response.status,
				)
		}
	}

	async #readErrorMessage(response: Response): Promise<string | undefined> {
		try {
			const body = (await response.json()) as NetioErrorBody
			return body.result?.error?.message
		} catch {
			return undefined
		}
	}
}

function isNetioStatus(value: unknown): value is NetioStatus {
	if (typeof value !== 'object' || value === null) return false
	const candidate = value as Partial<NetioStatus>
	return typeof candidate.Agent === 'object' && candidate.Agent !== null && Array.isArray(candidate.Outputs)
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError'
}

function describe(error: unknown): string {
	if (error instanceof Error) {
		// fetch wraps the underlying socket error, which carries the useful detail.
		const cause = error.cause
		if (cause instanceof Error && cause.message) return cause.message
		return error.message
	}
	return String(error)
}
