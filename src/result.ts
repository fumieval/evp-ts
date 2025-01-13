export type ParseResult<T> = { success: true; data: T } | { success: false; error: Error };

export type ParseResults<T> = { [K in keyof T]: ParseResult<T[K]> };

export const ParseResult = {
  missingVariable<T>(): ParseResult<T>{
    return { success: false, error: new Error('missing environment variable') };
  },
};

export const ParseResults = {
  combine<T>(partial: ParseResults<T>): ParseResult<T> {
    // report an error with a list of missing variables
    const missing = Object.keys(partial).filter(
        (key) => !partial[key as keyof T].success
    );
    if (missing.length > 0) {
        return {
            success: false,
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
        if (value.success) {
            result[k] = value.data;
        }
    }
    return { success: true, data: result as T };
  }
}