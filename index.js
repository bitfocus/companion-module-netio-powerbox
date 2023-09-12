const { InstanceBase, Regex, runEntrypoint,combineRgb , InstanceStatus} = require('@companion-module/base');
const { default: axios } = require('axios');

class BoxInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}
    outputs = [];
	async init(config) {
		this.config = config   
		this.updateStatus('Connecting')

		this.updateActions() // export actions
        this.updateFeedbacks()
        this.getStatus();
        this.updatePresets();
        this.updateStatus(InstanceStatus.Ok);

	}
	// When module gets deleted
	async destroy() {
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config
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
			}
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
					},{
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
                }}});

    }
    async updatePresets() {
        let presets = [];
        let url = `http://${this.config.ip}/netio.json`;
        let response = await axios.get(url).catch(error => {
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
                steps:[{down:[{actionId:'setOutput', options:{output:element.ID, para:1}}]},{down:[{actionId:'setOutput', options:{output:element.ID, para:0}}]}],
                feedbacks: [{feedbackId:'outputs', options:{output:element.ID},style:{
                    bgcolor: combineRgb(255,255,0),
                    color: combineRgb(0,0,0),
                }}]

        })});
        this.setPresetDefinitions(presets);
    }
    async getStatus() {
        let url = `http://${this.config.ip}/netio.json`;
        let response = await axios.get(url).catch(error => {
            this.log('error', error.message);
            this.updateStatus(InstanceStatus.ConnectionFailure,error.message)} );
        this.outputs = response.data.Outputs;
        this.checkFeedbacks('outputs'); 
    }   
    async setOutput(output, para) {
        let url = `http://${this.config.ip}/netio.json`;
        try{
        let body = JSON.parse(`{ "Outputs":[ { "ID":${output}, "Action":${para} } ] }`);
        } catch (error) {
            this.log('error', error.message);
            this.updateStatus(InstanceStatus.UnknownError,error.message);
        }
        if(this.outputs.find(element => element.ID.toString() == output)){
            
        let response = await axios.post(url, body).catch(error => {
            this.log('error', error.message)} );
            
        } else {
			this.log('error', 'That output does not exist on this NETIO');
		}
        this.getStatus();
    }
    call
}

runEntrypoint(BoxInstance, [])