export type QueryValue = string | number | boolean | null;
export type Operator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'exists';
export interface Condition {
  field: string;
  op: Operator;
  value?: QueryValue | readonly QueryValue[];
}
export interface Query {
  where?: readonly Condition[];
  select?: readonly string[];
  orderBy?: readonly { field: string; direction?: 'asc' | 'desc' }[];
  offset?: number;
  limit?: number;
}
export interface QueryOptions {
  maxRows?: number;
  maxConditions?: number;
}

export class QueryError extends Error {
  constructor(
    readonly code: 'invalid' | 'capacity',
    message: string,
  ) {
    super(message);
    this.name = 'QueryError';
  }
}

const plain = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function exactKeys(
  value: object,
  allowed: readonly string[],
  required: readonly string[] = [],
): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.every((key) => {
      if (typeof key !== 'string' || !allowed.includes(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.enumerable === true && 'value' in descriptor;
    }) && required.every((key) => Object.hasOwn(value, key))
  );
}
function denseArray(value: unknown[]): boolean {
  return (
    Object.getPrototypeOf(value) === Array.prototype &&
    Reflect.ownKeys(value).length === value.length + 1 &&
    Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean)
  );
}
function field(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128)
    throw new QueryError('invalid', 'Field names must contain 1..128 characters.');
}
function integer(value: number, name: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new QueryError('invalid', `${name} must be an integer from 0 to ${maximum}.`);
}
function comparable(value: unknown): value is QueryValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}
function validate(query: Query, maxConditions: number): void {
  if (!plain(query) || !exactKeys(query, ['where', 'select', 'orderBy', 'offset', 'limit']))
    throw new QueryError('invalid', 'Query must be a plain object with supported fields.');
  const input = query as Query;
  for (const key of ['where', 'select', 'orderBy'] as const) {
    if (Object.hasOwn(input, key) && !Array.isArray(input[key]))
      throw new QueryError('invalid', `${key} must be an array when provided.`);
  }
  for (const key of ['offset', 'limit'] as const) {
    if (Object.hasOwn(input, key) && typeof input[key] !== 'number')
      throw new QueryError('invalid', `${key} must be a number when provided.`);
  }
  const conditions: readonly Condition[] = input.where ?? [];
  const selected: readonly string[] = input.select ?? [];
  const ordering: NonNullable<Query['orderBy']> = input.orderBy ?? [];
  if (!Array.isArray(conditions) || !denseArray(conditions) || conditions.length > maxConditions)
    throw new QueryError('capacity', `At most ${maxConditions} conditions are allowed.`);
  for (const condition of conditions) {
    if (!plain(condition) || !exactKeys(condition, ['field', 'op', 'value'], ['field', 'op']))
      throw new QueryError('invalid', 'Each condition must be an object with field and op.');
    field(condition.field);
    if (
      !['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists'].includes(
        condition.op as string,
      )
    )
      throw new QueryError('invalid', 'Unsupported query operator.');
    if (condition.op === 'exists') {
      if (typeof condition.value !== 'boolean')
        throw new QueryError('invalid', 'exists requires a boolean.');
    } else if (condition.op === 'in') {
      if (
        !Array.isArray(condition.value) ||
        !denseArray(condition.value) ||
        condition.value.length > 256 ||
        !condition.value.every(comparable)
      )
        throw new QueryError('invalid', 'in requires an array of at most 256 scalar values.');
    } else if (!comparable(condition.value)) {
      throw new QueryError('invalid', 'This operator requires a scalar value.');
    }
    if (condition.op === 'contains' && typeof condition.value !== 'string')
      throw new QueryError('invalid', 'contains requires a string value.');
    if (
      ['gt', 'gte', 'lt', 'lte'].includes(condition.op as string) &&
      !(typeof condition.value === 'number' || typeof condition.value === 'string')
    )
      throw new QueryError('invalid', 'Ordering operators require a number or string.');
  }
  if (
    !Array.isArray(selected) ||
    !denseArray(selected) ||
    selected.length > 32 ||
    !selected.every((item) => typeof item === 'string')
  )
    throw new QueryError('invalid', 'select must contain at most 32 field names.');
  selected.forEach(field);
  if (!Array.isArray(ordering) || !denseArray(ordering) || ordering.length > 8)
    throw new QueryError('capacity', 'At most 8 order fields are allowed.');
  for (const order of ordering) {
    if (!plain(order) || !exactKeys(order, ['field', 'direction'], ['field']))
      throw new QueryError('invalid', 'Each order clause must specify only field and direction.');
    field(order.field);
    if (
      Object.hasOwn(order, 'direction') &&
      order.direction !== 'asc' &&
      order.direction !== 'desc'
    )
      throw new QueryError('invalid', 'Order direction must be asc or desc.');
  }
  integer(input.offset ?? 0, 'offset', 100_000);
  integer(input.limit ?? 1000, 'limit', 10_000);
}
function matches(row: Record<string, unknown>, condition: Condition): boolean {
  const actual = row[condition.field];
  const expected = condition.value;
  switch (condition.op) {
    case 'exists':
      return (condition.value as boolean) === Object.hasOwn(row, condition.field);
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
    case 'in':
      return (expected as readonly QueryValue[]).includes(actual as QueryValue);
    case 'contains':
      return typeof actual === 'string' && actual.includes(expected as string);
    case 'gt':
      return (
        typeof actual === typeof expected &&
        (actual as string | number) > (expected as string | number)
      );
    case 'gte':
      return (
        typeof actual === typeof expected &&
        (actual as string | number) >= (expected as string | number)
      );
    case 'lt':
      return (
        typeof actual === typeof expected &&
        (actual as string | number) < (expected as string | number)
      );
    case 'lte':
      return (
        typeof actual === typeof expected &&
        (actual as string | number) <= (expected as string | number)
      );
  }
}
export function executeQuery<T extends Record<string, unknown>>(
  rows: readonly T[],
  query: Query = {},
  options: QueryOptions = {},
): Array<Partial<T>> {
  if (!plain(options) || !exactKeys(options, ['maxRows', 'maxConditions']))
    throw new QueryError('invalid', 'Options must be a plain object with supported fields.');
  const config = options as QueryOptions;
  for (const key of ['maxRows', 'maxConditions'] as const) {
    if (Object.hasOwn(config, key) && typeof config[key] !== 'number')
      throw new QueryError('invalid', `${key} must be a number when provided.`);
  }
  const maxRows = config.maxRows ?? 100_000;
  const maxConditions = config.maxConditions ?? 64;
  integer(maxRows, 'maxRows', 1_000_000);
  integer(maxConditions, 'maxConditions', 1024);
  validate(query, maxConditions);
  if (!Array.isArray(rows) || rows.length > maxRows)
    throw new QueryError('capacity', `Input must contain at most ${maxRows} rows.`);
  if (
    !denseArray(rows as T[]) ||
    !rows.every(
      (row) =>
        plain(row) &&
        Reflect.ownKeys(row).length <= 1000 &&
        Reflect.ownKeys(row).every((key) => typeof key === 'string' && key.length <= 128) &&
        exactKeys(row, Reflect.ownKeys(row) as string[]),
    )
  )
    throw new QueryError('invalid', 'Every row must be a plain object with data properties.');
  const input = query as Query;
  const source = rows as readonly T[];
  const conditions = input.where ?? [];
  let result = source.filter((row) => conditions.every((condition) => matches(row, condition)));
  if (input.orderBy?.length) {
    result = [...result].sort((a, b) => {
      for (const order of input.orderBy!) {
        const left = a[order.field];
        const right = b[order.field];
        if (left === right) continue;
        const direction = order.direction === 'desc' ? -1 : 1;
        if (left === undefined || left === null) return -direction;
        if (right === undefined || right === null) return direction;
        if (typeof left !== typeof right || !['number', 'string', 'boolean'].includes(typeof left))
          throw new QueryError(
            'invalid',
            `Values for ${order.field} are not consistently sortable.`,
          );
        return (left < right ? -1 : 1) * direction;
      }
      return 0;
    });
  }
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 1000;
  return result.slice(offset, offset + limit).map((row): Partial<T> => {
    if (input.select === undefined || input.select.length === 0) return { ...row };
    const projection: Partial<T> = {};
    for (const key of input.select)
      if (Object.hasOwn(row, key)) projection[key as keyof T] = row[key] as T[keyof T];
    return projection;
  });
}
