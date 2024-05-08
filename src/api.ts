import {
    ObjectParser,
    Variable,
    ParsersOf,
    UndiscriminatedSwitcher,
} from './mod';

export type TypeOf<T extends ObjectParser<unknown>> = T['_T'];

export function string(name?: string): Variable<string> {
    return new Variable({
        name,
        isSecret: false,
        parser: (value: string) => value,
        defaultValue: undefined,
        metavar: (def?: string) => def ?? '<string>',
    });
}

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
export function object<T>(fields: ParsersOf<T>): ObjectParser<T> {
    return new ObjectParser(fields);
}

export function union(name?: string): UndiscriminatedSwitcher<{}> {
    return new UndiscriminatedSwitcher({}, undefined, name);
}
