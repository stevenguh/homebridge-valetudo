declare module "dnssd" {
  class ServiceType {
    constructor(...args: Array<string | string[]>);
    constructor(args: ServiceType);

    name: string;
    protocol: string;
    subtypes: string[];

    toString(): string;

    static all(): ServiceType;
    static tcp(...args: string[]): ServiceType;
    static udp(...args: string[]): ServiceType;
  }

  interface BrowserOption {
    // Set to false if don't want to maintain a service's info.
    // This will give you a 'serviceUp' event but no 'serviceDown' or 'serviceChanged'
    maintain?: boolean;
    // Set to false if you only want the instance name and nothing else.
    resolve?: boolean;
    // Sets the interface to use ('eth0' or '1.2.3.4')
    interface?: string;
  }

  class Browser<K extends string> {
    constructor(type: string | string[] | ServiceType, options?: BrowserOption);

    start(): Browser<K>;
    stop(): void;
    list(): Service<K>[];
    on(event: "serviceUp", listener: (service: Service<K>) => void): Browser<K>;
    on(
      event: "serviceChanged",
      listener: (service: Service<K>) => void
    ): Browser<K>;
    on(
      event: "serviceDown",
      listener: (service: Service<K>) => void
    ): Browser<K>;
    on(event: "error", listener: (e: Error) => void): Browser<K>;
  }

  interface Service<K extends string> {
    fullname: string; // 'InstanceName._googlecast._tcp.local.'
    name: string; // 'InstanceName'
    type: ServiceType; // { name: 'googlecast'; protocol: 'tcp' }
    domain: string; // 'local'
    host: string; // 'Hostname.local.'
    port: number; // 8009
    addresses: string[]; // ['192.168.1.15']
    txt: Record<K, string>; // { id: 'strings' }
    txtRaw: Record<K, Buffer>;
  }
  export { Browser, Service, ServiceType };
  export const tcp: typeof ServiceType.tcp;
  export const udp: typeof ServiceType.udp;
  export const all: typeof ServiceType.all;
}
