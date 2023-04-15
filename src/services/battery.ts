import { LogLevel, PlatformAccessory, Service } from "homebridge";
import { ValetudoClient } from "../valetudoClient";
import {
  BatteryState,
  BatteryStateFlag,
  RobotAttribute,
  RobotAttributeClass,
  isAttribute,
} from "../types/valetudo";
import { BaseService } from "./base";
import { HomebridgeContext } from "../types/homebridgeContext";
import { logMethod } from "../decorators";

function getBatteryState(attributes: RobotAttribute[]) {
  return (
    attributes.find(isAttribute(RobotAttributeClass.BatteryState)) || {
      __class: RobotAttributeClass.BatteryState,
      metaData: {},
      level: 0,
      flag: BatteryStateFlag.None,
    }
  );
}

export class BatteryService extends BaseService {
  private readonly battery: Service;
  private state: BatteryState;

  constructor(
    context: HomebridgeContext,
    accessory: PlatformAccessory,
    client: ValetudoClient,
    attributes: RobotAttribute[]
  ) {
    super(context, accessory, client);

    this.state = getBatteryState(attributes);

    this.battery = this.getOrAddService(this.service.Battery);
    this.characteristics = [
      this.battery
        .getCharacteristic(this.characteristic.BatteryLevel)
        .onGet(this.getBatteryLevel.bind(this)),
      this.battery
        .getCharacteristic(this.characteristic.ChargingState)
        .onGet(this.getChargingState.bind(this)),
      this.battery
        .getCharacteristic(this.characteristic.StatusLowBattery)
        .onGet(this.getStatusLowBattery.bind(this)),
    ];

    this.client.onStateAttributesUpdated(this.handleAttributeUpdate.bind(this));
  }

  @logMethod({ level: LogLevel.DEBUG, skipArgs: true, skipResult: true })
  private handleAttributeUpdate(attribute: RobotAttribute[]) {
    this.state = getBatteryState(attribute);

    this.battery
      .getCharacteristic(this.characteristic.BatteryLevel)
      .updateValue(this.getBatteryLevel());
    this.battery
      .getCharacteristic(this.characteristic.ChargingState)
      .updateValue(this.getChargingState());
    this.battery
      .getCharacteristic(this.characteristic.StatusLowBattery)
      .updateValue(this.getStatusLowBattery());
  }

  private getBatteryLevel() {
    return this.state.level || 0;
  }

  private getChargingState() {
    switch (this.state.flag) {
      case BatteryStateFlag.None:
        return this.characteristic.ChargingState.NOT_CHARGEABLE;
      case BatteryStateFlag.Charged:
      case BatteryStateFlag.Discharging:
        return this.characteristic.ChargingState.NOT_CHARGING;
      case BatteryStateFlag.Charging:
        return this.characteristic.ChargingState.CHARGING;
    }
  }

  private getStatusLowBattery() {
    if (this.state.level < 20) {
      this.characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    }

    return this.characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }
}
