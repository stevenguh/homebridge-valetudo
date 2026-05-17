import { RvcCleanMode } from "@matter/types/clusters/rvc-clean-mode";
import type {
  RvcCleanModeState as ClusterState,
  RvcCleanModeHandlers,
} from "homebridge";

import type { ClusterContext } from "./context";

const VACUUM_MODE = 0;

export class RvcCleanModeCluster {
  private readonly _ctx: ClusterContext;
  readonly clusterState: ClusterState;

  static async create(ctx: ClusterContext): Promise<RvcCleanModeCluster> {
    return new RvcCleanModeCluster(ctx);
  }

  private constructor(ctx: ClusterContext) {
    this._ctx = ctx;

    this.clusterState = {
      supportedModes: [
        {
          label: "Vacuum",
          mode: VACUUM_MODE,
          modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }],
        },
      ],
      currentMode: VACUUM_MODE,
    };
  }

  get handler(): RvcCleanModeHandlers {
    return {
      changeToMode: () => {},
    };
  }
}
