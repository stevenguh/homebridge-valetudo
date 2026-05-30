import type {
  ServiceAreaState as ClusterState,
  ServiceAreaHandlers,
} from "homebridge";

import {
  Capability,
  CleaningFlag,
  MapSegment,
  RobotAttribute,
  RobotAttributeClass,
  RobotStatus,
  Segment,
  isAttribute,
} from "../types/valetudo";
import type { ClusterContext } from "./context";
import { describeError } from "./utils";

type SupportedAreas = NonNullable<ClusterState["supportedAreas"]>;

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function buildSupportedAreas(segments: Segment[]): {
  supportedAreas: SupportedAreas;
  areaIdToSegmentId: Map<number, string>;
} {
  const areaIdToSegmentId = new Map<number, string>();
  const supportedAreas = segments.map((segment) => {
    const areaId = hashCode(segment.id);
    areaIdToSegmentId.set(areaId, segment.id);
    return {
      areaId,
      mapId: null,
      areaInfo: {
        locationInfo: {
          locationName: segment.name ?? `Room ${segment.id}`,
        },
        landmarkInfo: null,
      },
    };
  });
  return { supportedAreas, areaIdToSegmentId };
}

function buildFromMapSegments(segments: MapSegment[]): {
  supportedAreas: SupportedAreas;
  selectedAreas: number[];
  selectedSegmentIds: Set<string>;
} {
  const { supportedAreas } = buildSupportedAreas(segments);
  const selectedAreas: number[] = [];
  const selectedSegmentIds = new Set<string>();
  for (const segment of segments) {
    if (!segment.active) continue;
    selectedAreas.push(hashCode(segment.id));
    selectedSegmentIds.add(segment.id);
  }
  return { supportedAreas, selectedAreas, selectedSegmentIds };
}

export class ServiceAreaCluster {
  private readonly _ctx: ClusterContext;
  readonly clusterState: ClusterState | undefined;

  static async create(ctx: ClusterContext): Promise<ServiceAreaCluster> {
    if (!ctx.capabilities.has(Capability.MapSegmentation)) {
      ctx.log.debug(`ServiceArea: MapSegmentation not supported, skipping`);
      return new ServiceAreaCluster(ctx, []);
    }

    const segments = await ctx.client.getMapSegments();
    ctx.log.debug(`ServiceArea: ${segments.length} segment(s) loaded`);
    return new ServiceAreaCluster(ctx, segments);
  }

  private constructor(ctx: ClusterContext, segments: MapSegment[]) {
    this._ctx = ctx;

    if (segments.length === 0) {
      this.clusterState = undefined;
      return;
    }

    const { supportedAreas, selectedAreas, selectedSegmentIds } =
      buildFromMapSegments(segments);
    this.clusterState = {
      supportedMaps: [],
      supportedAreas,
      selectedAreas,
    };
    ctx.selectedSegmentId = selectedSegmentIds;

    ctx.client.onStateAttributesUpdated((attrs) =>
      this._onAttributesUpdated(attrs),
    );
  }

  get handler(): ServiceAreaHandlers {
    if (!this._ctx.capabilities.has(Capability.MapSegmentation)) {
      return {
        selectAreas: undefined,
      };
    }

    return {
      selectAreas: async (request) => {
        const { newAreas } = request;
        this._ctx.log.debug(
          `selectAreas: ${newAreas.length} area(s) requested`,
        );

        // Refresh segments in case they've been updated; ideally via SSE.
        const segments = await this._ctx.client.getSegments();
        const { supportedAreas, areaIdToSegmentId } =
          buildSupportedAreas(segments);

        const selectedAreas: number[] = [];
        this._ctx.selectedSegmentId.clear();
        for (const areaId of newAreas) {
          const segmentId = areaIdToSegmentId.get(areaId);
          if (segmentId === undefined) {
            this._ctx.log.warn(
              `Received invalid areaId ${areaId} in selectAreas`,
            );
            continue;
          }

          selectedAreas.push(areaId);
          this._ctx.selectedSegmentId.add(segmentId);
        }

        this._ctx.log.debug(
          `selectAreas: resolved ${selectedAreas.length} area(s)`,
        );
        const clusterName = this._ctx.matterApi.clusterNames.ServiceArea;
        await this._ctx.matterApi.updateAccessoryState(
          this._ctx.uuid,
          clusterName,
          {
            supportedAreas,
            selectedAreas,
          },
        );
      },
    };
  }

  private _onAttributesUpdated(attributes: RobotAttribute[]): void {
    const status = attributes.find(
      isAttribute(RobotAttributeClass.StatusState),
    );

    if (status?.value !== RobotStatus.Cleaning) {
      return;
    }

    // Update the active segments if cleaning was started externally.
    if (status.flag === CleaningFlag.Segment) {
      void this._refreshFromMap();
    } else if (this._ctx.selectedSegmentId.size > 0) {
      void this._clearSelection();
    }
  }

  private async _refreshFromMap(): Promise<void> {
    const clusterName = this._ctx.matterApi.clusterNames.ServiceArea;
    try {
      const segments = await this._ctx.client.getMapSegments();
      const { supportedAreas, selectedAreas, selectedSegmentIds } =
        buildFromMapSegments(segments);
      this._ctx.selectedSegmentId = selectedSegmentIds;
      this._ctx.log.debug(
        `ServiceArea: ${supportedAreas.length} segment(s), ${selectedAreas.length} active`,
      );
      await this._ctx.matterApi.updateAccessoryState(
        this._ctx.uuid,
        clusterName,
        {
          supportedAreas,
          selectedAreas,
        },
      );
    } catch (err: unknown) {
      this._ctx.log.error(
        `Failed to refresh service area from map: ${describeError(err)}`,
      );
    }
  }

  private async _clearSelection(): Promise<void> {
    this._ctx.log.debug(`ServiceArea: clearing selection`);
    this._ctx.selectedSegmentId.clear();
    const clusterName = this._ctx.matterApi.clusterNames.ServiceArea;
    try {
      await this._ctx.matterApi.updateAccessoryState(
        this._ctx.uuid,
        clusterName,
        { selectedAreas: [] },
      );
    } catch (err: unknown) {
      this._ctx.log.error(
        `Failed to clear service area selection: ${describeError(err)}`,
      );
    }
  }
}
