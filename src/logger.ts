import pc from 'picocolors';

export interface ILogger {
    present(key: string, value: string): void;
    useDefault(key: string, value: string): void;
    missing(key: string): void;
    error(key: string, value: string, error: Error): void;
}

export class ConsoleLogger implements ILogger {
    public present(key: string, value: string): void {
        console.info(`${pc.blue('[EVP]')} ${key}=${value}`);
    }
    public useDefault(key: string, value: string): void {
        console.info(`${pc.gray('[EVP]')} ${key}=${value} (default)`);
    }
    public missing(key: string): void {
        console.error(`${pc.red('[EVP]')} ${key} is missing`);
    }
    public error(key: string, value: string, error: Error): void {
        console.error(
            `${pc.red('[EVP]')} ${key}=${value} ERROR: ${error.message}`,
        );
    }
}
