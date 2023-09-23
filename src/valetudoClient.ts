// A file which contains the client for the Valetudo API.
//
// An alternative is to generate a client from https://github.com/Hypfer/Valetudo/blob/104ec641d96f240e2515eec9800ac0176680110b/util/build_openapi_schema.mjs#L106

import axios, { AxiosInstance } from "axios";
import {
  BasicControlAction,
  Capability,
  ConsumableId,
  ConsumableProperties,
  ConsumableState,
  PresetSelectionState,
  PresetSelectionStateIntensity,
  PresetSelectionStateMode,
  RobotAttribute,
  RobotInformation,
  RobotProperties,
  SpeakerVolumeState,
} from "./types/valetudo";
import ReconnectingEventSource from "reconnecting-eventsource";
import EventSource from "eventsource";
import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import { URL } from "url";
import { Logger } from "homebridge";
import { logMethod } from "./decorators";

type PresetSelectionCapacity =
  | Capability.FanSpeedControl
  | Capability.WaterUsageControl
  | Capability.OperationModeControl;
type PresetSelectionValue<T extends PresetSelectionCapacity> =
  T extends Capability.OperationModeControl
    ? PresetSelectionStateMode
    : PresetSelectionStateIntensity;

enum ValetudoEventKey {
  StateAttributes = "StateAttributesUpdated",
}

type ValetudoEvent = {
  [ValetudoEventKey.StateAttributes]: (attributes: RobotAttribute[]) => void;
};

const presetOrder = [
  PresetSelectionStateIntensity.Off,
  PresetSelectionStateIntensity.Min,
  PresetSelectionStateIntensity.Low,
  PresetSelectionStateIntensity.Medium,
  PresetSelectionStateIntensity.High,
  PresetSelectionStateIntensity.Max,
  PresetSelectionStateIntensity.Turbo,
  PresetSelectionStateMode.Vacuum,
  PresetSelectionStateMode.VacuumAndMop,
  PresetSelectionStateMode.Mop,
];

function sortPresets<T extends PresetSelectionCapacity>(
  presets: PresetSelectionValue<T>[]
) {
  return presets.sort((a, b) => {
    return presetOrder.indexOf(a) - presetOrder.indexOf(b);
  });
}

export class ValetudoClient {
  logger?: Logger;
  client: AxiosInstance;
  emitter: TypedEmitter<ValetudoEvent>;
  eventSources: Map<ValetudoEventKey, ReconnectingEventSource>;

  constructor(host: string, port: number, logger?: Logger) {
    this.logger = logger;
    this.client = axios.create({ baseURL: `http://${host}:${port}/api/v2/` });
    this.emitter = new EventEmitter() as TypedEmitter<ValetudoEvent>;
    this.eventSources = new Map();
  }

  @logMethod()
  getCapabilities() {
    return this.client
      .get<Capability[]>("robot/capabilities")
      .then((res) => new Set(res.data));
  }

  @logMethod()
  getInfo() {
    return this.client.get<RobotInformation>("robot").then((res) => res.data);
  }

  @logMethod()
  getProperties() {
    return this.client.get<RobotProperties>("robot/properties").then((res) => {
      return res.data;
    });
  }

  @logMethod()
  getStateAttributes() {
    return this.client
      .get<RobotAttribute[]>("robot/state/attributes")
      .then((res) => res.data);
  }

  onStateAttributesUpdated(callback: (attributes: RobotAttribute[]) => void) {
    if (!this.eventSources.has(ValetudoEventKey.StateAttributes)) {
      const url = new URL(
        "robot/state/attributes/sse",
        this.client.defaults.baseURL
      );
      const eventSource = new ReconnectingEventSource(url.href, {
        max_retry_time: 3000,
        eventSourceClass: EventSource,
      });
      this.eventSources.set(ValetudoEventKey.StateAttributes, eventSource);

      eventSource.addEventListener(
        ValetudoEventKey.StateAttributes,
        (event: MessageEvent<string>) => {
          this.emitter.emit(
            ValetudoEventKey.StateAttributes,
            JSON.parse(event.data)
          );
        }
      );
    }

    this.emitter.on(ValetudoEventKey.StateAttributes, callback);
  }

  @logMethod()
  getPresetSelections<T extends PresetSelectionCapacity>(
    capability: T
  ): Promise<PresetSelectionValue<T>[]> {
    return this.client
      .get<PresetSelectionValue<T>[]>(
        `/robot/capabilities/${capability}/presets`
      )
      .then((res) => sortPresets(res.data));
  }

  @logMethod()
  putPresetSelection(
    capability:
      | Capability.FanSpeedControl
      | Capability.WaterUsageControl
      | Capability.OperationModeControl,
    level: PresetSelectionState["value"]
  ) {
    return this.client
      .put(`robot/capabilities/${capability}/preset`, {
        name: level,
      })
      .then((res) => res.data);
  }

  @logMethod()
  getConsumableStates() {
    return this.client
      .get<ConsumableState[]>(
        `robot/capabilities/${Capability.ConsumableMonitoring}`
      )
      .then((res) => res.data);
  }

  @logMethod()
  getConsumableProperties() {
    return this.client
      .get<ConsumableProperties>(
        `robot/capabilities/${Capability.ConsumableMonitoring}/properties`
      )
      .then((res) => res.data);
  }

  @logMethod()
  putResetConsumable(id: ConsumableId) {
    let url = `robot/capabilities/${Capability.ConsumableMonitoring}/${id.type}}`;
    if (id.subType) {
      url = `${url}/${id.subType}`;
    }

    return this.client.put(url, { action: "reset" }).then((res) => res.data);
  }

  @logMethod()
  putBasicControlAction(action: BasicControlAction) {
    return this.client
      .put(`robot/capabilities/${Capability.BasicControl}`, {
        action,
      })
      .then((res) => res.data);
  }

  @logMethod()
  getSpeakerVolume() {
    return this.client
      .get<SpeakerVolumeState>(
        `robot/capabilities/${Capability.SpeakerVolumeControl}`
      )
      .then((res) => res.data.volume);
  }

  @logMethod()
  putSpeakerVolume(volume: number) {
    return this.client
      .put(`robot/capabilities/${Capability.SpeakerVolumeControl}`, {
        action: "set_volume",
        value: volume,
      })
      .then((res) => res.data);
  }

  @logMethod()
  dispose() {
    this.emitter.removeAllListeners();
    for (const [_, eventSource] of this.eventSources) {
      eventSource.close();
    }
    this.eventSources.clear();
  }
}
