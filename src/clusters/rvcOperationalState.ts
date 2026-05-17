import type {
  RvcOperationalState as ClusterType,
  RvcOperationalStateHandlers,
} from "homebridge";
import { RvcOperationalState } from "@matter/types/clusters/rvc-operational-state";
const OperationalState = RvcOperationalState.OperationalState;

import {
  BasicControlAction,
  BatteryState,
  BatteryStateFlag,
  RobotAttribute,
  RobotAttributeClass,
  RobotStatus,
  StatusState,
  isAttribute,
} from "../types/valetudo";
import type { ClusterContext } from "./context";
import { describeError } from "./utils";

const NO_ERROR = { errorStateId: RvcOperationalState.ErrorState.NoError };

function deriveState(
  attributes: RobotAttribute[],
): Pick<ClusterType, "operationalState" | "operationalError"> {
  let statusState: StatusState | undefined;
  let battery: BatteryState | undefined;
  for (const attr of attributes) {
    if (isAttribute(RobotAttributeClass.StatusState)(attr))
      statusState = attr as StatusState;
    else if (isAttribute(RobotAttributeClass.BatteryState)(attr))
      battery = attr as BatteryState;
  }

  switch (statusState?.value) {
    case RobotStatus.Cleaning:
    case RobotStatus.ManualControl:
    case RobotStatus.Moving:
      return {
        operationalState: OperationalState.Running,
        operationalError: NO_ERROR,
      };
    case RobotStatus.Returning:
      return {
        operationalState: OperationalState.SeekingCharger,
        operationalError: NO_ERROR,
      };
    case RobotStatus.Paused:
      return {
        operationalState: OperationalState.Paused,
        operationalError: NO_ERROR,
      };
    case RobotStatus.Docked:
      return {
        operationalState:
          battery?.flag === BatteryStateFlag.Charging
            ? OperationalState.Charging
            : OperationalState.Docked,
        operationalError: NO_ERROR,
      };
    case RobotStatus.Error:
      return {
        operationalState: OperationalState.Error,
        operationalError: {
          errorStateId:
            RvcOperationalState.ErrorState.UnableToCompleteOperation,
          errorStateDetails: statusState.error?.description,
        },
      };
    case RobotStatus.Idle:
    default:
      return {
        operationalState: OperationalState.Stopped,
        operationalError: NO_ERROR,
      };
  }
}

export class RvcOperationalStateCluster {
  private readonly _ctx: ClusterContext;
  readonly clusterState: ClusterType;

  static async create(
    ctx: ClusterContext,
  ): Promise<RvcOperationalStateCluster> {
    return new RvcOperationalStateCluster(ctx);
  }

  private constructor(ctx: ClusterContext) {
    this._ctx = ctx;

    const initialState = deriveState(ctx.attributes);
    this.clusterState = {
      operationalStateList: [
        { operationalStateId: OperationalState.Stopped },
        { operationalStateId: OperationalState.Running },
        { operationalStateId: OperationalState.Paused },
        { operationalStateId: OperationalState.Error },
        { operationalStateId: OperationalState.SeekingCharger },
        { operationalStateId: OperationalState.Charging },
        { operationalStateId: OperationalState.Docked },
      ],
      operationalState: initialState.operationalState,
      operationalError: initialState.operationalError,
    };

    ctx.client.onStateAttributesUpdated(this._onAttributesUpdated.bind(this));
  }

  get handler(): RvcOperationalStateHandlers {
    return {
      pause: () => this._sendAction(BasicControlAction.Pause, "Pause"),
      resume: () => this._sendAction(BasicControlAction.Start, "Resume"),
      goHome: () => this._sendAction(BasicControlAction.Home, "Home"),
    };
  }

  private _onAttributesUpdated(attributes: RobotAttribute[]): void {
    const { operationalState, operationalError } = deriveState(attributes);
    const clusterName = this._ctx.matterApi.clusterNames.RvcOperationalState;
    this._ctx.log.debug(`Operational state → ${operationalState}`);

    void this._ctx.matterApi
      .updateAccessoryState(this._ctx.uuid, clusterName, {
        operationalState,
        operationalError,
      })
      .catch((err: unknown) =>
        this._ctx.log.error(
          `Failed to update rvcOperationalState: ${describeError(err)}`,
        ),
      );
  }

  private async _sendAction(
    action: BasicControlAction,
    label: string,
  ): Promise<void> {
    try {
      await this._ctx.client.putBasicControlAction(action);
      this._ctx.log.debug(label);
    } catch (err: unknown) {
      this._ctx.log.warn(`${label} failed: ${describeError(err)}`);
      throw err;
    }
  }
}
