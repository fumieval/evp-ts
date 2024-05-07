import { ObjectParser, Variable, ParsersOf } from './mod';

export type infer<T extends ObjectParser<any>> = T['_T'];

export function string(name?: string): Variable<string> {
    return new Variable({
        name,
        isSecret: false,
        parser: (value: string) => value,
        defaultValue: undefined,
        metavar: 'string',
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
        metavar: 'decimal',
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
                    return true;
                case 'false':
                case 'no':
                case 'off':
                    return false;
                default:
                    throw new Error(`Invalid boolean value: ${value}`);
            }
        },
        defaultValue: undefined,
        metavar: 'boolean',
    });
}
export function object<T>(fields: ParsersOf<T>): ObjectParser<T> {
    return new ObjectParser(fields);
}
