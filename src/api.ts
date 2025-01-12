import {
    ObjectParser,
    Variable,
    ParsersOf,
    Enum,
    UntaggedUnionParser,
    BooleanVariable,
    NumericVariable,
    StringVariable,
} from './mod';

export { Variable, ObjectParser, Parser } from './mod';
export { ILogger, ConsoleLogger } from './logger';

/**
 * Infer the type of an ObjectParser
 * @typeparam T - The type of the ObjectParser
 * 
 * @example
 * ```ts
 * const parser = EVP.object({
 *    API_ENDPOINT: EVP.string(),
 *    API_TOKEN: EVP.string().secret(),
 * });
 * 
 * type Config = EVP.TypeOf<typeof parser>;
 * ```
 */
export type TypeOf<T extends ObjectParser<unknown>> = T['_T'];

/**
 * Parser for a single environment variable
 * @param name - The name of the variable (optional)
 * @returns A Variable of type string
 */
export function string(): StringVariable {
    return new StringVariable();
}

/**
 * Parser for any number
 * @param name - The name of the variable (optional)
 * @returns A Variable of type number
 */
export function number(): NumericVariable {
    return new NumericVariable();
}

/**
 * Create a Variable of type boolean. The following values are considered true:
 * - true
 * - yes
 * - on
 * - 1
 *
 * The following values are considered false:
 * - false
 * - no
 * - off
 * - 0
 *
 * @param name - The name of the variable
 * @returns A Variable of type boolean
 *
 * @example
 * ```ts
 * { DEBUG_MODE: EVP.boolean().default(false) }
 * ```
 */
export function boolean(): Variable<boolean> {
    return new BooleanVariable();
}

/**
 * Create a parser from a record of parsers
 * @typeparam T - The type of the object
 * @param fields - parsers for the fields of the object
 * @returns An ObjectParser with the specified fields
 * 
 * @example
 * ```ts
 * { connection: EVP.object({
 *     HOST: EVP.string(),
 *     PORT: EVP.string(),
 *   })
 * },
 */
export function object<T>(fields: ParsersOf<T>): ObjectParser<T> {
    return new ObjectParser(fields);
}

export function emptyObject(): ObjectParser<Record<string, never>> {
    return new ObjectParser({});
}

/**
 * Create a dynamically-switched parser depending on the value.
 * Use `.options()` to add options, and use `.discriminator()` to specify the field to propagate the switching value.
 * @param name - The name of the switcher
 * @returns An UndiscriminatedUnionParser
 * 
 * @example
 * ```ts
 * { MODE: EVP.union()
 *   .options({
 *      foo: EVP.object({ FOO_STR: EVP.string() }),
 *      bar: EVP.object({ BAR_NUM: EVP.number() }),
 *   })
 *   .discriminator('type');
 * ```
 */
export function union<T>(options: ParsersOf<T>): UntaggedUnionParser<T> {
    return new UntaggedUnionParser(options);
}

function enum_<U extends string, T extends U[]>(values: T): Enum<U, T> {
    return new Enum(values);
}
export { enum_ as enum };
