import type { ModeBase } from "@matter/main/clusters";
import { RvcRunMode } from "@matter/types/clusters/rvc-run-mode";

import type {
  RvcRunModeState as ClusterState,
  RvcRunModeHandlers,
} from "homebridge";
type SupportMode = NonNullable<ClusterState["supportedModes"]>;

import {
  BasicControlAction,
  RobotAttribute,
  RobotAttributeClass,
  RobotStatus,
  isAttribute,
} from "../types/valetudo";
import type { ClusterContext } from "./context";
import { describeError } from "./utils";

const RUN_MODE = { IDLE: 0, CLEANING: 1 } as const;

export class RvcRunModeCluster {
  private readonly _ctx: ClusterContext;
  readonly clusterState: ClusterState;

  static async create(ctx: ClusterContext): Promise<RvcRunModeCluster> {
    return new RvcRunModeCluster(ctx);
  }

  private constructor(ctx: ClusterContext) {
    this._ctx = ctx;

    const supportedModes: SupportMode = [
      {
        label: "Idle",
        mode: RUN_MODE.IDLE,
        modeTags: [{ value: RvcRunMode.ModeTag.Idle }],
      },
      {
        label: "Cleaning",
        mode: RUN_MODE.CLEANING,
        modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }],
      },
    ];

    this.clusterState = {
      supportedModes,
      currentMode: this._deriveMode(ctx.attributes),
    };

    ctx.client.onStateAttributesUpdated((attrs) =>
      this._onAttributesUpdated(attrs),
    );
  }

  get handler(): RvcRunModeHandlers {
    return {
      changeToMode: this._handleChangeToMode.bind(this),
    };
  }

  private _deriveMode(attributes: RobotAttribute[]): number {
    for (const attr of attributes) {
      if (!isAttribute(RobotAttributeClass.StatusState)(attr)) {
        continue;
      }
      if ([RobotStatus.Docked, RobotStatus.Idle].includes(attr.value)) {
        return RUN_MODE.IDLE;
      }
    }

    return RUN_MODE.CLEANING;
  }

  private _onAttributesUpdated(attributes: RobotAttribute[]): void {
    const currentMode = this._deriveMode(attributes);
    const clusterName = this._ctx.matterApi.clusterNames.RvcRunMode;
    this._ctx.log.debug(
      `RvcRunMode → ${currentMode === RUN_MODE.IDLE ? "Idle" : "Cleaning"}`,
    );

    void this._ctx.matterApi
      .updateAccessoryState(this._ctx.uuid, clusterName, { currentMode })
      .catch((err: unknown) =>
        this._ctx.log.debug(
          `Failed to update rvcRunMode: ${describeError(err)}`,
        ),
      );
  }

  private async _handleChangeToMode(
    request: ModeBase.ChangeToModeRequest,
  ): Promise<void> {
    const { newMode } = request;
    if (newMode === RUN_MODE.CLEANING) {
      const selectedSegmentIds = Array.from(this._ctx.selectedSegmentId);
      if (selectedSegmentIds.length > 0) {
        this._ctx.log.debug(`Start segment cleaning`);
        await this._ctx.client.putMapSegmentationAction(selectedSegmentIds);
      } else {
        this._ctx.log.debug(`Start general cleaning`);
        await this._ctx.client.putBasicControlAction(BasicControlAction.Start);
      }
    } else if (newMode === RUN_MODE.IDLE) {
      this._ctx.log.debug(`Stop cleaning`);
      await this._ctx.client.putBasicControlAction(BasicControlAction.Stop);
    } else {
      throw new Error(`Unsupported run mode: ${newMode}`);
    }
  }
}
