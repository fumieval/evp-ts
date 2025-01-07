import { ILogger, ConsoleLogger } from './logger';

export type State = {
    value: string;
    used: boolean;
};

export type Context = {
    values: Record<string, State>;
    logger: ILogger;
};

export type ParseResult<T> =
    | { type: 'success'; value: T }
    | { type: 'missing' }
    | { type: 'error'; error: Error };

export type ParseResults<T> = { [K in keyof T]: ParseResult<T[K]> };

export interface Parsable<T> {
    parseKey(ctx: Context, key: string): ParseResult<T>;
    describe(key?: string, prepend?: string): string;
}

export type Option<T> = { tag: 'some'; value: T } | { tag: 'none' };

/** Variable<T> represents a single environment variable that can be parsed into a value of type T */
export class Variable<T> implements Parsable<T> {
    public name?: string;
    public isSecret: boolean = false;
    public defaultValue: Option<T>;
    public parser: (value: string) => T;
    public _description?: string;
    public _metavar: (defaultValue: Option<T>) => string;
    public _logger: ILogger | undefined;
    public constructor(
        public params: {
            name?: string;
            isSecret?: boolean;
            defaultValue?: Option<T>;
            parser: (value: string) => T;
            description?: string;
            metavar?: (defaultValue?: T) => string;
        },
    ) {
        this.name = params.name;
        this.isSecret = params.isSecret ?? false;
        this.defaultValue = params.defaultValue ?? { tag: 'none' };
        this.parser = params.parser;
        this._description = params.description;
        const metavarFunc = params.metavar;
        this._metavar =
            metavarFunc === undefined
                ? () => '<value>'
                : (def: Option<T>) =>
                      def.tag === 'some'
                          ? metavarFunc(def.value)
                          : metavarFunc();
    }
    public parseKey(ctx: Context, key: string): ParseResult<T> {
        const k = this.name ?? key;
        const state = ctx.values[k];
        if (state === undefined) {
            if (this.defaultValue.tag === 'none') {
                ctx.logger.error(
                    k,
                    undefined,
                    new Error('missing environment variable'),
                );
                return { type: 'missing' };
            } else {
                const value: T = this.defaultValue.value;
                ctx.logger.success(k, value === null ? 'null' : value === undefined ? 'undefined' : value.toString(), true);
                return { type: 'success', value };
            }
        } else {
            state.used = true;
            try {
                const result = this.parser(state.value);
                if (this.isSecret) {
                    ctx.logger.success(k, '<REDACTED>', false);
                } else {
                    ctx.logger.success(k, state.value, false);
                }
                return { type: 'success', value: result };
            } catch (error) {
                if (error instanceof Error) {
                    ctx.logger.error(k, state.value, error);
                    return { type: 'error', error };
                }
                throw error;
            }
        }
    }

    /** mark the variable as a secret, so its value will be redacted in logs */
    public secret(): Variable<T> {
        return new Variable({ ...this.params, isSecret: true });
    }
    /** set a default value for the variable */
    public default(defaultValue: T): Variable<T> {
        return new Variable({
            ...this.params,
            defaultValue: { tag: 'some', value: defaultValue },
        });
    }
    public optional(): Variable<T | undefined> {
        return new Variable<T | undefined>({
            ...this.params,
            defaultValue: { tag: 'some', value: undefined },
            metavar: () => this._metavar({ tag: 'none' }),
        });
    }
    /** set a description for the variable */
    public description(description: string): Variable<T> {
        return new Variable({ ...this.params, description });
    }
    /** set a metavariable for the variable */
    public metavar(metavar: string): Variable<T> {
        return new Variable({ ...this.params, metavar: () => metavar });
    }
    /** dotenv-style description of the variable */
    public describe(key?: string): string {
        let k = this.name ?? key;
        const binding = `${k}=${this._metavar(this.defaultValue)}`;
        if (this._description !== undefined) {
            return `# ${this._description}\n${binding}`;
        } else {
            return binding;
        }
    }
    /** apply a function to the parsed value.
     * Note that metavar is not preserved.
     * */
    public map<U>(f: (value: T) => U): Variable<U> {
        return new Variable<U>({
            ...this.params,
            parser: (value) => f(this.parser(value)),
            defaultValue: this.defaultValue.tag === 'some' ? { tag: 'some', value: f(this.defaultValue.value) } : { tag: 'none' },
            metavar: undefined,
        });
    }
}

/** ParsersOf<T> is a record where each value is a Parsable<T[key]> for each key in T */
export type ParsersOf<T> = {
    [K in keyof T]: Parsable<T[K]>;
};

export class ObjectParser<T> implements Parsable<T> {
    readonly _T!: T;
    public constructor(
        public fields: ParsersOf<T>,
        public _description?: string,
        public _logger?: ILogger,
    ) {}
    public parseKey(ctx: Context, _key: string): ParseResult<T> {
        const result = fromParseResults(this.run(ctx));
        if (result instanceof Error) {
            return { type: 'error', error: result };
        }
        return { type: 'success', value: result };
    }
    run(ctx: Context): ParseResults<T> {
        const result: Partial<ParseResults<T>> = {};
        for (const key in this.fields) {
            const variable = this.fields[key];
            result[key] = variable.parseKey(ctx, key);
        }
        return result as ParseResults<T>;
    }
    public parse(input?: Record<string, string>): T {
        const raw = input ?? process.env;
        const env: Record<string, State> = {};
        for (const key in raw) {
            env[key] = { value: raw[key] ?? '', used: false };
        }
        const final = fromParseResults(
            this.run({
                values: env,
                logger: this._logger ?? new ConsoleLogger(),
            }),
        );
        if (final instanceof Error) {
            throw final;
        }
        return final;
    }
    public describe(_key?: string, prepend?: string): string {
        const header = this._description ? `# ${this._description}\n` : '';
        return `${header}${prepend ?? ''}${Object.keys(this.fields)
            .map((k) => this.fields[k as keyof T].describe(k))
            .join('\n')}`;
    }
    public description(description: string): ObjectParser<T> {
        return new ObjectParser(this.fields, description, this._logger);
    }
    public logger(logger: ILogger): ObjectParser<T> {
        return new ObjectParser(this.fields, this._description, logger);
    }
}

function fromParseResults<T>(partial: ParseResults<T>): T | Error {
    // report an error with a list of missing variables
    const missing = Object.keys(partial).filter(
        (key) => partial[key as keyof T].type !== 'success',
    );
    if (missing.length > 0) {
        return Error(
            `Unable to fill the following fields: ${missing.join(', ')}`,
        );
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
    return result as T;
}

export type Discriminated<Discriminator extends string, T> = {
    [K in keyof T]: { [P in Discriminator]: K } & T[K];
}[keyof T];

export class UndiscriminatedSwitcher<T>
    implements Parsable<{ [K in keyof T]: T[K] }[keyof T]>
{
    constructor(
        private _options: ParsersOf<T>,
        private _default?: keyof T,
        private name?: string,
    ) {}
    parseKey(
        ctx: Context,
        key: string,
    ): ParseResult<{ [K in keyof T]: T[K] }[keyof T]> {
        const k = this.name ?? key;
        const value = ctx.values[k]?.value ?? this._default;
        if (value === undefined) {
            ctx.logger.error(
                k,
                undefined,
                new Error('missing environment variable'),
            );
            return { type: 'missing' };
        }
        const parser = this._options[k as keyof T];
        return parser.parseKey(ctx, k);
    }
    describe(key?: string): string {
        return describeOptions(
            this.name ?? key ?? '',
            this._options,
            this._default,
        );
    }
    options<U extends T>(options: ParsersOf<U>): UndiscriminatedSwitcher<U> {
        return new UndiscriminatedSwitcher(options, this._default, this.name);
    }
    default(key: keyof T): UndiscriminatedSwitcher<T> {
        return new UndiscriminatedSwitcher(this._options, key, this.name);
    }
    discriminator<Discriminator extends string>(
        discriminator: Discriminator,
    ): Switcher<Discriminator, T> {
        return new Switcher(
            discriminator,
            this._options,
            this._default,
            this.name,
        );
    }
}

export class Switcher<Discriminator extends string, T>
    implements Parsable<Discriminated<Discriminator, T>>
{
    constructor(
        private discriminator: Discriminator,
        private _options: ParsersOf<T>,
        private _default?: keyof T,
        private name?: string,
    ) {}
    parseKey(
        ctx: Context,
        key: string,
    ): ParseResult<Discriminated<Discriminator, T>> {
        const k = this.name ?? key;
        const value = ctx.values[k]?.value ?? this._default;
        if (value === undefined) {
            ctx.logger.error(
                k,
                undefined,
                new Error('missing environment variable'),
            );
            return { type: 'missing' };
        }
        const parser = this._options[value as keyof T];
        if (parser === undefined) {
            const error = new Error(
                `${k} must be one of ${Object.keys(this.options).join(', ')}, but got ${value}`,
            );
            ctx.logger.error(k, value, error);
            return { type: 'error', error };
        }
        ctx.logger.success(k, value, ctx.values[k] === undefined);
        const result = parser.parseKey(ctx, k);
        const discriminator = { [this.discriminator]: value } as { [P in Discriminator]: keyof T };
        if (result.type === 'success'){
            return {
                type: 'success',
                value: {
                    ...discriminator,
                    ...result.value,
                },
            };
        } else {
            return result;
        }
    }
    describe(contextKey?: string): string {
        return describeOptions(
            this.name ?? contextKey ?? '',
            this._options,
            this._default,
        );
    }
    options<U extends T>(options: ParsersOf<U>): Switcher<Discriminator, U> {
        return new Switcher(
            this.discriminator,
            options,
            this._default,
            this.name,
        );
    }
    default(key: keyof T): Switcher<Discriminator, T> {
        return new Switcher(this.discriminator, this._options, key, this.name);
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
            const desc = option.describe(k, `${key}=${k}\n`);
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

export class Enum<U extends string, T extends U[]> extends Variable<T[number]> {
    constructor(private values: T, name?: string) {
        super({
            name,
            parser: (value: string) => {
                if (!values.includes(value as T[number])) {
                    throw new Error(
                        `${name} must be one of ${values.join(', ')}, but got ${value}`,
                    );
                }
                return value as T[number];
            },
        });
    }
    describe(key: string): string {
        return `${key}=${this.values.join('|')}`;
    }
    options<U1 extends string, T1 extends U1[]>(values: T1): Enum<U1, T1> {
        return new Enum<U1, T1>(values, this.name);
    }
}
