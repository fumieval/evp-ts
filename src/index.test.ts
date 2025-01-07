import { describe, expect, test } from 'vitest';

import { EVP } from '.';
import { ILogger } from './logger';

class TestLogger implements ILogger {
    public logs: string[] = [];
    public constructor() {
        this.logs = [];
    }
    public success(key: string, value: string, useDefault: boolean): void {
        this.logs.push(`${key}=${value}${useDefault ? ' (default)' : ''}`);
    }
    public error(key: string, value: string, error: Error): void {
        this.logs.push(`${key}=${value} ERROR: ${error.message}`);
    }
}

const parser = EVP.object({
    API_ENDPOINT: EVP.string(),
    API_TOKEN: EVP.string().secret(),
    HTTP_PORT: EVP.decimal(),
    DEBUG_MODE: EVP.boolean().default(false),
    mysql: EVP.object({
        host: EVP.string('MYSQL_HOST').default('localhost'),
        port: EVP.string('MYSQL_PORT').default('3306'),
    }),
    OPTIONAL: EVP.string().optional(),
    DATA_SOURCE: EVP.union().options({
        dummy: EVP.object({}),
        file: EVP.object({
            DATA_PATH: EVP.string(),
        }),
        mysql: EVP.object({
            DATABASE: EVP.string(),
        }),
    }).discriminator('type'),
});

type Config = EVP.TypeOf<typeof parser>;

describe('EVP', () => {
    test('describe', () => {
        expect(parser.describe()).toMatchSnapshot();
    });
    test('parse successfully', () => {
        const logger = new TestLogger();
        const config: Config = parser.logger(logger).parse({
            API_ENDPOINT: 'https://example.com',
            API_TOKEN: 'secret',
            HTTP_PORT: '8080',
            MYSQL_HOST: '127.0.0.1',
            DATA_SOURCE: 'file',
            DATA_PATH: '/path/to/data',
        });
        expect(config).toEqual({
            API_ENDPOINT: 'https://example.com',
            API_TOKEN: 'secret',
            DATA_SOURCE: { type: 'file', DATA_PATH: '/path/to/data' },
            DEBUG_MODE: false,
            HTTP_PORT: 8080,
            mysql: { host: '127.0.0.1', port: '3306' },
        });
        expect(logger.logs).toEqual([
            'API_ENDPOINT=https://example.com',
            'API_TOKEN=<REDACTED>',
            'HTTP_PORT=8080',
            'DEBUG_MODE=false (default)',
            'MYSQL_HOST=127.0.0.1',
            'MYSQL_PORT=3306 (default)',
            "OPTIONAL=undefined (default)",
            "DATA_SOURCE=file",
            "DATA_PATH=/path/to/data",
        ]);
    });
    test('reject invalid decimals', () => {
        const logger = new TestLogger();
        try {
            parser.logger(logger).parse({
                API_ENDPOINT: 'https://example.com',
                API_TOKEN: 'secret',
                HTTP_PORT: '808o',
                DATA_SOURCE: 'dummy',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'API_ENDPOINT=https://example.com',
                'API_TOKEN=<REDACTED>',
                'HTTP_PORT=808o ERROR: invalid decimal',
                'DEBUG_MODE=false (default)',
                'MYSQL_HOST=localhost (default)',
                'MYSQL_PORT=3306 (default)',
                "OPTIONAL=undefined (default)",
                "DATA_SOURCE=dummy",
            ]);
        }
    });
    test('reject missing variable', () => {
        const logger = new TestLogger();
        try {
            parser.logger(logger).parse({
                API_ENDPOINT: 'https://example.com',
                API_TOKEN: 'secret',
                DATA_SOURCE: 'dummy',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'API_ENDPOINT=https://example.com',
                'API_TOKEN=<REDACTED>',
                'HTTP_PORT=undefined ERROR: missing environment variable',
                'DEBUG_MODE=false (default)',
                'MYSQL_HOST=localhost (default)',
                'MYSQL_PORT=3306 (default)',
                "OPTIONAL=undefined (default)",
                "DATA_SOURCE=dummy",
            ]);
        }
    });
});
