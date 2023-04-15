import { CharacteristicValue, PlatformAccessory, Service } from "homebridge";
import { ValetudoClient } from "../valetudoClient";
import { BaseService } from "./base";
import { HomebridgeContext } from "../types/homebridgeContext";
import { cachePromise } from "../decorators";
import { milliseconds } from "../duration";

// Require SpeakerVolumeControlCapability
export class SpeakerVolumeService extends BaseService {
  private readonly volume: Service;

  constructor(
    context: HomebridgeContext,
    accessory: PlatformAccessory,
    client: ValetudoClient
  ) {
    super(context, accessory, client);

    this.volume = this.getOrAddService(this.service.Speaker);

    this.characteristics = [
      this.volume
        .getCharacteristic(this.characteristic.Mute)
        .onGet(this.getMute.bind(this))
        .onSet(this.setMute.bind(this)),
      this.volume
        .getCharacteristic(this.characteristic.Volume)
        .onGet(this.getVolume.bind(this))
        .onSet(this.setVolume.bind(this)),
    ];
  }

  @cachePromise(milliseconds({ seconds: 0.5 }))
  private getVolume() {
    return this.client.getSpeakerVolume();
  }

  private async getMute() {
    const volume = await this.getVolume();
    return volume === 0;
  }

  private async setMute(value: CharacteristicValue) {
    const isMuted = value as boolean;
    await this.client.putSpeakerVolume(isMuted ? 0 : 100);
  }

  private async setVolume(value: CharacteristicValue) {
    const volume = value as number;
    await this.client.putSpeakerVolume(volume);
  }
}
