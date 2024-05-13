const { InstanceBase, Regex, runEntrypoint,combineRgb , InstanceStatus} = require('@companion-module/base');
const { default: axios } = require('axios');

class BoxInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}
	outputs = [];
	axios  = axios.create();
	async init(config) {
		this.handleUpdateConfig(config)
		
		
	}
	async checkBox() {
		let action = "read";
		let read = false;
		let write = false;
		console.log("checking BOX")
		let url = `http://${this.config.ip}/netio.json`;
		try{
			
		let response = await this.axios.get(url)
		//check if we get a response
		if(response.data.Outputs!= undefined){
			read = true;
		}else{
			this.updateStatus(InstanceStatus.ConnectionFailure,"No response from the BOX, check IP")
		}
		action = "write";
		let body = {Outputs:response.data.Outputs};
		//check if we can write 
		let write = await this.axios.post(url, body)
		//check if we get a response
		//console.log(write.data)
		write = true;
		return read && write;
		}catch(error){
			//console.log("error",error)
			//check if conection refused
			if(error.code == 'ECONNREFUSED'){
				this.updateStatus(InstanceStatus.ConnectionFailure,"Error during"+action+ " Connection Refused check IP")
			}
			//check if  unauthorized
			else if( error.response != undefined && error.response.status == 401){
				this.updateStatus(InstanceStatus.ConnectionFailure,"Error during"+action+ " Unauthorized, enable Auth in the config")
			}
			else{
				this.updateStatus(InstanceStatus.ConnectionFailure,"Error during "+action+ " "+error.message)
				console.log("error",error)
			}
		}
		
	}
	// When module gets deleted
	async destroy() {
		this.log('debug', 'destroy')
	}
	async handleUpdateConfig(config) {
		this.config = config   
		this.setupAxios();
		this.updateStatus('Connecting')
		if(await this.checkBox() == true){
		this.updateActions() 
		this.updateFeedbacks()
		this.getStatus();
		this.updatePresets();
		};
	}
	async configUpdated(config) {
		this.handleUpdateConfig(config)
	}
	// Return config fields for web config
	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'ip',
				label: 'Target IP',
				width: 8,
				regex: Regex.IP,
			},
			{
				type: 'checkbox',
				id: 'useAuth',
				label: 'Use Authentication',
				width: 4,
				default: false,
			},
			{
				type: 'textinput',
				id: 'username',
				label: 'Username',
				width: 8,
				isVisible : ((options, data) => options.useAuth),
			},
			{
				type: 'textinput',
				id: 'password',
				label: 'Password',
				width: 8,
				isVisible : ((options, data) => options.useAuth),
			},
		]
	}

	updateActions() {
		this.setActionDefinitions({
			setOutput: {
				name: 'Set output on/off',
				options: [
					{
						type: 'number',
						label: 'output',
						id: 'output',
						default: '1',
						useVariables: true,
					},
					{
						type: 'dropdown',
						label: 'select',
						id: 'para',
						choices: [ { id: '1', label: 'On'}, { id: '0', label: 'Off'} ],
						default: '1'
					}
				],
				callback: async (event) => {
					const id = await this.parseVariablesInString(event.options.output)
					this.setOutput(id, event.options.para)
				},
			},
		})
	}

	updateFeedbacks() {
		this.setFeedbackDefinitions({
			outputs: {
				type: 'boolean',
				name: 'Outputs',
				description: 'Get the status of the outputs',
				options: [
					{
						type:'number',
						label: 'Output',
						id: 'output',
						default: '1',

					}
				],
				defaultStyle: {
					bgcolor: combineRgb(255,255,0),
				},
				callback: (feedback,) => {
					if (this.outputs.length > 0) {
						let output = this.outputs.find(element => element.ID.toString() == feedback.options.output)
						if(output){
						return output.State == 1
						} else {
							return false
						}
					}
					return false
				}
			}
		});
	}

	async updatePresets() {
		let presets = [];
		let url = `http://${this.config.ip}/netio.json`;
		let response = await this.axios.get(url).catch(error => {
			this.log('error', error.message)
		} );
		this.outputs = response.data.Outputs;
		this.outputs.forEach(element => {
			presets.push({
				type: 'button',
				category: 'Outputs',
				name: 'Output ' + element.ID,
				style:{
					text:"Output "+element.ID+" ",
					color:combineRgb(255,255,255),
					size:'auto',
					bgcolor:combineRgb(0,0,0),
				},
				steps:[
					{
						down:[
							{
								actionId:'setOutput',
								options:
									{
										output: element.ID, para:1
									}
							}
						]
					},
					{
						down:[
							{
								actionId:'setOutput',
								options:
									{
										output: element.ID, para:0
									}
							}
						]
					}
				],
				feedbacks: [
					{
						feedbackId:'outputs',
						options:
						{
							output: element.ID
						},
						style:
						{
							bgcolor: combineRgb(255,255,0),
							color: combineRgb(0,0,0),
						}
					}
				]
			})
		});
		
		this.setPresetDefinitions(presets);
	}
	setupAxios(){
		if(this.config.useAuth){
		this.axios = axios.create({
			auth: {
				username: this.config.username,
				password: this.config.password
			},
			maxContentLength: 50 * 1024 * 1024, // 50 MB
  			maxBodyLength: 50 * 1024 * 1024, // 50 MB
		})	;
	} else {
		this.axios = axios.create();
	}
	}
	async getStatus() {
		let url = `http://${this.config.ip}/netio.json`;
		let response = await this.axios.get(url).catch(error => {
			this.log('error', error.message);
			this.updateStatus(InstanceStatus.ConnectionFailure,error.message)
			return;
		});
		this.updateStatus(InstanceStatus.Ok);
		this.outputs = response.data.Outputs;
		this.checkFeedbacks('outputs'); 
	}

	async setOutput(output, para) {
		let url = `http://${this.config.ip}/netio.json`;

		let body = undefined;

		try {
			body = JSON.parse(`{ "Outputs":[ { "ID":${output}, "Action":${para} } ] }`);
		}
		catch (error) {
			this.log('error', error.message);
			console.log(error);
			this.updateStatus(InstanceStatus.UnknownError, error.message);
		}
		if (this.outputs.find(element => element.ID.toString() == output)) {
			//config
			
			let response = await this.axios.post(url, body).catch(error => {
				this.log('error', error.message)} );
		}
		else {
			this.log('error', 'That output does not exist on this NETIO');
		}

		this.getStatus();
	}
	//call
}

runEntrypoint(BoxInstance, [])