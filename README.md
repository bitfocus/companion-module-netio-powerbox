# companion-module-netio-powerbox

A [Companion](https://bitfocus.io/companion) module for NETIO networked power sockets, using the
NETIO **JSON over HTTP(s)** M2M API (`netio.json`, protocol 2.4).

See [HELP.md](./companion/HELP.md) for the user-facing documentation, and
[LICENSE](./LICENSE).

## Getting started

Running `yarn` performs all the setup needed to develop the module.

- `yarn build` compiles the module once, which is enough for Companion to load it.
- `yarn dev` runs the compiler in watch mode while you work.
- `yarn lint` runs eslint and prettier.
- `yarn package` builds a distributable package.

## Layout

| Path                | Contents                                                                         |
| ------------------- | -------------------------------------------------------------------------------- |
| `src/api/types.ts`  | Types for the `netio.json` document and its action/state enums                   |
| `src/api/client.ts` | HTTP client for one device, and the mapping from failures to connection statuses |
| `src/config.ts`     | Connection configuration fields, and the secrets stored outside the config       |
| `src/main.ts`       | Instance lifecycle: polling loop, device state, status reporting                 |
| `src/actions.ts`    | Output control actions                                                           |
| `src/feedbacks.ts`  | Output and input state feedbacks                                                 |
| `src/variables.ts`  | Variable definitions and values, derived from the device's own document          |
| `src/presets.ts`    | Presets generated from the outputs and inputs the device reports                 |
| `src/gauges.ts`     | Layered gauge presets, and their plain text fallbacks                            |
| `src/upgrades.ts`   | Migration from the pre-3.0 JavaScript version of this module                     |

## Notes on the device API

- The JSON API must be enabled per device, with READ and WRITE enabled separately. A device with
  READ but not WRITE polls fine but rejects every action with `403`.
- A write returns the updated status document, so the module applies the new state from the
  write response instead of waiting for the next poll.
- Which fields the document contains depends on the model: `GlobalMeasure` and the per-output
  energy values only exist on metered devices, and `Inputs` only on devices with digital inputs.
  Variable definitions and presets are therefore rebuilt whenever the document's shape changes,
  rather than being hardcoded.
