# evp-ts: Environment Variable Parser for TypeScript

evp-ts is a lightweight and easy-to-use library for parsing environment variables in TypeScript projects. It provides a simple way to collect and validate environment variables.

This package is inspired by [EVP](https://github.com/fumieval/EVP), an environment variable parser library for Haskell.

## Features

- 🧹 Clutter-free code
- 🌳 Supports nested structure
- 🧩 Well-typed interface
- 📝 Explicit logging of parsed environment variables
- 🔒 Hiding sensitive values (e.g. API keys) from logs
- 🛡️ Graceful handling of missing or invalid environment variables

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
const result: Config = parser.exec();
console.log(result);
```

```
[EVP] API_ENDPOINT=https://example.com
[EVP] API_TOKEN=<REDACTED>
[EVP] HTTP_PORT=8080
[EVP] DEBUG_MODE=false (default)
[EVP] MYSQL_HOST=localhost (default)
[EVP] MYSQL_PORT=3306 (default)
{
  API_ENDPOINT: 'https://api.example.com',
  API_TOKEN: '00000000-0000-0000-0000-000000000000',
  HTTP_PORT: 3000,
  DEBUG_MODE: false,
  mysql: { host: 'localhost', port: '3306', user: 'root' }
}
```

In this example, we define a parser using the `EVP.object()` function, which takes an object describing the structure and types of the environment variables. Each key in the object represents an environment variable, and the corresponding value defines its type and any additional options (e.g. default values, secret flag).

The `exec()` method is then called on the parser to parse the environment variables and return an object with the parsed values. If any required environment variables are missing or have invalid values, evp-ts will log an error message but continue parsing the remaining variables to provide a comprehensive error report.

## Supported Types

evp-ts supports the following types for parsing environment variables:

- `EVP.string()`: Get the value as a string.
- `EVP.number()`: Parses the value as a number.
- `EVP.boolean()`: Parses the value as a boolean (`true`, `yes`, and `1` becomes `true` and `false`, `no`, `0` becomes `false`).
- `EVP.object()`: Defines a nested object structure for grouping related environment variables.

## Modifiers

evp-ts provides additional options for configuring the behavior of environment variable parsing:

- `.default(value)`: Specifies a default value to use if the environment variable is not set.
- `.secret()`: Marks the environment variable as sensitive, hiding its value from logs.

## Generating Help Text

`parser.describe()` generates a dotenv-style help text from the parser.
For this purpose, `.description(text)` and `.metavar(name)` methods are provided.
If `.metavar(name)` is not specified, the default value or the type name is used as the metavariable name.

```typescript:describe.ts
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

## Discriminated Unions (switching between a different set of environment variables)

In the following example, the `DATABASE_BACKEND` environment variable is used to switch between different sets of environment variables for different database backends.

The `EVP.union()` function is used to define a union of different parsers.
The `options()` method is then used to define a set of parsers for each possible value of `DATABASE_BACKEND`.
The field specified by the `discriminator()` contains the value of `DATABASE_BACKEND`.
If `DATABASE_BACKEND` is not set, it will use the default option specified by the `.default()` method.

```typescript:union.ts
import { EVP } from 'evp-ts';

const parser = EVP.object({
    DATABASE_BACKEND: EVP.union()
        .discriminator('backend')
        .options({
            mysql: EVP.object({
                host: EVP.string('MYSQL_HOST').default('localhost'),
                port: EVP.number('MYSQL_PORT').default(3306),
            }).description('MySQL database connection settings'),
            sqlite: EVP.object({
                path: EVP.string('SQLITE_PATH'),
            }),
        })
        // .default('sqlite'),
});

console.log(parser.describe());
console.log(parser.exec());
```

## License

evp-ts is open-source software licensed under the [MIT License](https://opensource.org/licenses/MIT).
