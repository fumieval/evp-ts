import { ILogger, ConsoleLogger } from './logger';

export type State = {
    value: string;
    used: boolean;
};

export type Context = {
    values: Record<string, State>;
    logger: ILogger;
};

export interface Parsable<T> {
    parseKey(ctx: Context, key: string): T | undefined;
    describe(key?: string, prepend?: string): string;
}

/** Variable<T> represents a single environment variable that can be parsed into a value of type T */
export class Variable<T> implements Parsable<T> {
    public name?: string;
    public isSecret: boolean = false;
    public defaultValue?: T;
    public parser: (value: string) => T;
    public _description?: string;
    public _metavar: (defaultValue?: T) => string;
    public _logger: ILogger | undefined;
    public constructor(
        public params: {
            name?: string;
            isSecret?: boolean;
            defaultValue?: T;
            parser: (value: string) => T;
            description?: string;
            metavar?: (defaultValue?: T) => string;
        },
    ) {
        this.name = params.name;
        this.isSecret = params.isSecret ?? false;
        this.defaultValue = params.defaultValue;
        this.parser = params.parser;
        this._description = params.description;
        this._metavar = params.metavar ?? (() => '<value>');
    }
    public parseKey(ctx: Context, key: string): T | undefined {
        const k = this.name ?? key;
        const state = ctx.values[k];
        if (state === undefined) {
            if (this.defaultValue === undefined) {
                ctx.logger.missing(k);
                return undefined;
            } else {
                ctx.logger.useDefault(
                    k,
                    this.defaultValue === null
                        ? 'null'
                        : this.defaultValue.toString(),
                );
                return this.defaultValue;
            }
        } else {
            state.used = true;
            try {
                const result = this.parser(state.value);
                if (this.isSecret) {
                    ctx.logger.present(k, '<REDACTED>');
                } else {
                    ctx.logger.present(k, state.value);
                }
                return result;
            } catch (error) {
                if (error instanceof Error) {
                    ctx.logger.error(k, state.value, error);
                    return undefined;
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
        return new Variable({ ...this.params, defaultValue });
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
    public parseKey(ctx: Context, _key: string): T | undefined {
        const result = fromPartial(this.run(ctx));
        if (result instanceof Error) {
            return undefined;
        }
        return result;
    }
    run(ctx: Context): Partial<T> {
        const result: Partial<T> = {};
        for (const key in this.fields) {
            const variable = this.fields[key];
            if (!variable) {
                continue;
            }
            result[key] = variable.parseKey(ctx, key);
        }
        return result;
    }
    public parse(input?: Record<string, string>): T {
        const raw = input ?? process.env;
        const env: Record<string, State> = {};
        for (const key in raw) {
            env[key] = { value: raw[key] ?? '', used: false };
        }
        const final = fromPartial(
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

function fromPartial<T>(partial: Partial<T>): T | Error {
    // report an error with a list of missing variables
    const missing = Object.keys(partial).filter(
        (key) => partial[key as keyof T] === undefined,
    );
    if (missing.length > 0) {
        return Error(
            `Unable to fill the following fields: ${missing.join(', ')}`,
        );
    }
    return partial as T;
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
    ): { [K in keyof T]: T[K] }[keyof T] | undefined {
        const k = this.name ?? key;
        const value = ctx.values[k]?.value ?? this._default;
        if (value === undefined) {
            ctx.logger.missing(k);
            return undefined;
        }
        const parser = this._options[k as keyof T];
        const result = parser.parseKey(ctx, k);
        if (result === undefined) {
            return undefined;
        }
        return result;
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
    ): Discriminated<Discriminator, T> | undefined {
        const k = this.name ?? key;
        const value = ctx.values[k]?.value ?? this._default;
        if (value === undefined) {
            ctx.logger.missing(k);
            return undefined;
        }
        const parser = this._options[value as keyof T];
        if (parser === undefined) {
            ctx.logger.error(
                k,
                value,
                new Error(
                    `${k} must be one of ${Object.keys(this.options).join(', ')}, but got ${value}`,
                ),
            );
            return undefined;
        }
        ctx.logger.present(k, value);
        const result = parser.parseKey(ctx, k);
        if (result === undefined) {
            return undefined;
        }
        return {
            [this.discriminator]: value as keyof T,
            ...result,
        } as Discriminated<Discriminator, T>;
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
