import type { Logging, MatterAPI } from "homebridge";

import type { Capability, RobotAttribute } from "../types/valetudo";
import type { ValetudoClient } from "../valetudoClient";

export interface ClusterContext {
  uuid: string;
  matterApi: MatterAPI;
  client: ValetudoClient;
  log: Logging;
  attributes: RobotAttribute[];
  capabilities: Set<Capability>;
  selectedSegmentId: Set<string>;
}
