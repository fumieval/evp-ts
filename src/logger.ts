import pc from 'picocolors';

export interface ILogger {
    info(message: string) : void;
    error(message: string): void;
}

export class ConsoleLogger implements ILogger {
    public info(
        message: string,
    ): void {
        console.info(`${process.stdout.isTTY ? pc.blue('[EVP]') : '[EVP]'} ${message}`);
    }
    public error(
        message: string,
    ): void {
        console.error(`${process.stderr.isTTY ? pc.red('[EVP]') : '[EVP]'} ${message}`);
    }
}

export function logMissingVariable(logger: ILogger, key: string): void {
    logger.error(`${key}=undefined ERROR: missing environment variable`);
}
