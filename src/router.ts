// includes
import cmd = require('commander');
import dotenv = require('dotenv');
import { IPartition, PartitionerClient } from 'partitioner';
import * as winston from 'winston';

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
        '-a, --address <s>',
        'ADDRESS. The address of the server. Default is "127.0.0.1".'
    )
    .option(
        '-p, --port <i>',
        'PORT. The port to connect to on the server. Default is "8000".',
        parseInt
    )
    .option(
        '-c, --count <i>',
        'COUNT. The number of messages per second per partition to generate. Default is "10".',
        parseInt
    )
    .parse(process.argv);

// globals
const LOG_LEVEL = cmd.logLevel || process.env.LOG_LEVEL || 'info';
const CLIENT_ID = cmd.clientId || process.env.CLIENT_ID;
const ADDRESS = cmd.address || process.env.ADDRESS;
const PORT = cmd.port || process.env.PORT;
const COUNT = cmd.count || process.env.COUNT;

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
            address: ADDRESS,
            id: CLIENT_ID,
            port: PORT
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
        logger.info(`ADDRESS is "${pclient.address}".`);
        logger.info(`PORT is "${pclient.port}".`);
        logger.info(`COUNT is "${COUNT}".`);

        // connect
        pclient.connect();

        // generate fake traffic for each partition
        const generate = () => {
            try {
                for (const partition of partitions) {
                    for (let i = 0; i < COUNT; i++) {
                        const msg = {
                            heading: random(0, 359),
                            icao: random(1000, 2000),
                            source: partition.id
                        };
                        console.log(msg);
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
