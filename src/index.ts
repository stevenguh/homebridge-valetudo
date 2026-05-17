import {
  API,
  Logging,
  PlatformConfig,
  PlatformPluginConstructor,
} from "homebridge";

import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import ValetudoPlatformHAP from "./platform.hap";
import ValetudoPlatformMatter from "./platform.matter";

class ValetudoPlatformProxy {
  constructor(log: Logging, config: PlatformConfig, api: API) {
    const enableMatter = config.enableMatter !== false;
    const matterAvailable = !!(
      api.isMatterAvailable?.() && api.isMatterEnabled?.()
    );

    if (enableMatter && matterAvailable) {
      log.debug("Initializing Matter platform");
      try {
        return new ValetudoPlatformMatter(log, config, api);
      } catch (error: any) {
        log.warn(
          `Matter platform failed to initialize, falling back to HAP: ${error?.message ?? error}`,
        );
      }
    } else if (!enableMatter) {
      log.debug("Matter disabled in config, using HAP platform");
    } else {
      log.debug("Matter API not available, using HAP platform");
    }

    return new ValetudoPlatformHAP(log, config, api);
  }
}

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, ValetudoPlatformProxy);
};
