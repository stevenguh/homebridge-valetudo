import { Service } from "dnssd";

export type ValetudoTxtKey = "id" | "model" | "manufacturer" | "version";
export type ValetudoService = Service<ValetudoTxtKey>;
