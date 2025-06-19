# evp-ts: Environment Variable Parser for TypeScript

[![npm version](https://badge.fury.io/js/evp-ts.svg)](https://badge.fury.io/js/evp-ts)

evp-ts is a lightweight and easy-to-use library for parsing environment variables in TypeScript projects. It provides a simple way to collect and validate environment variables.

This package is inspired by [zod](https://zod.dev/) and [EVP](https://github.com/fumieval/EVP), an environment variable parser library for Haskell.

## Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Supported Types](#supported-types)
- [Modifiers](#modifiers)
- [Error Handling](#error-handling)
- [Generating Help Text](#generating-help-text)
- [Discriminated Unions](#discriminated-unions)
- [Customising the Logger](#customising-the-logger)
- [Detecting Unused Variables](#detecting-unused-environment-variables)
- [License](#license)

## Features

- 🐾 Low dependency footprint
- 🧹 Clutter-free code
- 🪺 Supports nested structure
- 🧩 Well-typed interface
- ⚗️ Derive types from the parser
- 📝 Explicit logging of parsed environment variables
- 🔒 Hiding sensitive values (e.g. API keys) from logs
- 🛡️ Handle errors comprehensively
- 📜 Generate dotenv-style help text from the parser
- 🎭 Dynamically toggle between different sets of environment variables (discriminated unions)
- 🗑️ Detect unused environment variables

## Installation

```bash
# Using npm
npm install evp-ts

# Using yarn
yarn add evp-ts

# Using pnpm
pnpm add evp-ts

# Using bun
bun add evp-ts
```

## Usage

Here's an example of how to use evp-ts in your TypeScript project:

```typescript
import { EVP } from 'evp-ts';

const parser = EVP.object({
    API_ENDPOINT: EVP.string(),
    API_TOKEN: EVP.string().secret(),
    HTTP_PORT: EVP.number(),
    DEBUG_MODE: EVP.boolean().default(false),
});

type Config = EVP.infer<typeof parser>;
const result: Config = parser.parse();

console.log(result);
```

Example output:
```
[EVP] API_ENDPOINT=https://example.com
[EVP] API_TOKEN=<SHA256:fcf730b6>
[EVP] HTTP_PORT=8080
[EVP] DEBUG_MODE=false (default)
{
  API_ENDPOINT: "https://example.com",
  API_TOKEN: "secret123",
  HTTP_PORT: 8080,
  DEBUG_MODE: false
}
```

## Supported Types

evp-ts supports the following types for parsing environment variables:

- `EVP.string()`: Get the value as a string.
- `EVP.number()`: Parses the value as a number.
- `EVP.boolean()`: Parses the value as a boolean (`true`, `yes`, and `1` are parsed as `true`, while `false`, `no`, and `0` are parsed as `false`).
- `EVP.object()`: Defines a nested object structure for grouping related environment variables.
- `EVP.enum()`: Validates that the value matches one of the specified options.

## Modifiers

evp-ts provides additional options for configuring the behavior of environment variable parsing:

- `.default(value)`: Specifies a default value to use if the environment variable is not set.
- `.secret()`: Logs its SHA-256 hash instead of the actual value.
- `.optional()`: Marks the environment variable as optional, allowing it to be missing without causing an error.
- `.env(name)`: Specifies the name of the environment variable to use for parsing.
- `.description(text)`: Adds a description that appears in the help text.
- `.metavar(name)`: Customizes the placeholder shown in help text.

## Error Handling

evp-ts provides error handling through the `safeParse` method:

```typescript
import { EVP } from 'evp-ts';

const parser = EVP.object({
    PORT: EVP.number(),
    API_KEY: EVP.string().secret(),
});

const result = parser.safeParse();
if (!result.success) {
    console.error('Configuration error:', result.error.message);
    process.exit(1);
}

// Use the validated config
const config = result.data;
```

Example error output:
```
[EVP] PORT=invalid_port ERROR: invalid number
[EVP] API_KEY=undefined ERROR: missing environment variable
Configuration error: Unable to fill the following fields: PORT, API_KEY
```

## Generating Help Text

`parser.describe()` generates a dotenv-style help text from the parser.
For this purpose, `.description(text)` and `.metavar(name)` methods are provided.
If `.metavar(name)` is not specified, the default value or the type name is used as the metavariable name.

```typescript
import { EVP } from 'evp-ts';

const parser = EVP.object({
    API_ENDPOINT: EVP.string().description('The base URL of the API'),
    API_TOKEN: EVP.string().secret().metavar('TOKEN'),
    HTTP_PORT: EVP.number().description('The port number to listen on'),
    DEBUG_MODE: EVP.boolean().default(false),
});

console.log(parser.describe());
```

Output:
```
# The base URL of the API
API_ENDPOINT=<string>
API_TOKEN=TOKEN
# The port number to listen on
HTTP_PORT=<number>
DEBUG_MODE=false
```

## Discriminated Unions

The `EVP.union()` function allows you to switch between different sets of environment variables based on a discriminator value:

```typescript
import { EVP } from 'evp-ts';

const parser = EVP.object({
    DATABASE_BACKEND: EVP.union({
        mysql: EVP.object({
            host: EVP.string().env('MYSQL_HOST').default('localhost'),
            port: EVP.number().env('MYSQL_PORT').default(3306),
        }).description('MySQL database connection settings'),
        sqlite: EVP.object({
            path: EVP.string().env('SQLITE_PATH'),
        }),
    }).tag('backend')
});
```

MySQL configuration output:
```
[EVP] DATABASE_BACKEND=mysql
[EVP] MYSQL_HOST=localhost (default)
[EVP] MYSQL_PORT=3306 (default)
{
  DATABASE_BACKEND: {
    backend: "mysql",
    host: "localhost",
    port: 3306
  }
}
```

SQLite configuration output:
```
[EVP] DATABASE_BACKEND=sqlite
[EVP] SQLITE_PATH=/path/to/db.sqlite
{
  DATABASE_BACKEND: {
    backend: "sqlite",
    path: "/path/to/db.sqlite"
  }
}
```

## Customising the Logger

You can use either the default console logger or a custom logger like Winston:

```typescript
import { EVP } from 'evp-ts';
import * as winston from 'winston';

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

const parser = EVP.object({
    LOG_LEVEL: EVP.enum(['error', 'warn', 'info', 'debug']).default('info'),
}).logger(logger);

const result = parser.parse();
logger.level = result.LOG_LEVEL;
```

Winston logger output:
```
info: LOG_LEVEL=debug
```

## Detecting Unused Environment Variables

Typos in environment variable names can lead to bugs that are difficult to detect, especially when the variable is optional.
To detect unused environment variables, use `assumePrefix()` and `rejectUnused()`:

```typescript
import { EVP } from 'evp-ts';

const parser = EVP.object({
    APP_FOO: EVP.string(),
})
    .logger(logger)
    .assumePrefix('APP_')
    .rejectUnused();

const result = parser.parse({
    APP_FOO: 'foo',
    APP_BAR: 'bar', // This will be detected as unused
    HOME: '/home/user', // This will be ignored (no prefix)
});

Output:
```
error: Unused variables: APP_BAR
```

## License

evp-ts is open-source software licensed under the [MIT License](https://opensource.org/licenses/MIT).
