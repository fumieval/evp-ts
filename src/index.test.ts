import { describe, expect, test, vi } from 'vitest';

import { EVP } from '.';
import { ILogger } from './logger';
import * as winston from 'winston';

class TestLogger implements ILogger {
    public logs: string[] = [];
    public constructor() {
        this.logs = [];
    }
    public info(message: string): void {
        this.logs.push(message);
    }
    public error(message: string): void {
        this.logs.push(message);
    }
}

const parser = EVP.object({
    API_ENDPOINT: EVP.string(),
    API_TOKEN: EVP.string().secret(),
    HTTP_PORT: EVP.number().metavar('<decimal>'),
    DEBUG_MODE: EVP.boolean().default(false),
    mysql: EVP.object({
        host: EVP.string().env('MYSQL_HOST').default('localhost'),
        port: EVP.string().env('MYSQL_PORT').default('3306'),
    }),
    OPTIONAL: EVP.string().optional(),
    DATA_SOURCE: EVP.union({
        dummy: EVP.object({}),
        file: EVP.object({
            DATA_PATH: EVP.string(),
        }),
        mysql: EVP.object({
            DATABASE: EVP.string(),
        }),
    }).tag('type').default('dummy'),
    MODE: EVP.enum(['development', 'production']),
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
            MODE: 'development',
        });
        expect(config).toEqual({
            API_ENDPOINT: 'https://example.com',
            API_TOKEN: 'secret',
            DATA_SOURCE: { type: 'file', DATA_PATH: '/path/to/data' },
            DEBUG_MODE: false,
            HTTP_PORT: 8080,
            mysql: { host: '127.0.0.1', port: '3306' },
            MODE: 'development',
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
            "MODE=development",
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
                MODE: 'development',
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
                "MODE=development",
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
                MODE: 'development',
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
                "MODE=development",
            ]);
        }
    });
    test('reject invalid number', () => {
        const logger = new TestLogger();
        try {
            const parser = EVP.object({
                PORT: EVP.number(),
            });
            parser.logger(logger).parse({
                PORT: 'blah',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'PORT=blah ERROR: invalid number',
            ]);
        }
    }),
    test('parse boolean values', () => {
        const logger = new TestLogger();
        const parser = EVP.object({
            A: EVP.boolean(),
            B: EVP.boolean(),
            C: EVP.boolean(),
            D: EVP.boolean(),
            E: EVP.boolean(),
            F: EVP.boolean(),
            G: EVP.boolean(),
            H: EVP.boolean(),
        });
        const config = parser.logger(logger).parse({
            A: 'true',
            B: 'false',
            C: '1',
            D: '0',
            E: 'yes',
            F: 'no',
            G: 'on',
            H: 'off',
        });
        expect(config).toEqual({
            A: true,
            B: false,
            C: true,
            D: false,
            E: true,
            F: false,
            G: true,
            H: false,
        });
    });
    test('reject invalid boolean values', () => {
        const logger = new TestLogger();
        try {
            const parser = EVP.object({
                A: EVP.boolean(),
            });
            parser.logger(logger).parse({
                A: 'blah',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'A=blah ERROR: invalid boolean',
            ]);
        }
    });
    test('metavariables', () => {
        const logger = new TestLogger();
        const parser = EVP.object({
            NUM: EVP.number(),
            HOST: EVP.string().default('localhost'),
            PORT: EVP.number().default(8080), 
            DB_HOST: EVP.string().metavar('<host>'),
            DB_PORT: EVP.number().metavar('<port>'),
            DEBUG_MODE: EVP.boolean().default(false),
        });
        expect(parser.describe()).toMatchSnapshot();
    });

    test('reject invalid enum values', () => {
        const logger = new TestLogger();
        try {
            const parser = EVP.object({
                MODE: EVP.enum(['development', 'production']),
                THEME: EVP.enum(['light', 'dark', 'auto']),
            });
            parser.logger(logger).parse({
                MODE: 'blah',
                THEME: 'blah',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'MODE=blah ERROR: it must be development or production, but got blah',
                "THEME=blah ERROR: it must be light, dark, or auto, but got blah",
            ]);
        }
    });

    test('reject missing untagged union tag', () => {
        const logger = new TestLogger();
        try {
            const parser = EVP.object({
                DATA_SOURCE: EVP.union({
                    dummy: EVP.object({}),
                    mysql: EVP.object({
                        DATABASE: EVP.string(),
                    }),
                }),
            });
            parser.logger(logger).parse({
                DATABASE: 'test',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'DATA_SOURCE=undefined ERROR: missing environment variable',
            ]);
        }
    });

    test('reject invalid union tag', () => {
        const logger = new TestLogger();
        try {
            const parser = EVP.object({
                DATA_SOURCE: EVP.union({
                    dummy: EVP.object({}),
                    mysql: EVP.object({
                        DATABASE: EVP.string(),
                    }),
                }),
            });
            parser.logger(logger).parse({
                DATA_SOURCE: 'blah',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'DATA_SOURCE=blah ERROR: it must be dummy or mysql, but got blah',
            ]);
        }
    });

    test('reject invalid untaggeed union value', () => {
        const logger = new TestLogger();
        try {
            const parser = EVP.object({
                DATA_SOURCE: EVP.union({
                    dummy: EVP.emptyObject(),
                    mysql: EVP.object({
                        DATABASE: EVP.string(),
                    }),
                }),
            });
            parser.logger(logger).parse({
                DATA_SOURCE: 'mysql',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'DATABASE=undefined ERROR: missing environment variable',
            ]);
        }
    });

    test('reject missing tagged union tag', () => {
        const logger = new TestLogger();
        try {
            const parser = EVP.object({
                DATA_SOURCE: EVP.union({
                    dummy: EVP.emptyObject(),
                    mysql: EVP.object({
                        DATABASE: EVP.string(),
                    }),
                }).tag('type'),
            });
            parser.logger(logger).parse({
                DATABASE: 'test',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'DATA_SOURCE=undefined ERROR: missing environment variable',
            ]);
        }
    });

    test('reject missing tagged union value', () => {
        const logger = new TestLogger();
        try {
            const parser = EVP.object({
                DATA_SOURCE: EVP.union({
                    dummy: EVP.object({}),
                    mysql: EVP.object({
                        DATABASE: EVP.string(),
                    }),
                }).tag('type'),
            });
            parser.logger(logger).parse({
                type: 'mysql',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'DATA_SOURCE=undefined ERROR: missing environment variable',
            ]);
        }
    });

    test('reject invalid tagged union tag', () => {
        const logger = new TestLogger();
        try {
            const parser = EVP.object({
                DATA_SOURCE: EVP.union({
                    dummy: EVP.object({}),
                    mysql: EVP.object({
                        DATABASE: EVP.string(),
                    }),
                }).tag('type'),
            });
            parser.logger(logger).parse({
                DATA_SOURCE: 'blah',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'DATA_SOURCE=blah ERROR: it must be dummy or mysql, but got blah',
            ]);
        }
    });

    test('reject invalid tagged union value', () => {
        const logger = new TestLogger();
        try {
            const parser = EVP.object({
                DATA_SOURCE: EVP.union({
                    dummy: EVP.object({}),
                    mysql: EVP.object({
                        DATABASE: EVP.string(),
                    }),
                }).tag('type'),
            });
            parser.logger(logger).parse({
                DATA_SOURCE: 'mysql',
            });
        } catch (_error) {
            expect(logger.logs).toEqual([
                'DATA_SOURCE=mysql',
                'DATABASE=undefined ERROR: missing environment variable',
            ]);
        }
    });

    test('handle default untagged union', () => {
        const logger = new TestLogger();
        const parser = EVP.object({
            DATA_SOURCE: EVP.union({
                dummy: EVP.object({}),
                mysql: EVP.object({
                    DATABASE: EVP.string(),
                }),
            }).default('dummy'),
        });
        const config = parser.logger(logger).parse({});
        expect(config).toEqual({ DATA_SOURCE: {} });
        expect(parser.describe()).toMatchSnapshot();
    });

    test('describe object', () => {
        const parser = EVP.object({
            FOO: EVP.string().description('foo'),
        }).description("foo parser").describe();
        expect(parser).toMatchSnapshot();
    })

    test('map', () => {
        const parser = EVP.object({
            FOO: EVP.string().map((value) => value.toUpperCase()).default('foo'),
        });
        const config = parser.parse({ FOO: 'bar' });
        expect(config).toEqual({ FOO: 'BAR' });
        expect(parser.describe()).toMatchSnapshot();
    });

    test('optional', () => {
        const parser = EVP.object({
            FOO: EVP.string().metavar('foo').optional(),
            BAR: EVP.string().optional().metavar('bar'),
        });
        const config = parser.parse({
            FOO: 'foo',
        });
        expect(config).toEqual({
            FOO: 'foo',
            BAR: undefined,
        });
        expect(parser.describe()).toMatchSnapshot();
    })

    test('throwing error', () => {
        const parser = EVP.object({
            FOO: EVP.string().map(() => { throw new Error('error') }),
        });
        try {
            parser.parse({ FOO: 'foo' });
        } catch (error) {
            if (!(error instanceof Error)) {
                throw error;
            }
            expect(error.message).toEqual('Unable to fill the following fields: FOO');
        }
    });

    test('throwing non-Error', () => {
        const parser = EVP.object({
            FOO: EVP.string().map(() => { throw 'error' }),
        });
        try {
            parser.parse({ FOO: 'foo' });
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            expect(error).toEqual('error');
        }
    });

    test('default values', () => {
        const parser = EVP.object({
            FOO: EVP.string().default('undefined'),
            BAR: EVP.string().default('null'),
            BAZ: EVP.string().default(''),
        });
        const config = parser.parse({});
        expect(config).toEqual({
            FOO: 'undefined',
            BAR: 'null',
            BAZ: '',
        });
        expect(parser.describe()).toMatchSnapshot();
    });

    test("winston compatibility", () => {
        const parser = EVP.object({
            LOG_LEVEL: EVP.enum(['error', 'warn', 'info', 'debug']).default('info'),
            FOO: EVP.enum(['foo', 'bar', 'baz']),
        });
        const logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.Console({
                    format: winston.format.simple(),
                }),
            ],
        });
        const winstonSpy = vi.spyOn(logger, 'log');
        try {
            parser.logger(logger).parse({});
        } catch (error) {
        }
        expect(winstonSpy.mock.calls).toMatchSnapshot();
    });
});
