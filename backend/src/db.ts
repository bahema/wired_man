import { query, one, many, exec, withTransaction } from './db/pg';

export type DbClient = {
  query: typeof query;
  one: typeof one;
  many: typeof many;
  exec: typeof exec;
  withTransaction: typeof withTransaction;
};

const db: DbClient = {
  query,
  one,
  many,
  exec,
  withTransaction
};

export default db;
