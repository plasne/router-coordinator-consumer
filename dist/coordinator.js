"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// includes
var cmd = require("commander");
var dotenv = require("dotenv");
var partitioner_1 = require("partitioner");
var winston = __importStar(require("winston"));
// set env
dotenv.config();
// define options
cmd.option('-l, --log-level <s>', 'LOG_LEVEL. The minimum level to log (error, warn, info, verbose, debug, silly). Defaults to "info".', /^(error|warn|info|verbose|debug|silly)$/i)
    .option('-p, --router-port <i>', 'ROUTER_PORT. The port that accepts connections from router clients. Default is "8000".', parseInt)
    .option('-c, --consumer-port <i>', 'CONSUMER_PORT. The port that accepts connections from consumer clients. Default is "8001".', parseInt)
    .option('-r, --rebalance <i>', 'REBALANCE. The number of milliseconds between rebalancing the partitions. Default is "10000" (10 seconds).', parseInt)
    .option('-i, --router-imbalance <i>', 'ROUTER_IMBALANCE. If set to "0" the partitions will distributed equally, with a greater number, REBALANCE will allow a client to have more partitions than its peers per this value. Default is "0".', parseInt)
    .option('-j, --consumer-imbalance <i>', 'CONSUMER_IMBALANCE. If set to "0" the partitions will distributed equally, with a greater number, REBALANCE will allow a client to have more partitions than its peers per this value. Default is "0".', parseInt)
    .option('-t, --timeout <i>', 'TIMEOUT. A client must checkin within the timeout period in milliseconds or its partitions will be reassigned. Default is "30000".', parseInt)
    .option('-l, --learn-for <i>', 'LEARN_FOR. The number of milliseconds after this application starts up that it will stay in learning mode. Default is "60000" (1 min).', parseInt)
    .option('-s, --shard-size <i>', 'SHARD_SIZE. The number of aircraft per partition (shard). Default is "100".', parseInt)
    .parse(process.argv);
// globals
var LOG_LEVEL = cmd.logLevel || process.env.LOG_LEVEL || 'info';
var ROUTER_PORT = cmd.routerPort || process.env.ROUTER_PORT || 8000;
var CONSUMER_PORT = cmd.consumerPort || process.env.CONSUMER_PORT || 8001;
var REBALANCE = cmd.rebalance || process.env.REBALANCE;
var ROUTER_IMBALANCE = cmd.routerImbalance || process.env.ROUTER_IMBALANCE;
var CONSUMER_IMBALANCE = cmd.consumerImbalance || process.env.CONSUMER_IMBALANCE;
var TIMEOUT = cmd.timeout || process.env.TIMEOUT;
var LEARN_FOR = cmd.learnFor || process.env.LEARN_FOR;
var SHARD_SIZE = cmd.shardSize || process.env.SHARD_SIZE || 100;
// start logging
var logColors = {
    debug: '\x1b[32m',
    error: '\x1b[31m',
    info: '',
    silly: '\x1b[32m',
    verbose: '\x1b[32m',
    warn: '\x1b[33m' // yellow
};
var transport = new winston.transports.Console({
    format: winston.format.combine(winston.format.timestamp(), winston.format.printf(function (event) {
        var color = logColors[event.level] || '';
        var level = event.level.padStart(7);
        return event.timestamp + " " + color + level + "\u001B[0m: " + event.message;
    }))
});
var logger = winston.createLogger({
    level: LOG_LEVEL,
    transports: [transport]
});
function addLogging(name, server) {
    server
        .on('listen', function () {
        logger.info("listening for " + name + " clients on port \"" + server.port + "\".");
    })
        .on('learning', function () {
        logger.info("the " + name + " port is now in \"learning\" mode.");
    })
        .on('managing', function () {
        logger.info("the " + name + " port is now in \"managing\" mode.");
    })
        .on('connect', function (client) {
        if (client.socket) {
            logger.info(name + " \"" + client.id + "\" connected from \"" + client.socket.remoteAddress + "\".");
            if (client.metadata &&
                (client.metadata.address || client.metadata.port)) {
                logger.info(name + " \"" + client.id + "\" announced its address as \"" + client.metadata.address + ":" + client.metadata.port + "\".");
            }
        }
        else {
            logger.info(name + " \"" + client.id + "\" connected.");
        }
    })
        .on('disconnect', function (client) {
        if (client) {
            logger.info(name + " \"" + client.id + "\" disconnected.");
        }
        else {
            logger.info("an unknown " + name + " client disconnected.");
        }
    })
        .on('remove', function (client) {
        logger.info(name + " client \"" + client.id + "\" removed.");
    })
        .on('timeout', function (client) {
        logger.info(name + " client \"" + client.id + "\" timed-out (lastCheckIn: " + client.lastCheckin + ", now: " + new Date().valueOf() + ", timeout: " + server.timeout + ").");
    })
        .on('rebalance', function () {
        var counts = server.counts();
        if (counts.length > 0) {
            logger.verbose(name + " rebalance finished...");
            var str = counts.map(function (c) { return c.client.id + ": " + c.count; });
            logger.verbose(str.join(', '));
        }
        else {
            logger.verbose(name + " rebalance finished; but there are no clients.");
        }
    })
        .on('assign', function (partition) {
        logger.info("partition \"" + partition.id + "\" was assigned to " + name + " client \"" + (partition.client ? partition.client.id : 'unknown') + "\".");
    })
        .on('unassign', function (partition) {
        logger.info("partition \"" + partition.id + "\" was unassigned from " + name + " client \"" + (partition.client ? partition.client.id : 'unknown') + "\".");
    })
        .on('yield', function (partition) {
        if (partition.yieldTo && partition.client) {
            logger.info("partition \"" + partition.id + "\" was yielded to " + name + " client \"" + partition.yieldTo.id + "\" from \"" + partition.client.id + "\".");
        }
    })
        .on('add-partition', function (partition) {
        logger.info("partition \"" + partition.id + "\" was added for distribution to " + name + " clients.");
    })
        .on('remove-partition', function (partition) {
        logger.info("partition \"" + partition.id + "\" was removed from distribution to " + name + " clients.");
    })
        .on('error', function (error, module) {
        logger.error("there was an error raised in " + name + " module \"" + module + "\"...");
        logger.error(error.stack ? error.stack : error.message);
    });
}
function setup() {
    return __awaiter(this, void 0, void 0, function () {
        var routers_1, consumers_1, min, max, cursor, high;
        var _this = this;
        return __generator(this, function (_a) {
            try {
                console.log("LOG_LEVEL is \"" + LOG_LEVEL + "\".");
                routers_1 = new partitioner_1.PartitionerServer({
                    imbalance: ROUTER_IMBALANCE,
                    learnFor: LEARN_FOR,
                    port: ROUTER_PORT,
                    rebalance: REBALANCE,
                    timeout: TIMEOUT
                });
                addLogging('router', routers_1);
                consumers_1 = new partitioner_1.PartitionerServer({
                    imbalance: CONSUMER_IMBALANCE,
                    learnFor: LEARN_FOR,
                    port: CONSUMER_PORT,
                    rebalance: REBALANCE,
                    timeout: TIMEOUT
                }).on('assign', function (partition) {
                    // proactively alert routers of consumer assignments (instead of relying on "who")
                    if (partition.client) {
                        var map = {
                            address: partition.client.metadata.address,
                            high: partition.metadata.high,
                            low: partition.metadata.low,
                            port: partition.client.metadata.port
                        };
                        routers_1.broadcast('map', map);
                    }
                });
                addLogging('consumer', consumers_1);
                // log settings
                logger.info("ROUTER_PORT is \"" + routers_1.port + "\".");
                logger.info("CONSUMER_PORT is \"" + consumers_1.port + "\".");
                logger.info("REBALANCE is \"" + routers_1.rebalanceEvery + "\".");
                logger.info("ROUTER_IMBALANCE is \"" + routers_1.allowedImbalance + "\".");
                logger.info("CONSUMER_IMBALANCE is \"" + consumers_1.allowedImbalance + "\".");
                logger.info("TIMEOUT is \"" + routers_1.timeout + "\".");
                logger.info("LEARN_FOR is \"" + routers_1.learnFor + "\".");
                logger.info("SHARD_SIZE is \"" + SHARD_SIZE + "\".");
                // start listening
                routers_1.listen();
                consumers_1.listen();
                // add some partitions to routers
                routers_1.addPartition({ id: 'router-partition-A' });
                routers_1.addPartition({ id: 'router-partition-B' });
                routers_1.addPartition({ id: 'router-partition-C' });
                routers_1.addPartition({ id: 'router-partition-D' });
                routers_1.addPartition({ id: 'router-partition-E' });
                routers_1.addPartition({ id: 'router-partition-F' });
                min = 1000;
                max = 15999;
                cursor = min;
                while (cursor < max) {
                    high = cursor + SHARD_SIZE - 1;
                    consumers_1.addPartition({
                        id: "aircraft-" + cursor + "-" + high,
                        metadata: {
                            high: high,
                            low: cursor
                        }
                    });
                    cursor += SHARD_SIZE;
                }
                // routers can ask which consumers own which partitions
                routers_1.on('cmd:req-map', function (client, payload, respond) { return __awaiter(_this, void 0, void 0, function () {
                    var icao, _i, _a, partition, map;
                    return __generator(this, function (_b) {
                        try {
                            icao = parseInt(payload, 10);
                            for (_i = 0, _a = consumers_1.partitions; _i < _a.length; _i++) {
                                partition = _a[_i];
                                if (isNaN(icao) ||
                                    (partition.metadata.low <= icao &&
                                        partition.metadata.high >= icao)) {
                                    if (partition.client) {
                                        map = {
                                            address: partition.client.metadata.address,
                                            high: partition.metadata.high,
                                            low: partition.metadata.low,
                                            port: partition.client.metadata.port
                                        };
                                        routers_1.tell(client, 'map', map);
                                    }
                                }
                            }
                        }
                        catch (error) {
                            routers_1.emit('error', error, 'req-map');
                        }
                        if (respond)
                            respond();
                        return [2 /*return*/];
                    });
                }); });
            }
            catch (error) {
                logger.error(error.stack);
            }
            return [2 /*return*/];
        });
    });
}
// run setup
setup();
