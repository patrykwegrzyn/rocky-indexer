import { AbstractLevel, AbstractSublevel } from "abstract-level";
/**
 * An index definition can be provided either as:
 *  - A function: (record: T) => any, or
 *  - An object with options (which may include a `getter`, a `field`, and/or a custom `keyEncoding`).
 */
export type IndexDef<T> = ((record: T) => any) | {
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
export declare class Index<T = any, K = string> {
    main: AbstractSublevel<any, any, K, T>;
    db: AbstractLevel<any, any, any>;
    indexes: Record<string, {
        getter: (record: T) => any;
        sublevel: AbstractSublevel<any, any, any, any>;
        keyEncoding: string | any;
    }>;
    constructor(mainSublevel: AbstractSublevel<any, any, K, T>, indexes: Record<string, IndexDef<T>>);
    _indexName(name: string): string;
    /**
     * Insert or update a single record using a chained batch.
     *
     * Creates a chained batch, adds the main sublevel put operation, and for each defined
     * index adds a put using a composite key [indexValue, mainKey]. Then commits the batch atomically.
     *
     * @param key - The primary key for the record.
     * @param value - The record to store.
     */
    put(key: K, value: T): Promise<void>;
    /**
     * Delete a single record.
     *
     * Retrieves the current record (if it exists) so that its corresponding index entries
     * can be removed. Then deletes the record and its index entries via a chained batch.
     *
     * @param key - The primary key of the record to delete.
     */
    del(key: K): Promise<void>;
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
    query(indexName: string, value: any): Promise<T[]>;
}
