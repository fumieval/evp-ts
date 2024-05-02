export interface ILogger {
    present(key: string, value: string): void;
    useDefault(key: string, value: string): void;
    missing(key: string): void;
    error(key: string, value: string, error: Error): void;
}

export class ConsoleLogger implements ILogger {
    public present(key: string, value: string): void {
        console.info(`Environment variable found: ${key}=${value}`);
    }
    public useDefault(key: string, value: string): void {
        console.info(`Using the default: ${key}=${value}`);
    }
    public missing(key: string): void {
        console.error(`Missing environment variable: ${key}`);
    }
    public error(key: string, value: string, error: Error): void {
        console.error(`Error parsing environment variable: ${key}=${value} (${error.message})`);
    }
}
