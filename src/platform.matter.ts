import {
  API,
  APIEvent,
  DynamicPlatformPlugin,
  Logging,
  MatterAccessory,
  MatterAPI,
  PlatformAccessory,
  PlatformConfig,
} from "homebridge";

import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import { Browser, tcp } from "dnssd";
import { ValetudoTxtKey, ValetudoService } from "./types/discovery";
import { milliseconds } from "./duration";
import {
  ValetudoMatterAccessory,
  createRoboticVacuumCleaner,
} from "./valetudoDevice.matter";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * ValetudoPlatformMatter
 * This class is the Matter platform plugin that registers Valetudo devices
 * as Homebridge Matter RoboticVacuumCleaner accessories.
 */
export default class ValetudoPlatformMatter implements DynamicPlatformPlugin {
  private readonly initedDevices = new Map<string, ValetudoMatterAccessory>();
  private readonly cachedMatterAccessories = new Map<string, MatterAccessory>();
  // HAP accessories restored from disk are not used by the Matter platform;
  // they are unregistered at launch to clean up any pre-Matter cache entries.
  private readonly staleHapAccessories: PlatformAccessory[] = [];

  private browser: Browser<ValetudoTxtKey> | undefined;
  private matterApi: MatterAPI;

  public constructor(
    public readonly logger: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (!api.matter) {
      throw new Error("Matter API not available.");
    }
    this.matterApi = api.matter;

    this.logger.debug("Finished initializing platform:", this.config.name);

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      if (this.staleHapAccessories.length > 0) {
        this.logger.info(
          `Removing ${this.staleHapAccessories.length} stale HAP accessories`,
        );
        this.api.unregisterPlatformAccessories(
          PLUGIN_NAME,
          PLATFORM_NAME,
          this.staleHapAccessories,
        );
      }

      this.logger.debug("Starting service discovery");
      this.browser = new Browser<ValetudoTxtKey>(tcp("valetudo"))
        .on("serviceUp", (svc) => {
          void this.handleServiceUp(svc);
        })
        .start();

      // Remove cached Matter accessories not rediscovered within 5 minutes.
      setTimeout(
        () => {
          for (const [uuid, accessory] of this.cachedMatterAccessories) {
            if (!this.initedDevices.has(uuid)) {
              this.logger.info(
                "Removing existing accessory from cache:",
                accessory.displayName,
              );
              this.cachedMatterAccessories.delete(uuid);
              this.matterApi
                .unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
                  accessory,
                ])
                .catch((e: unknown) => {
                  this.logger.warn(
                    "Failed to unregister stale accessory:",
                    describeError(e),
                  );
                });
            }
          }

          // Only remove cached HAP accessories after Matter registration succeeds.
          if (
            this.initedDevices.size > 0 &&
            this.staleHapAccessories.length > 0
          ) {
            this.logger.info(
              "Unregistering %d cached HAP accessory(ies) (switching to Matter)",
              this.staleHapAccessories.length,
            );
            this.api.unregisterPlatformAccessories(
              PLUGIN_NAME,
              PLATFORM_NAME,
              this.staleHapAccessories,
            );
            this.staleHapAccessories.length = 0;
          }
        },
        milliseconds({ minutes: 5 }),
      );
    });

    this.api.on(APIEvent.SHUTDOWN, () => {
      this.logger.debug("Shutting down Valetudo Matter platform");
      this.browser?.stop();
      for (const device of this.initedDevices.values()) {
        device.dispose();
      }
      this.initedDevices.clear();
    });
  }

  /**
   * Called by Homebridge when a cached HAP accessory is restored from disk.
   * The Matter platform does not use HAP accessories — they are unregistered
   * at launch.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.logger.debug(
      "Queuing stale HAP accessory for removal:",
      accessory.displayName,
    );
    this.staleHapAccessories.push(accessory);
  }

  /**
   * Called by Homebridge when a cached Matter accessory is restored from disk.
   */
  configureMatterAccessory(accessory: MatterAccessory): void {
    this.logger.info("Loading accessory from cache:", accessory.displayName);
    this.cachedMatterAccessories.set(accessory.UUID, accessory);
  }

  private async handleServiceUp(service: ValetudoService): Promise<void> {
    this.logger.debug("Service discovered:", service.name);

    try {
      const accessory = await createRoboticVacuumCleaner(
        this.matterApi,
        this.logger,
        service,
      );

      const cachedAccessory = this.cachedMatterAccessories.get(accessory.UUID);
      if (cachedAccessory) {
        this.logger.info(
          "Restoring cached accessory:",
          cachedAccessory.displayName,
        );
        await this.matterApi.updatePlatformAccessories([accessory]);
      } else {
        this.logger.info("Adding new accessory:", service.name);
        this.cachedMatterAccessories.set(accessory.UUID, accessory);
        await this.matterApi.registerPlatformAccessories(
          PLUGIN_NAME,
          PLATFORM_NAME,
          [accessory],
        );
      }

      // Replace any existing instance (e.g. re-discovery after serviceDown)
      this.initedDevices.get(accessory.UUID)?.dispose();
      this.initedDevices.set(accessory.UUID, accessory);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to initialize Matter accessory for ${service.txt.id}:`,
        describeError(error),
      );
    }
  }
}
