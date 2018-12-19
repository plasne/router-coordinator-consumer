// includes
import cmd = require('commander');
import dotenv = require('dotenv');
import { IPartition, PartitionerServer } from 'partitioner';
import * as winston from 'winston';
import IConsumerOwns from './IConsumerOwns';

declare interface IClientMetadata {
    address: string;
    port: number;
}

// set env
dotenv.config();

// define options
cmd.option(
    '-l, --log-level <s>',
    'LOG_LEVEL. The minimum level to log (error, warn, info, verbose, debug, silly). Defaults to "info".',
    /^(error|warn|info|verbose|debug|silly)$/i
)
    .option(
        '-p, --router-port <i>',
        '[REQUIRED] ROUTER_PORT. The port that accepts connections from router clients. Default is "8000".',
        parseInt
    )
    .option(
        '-c, --consumer-port <i>',
        '[REQUIRED] CONSUMER_PORT. The port that accepts connections from consumer clients. Default is "8001".',
        parseInt
    )
    .option(
        '-r, --rebalance <i>',
        '[REQUIRED] REBALANCE. The number of milliseconds between rebalancing the partitions. Default is "10000" (10 seconds).',
        parseInt
    )
    .option(
        '-i, --router-imbalance <i>',
        '[REQUIRED] ROUTER_IMBALANCE. If set to "0" the partitions will distributed equally, with a greater number, REBALANCE will allow a client to have more partitions than its peers per this value. Default is "0".',
        parseInt
    )
    .option(
        '-j, --consumer-imbalance <i>',
        '[REQUIRED] CONSUMER_IMBALANCE. If set to "0" the partitions will distributed equally, with a greater number, REBALANCE will allow a client to have more partitions than its peers per this value. Default is "0".',
        parseInt
    )
    .option(
        '-t, --timeout <i>',
        '[REQUIRED] TIMEOUT. A client must checkin within the timeout period in milliseconds or its partitions will be reassigned. Default is "30000".',
        parseInt
    )
    .option(
        '-l, --learn-for <i>',
        '[REQUIRED] LEARN_FOR. The number of milliseconds after this application starts up that it will stay in learning mode. Default is "60000" (1 min).',
        parseInt
    )
    .parse(process.argv);

// globals
const LOG_LEVEL = cmd.logLevel || process.env.LOG_LEVEL || 'info';
const ROUTER_PORT = cmd.routerPort || process.env.ROUTER_PORT || 8000;
const CONSUMER_PORT = cmd.consumerPort || process.env.CONSUMER_PORT || 8001;
const REBALANCE = cmd.rebalance || process.env.REBALANCE;
const ROUTER_IMBALANCE = cmd.routerImbalance || process.env.ROUTER_IMBALANCE;
const CONSUMER_IMBALANCE =
    cmd.consumerImbalance || process.env.CONSUMER_IMBALANCE;
const TIMEOUT = cmd.timeout || process.env.TIMEOUT;
const LEARN_FOR = cmd.learnFor || process.env.LEARN_FOR;

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

function addLogging(name: string, server: PartitionerServer) {
    server
        .on('listen', () => {
            logger.info(
                `listening for ${name} clients on port "${server.port}".`
            );
        })
        .on('learning', () => {
            logger.info(`the ${name} port is now in "learning" mode.`);
        })
        .on('managing', () => {
            logger.info(`the ${name} port is now in "managing" mode.`);
        })
        .on('connect', (client, metadata) => {
            if (client.socket) {
                logger.info(
                    `${name} "${client.id}" connected from "${
                        client.socket.remoteAddress
                    }".`
                );
                if (metadata.address || metadata.port) {
                    logger.info(
                        `${name} "${client.id}" announced its address as "${
                            metadata.address
                        }:${metadata.port}".`
                    );
                }
            } else {
                logger.info(`${name} "${client.id}" connected.`);
            }
        })
        .on('disconnect', (client?) => {
            if (client) {
                logger.info(`${name} "${client.id}" disconnected.`);
            } else {
                logger.info(`an unknown ${name} client disconnected.`);
            }
        })
        .on('remove', client => {
            logger.info(`${name} client "${client.id}" removed.`);
        })
        .on('timeout', client => {
            logger.info(
                `${name} client "${client.id}" timed-out (lastCheckIn: ${
                    client.lastCheckin
                }, now: ${new Date().valueOf()}, timeout: ${server.timeout}).`
            );
        })
        .on('rebalance', () => {
            const counts = server.counts();
            if (counts.length > 0) {
                logger.verbose(`${name} rebalance finished...`);
                const str = counts.map(c => `${c.client.id}: ${c.count}`);
                logger.verbose(str.join(', '));
            } else {
                logger.verbose(
                    `${name} rebalance finished; but there are no clients.`
                );
            }
        })
        .on('assign', (partition: IPartition) => {
            logger.info(
                `partition "${partition.id}" was assigned to ${name} client "${
                    partition.client ? partition.client.id : 'unknown'
                }".`
            );
        })
        .on('unassign', (partition: IPartition) => {
            logger.info(
                `partition "${
                    partition.id
                }" was unassigned from ${name} client "${
                    partition.client ? partition.client.id : 'unknown'
                }".`
            );
        })
        .on('yield', partition => {
            if (partition.yieldTo && partition.client) {
                logger.info(
                    `partition "${
                        partition.id
                    }" was yielded to ${name} client "${
                        partition.yieldTo.id
                    }" from "${partition.client.id}".`
                );
            }
        })
        .on('add-partition', partition => {
            logger.info(
                `partition "${
                    partition.id
                }" was added for distribution to ${name} clients.`
            );
        })
        .on('remove-partition', partition => {
            logger.info(
                `partition "${
                    partition.id
                }" was removed from distribution to ${name} clients.`
            );
        })
        .on('error', (error, module) => {
            logger.error(
                `there was an error raised in ${name} module "${module}"...`
            );
            logger.error(error.stack ? error.stack : error.message);
        });
}

async function setup() {
    try {
        console.log(`LOG_LEVEL is "${LOG_LEVEL}".`);

        // setup routers
        const routers = new PartitionerServer({
            imbalance: ROUTER_IMBALANCE,
            learnFor: LEARN_FOR,
            port: ROUTER_PORT,
            rebalance: REBALANCE,
            timeout: TIMEOUT
        });
        addLogging('router', routers);

        // track metadata on clients
        const clients = new WeakMap();

        // setup consumers
        const consumers = new PartitionerServer({
            imbalance: CONSUMER_IMBALANCE,
            learnFor: LEARN_FOR,
            port: CONSUMER_PORT,
            rebalance: REBALANCE,
            timeout: TIMEOUT
        })
            .on('connect', (client, metadata: IClientMetadata) => {
                if (metadata.address || metadata.port) {
                    clients.set(client, metadata);
                }
            })
            .on('disconnect', (client?) => {
                if (client && clients.has(client)) {
                    clients.delete(client);
                }
            });
        addLogging('consumer', consumers);

        // log settings
        logger.info(`ROUTER_PORT is "${routers.port}".`);
        logger.info(`CONSUMER_PORT is "${consumers.port}".`);
        logger.info(`REBALANCE is "${routers.rebalanceEvery}".`);
        logger.info(`ROUTER_IMBALANCE is "${routers.allowedImbalance}".`);
        logger.info(`CONSUMER_IMBALANCE is "${consumers.allowedImbalance}".`);
        logger.info(`TIMEOUT is "${routers.timeout}".`);
        logger.info(`LEARN_FOR is "${routers.learnFor}".`);

        // start listening
        routers.listen();
        consumers.listen();

        // add some partitions to routers
        routers.addPartition({ id: 'partition-A' });
        routers.addPartition({ id: 'partition-B' });
        routers.addPartition({ id: 'partition-C' });
        routers.addPartition({ id: 'partition-D' });
        routers.addPartition({ id: 'partition-E' });
        routers.addPartition({ id: 'partition-F' });

        // routers can ask which consumers own which partitions
        routers.on('cmd:who', (_, payload: string | string[], respond) => {
            const response: IConsumerOwns[] = [];
            try {
                const partitions = Array.isArray(payload) ? payload : [payload];
                for (const partition of partitions) {
                    const ep = consumers.partitions.find(
                        p => p.id === partition
                    );
                    if (ep && ep.client) {
                        const cid = ep.client.id;
                        const md: IClientMetadata = clients.get(ep.client);
                        if (md) {
                            const ec = response.find(r => r.id === cid);
                            if (ec) {
                                ec.partitions.push(partition);
                            } else {
                                response.push({
                                    address: md.address,
                                    id: ep.client.id,
                                    partitions: [partition],
                                    port: md.port
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                routers.emit('error', error, 'who');
            }
            if (respond) respond(response);
        });
    } catch (error) {
        logger.error(error.stack);
    }
}

// run setup
setup();
