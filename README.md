# RockyIndexer

RockyIndexer is a lightweight secondary indexing layer for `abstract-level` databases.
It allows you to efficiently query records by indexed fields, making it easier to work with structured data.

## Features

- **Automatic Secondary Indexing**: Define indexes using field names or custom getter functions.
- **Efficient Querying**: Perform fast lookups using indexed fields.
- **Atomic Writes**: Uses chained batch operations to keep indexes in sync.
- **Built on Abstract-Level**: Compatible with any `abstract-level` backend, including RocksDB.

## Installation

```sh
npm install rockyindexer
```

## Usage

```javascript
const { Index } = require("rockyindexer");
const { RocksLevel } = require("@nxtedition/rocksdb");

const db = new RocksLevel("./mydb", { valueEncoding: "json" });

const users = db.sublevel("users", { valueEncoding: "json" });

// Define secondary indexes using getter functions.
const indexManager = new Index(users, {
  name: (user) => user.name,
  age: (user) => user.age.toString(),
});

async function run() {

  await indexManager.put("user1", {
    name: "Alice",
    email: "alice@example.com",
    age: 30,
  });

  await indexManager.put("user2", {
    name: "Alice",
    email: "alice@example.com",
    age: 40,
  });

  // Query by age.
  const age30 = await indexManager.query("age", "30");
  console.log("Users with age 30:", age30);

  // Query by name.
  const nameAlice = await indexManager.query("name", "Alice");
  console.log("Users with name Alice:", nameAlice);
}

run().catch((err) => console.error(err));
```

## API

### `new SecondaryIndexManager(mainSublevel, indexes)`

Creates a new secondary index manager.

- `mainSublevel`: The primary sublevel where records are stored.
- `indexes`: An object defining secondary indexes. Each index can be defined as:
  - A function `(record) => any`
  - An object `{ getter, field, keyEncoding }`

### `.put(key, value)`

Inserts or updates a record in the database, automatically updating secondary indexes.

- `key`: The primary key of the record.
- `value`: The record object.

### `.del(key)`

Deletes a record and removes its associated index entries.

- `key`: The primary key of the record to delete.

### `.query(indexName, value)`

Queries an index for all records matching a given value.

- `indexName`: The name of the index.
- `value`: The index value to search for.
- **Returns**: An array of matching records.

## License

MIT
