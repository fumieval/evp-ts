# evp-ts: Environment Variable Parser for TypeScript

[![npm version](https://badge.fury.io/js/evp-ts.svg)](https://badge.fury.io/js/evp-ts)

evp-ts is a lightweight and easy-to-use library for parsing environment variables in TypeScript projects. It provides a simple way to collect and validate environment variables.

This package is inspired by [zod](https://zod.dev/) and [EVP](https://github.com/fumieval/EVP), an environment variable parser library for Haskell.

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

type Config = EVP.TypeOf<typeof parser>;
const result: Config = parser.parse();

console.log(result);
```

```
[EVP] API_ENDPOINT=https://example.com
[EVP] API_TOKEN=<SHA256:2bb80d53>
[EVP] HTTP_PORT=8080
[EVP] DEBUG_MODE=false (default)
[EVP] MYSQL_HOST=localhost (default)
[EVP] MYSQL_PORT=3306 (default)
{
  API_ENDPOINT: 'https://api.example.com',
  API_TOKEN: 'secret',
  HTTP_PORT: 3000,
  DEBUG_MODE: false,
  mysql: { host: 'localhost', port: '3306', user: 'root' }
}
```

In this example, we define a parser using the `EVP.object()` function, which takes an object describing the structure and types of the environment variables. Each key in the object represents an environment variable, and the corresponding value defines its type and any additional options (e.g. default values, secret flag).

You can infer the type of the result using the `EVP.TypeOf<typeof parser>`, rather than defining it manually.

The `parse()` method is then called on the parser to parse the environment variables and return an object with the parsed values. If any required environment variables are missing or have invalid values, evp-ts will log an error message but continue parsing the remaining variables to provide a comprehensive error report.

## Supported Types

evp-ts supports the following types for parsing environment variables:

- `EVP.string()`: Get the value as a string.
- `EVP.number()`: Parses the value as a number.
- `EVP.boolean()`: Parses the value as a boolean (`true`, `yes`, and `1` becomes `true` and `false`, `no`, `0` becomes `false`).
- `EVP.object()`: Defines a nested object structure for grouping related environment variables.

## Modifiers

evp-ts provides additional options for configuring the behavior of environment variable parsing:

- `.default(value)`: Specifies a default value to use if the environment variable is not set.
- `.secret()`: Logs its SHA-256 hash instead of the actual value.
- `.optional()`: Marks the environment variable as optional, allowing it to be missing without causing an error.
- `.env(name)`: Specifies the name of the environment variable to use for parsing.
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

```
# The base URL of the API
API_ENDPOINT=<string>
API_TOKEN=TOKEN
# The port number to listen on
HTTP_PORT=<number>
DEBUG_MODE=false
```

## Discriminated Unions

In the following example, the `DATABASE_BACKEND` environment variable is used to switch between different sets of environment variables for different database backends.

The `EVP.union()` function is used to define a union of different parsers.
The `options()` method is then used to define a set of parsers for each possible value of `DATABASE_BACKEND`.
The field specified by the `discriminator()` contains the value of `DATABASE_BACKEND`.
If `DATABASE_BACKEND` is not set, it will use the default option specified by the `.default()` method.

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
    }).tag('backend');
    // .default('sqlite'),
});

console.log(parser.describe());
console.log(parser.parse());
```

## Customising the logger

By default, evp-ts uses `console` to log messages.
You can attach a custom logger, such as [winston](https://www.npmjs.com/package/winston)'s to the parser using the `.logger()` method.

```typescript
import { EVP } from 'evp-ts';
import * as winston from 'winston';

const logger = winston.createLogger();
const parser = EVP.object({
    LOG_LEVEL: EVP.enum(['error', 'warn', 'info', 'debug']).default('info'),
}).logger(logger);

const result = parser.parse();
logger.level = result.LOG_LEVEL;
```

## Detecting unused environment variables

Typos in environment variable names can lead to bugs that are difficult to detect, especially when the intended variable is optional.

To detect unused environment variables, call `parser.reportUnused()` or `parser.rejectUnused()`.

```typescript
const result = parser.logger(logger).safeParse({
    APP_BAR: 'bar', // logged as unused
    HOME: '/home/user', // ignored
}).assumePrefix('APP_').rejectUnused();
```

In practice, you may want to prefix the environment variables you intend to parse, then set `assumePrefix` to specify the prefix (or prefices). When an environment variable with the given prefix is not used, it is considered unused and will be logged.

## License

evp-ts is open-source software licensed under the [MIT License](https://opensource.org/licenses/MIT).
