import { ILogger, ConsoleLogger, logMissingVariable } from './logger';
import { fromOption, Option, toUndefined } from './option';
import { ParseResult, ParseResults } from './result';

export type State = {
    value: string;
    used: boolean;
};

export type Context<Env> = {
    values: Record<string, State>;
    logger: ILogger;
    envName: Env;
    envValue: string | undefined;
};

export type KnownEnvName = string;

export interface Parser<Env, T> {
    envName?: Env;
    parseContext(ctx: Context<Env>): ParseResult<T>;
    describeVariable(envName: Env, prepend?: string): string;
}

/** Variable<T> represents a single environment variable that can be parsed into a value of type T */
export abstract class VariableLike<EnvName, T, Default = T>
    implements Parser<EnvName, T>
{
    public envName?: EnvName;
    public isSecret: boolean = false;
    public defaultValue: Option<Default> = { tag: 'none' };
    public _description?: string;
    public forceMetavar?: string;
    abstract getMetavar(): string;
    abstract parseContext(ctx: Context<EnvName>): ParseResult<T>;
    abstract describeVariable(envName: EnvName, prepend?: string): string;

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
    public env(name: EnvName): this {
        this.envName = name;
        return this;
    }
}

export abstract class Variable<T> extends VariableLike<KnownEnvName, T, T> {
    abstract parse(value: string): T;
    public parseContext(ctx: Context<KnownEnvName>): ParseResult<T> {
        const envName = ctx.envName;
        const state = ctx.values[envName];
        if (state === undefined) {
            if (this.defaultValue.tag === 'none') {
                logMissingVariable(ctx.logger, envName);
                return {
                    success: false,
                    error: new Error('missing environment variable'),
                };
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
                return { success: true, data: value };
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
                return { success: true, data: result };
            } catch (error) {
                if (error instanceof Error) {
                    ctx.logger.error(
                        `${envName}=${state.value} ERROR: ${error.message}`,
                    );
                    return { success: false, error };
                }
                throw error;
            }
        }
    }

    /**
     * apply a function to the parsed value.
     */
    public map<U>(f: (value: T) => U): Variable<U> {
        return new MapVariable(this, f);
    }

    public optional(): OptionalVariable<T, this> {
        const result = new OptionalVariable<T, this>(this);
        this.envName = this.envName;
        this.isSecret = this.isSecret;
        this._description = this._description;
        this.forceMetavar = this.forceMetavar;
        return result;
    }

    /** dotenv-style description of the variable */
    public describeVariable(envName: string): string {
        const binding = `${envName}=${this.forceMetavar ?? this.getMetavar()}`;
        if (this._description !== undefined) {
            return `# ${this._description}\n${binding}`;
        } else {
            return binding;
        }
    }
}

export class OptionalVariable<T, V extends VariableLike<KnownEnvName, T, any>>
    implements VariableLike<KnownEnvName, T | undefined, undefined>
{
    public isSecret: boolean;
    public envName?: KnownEnvName;
    public defaultValue: Option<undefined> = { tag: 'some', value: undefined };
    public _description?: string;
    constructor(private variable: V) {
        this.isSecret = variable.isSecret;
        this.envName = variable.envName;
        this._description = variable._description;
    }
    public parseContext(
        ctx: Context<KnownEnvName>,
    ): ParseResult<T | undefined> {
        const envName = ctx.envName;
        if (envName === undefined) {
            throw new Error('Unable to determine the name of the variable');
        }
        if (ctx.values[envName] === undefined) {
            ctx.logger.info(`${envName}=undefined (default)`);
            return { success: true, data: undefined };
        }
        return this.variable.parseContext(ctx);
    }
    public getMetavar(): string {
        return this.variable.getMetavar();
    }
    public metavar(metavar: string): this {
        this.variable.metavar(metavar);
        return this;
    }
    public description(description: string): this {
        this._description = description;
        this.variable.description(description);
        return this;
    }
    public secret(): this {
        this.variable.secret();
        this.isSecret = true;
        return this;
    }
    public env(name: KnownEnvName): this {
        this.variable.env(name);
        this.envName = name;
        return this;
    }
    public default(defaultValue: undefined): this {
        return this;
    }
    public describeVariable(envName: string): string {
        return `# ${this.variable.describeVariable(envName)}`;
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
export type ParsersOf<EnvName, T> = {
    [K in keyof T]: Parser<EnvName, T[K]>;
};

export class ObjectParser<T> extends VariableLike<never, T> {
    readonly _T!: T;
    private _logger: ILogger;
    private _reportUnused: boolean = false;
    private _rejectUnused: boolean = false;
    private assumedPrefices: string[] = [];
    private ignoredNames: string[] = [];
    public constructor(public fields: ParsersOf<KnownEnvName, T>) {
        super();
        this._logger = new ConsoleLogger();
    }
    public parseContext(ctx: Context<unknown>): ParseResult<T> {
        const result: ParseResults<T> = {} as ParseResults<T>;
        for (const key in this.fields) {
            const variable = this.fields[key];
            const envName = variable.envName ?? key;
            result[key] = variable.parseContext({
                ...ctx,
                envName,
                envValue: ctx.values[envName]?.value,
            });
        }
        return ParseResults.combine(result);
    }
    public safeParse(input?: Record<string, string>): ParseResult<T> {
        const raw = input ?? process.env;
        const env: Record<string, State> = {};
        for (const [key, value] of Object.entries(raw)) {
            if (value === undefined) {
                continue;
            }
            env[key] = { value, used: false };
        }
        const result = this.parseContext({
            values: env,
            logger: this._logger,
            envName: void 0,
            envValue: undefined,
        });
        const unused = [];
        if (this._reportUnused || this._rejectUnused) {
            for (const key in env) {
                if (!env[key].used) {
                    if (!this.assumedPrefices.some((prefix) => key.startsWith(prefix))) {
                        continue;
                    }
                    if (this.ignoredNames.includes(key)) {
                        continue;
                    }
                    unused.push(key);
                    this._logger.info(`${key} is unused`);
                }
            }
        }
        if (this._rejectUnused && unused.length > 0) {
            return {
                success: false,
                error: new Error(`Unused variables: ${unused.join(', ')}`, {
                    cause: {
                        unused,
                    }
                }),
            };
        }
        return result;
    }
    public parse(input?: Record<string, string>): T {
        const final = this.safeParse(input);
        if (final.success) {
            return final.data;
        } else {
            throw final.error;
        }
    }
    public describeVariable(envName?: unknown, prepend?: string): string {
        const header = this._description ? `# ${this._description}` : undefined;
        const fields = Object.keys(this.fields).map((k) => {
            const parser = this.fields[k as keyof T];
            return parser.describeVariable(parser.envName ?? k);
        });
        return [header, prepend, ...fields]
            .filter((x) => x !== undefined)
            .join('\n');
    }
    public describe(): string {
        return this.describeVariable();
    }
    public logger(logger: ILogger): this {
        this._logger = logger;
        return this;
    }
    public getMetavar(): string {
        // this should never be called
        return 'object';
    }
    public assumePrefix(...prefixes: string[]): this {
        this.assumedPrefices.push(...prefixes);
        return this;
    }
    public ignoreUnused(names: string[]){
        this.ignoredNames.push(...names);
        return this;
    }
    public reportUnused(): this {
        this._reportUnused = true;
        return this;
    }
    public rejectUnused(): this {
        this._rejectUnused = true;
        return this;
    }
}

export type TaggedUnion<Tag extends string, T> = {
    [K in keyof T]: { [P in Tag]: K } & T[K];
}[keyof T];

export type UntaggedUnion<T> = { [K in keyof T]: T[K] }[keyof T];

export class UntaggedUnionParser<T> extends VariableLike<
    KnownEnvName,
    UntaggedUnion<T>,
    Extract<keyof T, string>
> {
    constructor(private _options: ParsersOf<void, T>) {
        super();
    }
    parseContext(
        ctx: Context<KnownEnvName>,
    ): ParseResult<{ [K in keyof T]: T[K] }[keyof T]> {
        const value = ctx.envValue ?? toUndefined(this.defaultValue);
        if (value === undefined) {
            logMissingVariable(ctx.logger, ctx.envName);
            return ParseResult.missingVariable();
        }
        const parser = this._options[value as keyof T];
        if (parser === undefined) {
            const error = new Error(
                `it must be ${serialComma(Object.keys(this._options))}, but got ${value}`,
            );
            ctx.logger.error(`${ctx.envName}=${value} ERROR: ${error.message}`);
            return { success: false, error };
        }
        return parser.parseContext({
            ...ctx,
            envName: void 0,
        });
    }
    describeVariable(envName: string): string {
        return describeOptions(
            envName,
            this._options,
            toUndefined(this.defaultValue),
        );
    }
    getMetavar(): string {
        return fromOption(
            this.defaultValue,
            Object.keys(this._options).join('|'),
            (value) => value,
        );
    }
    tag<Tag extends string>(tag: Tag): TaggedUnionParser<Tag, T> {
        const result = new TaggedUnionParser(tag, this._options);
        this.envName = this.envName;
        this.isSecret = this.isSecret;
        this._description = this._description;
        this.defaultValue = this.defaultValue;
        this.forceMetavar = this.forceMetavar;
        return result;
    }
}

export class TaggedUnionParser<Tag extends string, T> extends VariableLike<
    KnownEnvName,
    TaggedUnion<Tag, T>,
    Extract<keyof T, string>
> {
    constructor(
        private tag: Tag,
        private _options: ParsersOf<void, T>,
    ) {
        super();
    }
    parseContext(ctx: Context<KnownEnvName>): ParseResult<TaggedUnion<Tag, T>> {
        const value = ctx.envValue ?? toUndefined(this.defaultValue);
        if (value === undefined) {
            logMissingVariable(ctx.logger, ctx.envName);
            return ParseResult.missingVariable();
        }
        const parser = this._options[value as keyof T];
        if (parser === undefined) {
            const error = new Error(
                `it must be ${serialComma(Object.keys(this._options))}, but got ${value}`,
            );
            ctx.logger.error(`${ctx.envName}=${value} ERROR: ${error.message}`);
            return { success: false, error };
        }
        const isDefault = ctx.envValue === undefined;
        if (isDefault) {
            ctx.logger.info(`${ctx.envName}=${value} (default)`);
        } else {
            ctx.logger.info(`${ctx.envName}=${value}`);
        }
        const result = parser.parseContext({
            ...ctx,
            envName: void 0,
        });
        const tag = { [this.tag]: value } as { [P in Tag]: keyof T };
        if (result.success) {
            return {
                success: true,
                data: {
                    ...tag,
                    ...result.data,
                },
            };
        } else {
            return result;
        }
    }
    describeVariable(envName: string): string {
        return describeOptions(
            envName,
            this._options,
            toUndefined(this.defaultValue),
        );
    }
    getMetavar(): string {
        return fromOption(
            this.defaultValue,
            Object.keys(this._options).join('|'),
            (value) => value.toString(),
        );
    }
}

function describeOptions<T>(
    key: string,
    options: ParsersOf<unknown, T>,
    defaultOption?: keyof T,
): string {
    return Object.keys(options)
        .map((k) => {
            const option = options[k as keyof T];
            const desc = option.describeVariable(void 0, `${key}=${k}`);
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
