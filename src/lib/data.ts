import { DATA_TYPE, DATETIME_REGEX } from './constants';
import type { DynamicDataType } from './types';

export function flattenJSON(
  eventData: Record<string, any>,
  keyValues: { key: string; value: any; dataType: DynamicDataType }[] = [],
  parentKey = '',
): { key: string; value: any; dataType: DynamicDataType }[] {
  for (const key of Object.keys(eventData)) {
    const value = eventData[key];
    const type = typeof value;
    const keyName = getKeyName(key, parentKey);

    // nested object
    if (value && type === 'object' && !Array.isArray(value) && !isValidDateValue(value)) {
      flattenJSON(value, keyValues, keyName);
    } else {
      createKey(keyName, value, keyValues);
    }
  }

  return keyValues;
}

export function isValidDateValue(value: string) {
  return typeof value === 'string' && DATETIME_REGEX.test(value);
}

export function getDataType(value: any): string {
  let type: string = typeof value;

  if (isValidDateValue(value)) {
    type = 'date';
  }

  return type;
}

export function getStringValue(value: string, dataType: number) {
  if (dataType === DATA_TYPE.number) {
    return parseFloat(value).toFixed(4);
  }

  if (dataType === DATA_TYPE.date) {
    return new Date(value).toISOString();
  }

  return value;
}

function createKey(key: string, value: string, keyValues: any[]) {
  const type = getDataType(value);

  let dataType = null;

  switch (type) {
    case 'number':
      dataType = DATA_TYPE.number;
      break;
    case 'string':
      dataType = DATA_TYPE.string;
      break;
    case 'boolean':
      dataType = DATA_TYPE.boolean;
      value = value ? 'true' : 'false';
      break;
    case 'date':
      dataType = DATA_TYPE.date;
      break;
    case 'object':
      dataType = DATA_TYPE.array;
      value = JSON.stringify(value);
      break;
    default:
      dataType = DATA_TYPE.string;
      break;
  }

  keyValues.push({ key, value, dataType });
}

function getKeyName(key: string, parentKey: string) {
  if (!parentKey) {
    return key;
  }

  return `${parentKey}.${key}`;
}

export function objectToArray(obj: object) {
  return Object.values(obj);
}
