import type {
  ServiceAreaState as ClusterState,
  ServiceAreaHandlers,
} from "homebridge";

import { Capability, Segment } from "../types/valetudo";
import type { ClusterContext } from "./context";

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export class ServiceAreaCluster {
  private readonly _ctx: ClusterContext;
  private readonly _areaIdToSegmentId: Map<number, string>;
  readonly clusterState: ClusterState | undefined;

  static async create(ctx: ClusterContext): Promise<ServiceAreaCluster> {
    if (!ctx.capabilities.has(Capability.MapSegmentation)) {
      ctx.log.debug(`ServiceArea: MapSegmentation not supported, skipping`);
      return new ServiceAreaCluster(ctx, []);
    }

    const segments = await ctx.client.getSegments();
    ctx.log.debug(`ServiceArea: ${segments.length} segment(s) loaded`);
    return new ServiceAreaCluster(ctx, segments);
  }

  private constructor(ctx: ClusterContext, segments: Segment[]) {
    this._ctx = ctx;
    this._areaIdToSegmentId = new Map();

    if (segments.length === 0) {
      this.clusterState = undefined;
      return;
    }

    this.clusterState = {
      supportedMaps: [],
      supportedAreas: this._buildSupportedAreas(segments),
      selectedAreas: [],
    };
  }

  private _buildSupportedAreas(
    segments: Segment[],
  ): NonNullable<ClusterState["supportedAreas"]> {
    this._areaIdToSegmentId.clear();
    return segments.map((segment) => {
      const areaId = hashCode(segment.id);
      this._areaIdToSegmentId.set(areaId, segment.id);
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
        const supportedAreas = this._buildSupportedAreas(segments);

        const selectedAreas: number[] = [];
        this._ctx.selectedSegmentId.clear();
        for (const areaId of newAreas) {
          const segmentId = this._areaIdToSegmentId.get(areaId);
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
}
