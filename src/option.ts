export type Option<T> = { tag: 'some'; value: T } | { tag: 'none' };

export function fromOption<T, U>(
    option: Option<T>,
    none: U,
    some: (value: T) => U,
): U {
    if (option.tag === 'some') {
        return some(option.value);
    } else {
        return none;
    }
}

export const none = { tag: 'none' } as const;

export function some<T>(value: T): Option<T> {
    return { tag: 'some', value };
}

export function toUndefined<T>(option: Option<T>): T | undefined {
    return fromOption(option, undefined, (value) => value);
}
