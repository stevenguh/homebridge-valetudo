import {
  Characteristic,
  PlatformAccessory,
  Service,
  WithUUID,
} from "homebridge";
import { ValetudoClient } from "../valetudoClient";
import { HomebridgeContext } from "../types/homebridgeContext";
import { logMethod } from "../decorators";

export abstract class BaseService {
  protected characteristics: Characteristic[] = [];

  protected constructor(
    protected readonly context: HomebridgeContext,
    protected readonly accessory: PlatformAccessory,
    protected readonly client: ValetudoClient
  ) {
    this.logger.debug(`Creating ${this.constructor.name}`);
  }

  get service() {
    return this.context.service;
  }

  get characteristic() {
    return this.context.characteristic;
  }

  get logger() {
    return this.context.logger;
  }

  protected getOrAddService(service: WithUUID<typeof Service>) {
    return (
      this.accessory.getService(service) ||
      this.accessory.addService(service as unknown as Service)
    );
  }

  protected getOrAddNamedService(
    service: WithUUID<typeof Service>,
    name: string,
    subType: string
  ) {
    return (
      this.accessory.getService(name) ||
      this.accessory.addService(service, name, subType)
    );
  }

  @logMethod()
  dispose() {
    for (const c of this.characteristics) {
      c.removeOnGet();
      c.removeOnSet();
      c.removeAllListeners();
    }
  }
}
