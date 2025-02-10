import {
  AbstractLevel,
  AbstractSublevel,
  AbstractChainedBatch,
} from "abstract-level";
import * as charwise from "charwise-compact";

/**
 * An index definition can be provided either as:
 *  - A function: (record: T) => any, or
 *  - An object with options (which may include a `getter`, a `field`, and/or a custom `keyEncoding`).
 */
export type IndexDef<T> =
  | ((record: T) => any)
  | {
      getter?: (record: T) => any;
      field?: keyof T;
      keyEncoding?: string | any;
    };

/**
 * SecondaryIndexManager adds secondary indexing on top of a main sublevel.
 * It uses composite keys of the form [indexValue, mainKey] for indexing.
 *
 * T is the type for records stored in the main sublevel.
 * K is the type for primary keys (defaulting to string).
 */
export class Index<T = any, K = string> {
  main: AbstractSublevel<any, any, K, T>;
  db: AbstractLevel<any, any, any>;
  indexes: Record<
    string,
    {
      getter: (record: T) => any;
      sublevel: AbstractSublevel<any, any, any, any>;
      keyEncoding: string | any;
    }
  > = {};

  constructor(
    mainSublevel: AbstractSublevel<any, any, K, T>,
    indexes: Record<string, IndexDef<T>>
  ) {
    this.main = mainSublevel;
    this.db = mainSublevel.db;
    console.log(this.main.prefix);

    // Helper function to parse an index definition.
    const parseIndexDefinition = (
      name: string,
      def: IndexDef<T>
    ): { getter: (record: T) => any; keyEncoding: string | any } => {
      if (typeof def === "function") {
        return { getter: def, keyEncoding: charwise };
      }
      if (def && typeof def === "object") {
        return {
          getter: def.getter || ((record: T) => record[def.field as keyof T]),
          keyEncoding: def.keyEncoding || charwise,
        };
      }
      throw new Error(
        `Invalid index definition for "${name}". Must be a function or an object.`
      );
    };

    // Process each index definition.
    for (const [name, def] of Object.entries(indexes)) {
      const { getter, keyEncoding } = parseIndexDefinition(name, def);
      const indexName = this._indexName(name);
      console.log({ indexName });
      const indexSub = this.db.sublevel(indexName, { keyEncoding });
      this.indexes[name] = { getter, sublevel: indexSub, keyEncoding };
    }
  }

  _indexName(name: string) {
    return "idx" + this.main.prefix.replace(/!/g, "_") + name;
  }

  /**
   * Insert or update a single record using a chained batch.
   *
   * Creates a chained batch, adds the main sublevel put operation, and for each defined
   * index adds a put using a composite key [indexValue, mainKey]. Then commits the batch atomically.
   *
   * @param key - The primary key for the record.
   * @param value - The record to store.
   */
  async put(key: K, value: T): Promise<void> {
    const batch = this.db.batch() as AbstractChainedBatch<any, K, T>;

    // Main operation: route the write to the main sublevel.
    batch.put(key, value, { sublevel: this.main });

    // For each index, compute the index value and add the index update.
    for (const config of Object.values(this.indexes)) {
      const indexValue = config.getter(value);
      if (indexValue !== undefined) {
        const compositeKey = [indexValue, key];
        batch.put(compositeKey, "", { sublevel: config.sublevel });
      }
    }

    await batch.write();
  }

  /**
   * Delete a single record.
   *
   * Retrieves the current record (if it exists) so that its corresponding index entries
   * can be removed. Then deletes the record and its index entries via a chained batch.
   *
   * @param key - The primary key of the record to delete.
   */
  async del(key: K): Promise<void> {
    const maybeOldValue = await this.main.get(key);
    if (maybeOldValue === undefined) {
      // Record does not exist; nothing to delete.
      return;
    }
    const oldValue: T = maybeOldValue;

    const batch = this.db.batch() as AbstractChainedBatch<any, K, T>;
    batch.del(key, { sublevel: this.main });

    for (const config of Object.values(this.indexes)) {
      const indexValue = config.getter(oldValue);
      if (indexValue !== undefined) {
        const compositeKey = [indexValue, key];
        batch.del(compositeKey, { sublevel: config.sublevel });
      }
    }

    await batch.write();
  }

  /**
   * Query an index for all records matching a given index value.
   *
   * Performs a range query on the index sublevel using composite keys, collects all primary keys,
   * and then uses getMany() on the main sublevel for efficient bulk retrieval.
   *
   * @param indexName - The name of the index to query.
   * @param value - The index value to search for.
   * @returns An array of matching records.
   */
  async query(indexName: string, value: any): Promise<T[]> {
    const config = this.indexes[indexName];
    if (!config) {
      throw new Error(`Index "${indexName}" not defined`);
    }

    // Use '\uffff' as a high-value constant for the upper bound.
    const lowerBound = [value];
    const upperBound = [value, "\uffff"];
    const keys: K[] = [];

    for await (const [compositeKey] of config.sublevel.iterator({
      gt: lowerBound,
      lt: upperBound,
    })) {
      // The composite key is [indexValue, mainKey].
      keys.push(compositeKey[1]);
    }
    if (keys.length === 0) return [];

    const records = await this.main.getMany(keys);
    return records.filter((record): record is T => record !== undefined);
  }
}
