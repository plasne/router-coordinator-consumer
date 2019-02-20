// MAYBE SUPPORT CONNECTING TO A RANGE FOR DISCOVERY

// includes
import cmd = require('commander');
import dotenv = require('dotenv');
import { IPartition, PartitionerClient } from 'partitioner';
import { TcpClient } from 'tcp-comm';
import * as winston from 'winston';
import { Dispatcher, IEnvelope } from './Dispatcher';
import IMap from './IMap';
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
        '-s, --server-address <s>',
        'SERVER_ADDRESS. The address of the server. Default is "127.0.0.1".'
    )
    .option(
        '-t, --server-port <i>',
        'SERVER_PORT. The port to connect to on the server. Default is "8000".',
        parseInt
    )
    .option(
        '-c, --count <i>',
        'COUNT. The number of messages per second per partition to generate. Default is "10".',
        parseInt
    )
    .option(
        '-f, --flush-every <i>',
        'FLUSH_EVERY. The number of milliseconds between attempts to flush the buffer. Default is "10000" (every 10 seconds).',
        parseInt
    )
    .option(
        '-t, --buffer-timeout <i>',
        'BUFFER_TIMEOUT. The number of milliseconds that a message can stay in the buffer. Default is "60000" (1 minute).',
        parseInt
    )
    .parse(process.argv);

// globals
const LOG_LEVEL = cmd.logLevel || process.env.LOG_LEVEL || 'info';
const CLIENT_ID = cmd.clientId || process.env.CLIENT_ID;
const SERVER_ADDRESS = cmd.serverAddress || process.env.SERVER_ADDRESS;
const SERVER_PORT = cmd.serverPort || process.env.SERVER_PORT;
const COUNT = cmd.count || process.env.COUNT || 10;
const FLUSH_EVERY = cmd.flushEvery || process.env.FLUSH_EVERY || 10000;
const BUFFER_TIMEOUT = cmd.bufferTimeout || process.env.BUFFER_TIMEOUT || 60000;

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

function random(min: number, max: number) {
    return Math.floor(Math.random() * (max - min)) + min;
}

async function setup() {
    try {
        console.log(`LOG_LEVEL is "${LOG_LEVEL}".`);

        // keep track of partitions
        const partitions: IPartition[] = [];

        // setup the client
        const pclient = new PartitionerClient({
            address: SERVER_ADDRESS,
            id: CLIENT_ID,
            port: SERVER_PORT
        })
            .on('connect', () => {
                logger.verbose(
                    `connected to server at "${pclient.address}:${
                        pclient.port
                    }".`
                );
            })
            .on('disconnect', () => {
                logger.verbose(`disconnected from server.`);
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
        logger.info(`CLIENT_ID is "${CLIENT_ID}".`);
        logger.info(`SERVER_ADDRESS is "${SERVER_ADDRESS}".`);
        logger.info(`SERVER_PORT is "${SERVER_PORT}".`);
        logger.info(`COUNT is "${COUNT}".`);
        logger.info(`FLUSH_EVERY is "${FLUSH_EVERY}".`);
        logger.info(`BUFFER_TIMEOUT is "${BUFFER_TIMEOUT}".`);

        // create the dispatcher
        const dispatcher = new Dispatcher(pclient, FLUSH_EVERY, BUFFER_TIMEOUT)
            .on('error', (error: Error, module: string) => {
                logger.error(
                    `there was an error raised in module "${module}"...`
                );
                logger.error(error.stack ? error.stack : error.message);
            })
            .on('map', (partition: IMap) => {
                logger.verbose(
                    `map [${partition.low} - ${partition.high}] to ${
                        partition.address
                    }:${partition.port}`
                );
            })
            .on('unmap', (partition: IMap) => {
                logger.verbose(
                    `unmap [${partition.low} - ${partition.high}] to ${
                        partition.address
                    }:${partition.port}`
                );
            })
            .on('dispatch', (envelope: IEnvelope, client: TcpClient) => {
                logger.verbose(
                    `dispatched ${JSON.stringify(envelope.payload)} to ${
                        client.address
                    }:${client.port}`
                );
            })
            .on('buffer', (envelope: IEnvelope) => {
                logger.verbose(`buffered ${JSON.stringify(envelope.payload)}`);
            })
            .on('reject', (message: IMessage) => {
                logger.verbose(`rejected ${JSON.stringify(message)}`);
            })
            .on('timeout', (envelope: IEnvelope) => {
                logger.verbose(`timeout ${JSON.stringify(envelope.payload)}`);
            })
            .on('begin-flush', count => {
                logger.verbose(
                    `the buffer flush began with ${count} messages remaining.`
                );
            })
            .on('end-flush', count => {
                logger.verbose(
                    `the buffer flush ended with ${count} messages remaining.`
                );
            });

        // connect
        pclient.connect();

        // generate fake traffic for each partition
        const generate = () => {
            try {
                for (const partition of partitions) {
                    for (let i = 0; i < COUNT; i++) {
                        const msg = {
                            heading: random(0, 359),
                            icao: random(1000, 15999),
                            source: partition.id
                        };
                        dispatcher.tell(msg.icao, undefined, msg);
                    }
                }
            } catch (error) {
                logger.error(`error while generating fake traffic...`);
                logger.error(error.stack);
            }
            setTimeout(() => {
                generate();
            }, 1000);
        };
        setTimeout(() => {
            generate();
        }, 1000);
    } catch (error) {
        logger.error(error.stack);
    }
}

// run setup
setup();
