// RESPOND WITH REJECTIONS

// includes
import cmd = require('commander');
import dotenv = require('dotenv');
import { IPartition, PartitionerClient } from 'partitioner';
import { TcpServer } from 'tcp-comm';
import * as winston from 'winston';
import IMessage from './IMessage';

// set env
dotenv.config();

// define options
cmd.option(
    '-l, --log-level <s>',
    'LOG_LEVEL. The minimum level to log (error, warn, info, verbose, debug, silly). Defaults to "info".',
    /^(error|warn|info|verbose|debug|silly)$/i
)
    .option(
        '-i, --client-id <s>',
        'CLIENT_ID. The unique identifier of this client. Default is a random GUID, but this means if the client is recycled it cannot be reassigned to the previous partitions.'
    )
    .option(
        '-a, --client-address <s>',
        'CLIENT_ADDRESS. The address of the client that routers will use to connect on. Default is "127.0.0.1".'
    )
    .option(
        '-p, --client-port <i>',
        'CLIENT_PORT. The port to listen on. Default is "9000".',
        parseInt
    )
    .option(
        '-s, --server-address <s>',
        'SERVER_ADDRESS. The address of the server. Default is "127.0.0.1".'
    )
    .option(
        '-t, --server-port <i>',
        'SERVER_PORT. The port to connect to on the server. Default is "8001".',
        parseInt
    )
    .parse(process.argv);

// globals
const LOG_LEVEL = cmd.logLevel || process.env.LOG_LEVEL || 'info';
const CLIENT_ID = cmd.clientId || process.env.CLIENT_ID;
const CLIENT_ADDRESS =
    cmd.clientAddress || process.env.CLIENT_ADDRESS || '127.0.0.1';
const CLIENT_PORT = cmd.clientPort || process.env.CLIENT_PORT || 9000;
const SERVER_ADDRESS = cmd.serverAddress || process.env.SERVER_ADDRESS;
const SERVER_PORT = cmd.serverPort || process.env.SERVER_PORT || 8001;

// start logging
const logColors: {
    [index: string]: string;
} = {
    debug: '\x1b[32m', // green
    error: '\x1b[31m', // red
    info: '', // white
    silly: '\x1b[32m', // green
    verbose: '\x1b[32m', // green
    warn: '\x1b[33m' // yellow
};
const transport = new winston.transports.Console({
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(event => {
            const color = logColors[event.level] || '';
            const level = event.level.padStart(7);
            return `${event.timestamp} ${color}${level}\x1b[0m: ${
                event.message
            }`;
        })
    )
});
const logger = winston.createLogger({
    level: LOG_LEVEL,
    transports: [transport]
});

async function setup() {
    try {
        console.log(`LOG_LEVEL is "${LOG_LEVEL}".`);

        // keep track of partitions
        const partitions: IPartition[] = [];

        // listen for messages from routers
        const server = new TcpServer({
            port: CLIENT_PORT
        })
            .on('connect', client => {
                logger.info(`client "${client.id}" connected.`);
            })
            .on('disconnect', client => {
                if (client) logger.info(`client "${client.id}" disconnected.`);
            })
            .on('data', (client, payload: IMessage, respond) => {
                try {
                    const partition = partitions.find(
                        p =>
                            p.metadata.low <= payload.icao &&
                            p.metadata.high >= payload.icao
                    );
                    if (partition) {
                        // process as appropriate
                        logger.info(
                            `accepted from "${client.id}": ${JSON.stringify(
                                payload
                            )}`
                        );
                    } else {
                        // reject; this isn't the consumer handling this partition
                        server.tell(client, 'reject', payload);
                        logger.info(
                            `rejected from "${client.id}": ${JSON.stringify(
                                payload
                            )}`
                        );
                    }
                } catch (error) {
                    // invalid data; but important that there is still a response
                }
                if (respond) respond();
            })
            .on('error', (error, module) => {
                logger.error(
                    `there was an error raised in module "${module}"...`
                );
                logger.error(error.stack ? error.stack : error.message);
            });

        // setup the client
        const pclient = new PartitionerClient({
            address: SERVER_ADDRESS,
            id: CLIENT_ID,
            metadata: {
                address: CLIENT_ADDRESS,
                port: server.port
            },
            port: SERVER_PORT
        })
            .on('connect', () => {
                logger.info(
                    `connected to server at "${pclient.address}:${
                        pclient.port
                    }".`
                );
            })
            .on('disconnect', () => {
                logger.info(`disconnected from server.`);
            })
            .on('assign', partition => {
                const existing = partitions.find(p => p.id === partition.id);
                if (!existing) {
                    partitions.push(partition);
                    logger.info(`assigned partition "${partition.id}".`);
                }
            })
            .on('unassign', partition => {
                const index = partitions.findIndex(p => p.id === partition.id);
                if (index > -1) {
                    partitions.splice(index, 1);
                    logger.info(`unassigned partition "${partition.id}".`);
                }
            })
            .on('error', (error, module) => {
                logger.error(
                    `there was an error raised in module "${module}"...`
                );
                logger.error(error.stack ? error.stack : error.message);
            });

        // log settings
        logger.info(`CLIENT_ID is "${pclient.port}".`);
        logger.info(`CLIENT_ADDRESS is "${CLIENT_ADDRESS}".`);
        logger.info(`CLIENT_PORT is "${server.port}".`);
        logger.info(`SERVER_ADDRESS is "${pclient.port}".`);
        logger.info(`SERVER_PORT is "${pclient.port}".`);

        // connect
        server.listen();
        pclient.connect();
    } catch (error) {
        logger.error(error.stack);
    }
}

// run setup
setup();
