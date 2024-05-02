import { Variable, ObjectParser, ParsersOf } from './mod';

export const EVP = {
    object<T>(fields: ParsersOf<T>): ObjectParser<T> {
        return new ObjectParser(fields);
    },
    string: Variable.string,
    decimal: Variable.decimal,
    boolean: Variable.boolean,
};
