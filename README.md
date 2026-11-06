# @lp-labs/query-language

Bounded, in-memory filtering, sorting, projection, and pagination over plain JavaScript records.

## Install

```sh
npm install @lp-labs/query-language
```

## Quickstart

```js
import { executeQuery } from '@lp-labs/query-language';

const products = [
  { name: 'Pen', price: 2 },
  { name: 'Book', price: 8 },
];
const affordable = executeQuery(products, {
  where: [{ field: 'price', op: 'lte', value: 5 }],
  select: ['name'],
});
// [{ name: 'Pen' }]
```

## API

`executeQuery(rows, query?, options?)` returns a new array of shallow row copies.
The query supports up to 64 AND-combined `where` clauses (`eq`, `ne`, `gt`, `gte`,
`lt`, `lte`, `in`, `contains`, `exists`), at most 32 projected fields, 8 sort keys,
and bounded `offset`/`limit`. Default input cap is 100,000 rows and default result
limit is 1,000. `options.maxRows` and `options.maxConditions` customize those caps.
Invalid inputs throw `QueryError` (`invalid` or `capacity`).

## Customization

Set `maxRows` and `maxConditions` per call to fit the host application's workload.
Keep query objects constructed from trusted application values; this package does
not parse strings or execute user-provided code.

## Limitations

This is a small object-query evaluator, not a general-purpose query language or
database. It has no joins, nested paths, grouping, persistence, or indexing.
Conditions are AND-only, and values compared for ordering must be consistently
typed. Projection is shallow and operates only on own top-level fields.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
