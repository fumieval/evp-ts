import {
    ObjectParser,
    Variable,
    KnownEnvName,
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

export { TypeOf as infer };

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
export function object<T>(fields: ParsersOf<KnownEnvName, T>): ObjectParser<T> {
    return new ObjectParser(fields);
}

export function emptyObject(): ObjectParser<Record<string, never>> {
    return new ObjectParser({});
}

/**
 * Create a dynamically-switched parser based on the value.
 * Use `.options()` to add options, and use `.discriminator()` to specify the field that propagates the switching value.
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
export function union<T>(options: ParsersOf<void, T>): UntaggedUnionParser<T> {
    return new UntaggedUnionParser(options);
}

type ObjectParserType<P> = P extends ObjectParser<infer T> ? T : never;

type IntersectTypes<T extends readonly unknown[]> = T extends readonly [
    infer H,
    ...infer R,
]
    ? ObjectParserType<H> & IntersectTypes<R>
    : unknown;

/**
 * Combine multiple object parsers into one by intersecting their shapes.
 *
 * - Keys that exist in only one parser are kept as-is.
 * - If the same key exists in multiple parsers and both values are `EVP.object(...)`,
 *   they are recursively intersected.
 * - Otherwise, duplicate keys are rejected.
 *
 * @example
 * ```ts
 * const base = EVP.object({ APP_NAME: EVP.string() });
 * const db = EVP.object({ DB: EVP.object({ HOST: EVP.string() }) });
 * const parser = EVP.intersection(base, db);
 * ```
 */
export function intersection<const P extends readonly ObjectParser<any>[]>(
    ...parsers: P
): ObjectParser<IntersectTypes<P>> {
    if (parsers.length === 0) {
        return emptyObject() as ObjectParser<IntersectTypes<P>>;
    }
    let acc: ObjectParser<any> = parsers[0];
    for (let i = 1; i < parsers.length; i++) {
        acc = intersectTwoObjectParsers(acc, parsers[i], []);
    }
    return acc as ObjectParser<IntersectTypes<P>>;
}

function intersectTwoObjectParsers<A, B>(
    left: ObjectParser<A>,
    right: ObjectParser<B>,
    path: string[],
): ObjectParser<A & B> {
    const merged: Record<string, any> = { ...left.fields };
    for (const key of Object.keys(right.fields)) {
        const existing = merged[key];
        const incoming = (right.fields as Record<string, any>)[key];
        if (existing === undefined) {
            merged[key] = incoming;
            continue;
        }
        if (existing instanceof ObjectParser && incoming instanceof ObjectParser) {
            merged[key] = intersectTwoObjectParsers(
                existing,
                incoming,
                path.concat(key),
            );
            continue;
        }
        const at = path.length === 0 ? key : `${path.join('.')}.${key}`;
        throw new Error(`intersection() duplicate key: ${at}`);
    }
    const result = new ObjectParser(merged) as ObjectParser<A & B>;
    result._description = left._description ?? right._description;
    return result;
}

function enum_<U extends string, T extends U[]>(values: T): Enum<U, T> {
    return new Enum(values);
}
export { enum_ as enum };
