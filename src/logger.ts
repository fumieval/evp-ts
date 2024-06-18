import pc from 'picocolors';

export interface ILogger {
    success(key: string, value: string, useDefault: boolean): void;
    error(key: string, value: string, error: Error): void;
}

export class ConsoleLogger implements ILogger {
    public success(key: string, value: string, useDefault: boolean): void {
        console.info(
            `${pc.blue('[EVP]')} ${key}=${value}${useDefault ? ' (default)' : ''}`,
        );
    }
    public error(key: string, value: string, error: Error): void {
        console.error(
            `${pc.red('[EVP]')} ${key}=${value} ERROR: ${error.message}`,
        );
    }
}
