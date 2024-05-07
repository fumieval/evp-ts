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
    parse(ctx: Context, key: string): T | undefined;
    describe(key?: string): string;
}

export class Variable<T> implements Parsable<T> {
    public name?: string;
    public isSecret: boolean = false;
    public defaultValue?: T;
    public parser: (value: string) => T;
    public _description?: string;
    public _metavar: (defaultValue?: T) => string;
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
    public parse(ctx: Context, key: string): T | undefined {
        const k = this.name ?? key;
        const state = ctx.values[k];
        if (state === undefined) {
            if (this.defaultValue === undefined) {
                ctx.logger.missing(k);
                return undefined;
            } else {
                ctx.logger.useDefault(k, this.defaultValue === null ? 'null' : this.defaultValue.toString());
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

    public secret(): Variable<T> {
        return new Variable({ ...this.params, isSecret: true });
    }
    public default(defaultValue: T): Variable<T> {
        return new Variable({ ...this.params, defaultValue });
    }
    public description(description: string): Variable<T> {
        return new Variable({ ...this.params, description });
    }
    public metavar(metavar: string): Variable<T> {
        return new Variable({ ...this.params, metavar: () => metavar });
    }
    public describe(key?: string): string {
        let k = this.name ?? key;
        const binding = `${k}=${this._metavar(this.defaultValue)}`
        if (this._description !== undefined) {
            return `# ${this._description}\n${binding}`;
        } else {
            return binding;
        }
    }
}

// ParsersOf<T> is a record where each value is a Parsable<T[key]> for each key in T
export type ParsersOf<T> = {
    [K in keyof T]: Parsable<T[K]>;
};

export class ObjectParser<T> implements Parsable<T> {
    readonly _T!: T;
    public constructor(public fields: ParsersOf<T>) {}
    public parse(ctx: Context, _key: string): T | undefined {
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
            result[key] = variable.parse(ctx, key);
        }
        return result;
    }
    public exec(input?: Record<string, string>, logger?: ILogger): T {
        const raw = input ?? process.env;
        const env: Record<string, State> = {};
        for (const key in raw) {
            env[key] = { value: raw[key] ?? '', used: false };
        }
        const final = fromPartial(this.run({ values: env, logger: logger ?? new ConsoleLogger() }));
        if (final instanceof Error) {
            throw final;
        }
        return final;
    }
    public describe(_key?: string): string {
        return `${Object.keys(this.fields)
            .map(k => this.fields[k as keyof T].describe(k))
            .join('\n')}`;
    }
}

function fromPartial<T>(partial: Partial<T>): T | Error {
    // report an error with a list of missing variables
    const missing = Object.keys(partial).filter(key => partial[key as keyof T] === undefined);
    if (missing.length > 0) {
        return Error(`Unable to fill the following fields: ${missing.join(', ')}`);
    }
    return partial as T;
}
