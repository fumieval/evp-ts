import { EVP } from './src';

const parser = EVP.object({
    API_TOKEN: EVP.string().secret(),
    HTTP_PORT: EVP.decimal(),
    ENDPOINT: EVP.string(),
    DEBUG_MODE: EVP.boolean().default(false),
    mysql: EVP.object({
        host: EVP.string('MYSQL_HOST').default('localhost'),
        user: EVP.string('MYSQL_USER').default('root'),
    }),
});

console.log(parser.exec());
