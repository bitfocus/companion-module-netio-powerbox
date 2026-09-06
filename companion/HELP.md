## NETIO PowerBOX / PowerPDU

Controls and monitors NETIO networked power sockets through the **JSON over HTTP(s)** M2M API
(`netio.json`, protocol version 2.4).

Supported devices include PowerBOX 3Px and 4Kx, PowerPDU 4C, 4PS and 8QS, PowerCable REST,
PowerDIN 4PZ, and the older NETIO 4 / 4All.

### Enabling the API on the device

The JSON API is disabled by default. In the device web administration, open
**M2M API Protocols → JSON API** and:

1. Tick **Enable JSON API**.
2. Tick **Enable READ** so Companion can poll the outputs.
3. Tick **Enable WRITE** so Companion can switch the outputs. Without it the device answers
   `403 Forbidden` and the connection reports insufficient permissions.
4. Note the username and password for each. An empty username and password means no
   authentication — leave **Use authentication** off in that case. The default WRITE password is
   the MAC address without colons, in lowercase.

The device restarts its web server after you save these settings.

### Connection settings

| Setting            | Notes                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device address     | Hostname or IP address of the device                                                                                                                                                   |
| Port               | Only change this if **Use custom port** is set on the device. On the PowerPDU 4C the M2M API has its own port, separate from the web administration                                    |
| Use HTTPS          | Only the PowerPDU 4C supports HTTPS, and only with its built-in certificate                                                                                                            |
| Use authentication | Turn on and fill in the credentials configured for the JSON API                                                                                                                        |
| Poll interval      | How often the device status is read. Raise it if the device struggles to keep up                                                                                                       |
| Request timeout    | How long to wait for a response before treating the device as unreachable                                                                                                              |
| Circuit rating     | Full scale for the gauge presets, in amps. Most NETIO devices are rated 16 A in total and per output. This only affects how gauges are drawn, it does not limit anything on the device |

### Actions

- **Output: set state** — switch one output on or off, toggle it, or power cycle it.
  - _Short off (restart)_ switches the output off and back on. _Short on (pulse)_ does the
    opposite. Both use the delay configured per output on the device, which you can override
    per action. The override applies to that single command only.
  - On the PowerPDU 4C and NETIO 4/4All a short action is protected: until it completes, the
    output ignores further commands from the API.
- **All outputs: set state** — applies the same action to every output the device reports.

### Feedbacks

- **Output is on** — styles the button while a power output is switched on.
- **Input is closed** — styles the button while a digital input is closed. Only useful on models
  with digital inputs, such as the PowerDIN 4PZ.

### Variables

Variables are created from what the device actually reports, so the list differs per model.
Devices without energy metering (for example the PowerBOX 3Px) only expose the device and
output state variables.

- Device: `model`, `device_name`, `serial_number`, `mac`, `firmware_version`, `json_version`,
  `device_time`, `uptime`, `uptime_text`, `num_outputs`, `num_inputs`, `outputs_on`
- Metering totals: `voltage`, `frequency`, `total_current`, `total_current_a`, `total_load`,
  `total_power_factor`,
  `total_phase`, `total_energy`, `total_energy_nr`, `total_reverse_energy`,
  `total_reverse_energy_nr`, `energy_start`
- Per output _N_: `output_N_name`, `output_N_state`, `output_N_state_text`, `output_N_delay`,
  and on metered outputs `output_N_current`, `output_N_current_a`, `output_N_load`,
  `output_N_power_factor`,
  `output_N_phase`, `output_N_energy`, `output_N_energy_nr`, `output_N_reverse_energy`,
  `output_N_reverse_energy_nr`
- Per input _N_: `input_N_name`, `input_N_state`, `input_N_state_text`, `input_N_s0_counter`

Units follow the API: current in mA, load in W, energy in Wh, phase in degrees. The `_a` current
variables are the same reading converted to amps, for readouts and gauges. The `_nr` counters are
the ones that cannot be reset from the device web interface.

### Presets

Presets are generated from the outputs and inputs the device reports, using their configured
names. Connect to the device first so the preset list matches your hardware.

On metered devices there are also gauge presets:

- **Outputs / Toggle with current gauge** — toggles the output, and shows its name, its on/off
  state and its live current on a ring gauge. The background turns green while the output is on.
  The state is spelled out in the text as well as coloured, because an output that is switched on
  but has nothing drawing power reads zero on the gauge. Only generated for outputs that report a
  current, which on a PowerPDU 8QS is output 1 only, and on a PowerDIN 4PZ is outputs 1 and 2.
- **Device / Total current** — the whole device's current against the circuit rating.
- **Device / Total load** — the whole device's load in watts. Scaled by the circuit rating at
  nominal mains voltage, so a 16 A rating gives full scale at 3680 W on 230 V mains, or 1920 W
  on 120 V.

Gauges turn amber at 75% and red at 90% of full scale.

Each of these ships with a plain text version alongside the gauge. Companion draws the gauge where
it can and falls back to the text version where it cannot, so they also work on older versions.

### Troubleshooting

| Connection status        | Cause                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- |
| Bad configuration        | No device address is set                                                         |
| Connection failure       | The device did not answer in time, or the JSON API is not enabled on this port   |
| Authentication failure   | The device returned `401` — check the username and password                      |
| Insufficient permissions | The device returned `403` — enable **WRITE** for the JSON API                    |
| Unknown error            | The response was not a `netio.json` document, or the device rejected the command |
