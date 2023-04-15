import { PlatformAccessory } from "homebridge";

import { ValetudoService } from "./types/discovery";
import { Capability } from "./types/valetudo";
import { BaseService } from "./services/base";
import { AccessoryInfoService } from "./services/accessoryInfo";
import { BatteryService } from "./services/battery";
import { SpeakerVolumeService } from "./services/speakerVolume";
import { FanService } from "./services/fan";
import { ValetudoClient } from "./valetudoClient";
import { HomebridgeContext } from "./types/homebridgeContext";
import { ConsumableService } from "./services/consumable";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */

export class ValetudoDevice {
  private readonly client: ValetudoClient;
  private readonly services: BaseService[];

  constructor(
    private readonly context: HomebridgeContext,
    public readonly accessory: PlatformAccessory,
    private readonly dnsService: ValetudoService
  ) {
    this.client = new ValetudoClient(
      dnsService.addresses[0],
      dnsService.port,
      context.logger
    );
    this.services = [];
  }

  async init() {
    const [attributes, capabilities] = await Promise.all([
      this.client.getStateAttributes(),
      this.client.getCapabilities(),
    ]);

    this.services.push(
      new AccessoryInfoService(
        this.context,
        this.accessory,
        this.client,
        this.dnsService.txt
      )
    );
    this.services.push(
      new BatteryService(this.context, this.accessory, this.client, attributes)
    );

    if (
      capabilities.has(Capability.BasicControl) &&
      capabilities.has(Capability.FanSpeedControl)
    ) {
      const fanPresets = await this.client.getPresetSelections(
        Capability.FanSpeedControl
      );
      this.services.push(
        new FanService(
          this.context,
          this.accessory,
          this.client,
          attributes,
          fanPresets
        )
      );
    }

    if (capabilities.has(Capability.SpeakerVolumeControl)) {
      this.services.push(
        new SpeakerVolumeService(this.context, this.accessory, this.client)
      );
    }

    if (capabilities.has(Capability.ConsumableMonitoring)) {
      const properties = await this.client.getConsumableProperties();
      this.services.push(
        new ConsumableService(
          this.context,
          this.accessory,
          this.client,
          properties
        )
      );
    }
  }

  dispose() {
    for (const service of this.services) {
      service.dispose();
    }

    this.client.dispose();
  }
}
