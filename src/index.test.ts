import { describe, expect, test } from 'vitest';

import { EVP } from '.';
import { ILogger } from './logger';

class TestLogger implements ILogger {
    public logs: string[] = [];
    public constructor() {
        this.logs = [];
    }
    public present(key: string, value: string): void {
        this.logs.push(`Environment variable found: ${key}=${value}`);
    }
    public useDefault(key: string, value: string): void {
        this.logs.push(`Using the default: ${key}=${value}`);
    }
    public missing(key: string): void {
        this.logs.push(`Missing environment variable: ${key}`);
    }
    public error(key: string, value: string, error: Error): void {
        this.logs.push(`Error parsing environment variable: ${key}=${value} (${error.message})`);
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
});

type Config = EVP.infer<typeof parser>;

describe('EVP', () => {
    test('parse successfully', () => {
        const logger = new TestLogger();
        const config: Config = parser.exec(
            {
                API_ENDPOINT: 'https://example.com',
                API_TOKEN: 'secret',
                HTTP_PORT: '8080',
                MYSQL_HOST: '127.0.0.1',
            },
            logger,
        );
        expect(config).toEqual({
            API_ENDPOINT: 'https://example.com',
            API_TOKEN: 'secret',
            DEBUG_MODE: false,
            HTTP_PORT: 8080,
            mysql: { host: '127.0.0.1', port: '3306' },
        });
        expect(logger.logs).toEqual([
            'Environment variable found: API_ENDPOINT=https://example.com',
            'Environment variable found: API_TOKEN=<REDACTED>',
            'Environment variable found: HTTP_PORT=8080',
            'Using the default: DEBUG_MODE=false',
            'Environment variable found: MYSQL_HOST=127.0.0.1',
            'Using the default: MYSQL_PORT=3306',
        ]);
    });
    test('reject invalid decimals', () => {
        const logger = new TestLogger();
        try {
            parser.exec(
                {
                    API_ENDPOINT: 'https://example.com',
                    API_TOKEN: 'secret',
                    HTTP_PORT: '808o',
                },
                logger,
            );
        } catch (_error) {
            expect(logger.logs).toEqual([
                'Environment variable found: API_ENDPOINT=https://example.com',
                'Environment variable found: API_TOKEN=<REDACTED>',
                'Error parsing environment variable: HTTP_PORT=808o (invalid decimal)',
                'Using the default: DEBUG_MODE=false',
                'Using the default: MYSQL_HOST=localhost',
                'Using the default: MYSQL_PORT=3306',
            ]);
        }
    });
    test('reject missing variable', () => {
        const logger = new TestLogger();
        try {
            parser.exec(
                {
                    API_ENDPOINT: 'https://example.com',
                    API_TOKEN: 'secret',
                },
                logger,
            );
        } catch (_error) {
            expect(logger.logs).toEqual([
                'Environment variable found: API_ENDPOINT=https://example.com',
                'Environment variable found: API_TOKEN=<REDACTED>',
                'Missing environment variable: HTTP_PORT',
                'Using the default: DEBUG_MODE=false',
                'Using the default: MYSQL_HOST=localhost',
                'Using the default: MYSQL_PORT=3306',
            ]);
        }
    });
});
