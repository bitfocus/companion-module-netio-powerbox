import { combineRgb } from '@companion-module/base'
import type NetioInstance from './main.js'
import { NetioState } from './api/types.js'

export type FeedbacksSchema = {
	output_state: {
		type: 'boolean'
		options: {
			output: number
		}
	}
	input_state: {
		type: 'boolean'
		options: {
			input: number
		}
	}
}

export const OUTPUT_ON_STYLE = {
	bgcolor: combineRgb(0, 179, 0),
	color: combineRgb(255, 255, 255),
}

export const INPUT_CLOSED_STYLE = {
	bgcolor: combineRgb(0, 102, 204),
	color: combineRgb(255, 255, 255),
}

export function UpdateFeedbacks(self: NetioInstance): void {
	self.setFeedbackDefinitions({
		output_state: {
			name: 'Output is on',
			description: 'Change the button style while a power output is switched on',
			type: 'boolean',
			defaultStyle: OUTPUT_ON_STYLE,
			options: [
				{
					id: 'output',
					type: 'number',
					label: 'Output',
					default: 1,
					min: 1,
					max: 64,
					asInteger: true,
				},
			],
			callback: (feedback) => {
				const output = self.deviceStatus?.Outputs.find((candidate) => candidate.ID === feedback.options.output)
				return output?.State === NetioState.On
			},
		},

		input_state: {
			name: 'Input is closed',
			description: 'Change the button style while a digital input is closed',
			type: 'boolean',
			defaultStyle: INPUT_CLOSED_STYLE,
			options: [
				{
					id: 'input',
					type: 'number',
					label: 'Input',
					default: 1,
					min: 1,
					max: 64,
					asInteger: true,
				},
			],
			callback: (feedback) => {
				const input = self.deviceStatus?.Inputs?.find((candidate) => candidate.ID === feedback.options.input)
				return input?.State === NetioState.On
			},
		},
	})
}
