import {
	FixupNumericOrVariablesValueToExpressions,
	type CompanionStaticUpgradeProps,
	type CompanionStaticUpgradeResult,
	type CompanionStaticUpgradeScript,
	type CompanionUpgradeContext,
	type ExpressionOrValue,
	type JsonValue,
} from '@companion-module/base'
import { DEFAULT_CONFIG, type ModuleConfig, type ModuleSecrets } from './config.js'
import { NetioOutputAction } from './api/types.js'

/** Fields written by the original JavaScript version of this module. */
type LegacyConfig = {
	ip?: string
	password?: string
}

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig, ModuleSecrets>[] = [
	/**
	 * Migrates connections created by the original JavaScript module:
	 * `ip` became `host`, the password moved into the secrets store, and the
	 * action and feedback ids were renamed.
	 *
	 * Note: once added, an upgrade script can never be removed.
	 */
	function upgradeFromLegacyModule(
		_context: CompanionUpgradeContext<ModuleConfig>,
		props: CompanionStaticUpgradeProps<ModuleConfig, ModuleSecrets>,
	): CompanionStaticUpgradeResult<ModuleConfig, ModuleSecrets> {
		const result: CompanionStaticUpgradeResult<ModuleConfig, ModuleSecrets> = {
			updatedConfig: null,
			updatedSecrets: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}

		const legacy = props.config as (Partial<ModuleConfig> & LegacyConfig) | null
		if (legacy) {
			result.updatedConfig = {
				host: legacy.host ?? legacy.ip ?? DEFAULT_CONFIG.host,
				port: legacy.port ?? DEFAULT_CONFIG.port,
				useHttps: legacy.useHttps ?? DEFAULT_CONFIG.useHttps,
				useAuth: legacy.useAuth ?? DEFAULT_CONFIG.useAuth,
				username: legacy.username ?? DEFAULT_CONFIG.username,
				pollInterval: legacy.pollInterval ?? DEFAULT_CONFIG.pollInterval,
				timeout: legacy.timeout ?? DEFAULT_CONFIG.timeout,
				currentRating: legacy.currentRating ?? DEFAULT_CONFIG.currentRating,
			}

			if (legacy.password) {
				result.updatedSecrets = { password: legacy.password }
			}
		}

		for (const action of props.actions) {
			if (action.actionId !== 'setOutput') continue

			action.actionId = 'output_action'
			action.options = {
				// The legacy field allowed variables in the value.
				output: FixupNumericOrVariablesValueToExpressions(action.options.output),
				action: convertLegacyAction(action.options.para),
				overrideDelay: { value: false, isExpression: false },
				delay: { value: 5000, isExpression: false },
			}
			result.updatedActions.push(action)
		}

		for (const feedback of props.feedbacks) {
			if (feedback.feedbackId !== 'outputs') continue

			feedback.feedbackId = 'output_state'
			feedback.options = {
				output: FixupNumericOrVariablesValueToExpressions(feedback.options.output),
			}
			result.updatedFeedbacks.push(feedback)
		}

		return result
	},
]

/** The legacy `para` option was a dropdown of the strings '1' (on) and '0' (off). */
const LEGACY_ACTION_VALUES: Record<string, NetioOutputAction> = {
	'0': NetioOutputAction.Off,
	'1': NetioOutputAction.On,
}

function convertLegacyAction(
	value: ExpressionOrValue<JsonValue | undefined> | undefined,
): ExpressionOrValue<JsonValue | undefined> {
	if (!value) return { value: NetioOutputAction.On, isExpression: false }
	if (value.isExpression) return value

	const legacy = value.value
	const key = typeof legacy === 'string' || typeof legacy === 'number' ? String(legacy) : ''

	return {
		value: LEGACY_ACTION_VALUES[key] ?? NetioOutputAction.On,
		isExpression: false,
	}
}
