var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions

	return self;
}

instance.prototype.outputs = [];

instance.prototype.updateConfig = function(config) {
	var self = this;

	self.config = config;

	self.actions();
}

instance.prototype.init = function() {
	var self = this;

	self.status(self.UNKNOWN);

	debug = self.debug;
	log = self.log;

	self.initFeedbacks();
	self.getStatus();

}

instance.prototype.getStatus = function() {
	var self = this;
	if(self.config.ip !== undefined) {
	const url = `http://${self.config.ip}/netio.json`;
		self.system.emit('rest_get', url, function (err, result) {
			if (err !== null) {
				self.log('error', 'HTTP GET Request failed (' + result.error.code + ')');
				self.status(self.STATUS_ERROR, result.error.code);
			}
			else {
				self.outputs = result.data.Outputs;
				self.status(self.STATUS_OK);
				self.checkFeedbacks('outputs');
			}
		});
	}
}

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;
	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This module can be used for controlling the NETIO PowerBOX'
		},
		{
			type: 'textinput',
			id: 'ip',
			label: 'ip address',
			regex: self.REGEX_IP,
			width: 12
		}
	]
}

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;
	debug("destroy");
}

instance.prototype.actions = function(system) {
	var self = this;
	var urlLabel = 'URL';

	self.setActions({
		'setOutput': {
			label: 'Set output on/off',
			options: [
				{
					type: 'textinput',
					label: 'output',
					id: 'output',
					default: '1',
					regex: self.REGEX_NUMBER
				},
				{
					type: 'dropdown',
					label: 'select',
					id: 'para',
					choices: [ { id: '1', label: 'On'}, { id: '0', label: 'Off'} ],
					default: '1'
				}
			]
		},
	});
}

instance.prototype.action = function(action) {
	var self = this;

	if (action.action == 'setOutput') {
		let body;
		const url = `http://${self.config.ip}/netio.json`;
		try {
			body = JSON.parse(`{ "Outputs":[ { "ID":${action.options.output}, "Action":${action.options.para} } ] }`);
		} catch(e){
			self.log('error', 'HTTP POST Request aborted: Malformed JSON Body (' + e.message+ ')');
			self.status(self.STATUS_ERROR, e.message);
			return
		}
		// Is there an output on selected number?
		if(self.outputs.find(element => element.ID.toString() == action.options.output)) {
			self.system.emit('rest', url, body, (err, result) => {
				if (err !== null) {
					self.log('error', 'HTTP POST Request failed (' + result.error.code + ')');
					self.status(self.STATUS_ERROR, result.error.code);
				}
				else {
					self.outputs = result.data.Outputs;
					self.checkFeedbacks('outputs');
				}
			});
		} else {
			self.log('error', 'That output does not exist on this NETIO');
		}
	}
}

instance.prototype.initFeedbacks = function() {
	var self = this;
	
	// feedbacks
	var feedbacks = {};

	feedbacks['outputs'] = {
		label: 'Output On',
		description: 'If the selected output is on, change the color of the button',
		options: [
			{
				type: 'textinput',
				label: 'Output',
				id: 'output',
				default: '1',
				regex: self.REGEX_NUMBER
			},
			{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: self.rgb(255,255,255)
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: self.rgb(255,0,0)
			},
		]
	};
	self.setFeedbackDefinitions(feedbacks);
}

instance.prototype.feedback = function(feedback, bank) {
	var self = this;

	if (feedback.type === 'outputs') {
		let output = self.outputs.find(element => element.ID.toString() == feedback.options.output);
		if (output && output.State.toString() == '1') {
			return { color: feedback.options.fg, bgcolor: feedback.options.bg };
		}
	}
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;
