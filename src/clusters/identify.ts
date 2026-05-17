import type { ClusterStateMap, IdentifyHandlers } from "homebridge";

type ClusterState = ClusterStateMap["identify"];
import { Identify } from "@matter/types/clusters/identify";

import { Capability } from "../types/valetudo";
import type { ClusterContext } from "./context";

export class IdentifyCluster {
  readonly clusterState: ClusterState | undefined;

  static async create(ctx: ClusterContext): Promise<IdentifyCluster> {
    return new IdentifyCluster(ctx);
  }

  private constructor(private readonly _ctx: ClusterContext) {
    this.clusterState = {
      identifyTime: 0,
      identifyType: Identify.IdentifyType.AudibleBeep,
    };
  }

  get handler(): IdentifyHandlers {
    if (!this._ctx.capabilities.has(Capability.Locate)) {
      return {
        identify: undefined,
      };
    }

    return {
      identify: this._handleIdentify.bind(this),
    };
  }

  private async _handleIdentify(): Promise<void> {
    this._ctx.log.debug("Locate triggered");
    await this._ctx.client.putLocate();
  }
}
