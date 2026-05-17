import type { Logging, MatterAccessory, MatterAPI } from "homebridge";

import { ValetudoClient } from "./valetudoClient";
import { ValetudoService } from "./types/discovery";
import type { ClusterContext } from "./clusters/context";
import { IdentifyCluster } from "./clusters/identify";
import { PowerSourceCluster } from "./clusters/powerSource";
import { RvcCleanModeCluster } from "./clusters/rvcCleanMode";
import { RvcOperationalStateCluster } from "./clusters/rvcOperationalState";
import { RvcRunModeCluster } from "./clusters/rvcRunMode";
import { ServiceAreaCluster } from "./clusters/serviceArea";

interface ValetudoMatterContext extends Record<string, unknown> {
  id: string;
}

type MatterClusters = NonNullable<
  MatterAccessory<ValetudoMatterContext>["clusters"]
>;
type MatterHandlers = NonNullable<
  MatterAccessory<ValetudoMatterContext>["handlers"]
>;

export interface ValetudoMatterAccessory extends MatterAccessory<ValetudoMatterContext> {
  dispose(): void;
}

export async function createRoboticVacuumCleaner(
  matterApi: MatterAPI,
  log: Logging,
  dnsService: ValetudoService,
): Promise<ValetudoMatterAccessory> {
  if (!dnsService.txt.id) {
    throw new Error(`Missing id in device TXT record: ${dnsService.fullname}`);
  }
  if (!dnsService.addresses.length) {
    throw new Error(`No addresses found for device: ${dnsService.txt.id}`);
  }

  const client = new ValetudoClient(
    dnsService.addresses[0],
    dnsService.port,
    log,
  );
  const uuid = matterApi.uuid.generate(dnsService.txt.id);
  const displayName = dnsService.name;

  log.debug(`[${displayName}] Seeding initial state`);

  const [attributes, capabilities] = await Promise.all([
    client.getStateAttributes(),
    client.getCapabilities(),
  ]);

  const ctx: ClusterContext = {
    uuid,
    matterApi,
    client,
    log,
    attributes,
    capabilities,
    selectedSegmentId: new Set<string>(),
  };

  const [
    serviceArea,
    identify,
    rvcRunMode,
    rvcOperationalState,
    rvcCleanMode,
    powerSource,
  ] = await Promise.all([
    ServiceAreaCluster.create(ctx),
    IdentifyCluster.create(ctx),
    RvcRunModeCluster.create(ctx),
    RvcOperationalStateCluster.create(ctx),
    RvcCleanModeCluster.create(ctx),
    PowerSourceCluster.create(ctx),
  ]);

  // MatterClusters intersects with `{ [s: string]: Record<string, unknown> }`, but
  // concrete cluster state types lack an index signature, so `as` is unavoidable here.
  const clusters = {
    rvcRunMode: rvcRunMode.clusterState,
    rvcOperationalState: rvcOperationalState.clusterState,
    rvcCleanMode: rvcCleanMode.clusterState,
    powerSource: powerSource.clusterState,
    identify: identify.clusterState,
    serviceArea: serviceArea.clusterState,
  } as MatterClusters;

  const handlers = {
    rvcRunMode: rvcRunMode.handler,
    rvcOperationalState: rvcOperationalState.handler,
    rvcCleanMode: rvcCleanMode.handler,
    identify: identify.handler,
    serviceArea: serviceArea.handler,
  } as MatterHandlers;

  log.debug(`[${displayName}] Accessory created`);
  return {
    UUID: uuid,
    displayName,
    deviceType: matterApi.deviceTypes.RoboticVacuumCleaner,
    serialNumber: dnsService.txt.id,
    manufacturer: dnsService.txt.manufacturer || "Valetudo",
    model: dnsService.txt.model || "Robot",
    firmwareRevision: dnsService.txt.version || "0.0.0",
    hardwareRevision: "1.0",
    context: { id: dnsService.txt.id },
    clusters,
    handlers,
    dispose() {
      client.dispose();
    },
  };
}
