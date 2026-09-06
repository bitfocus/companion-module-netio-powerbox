import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
	useHttps: boolean
	useAuth: boolean
	username: string
	/** Milliseconds between status polls. */
	pollInterval: number
	/** Request timeout in milliseconds. */
	timeout: number
	/** Circuit rating in amps, used as the full scale for the gauge presets. */
	currentRating: number
}

/**
 * Stored in Companion's secrets store rather than the config, so it is not
 * reported to the web UI or included in exports.
 */
export type ModuleSecrets = {
	password: string
}

export const DEFAULT_CONFIG: ModuleConfig = {
	host: '',
	port: 80,
	useHttps: false,
	useAuth: false,
	username: '',
	pollInterval: 1000,
	timeout: 2000,
	currentRating: 16,
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'JSON API',
			width: 12,
			value:
				'The JSON API must be enabled on the device under <b>M2M API Protocols &rarr; JSON API</b>. ' +
				'Enable <b>READ</b> to poll status and <b>WRITE</b> to control outputs.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Device address',
			tooltip: 'Hostname or IP address of the NETIO device',
			width: 6,
			default: DEFAULT_CONFIG.host,
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			tooltip: 'Port the JSON API is served on. Only set a custom port if the device is configured to use one',
			width: 3,
			min: 1,
			max: 65535,
			asInteger: true,
			default: DEFAULT_CONFIG.port,
		},
		{
			type: 'checkbox',
			id: 'useHttps',
			label: 'Use HTTPS',
			tooltip: 'Only the PowerPDU 4C supports HTTPS. Custom certificates are not supported',
			width: 3,
			default: DEFAULT_CONFIG.useHttps,
			disableAutoExpression: true,
		},
		{
			type: 'checkbox',
			id: 'useAuth',
			label: 'Use authentication',
			tooltip: 'Leave off if the JSON API has an empty username and password',
			width: 12,
			default: DEFAULT_CONFIG.useAuth,
			disableAutoExpression: true,
		},
		{
			type: 'textinput',
			id: 'username',
			label: 'Username',
			width: 6,
			default: DEFAULT_CONFIG.username,
			isVisibleExpression: '$(options:useAuth)',
		},
		{
			type: 'secret-text',
			id: 'password',
			label: 'Password',
			description: 'The WRITE password defaults to the MAC address without colons, in lowercase',
			width: 6,
			isVisibleExpression: '$(options:useAuth)',
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Poll interval (ms)',
			tooltip: 'How often to read the device status. Raise this if the device struggles to keep up',
			width: 6,
			min: 100,
			max: 60000,
			step: 100,
			asInteger: true,
			clampValues: true,
			default: DEFAULT_CONFIG.pollInterval,
		},
		{
			type: 'number',
			id: 'timeout',
			label: 'Request timeout (ms)',
			width: 6,
			min: 200,
			max: 30000,
			step: 100,
			asInteger: true,
			clampValues: true,
			default: DEFAULT_CONFIG.timeout,
		},
		{
			type: 'number',
			id: 'currentRating',
			label: 'Circuit rating (A)',
			tooltip: 'Full scale for the gauge presets. Most NETIO devices are rated 16 A in total and per output',
			description: 'Only affects how gauges are scaled. It does not limit anything on the device',
			width: 6,
			min: 1,
			max: 63,
			step: 1,
			asInteger: true,
			clampValues: true,
			default: DEFAULT_CONFIG.currentRating,
		},
	]
}
