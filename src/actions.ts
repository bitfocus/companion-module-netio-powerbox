import type { DropdownChoice } from '@companion-module/base'
import type NetioInstance from './main.js'
import { NetioOutputAction } from './api/types.js'

export type ActionsSchema = {
	output_action: {
		options: {
			output: number
			action: NetioOutputAction
			overrideDelay: boolean
			delay: number
		}
	}
	outputs_all_action: {
		options: {
			action: NetioOutputAction
		}
	}
}

/**
 * `NoChange` and `Ignore` are deliberately left out: they are protocol
 * placeholders rather than things a user would want a button to do.
 */
const ACTION_CHOICES: DropdownChoice<NetioOutputAction>[] = [
	{ id: NetioOutputAction.On, label: 'On' },
	{ id: NetioOutputAction.Off, label: 'Off' },
	{ id: NetioOutputAction.Toggle, label: 'Toggle' },
	{ id: NetioOutputAction.ShortOff, label: 'Short off (restart)' },
	{ id: NetioOutputAction.ShortOn, label: 'Short on (pulse)' },
]

export function UpdateActions(self: NetioInstance): void {
	self.setActionDefinitions({
		output_action: {
			name: 'Output: set state',
			description: 'Switch a single power output on, off, toggle it, or power cycle it',
			options: [
				{
					id: 'output',
					type: 'number',
					label: 'Output',
					tooltip: 'Output number as shown on the device',
					default: 1,
					min: 1,
					max: 64,
					asInteger: true,
				},
				{
					id: 'action',
					type: 'dropdown',
					label: 'Action',
					choices: ACTION_CHOICES,
					default: NetioOutputAction.On,
				},
				{
					id: 'overrideDelay',
					type: 'checkbox',
					label: 'Override the short on/off delay',
					tooltip:
						'Only affects the two short actions. Otherwise the delay configured on the device for this output is used',
					default: false,
					disableAutoExpression: true,
				},
				{
					id: 'delay',
					type: 'number',
					label: 'Delay (ms)',
					description: 'Only used by the short actions. Rounded up to the nearest 100ms by the device',
					default: 5000,
					min: 100,
					max: 600000,
					step: 100,
					asInteger: true,
					isVisibleExpression: '$(options:overrideDelay)',
				},
			],
			callback: async (event, context) => {
				await self.sendOutputCommands(
					[
						{
							ID: event.options.output,
							Action: event.options.action,
							Delay:
								isShortAction(event.options.action) && event.options.overrideDelay ? event.options.delay : undefined,
						},
					],
					context.signal,
				)
			},
		},

		outputs_all_action: {
			name: 'All outputs: set state',
			description: 'Apply the same action to every output on the device',
			options: [
				{
					id: 'action',
					type: 'dropdown',
					label: 'Action',
					choices: ACTION_CHOICES,
					default: NetioOutputAction.Off,
				},
			],
			callback: async (event, context) => {
				const outputs = self.deviceStatus?.Outputs
				if (!outputs?.length) {
					self.log('warn', 'Cannot switch all outputs: the device status is not known yet')
					return
				}

				await self.sendOutputCommands(
					outputs.map((output) => ({ ID: output.ID, Action: event.options.action })),
					context.signal,
				)
			},
		},
	})
}

function isShortAction(action: NetioOutputAction): boolean {
	return action === NetioOutputAction.ShortOff || action === NetioOutputAction.ShortOn
}
