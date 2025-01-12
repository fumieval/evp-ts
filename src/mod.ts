import { ILogger, ConsoleLogger, logMissingVariable } from './logger';
import { fromOption, none, some, Option, toUndefined } from './option';

export type State = {
    value: string;
    used: boolean;
};

export type Context = {
    values: Record<string, State>;
    logger: ILogger;
    currentKey: string | undefined;
};

export type ParseResult<T> =
    | { type: 'success'; value: T }
    | { type: 'missing' }
    | { type: 'error'; error: Error };

export type ParseResults<T> = { [K in keyof T]: ParseResult<T[K]> };

export interface Parser<T> {
    parseContext(ctx: Context): ParseResult<T>;
    describe(key?: string, prepend?: string): string;
}

/** Variable<T> represents a single environment variable that can be parsed into a value of type T */
export abstract class VariableLike<T, Default = T> implements Parser<T> {
    public envName?: string;
    public isSecret: boolean = false;
    public defaultValue: Option<Default> = { tag: 'none' };
    public _description?: string;
    public forceMetavar?: string;
    abstract getMetavar(): string;
    abstract parseContext(ctx: Context): ParseResult<T>;

    /** mark the variable as a secret, so its value will be redacted in logs */
    public secret(): this {
        this.isSecret = true;
        return this;
    }
    /** set a default value for the variable */
    public default(defaultValue: Default): this {
        this.defaultValue = { tag: 'some', value: defaultValue };
        return this;
    }

    /** set a description for the variable */
    public description(description: string): this {
        this._description = description;
        return this;
    }
    /** set a metavariable for the variable */
    public metavar(metavar: string): this {
        this.forceMetavar = metavar;
        return this;
    }

    /** read the specified environment variable */
    public env(name: string): this {
        this.envName = name;
        return this;
    }

    /** dotenv-style description of the variable */
    public describe(key?: string): string {
        let k = this.envName ?? key;
        const binding = `${k}=${this.forceMetavar ?? this.getMetavar()}`;
        if (this._description !== undefined) {
            return `# ${this._description}\n${binding}`;
        } else {
            return binding;
        }
    }

    clone<U>(source: VariableLike<U, Default>): this {
        this.envName = source.envName;
        this.isSecret = source.isSecret;
        this._description = source._description;
        this.defaultValue = source.defaultValue;
        this.forceMetavar = source.forceMetavar;
        return this;
    }
}

export abstract class Variable<T> extends VariableLike<T, T> {
    abstract parse(value: string): T;
    public parseContext(ctx: Context): ParseResult<T> {
        const envName = this.envName ?? ctx.currentKey;
        if (envName === undefined) {
            throw new Error('Unable to determine the name of the variable');
        }
        const state = ctx.values[envName];
        if (state === undefined) {
            if (this.defaultValue.tag === 'none') {
                logMissingVariable(ctx.logger, envName);
                return { type: 'missing' };
            } else {
                const value: T = this.defaultValue.value;
                let strValue;
                if (this.isSecret) {
                    strValue = '<REDACTED>';
                } else if (value === null) {
                    strValue = 'null';
                } else if (value === undefined) {
                    strValue = 'undefined';
                } else {
                    strValue = value.toString();
                }
                ctx.logger.info(`${envName}=${strValue} (default)`);
                return { type: 'success', value };
            }
        } else {
            state.used = true;
            try {
                const result = this.parse(state.value);
                if (this.isSecret) {
                    ctx.logger.info(`${envName}=<REDACTED>`);
                } else {
                    ctx.logger.info(`${envName}=${result}`);
                }
                return { type: 'success', value: result };
            } catch (error) {
                if (error instanceof Error) {
                    ctx.logger.error(`${envName}=${state.value} ERROR: ${error.message}`);
                    return { type: 'error', error };
                }
                throw error;
            }
        }
    }

    /** apply a function to the parsed value.
     * Note that metavar is not preserved.
     * */
    public map<U>(f: (value: T) => U): Variable<U> {
        return new MapVariable(this, f);
    }

    public optional(): Variable<T | undefined> {
        return new OptionalVariable(this);
    }
}

export class OptionalVariable<T, V extends Variable<T>> extends Variable<
    T | undefined
> {
    constructor(private variable: V) {
        super();
        this.defaultValue = { tag: 'some', value: undefined };
    }
    parse(value: string): T | undefined {
        return this.variable.parse(value);
    }
    metavar(metavar: string): this {
        this.variable.metavar(metavar);
        return this;
    }
    getMetavar(): string {
        /* v8 ignore next 2 */
        return this.variable.getMetavar();
    }
    public describe(key?: string): string {
        return `# ${this.variable.describe(key)}`;
    }
}

export class MapVariable<T, U, V extends Variable<T>> extends Variable<U> {
    constructor(
        private variable: V,
        private f: (value: T) => U,
    ) {
        super();
    }
    parse(value: string): U {
        return this.f(this.variable.parse(value));
    }
    getMetavar(): string {
        return this.variable.getMetavar();
    }
}

/** ParsersOf<T> is a record where each value is a Parser<T[key]> for each key in T */
export type ParsersOf<T> = {
    [K in keyof T]: Parser<T[K]>;
};
export class ObjectParser<T> extends VariableLike<T> {
    readonly _T!: T;
    private _logger: ILogger;
    public constructor(public fields: ParsersOf<T>) {
        super();
        this._logger = new ConsoleLogger();
    }
    public parseContext(ctx: Context): ParseResult<T> {
        const result: ParseResults<T> = {} as ParseResults<T>;
        for (const key in this.fields) {
            const variable = this.fields[key];
            result[key] = variable.parseContext({ ...ctx, currentKey: key });
        }
        return fromParseResults(result);
    }
    public parse(input?: Record<string, string>): T {
        const raw = input ?? process.env;
        const env: Record<string, State> = {};
        for (const [key, value] of Object.entries(raw)) {
            if (value === undefined) {
                continue;
            }
            env[key] = { value, used: false };
        }
        const final = this.parseContext({
            values: env,
            logger: this._logger,
            currentKey: undefined,
        });
        if (final.type === 'error') {
            throw final.error;
        } else if (final.type === 'missing') {
            throw new Error('missing required variables');
        }
        return final.value;
    }
    public describe(_key?: string, prepend?: string): string {
        const header = this._description ? `# ${this._description}` : undefined;
        const fields = Object.keys(this.fields).map((k) =>
            this.fields[k as keyof T].describe(k),
        );
        return [header, prepend, ...fields]
            .filter((x) => x !== undefined)
            .join('\n');
    }
    public logger(logger: ILogger): ObjectParser<T> {
        this._logger = logger;
        return this;
    }
    public getMetavar(): string {
        // this should never be called
        return 'object';
    }
}

function fromParseResults<T>(partial: ParseResults<T>): ParseResult<T> {
    // report an error with a list of missing variables
    const missing = Object.keys(partial).filter(
        (key) => partial[key as keyof T].type !== 'success',
    );
    if (missing.length > 0) {
        return {
            type: 'error',
            error: new Error(
                `Unable to fill the following fields: ${missing.join(', ')}`,
            ),
        };
    }
    // combine the results into a single object
    const result: Partial<T> = {};
    for (const key in partial) {
        const k = key as keyof T;
        const value = partial[k];
        if (value.type === 'success') {
            result[k] = value.value;
        }
    }
    return { type: 'success', value: result as T };
}

export type TaggedUnion<Tag extends string, T> = {
    [K in keyof T]: { [P in Tag]: K } & T[K];
}[keyof T];

export type UntaggedUnion<T> = { [K in keyof T]: T[K] }[keyof T];

export class UntaggedUnionParser<T>
    extends VariableLike<UntaggedUnion<T>, Extract<keyof T, string>>
{
    constructor(
        private _options: ParsersOf<T>,
    ) {
        super();
    }
    parseContext(
        ctx: Context,
    ): ParseResult<{ [K in keyof T]: T[K] }[keyof T]> {
        const k = this.envName ?? ctx.currentKey;
        if (k === undefined) {
            throw new Error('Unable to determine the name of the variable');
        }
        const value = ctx.values[k]?.value ?? toUndefined(this.defaultValue);
        if (value === undefined) {
            logMissingVariable(ctx.logger, k);
            return { type: 'missing' };
        }
        const parser = this._options[value as keyof T];
        if (parser === undefined) {
            const error = new Error(
                `it must be ${serialComma(Object.keys(this._options))}, but got ${value}`,
            );
            ctx.logger.error(`${k}=${value} ERROR: ${error.message}`);
            return { type: 'error', error };
        }
        return parser.parseContext(ctx);
    }
    describe(key?: string): string {
        return describeOptions(
            this.envName ?? key ?? '',
            this._options,
            toUndefined(this.defaultValue),
        );
    }
    getMetavar(): string {
        return fromOption(this.defaultValue,
            Object.keys(this._options).join('|'),
            (value) => value);
    }
    tag<Tag extends string>(tag: Tag): TaggedUnionParser<Tag, T> {
        const result = new TaggedUnionParser(tag, this._options);
        result.clone(this);
        return result;
    }
}

export class TaggedUnionParser<Tag extends string, T> extends VariableLike<TaggedUnion<Tag, T>, keyof T> {
    constructor(
        private tag: Tag,
        private _options: ParsersOf<T>,
    ) {
        super();
    }
    parseContext(ctx: Context): ParseResult<TaggedUnion<Tag, T>> {
        const k = this.envName ?? ctx.currentKey;
        if (k === undefined) {
            throw new Error('Unable to determine the name of the variable');
        }
        const value = ctx.values[k]?.value ?? toUndefined(this.defaultValue)
        if (value === undefined) {
            logMissingVariable(ctx.logger, k);
            return { type: 'missing' };
        }
        const parser = this._options[value as keyof T];
        if (parser === undefined) {
            const error = new Error(
                `it must be ${serialComma(Object.keys(this._options))}, but got ${value}`,
            );
            ctx.logger.error(`${k}=${value} ERROR: ${error.message}`);
            return { type: 'error', error };
        }
        const isDefault = ctx.values[k] === undefined;
        if (isDefault) {
            ctx.logger.info(`${k}=${value} (default)`)
        } else {
            ctx.logger.info(`${k}=${value}`)
        }
        const result = parser.parseContext(ctx);
        const tag = { [this.tag]: value } as { [P in Tag]: keyof T };
        if (result.type === 'success') {
            return {
                type: 'success',
                value: {
                    ...tag,
                    ...result.value,
                },
            };
        } else {
            return result;
        }
    }
    describe(contextKey?: string): string {
        return describeOptions(
            this.envName ?? contextKey ?? '',
            this._options,
            toUndefined(this.defaultValue),
        );
    }
    getMetavar(): string {
        return fromOption(this.defaultValue, Object.keys(this._options).join('|'), (value) => value.toString());
    }
}

function describeOptions<T>(
    key: string,
    options: ParsersOf<T>,
    defaultOption?: keyof T,
): string {
    return Object.keys(options)
        .map((k) => {
            const option = options[k as keyof T];
            const desc = option.describe(k, `${key}=${k}`);
            if (k === defaultOption) {
                return desc;
            } else {
                return commentOut(desc);
            }
        })
        .join('\n\n');
}

function commentOut(text: string): string {
    return text
        .split('\n')
        .map((line) => (line.startsWith('#') ? line : `# ${line}`))
        .join('\n');
}

function serialComma(items: string[]): string {
    if (items.length === 1) return items[0];
    if (items.length === 2) return items.join(' or ');
    const last = items.pop();
    return `${items.join(', ')}, or ${last}`;
}

export class Enum<U extends string, T extends U[]> extends Variable<T[number]> {
    constructor(private values: T) {
        super();
    }
    parse(value: string): T[number] {
        if (!this.values.includes(value as T[number])) {
            throw new Error(
                `it must be ${serialComma(this.values)}, but got ${value}`,
            );
        }
        return value as T[number];
    }
    getMetavar(): string {
        return this.values.join('|');
    }
}

export class NumericVariable extends Variable<number> {
    parse(value: string): number {
        const num = parseFloat(value);
        if (isNaN(num)) {
            throw new Error('invalid number');
        }
        return num;
    }
    getMetavar(): string {
        return fromOption(this.defaultValue, '<number>', (value) =>
            value.toString(),
        );
    }
}

export class StringVariable extends Variable<string> {
    parse(value: string): string {
        return value;
    }
    getMetavar(): string {
        return fromOption(this.defaultValue, '<string>', (value) => value);
    }
}

export class BooleanVariable extends Variable<boolean> {
    parse(value: string): boolean {
        if (['true', 'yes', 'on', '1'].includes(value.toLowerCase())) {
            return true;
        }
        if (['false', 'no', 'off', '0'].includes(value.toLowerCase())) {
            return false;
        }
        throw new Error('invalid boolean');
    }
    getMetavar(): string {
        return fromOption(this.defaultValue, 'true|false', (value) =>
            value.toString(),
        );
    }
}
