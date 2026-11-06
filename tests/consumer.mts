import { executeQuery, type Query } from '@lp-labs/query-language';
const query: Query = { where: [{ field: 'score', op: 'gte', value: 5 }] };
const result: Array<Partial<{ score: number }>> = executeQuery([{ score: 6 }], query);
void result;
