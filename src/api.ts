import {
    ObjectParser,
    Variable,
    ParsersOf,
    UndiscriminatedSwitcher,
} from './mod';

export { Variable, ObjectParser, UndiscriminatedSwitcher, Switcher } from './mod';
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
export function string(name?: string): Variable<string> {
    return new Variable({
        name,
        isSecret: false,
        parser: (value: string) => value,
        defaultValue: undefined,
        metavar: (def?: string) => def ?? '<string>',
    });
}

/**
 * Parser for decimal integers
 * @param name - The name of the variable (optional)
 * @returns A Variable of type number
 */
export function decimal(name?: string): Variable<number> {
    return new Variable({
        name,
        isSecret: false,
        parser(value: string) {
            if (!/^\d+$/.test(value)) {
                throw new Error(`invalid decimal`);
            }
            return parseInt(value);
        },
        defaultValue: undefined,
        metavar: (def?: number) =>
            def === undefined ? '<decimal>' : def.toString(),
    });
}

/**
 * Parser for any number
 * @param name - The name of the variable (optional)
 * @returns A Variable of type number
 */
export function number(name?: string): Variable<number> {
    return new Variable({
        name,
        isSecret: false,
        parser(value: string) {
            return Number(value);
        },
        defaultValue: undefined,
        metavar: (def?: number) =>
            def === undefined ? '<number>' : def.toString(),
    });
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
export function boolean(name?: string): Variable<boolean> {
    return new Variable({
        name,
        isSecret: false,
        parser: (value: string) => {
            switch (value.toLowerCase()) {
                case 'true':
                case 'yes':
                case 'on':
                case '1':
                    return true;
                case 'false':
                case 'no':
                case 'off':
                case '0':
                    return false;
                default:
                    throw new Error(`Invalid boolean value: ${value}`);
            }
        },
        defaultValue: undefined,
        metavar: (def?: boolean) =>
            def === undefined ? 'boolean' : def.toString(),
    });
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

/**
 * Create a dynamically-switched parser depending on the value.
 * Use `.options()` to add options, and use `.discriminator()` to specify the field to propagate the switching value.
 * @param name - The name of the switcher
 * @returns An UndiscriminatedSwitcher
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
export function union(name?: string): UndiscriminatedSwitcher<{}> {
    return new UndiscriminatedSwitcher({}, undefined, name);
}
