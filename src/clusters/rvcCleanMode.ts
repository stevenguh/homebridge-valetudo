import type { ModeBase } from "@matter/main/clusters";
import { RvcCleanMode } from "@matter/types/clusters/rvc-clean-mode";
import type {
  RvcCleanModeState as ClusterState,
  RvcCleanModeHandlers,
} from "homebridge";

import { Capability, PresetSelectionStateMode } from "../types/valetudo";
import type { ClusterContext } from "./context";

type SupportedMode = NonNullable<ClusterState["supportedModes"]>[number];

const MODE_DEFS: Partial<
  Record<
    PresetSelectionStateMode,
    { mode: number; label: string; tags: number[] }
  >
> = {
  [PresetSelectionStateMode.Vacuum]: {
    mode: 0,
    label: "Vacuum",
    tags: [RvcCleanMode.ModeTag.Vacuum],
  },
  [PresetSelectionStateMode.Mop]: {
    mode: 1,
    label: "Mop",
    tags: [RvcCleanMode.ModeTag.Mop],
  },
  [PresetSelectionStateMode.VacuumAndMop]: {
    mode: 2,
    label: "Vacuum and Mop",
    tags: [RvcCleanMode.ModeTag.Vacuum, RvcCleanMode.ModeTag.Mop],
  },
  [PresetSelectionStateMode.VacuumThenMop]: {
    mode: 3,
    label: "Vacuum then Mop",
    tags: [RvcCleanMode.ModeTag.VacuumThenMop],
  },
};

export class RvcCleanModeCluster {
  private readonly _ctx: ClusterContext;
  private readonly _modeToPreset: Map<number, PresetSelectionStateMode>;
  readonly clusterState: ClusterState;

  static async create(ctx: ClusterContext): Promise<RvcCleanModeCluster> {
    if (!ctx.capabilities.has(Capability.OperationModeControl)) {
      ctx.log.debug(
        `RvcCleanMode: OperationModeControl not supported, defaulting to Vacuum only`,
      );
      return new RvcCleanModeCluster(ctx, [PresetSelectionStateMode.Vacuum]);
    }

    const presets = await ctx.client.getPresetSelections(
      Capability.OperationModeControl,
    );
    ctx.log.debug(`RvcCleanMode: ${presets.length} operation mode(s) loaded`);
    return new RvcCleanModeCluster(ctx, presets);
  }

  private constructor(
    ctx: ClusterContext,
    presets: PresetSelectionStateMode[],
  ) {
    this._ctx = ctx;
    this._modeToPreset = new Map();

    const supportedModes: SupportedMode[] = [];
    for (const preset of presets) {
      const def = MODE_DEFS[preset];
      if (!def) {
        continue;
      }

      this._modeToPreset.set(def.mode, preset);
      supportedModes.push({
        label: def.label,
        mode: def.mode,
        modeTags: def.tags.map((value) => ({ value })),
      });
    }

    this.clusterState = {
      supportedModes,
      currentMode: supportedModes[0].mode,
    };
  }

  get handler(): RvcCleanModeHandlers {
    return {
      changeToMode: this._handleChangeToMode.bind(this),
    };
  }

  private async _handleChangeToMode(
    request: ModeBase.ChangeToModeRequest,
  ): Promise<void> {
    if (!this._ctx.capabilities.has(Capability.OperationModeControl)) {
      this._ctx.log.debug(
        `RvcCleanMode: OperationModeControl not supported, ignoring changeToMode`,
      );
      return;
    }

    const { newMode } = request;
    const preset = this._modeToPreset.get(newMode);
    if (!preset) {
      throw new Error(`Unsupported clean mode: ${newMode}`);
    }

    this._ctx.log.debug(`RvcCleanMode → ${preset}`);
    await this._ctx.client.putPresetSelection(
      Capability.OperationModeControl,
      preset,
    );
  }
}
