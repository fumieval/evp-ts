# evp-ts: Environment Variable Parser for TypeScript

evp-ts is a lightweight and easy-to-use library for parsing environment variables in TypeScript projects. It provides a simple way to collect and validate environment variables.

This package is inspired by [EVP](https://github.com/fumieval/EVP), an environment variable parser library for Haskell.

## Features

- 🧹 Clutter-free code
- 🌳 Supports nested structure
- 🧩 Type-safe parsing
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
    HTTP_PORT: EVP.decimal(),
    DEBUG_MODE: EVP.boolean().default(false),
    mysql: EVP.object({
        host: EVP.string('MYSQL_HOST').default('localhost'),
        port: EVP.string('MYSQL_PORT').default('3306'),
    }),
});

type Config = EVP.infer<typeof parser>;

console.log(parser.describe());

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
- `EVP.decimal()`: Parses the value as a decimal number.
- `EVP.boolean()`: Parses the value as a boolean (`true`, `yes`, and `1` becomes `true` and `false`, `no`, `0` becomes `false`).
- `EVP.object()`: Defines a nested object structure for grouping related environment variables.

## Additional Options

evp-ts provides additional options for configuring the behavior of environment variable parsing:

- `.default(value)`: Specifies a default value to use if the environment variable is not set.
- `.secret()`: Marks the environment variable as sensitive, hiding its value from logs.

## License

evp-ts is open-source software licensed under the [MIT License](https://opensource.org/licenses/MIT).
