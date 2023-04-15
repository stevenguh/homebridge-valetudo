import { CharacteristicValue, PlatformAccessory } from "homebridge";
import { ValetudoClient } from "../valetudoClient";
import {
  ConsumableId,
  ConsumableMeta,
  ConsumableProperties,
  ConsumableSubType,
  ConsumableType,
} from "../types/valetudo";
import { BaseService } from "./base";
import { HomebridgeContext } from "../types/homebridgeContext";
import { cachePromise } from "../decorators";
import { milliseconds } from "../duration";

function getEnumName<T extends object>(
  enumType: T,
  enumValue: string
): keyof T | undefined {
  const keys = Object.keys(enumType) as Array<keyof T>;

  for (const key of keys) {
    if (enumType[key] === enumValue) {
      return key;
    }
  }

  return undefined;
}

function getConsumableName(consumable: ConsumableId) {
  const subType = consumable.subType ?? ConsumableSubType.None;

  const typeName: string =
    getEnumName(ConsumableType, consumable.type) ?? consumable.type;
  const subTypeName = getEnumName(ConsumableSubType, subType) ?? subType;

  return `${typeName} (${subTypeName})`;
}

function getConsumableId(consumable: ConsumableId) {
  return `${consumable.type}-${consumable.subType ?? ConsumableSubType.None}`;
}

function isMainFilter(meta: ConsumableMeta) {
  return (
    meta.type === ConsumableType.Filter &&
    meta.subType === ConsumableSubType.Main
  );
}

export class ConsumableService extends BaseService {
  constructor(
    context: HomebridgeContext,
    accessory: PlatformAccessory,
    client: ValetudoClient,
    properties: ConsumableProperties
  ) {
    super(context, accessory, client);

    // Support only main filter for now. Generally the name is not shown in other home apps if there are multiple filter indicators.
    const meta = properties.availableConsumables.find(isMainFilter);
    if (meta) {
      const id = getConsumableId(meta);
      const name = getConsumableName(meta);

      const service = this.getOrAddNamedService(
        this.service.FilterMaintenance,
        id,
        id
      );
      service.setCharacteristic(this.characteristic.Name, name);
      this.characteristics.push(
        service
          .getCharacteristic(this.characteristic.FilterChangeIndication)
          .onGet(this.getFilterChangeIndication.bind(this, meta)),
        service
          .getCharacteristic(this.characteristic.FilterLifeLevel)
          .onGet(this.getFilterLifeLevel.bind(this, meta)),
        service
          .getCharacteristic(this.characteristic.ResetFilterIndication)
          .onSet(this.resetFilterIndication.bind(this, meta))
      );
    }
  }

  @cachePromise(milliseconds({ minutes: 5 }))
  private getConsumableStates() {
    return this.client.getConsumableStates();
  }

  private async getConsumableStateByMeta(meta: ConsumableMeta) {
    const states = await this.getConsumableStates();
    const state = states.find(
      (state) =>
        state.type === meta.type &&
        (state.subType ?? ConsumableSubType.None) === meta.subType
    );
    if (!state) {
      throw new Error(
        `State for consumable ${getConsumableName(meta)} is not found`
      );
    }

    return state;
  }

  private async getFilterChangeIndication(meta: ConsumableMeta) {
    const state = await this.getConsumableStateByMeta(meta);
    return state.remaining.value > 0
      ? this.characteristic.FilterChangeIndication.FILTER_OK
      : this.characteristic.FilterChangeIndication.CHANGE_FILTER;
  }

  private async getFilterLifeLevel(meta: ConsumableMeta) {
    const state = await this.getConsumableStateByMeta(meta);
    const level = (state.remaining.value / (meta.maxValue ?? 100)) * 100;
    return Math.min(Math.max(Math.round(level), 0), 100);
  }

  private async resetFilterIndication(
    meta: ConsumableMeta,
    value: CharacteristicValue
  ) {
    if (value === 1) {
      return this.client.putResetConsumable(meta);
    }
  }
}
