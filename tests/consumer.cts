import { executeQuery, type Query } from '@lp-labs/query-language';
const query: Query = { select: ['name'] };
const result: Array<Partial<{ name: string }>> = executeQuery([{ name: 'A' }], query);
void result;
