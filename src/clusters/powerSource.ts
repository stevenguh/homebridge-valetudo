import type { ClusterStateMap } from "homebridge";
import { PowerSource } from "@matter/types/clusters/power-source";

import {
  BatteryState,
  RobotAttribute,
  RobotAttributeClass,
  isAttribute,
} from "../types/valetudo";
import type { ClusterContext } from "./context";
import { describeError } from "./utils";

type ClusterState = ClusterStateMap["powerSource"];

function toChargeLevel(level: number): number {
  if (level <= 5) return PowerSource.BatChargeLevel.Critical;
  if (level <= 15) return PowerSource.BatChargeLevel.Warning;
  return PowerSource.BatChargeLevel.Ok;
}

function extractBattery(
  attributes: RobotAttribute[],
): BatteryState | undefined {
  for (const attr of attributes) {
    if (isAttribute(RobotAttributeClass.BatteryState)(attr))
      return attr as BatteryState;
  }
  return undefined;
}

export class PowerSourceCluster {
  private readonly _ctx: ClusterContext;
  readonly clusterState: ClusterState | undefined;

  static async create(ctx: ClusterContext): Promise<PowerSourceCluster> {
    return new PowerSourceCluster(ctx);
  }

  private constructor(ctx: ClusterContext) {
    this._ctx = ctx;

    const battery = extractBattery(ctx.attributes);
    if (!battery) {
      this._ctx.log.error(
        `No battery attribute found during PowerSourceCluster initialization`,
      );
      return;
    }

    this.clusterState = {
      status: PowerSource.PowerSourceStatus.Unspecified,
      order: 0,
      description: "Battery",
      batPercentRemaining: Math.round(battery.level * 2),
      batChargeLevel: toChargeLevel(battery.level),
      batReplaceability: PowerSource.BatReplaceability.NotReplaceable,
    };

    ctx.client.onStateAttributesUpdated(this._onAttributesUpdated.bind(this));
  }

  private _onAttributesUpdated(attributes: RobotAttribute[]): void {
    const clusterName = this._ctx.matterApi.clusterNames.PowerSource;
    const battery = extractBattery(attributes);
    if (!battery) return;

    this._ctx.log.debug(`Battery: ${battery.level}%`);
    void this._ctx.matterApi
      .updateAccessoryState(this._ctx.uuid, clusterName, {
        batPercentRemaining: Math.round(battery.level * 2),
        batChargeLevel: toChargeLevel(battery.level),
      })
      .catch((err: unknown) =>
        this._ctx.log.debug(
          `Failed to update powerSource: ${describeError(err)}`,
        ),
      );
  }
}
