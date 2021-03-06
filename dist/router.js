"use strict";
// MAYBE SUPPORT CONNECTING TO A RANGE FOR DISCOVERY
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
var Dispatcher_1 = require("./Dispatcher");
// set env
dotenv.config();
// define options
cmd.option('-l, --log-level <s>', 'LOG_LEVEL. The minimum level to log (error, warn, info, verbose, debug, silly). Defaults to "info".', /^(error|warn|info|verbose|debug|silly)$/i)
    .option('-i, --client-id <s>', 'CLIENT_ID. The unique identifier of this client. Default is a random GUID, but this means if the client is recycled it cannot be reassigned to the previous partitions.')
    .option('-s, --server-address <s>', 'SERVER_ADDRESS. The address of the server. Default is "127.0.0.1".')
    .option('-t, --server-port <i>', 'SERVER_PORT. The port to connect to on the server. Default is "8000".', parseInt)
    .option('-c, --count <i>', 'COUNT. The number of messages per second per partition to generate. Default is "10".', parseInt)
    .option('-f, --flush-every <i>', 'FLUSH_EVERY. The number of milliseconds between attempts to flush the buffer. Default is "10000" (every 10 seconds).', parseInt)
    .option('-t, --buffer-timeout <i>', 'BUFFER_TIMEOUT. The number of milliseconds that a message can stay in the buffer. Default is "60000" (1 minute).', parseInt)
    .parse(process.argv);
// globals
var LOG_LEVEL = cmd.logLevel || process.env.LOG_LEVEL || 'info';
var CLIENT_ID = cmd.clientId || process.env.CLIENT_ID;
var SERVER_ADDRESS = cmd.serverAddress || process.env.SERVER_ADDRESS;
var SERVER_PORT = cmd.serverPort || process.env.SERVER_PORT;
var COUNT = cmd.count || process.env.COUNT || 10;
var FLUSH_EVERY = cmd.flushEvery || process.env.FLUSH_EVERY || 10000;
var BUFFER_TIMEOUT = cmd.bufferTimeout || process.env.BUFFER_TIMEOUT || 60000;
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
function random(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}
function setup() {
    return __awaiter(this, void 0, void 0, function () {
        var partitions_1, pclient_1, dispatcher_1, generate_1;
        return __generator(this, function (_a) {
            try {
                console.log("LOG_LEVEL is \"" + LOG_LEVEL + "\".");
                partitions_1 = [];
                pclient_1 = new partitioner_1.PartitionerClient({
                    address: SERVER_ADDRESS,
                    id: CLIENT_ID,
                    port: SERVER_PORT
                })
                    .on('connect', function () {
                    logger.verbose("connected to server at \"" + pclient_1.address + ":" + pclient_1.port + "\".");
                })
                    .on('disconnect', function () {
                    logger.verbose("disconnected from server.");
                })
                    .on('assign', function (partition) {
                    var existing = partitions_1.find(function (p) { return p.id === partition.id; });
                    if (!existing) {
                        partitions_1.push(partition);
                        logger.info("assigned partition \"" + partition.id + "\".");
                    }
                })
                    .on('unassign', function (partition) {
                    var index = partitions_1.findIndex(function (p) { return p.id === partition.id; });
                    if (index > -1) {
                        partitions_1.splice(index, 1);
                        logger.info("unassigned partition \"" + partition.id + "\".");
                    }
                })
                    .on('error', function (error, module) {
                    logger.error("there was an error raised in module \"" + module + "\"...");
                    logger.error(error.stack ? error.stack : error.message);
                });
                // log settings
                logger.info("CLIENT_ID is \"" + CLIENT_ID + "\".");
                logger.info("SERVER_ADDRESS is \"" + SERVER_ADDRESS + "\".");
                logger.info("SERVER_PORT is \"" + SERVER_PORT + "\".");
                logger.info("COUNT is \"" + COUNT + "\".");
                logger.info("FLUSH_EVERY is \"" + FLUSH_EVERY + "\".");
                logger.info("BUFFER_TIMEOUT is \"" + BUFFER_TIMEOUT + "\".");
                dispatcher_1 = new Dispatcher_1.Dispatcher(pclient_1, FLUSH_EVERY, BUFFER_TIMEOUT)
                    .on('error', function (error, module) {
                    logger.error("there was an error raised in module \"" + module + "\"...");
                    logger.error(error.stack ? error.stack : error.message);
                })
                    .on('map', function (partition) {
                    logger.verbose("map [" + partition.low + " - " + partition.high + "] to " + partition.address + ":" + partition.port);
                })
                    .on('unmap', function (partition) {
                    logger.verbose("unmap [" + partition.low + " - " + partition.high + "] to " + partition.address + ":" + partition.port);
                })
                    .on('dispatch', function (envelope, client) {
                    logger.verbose("dispatched " + JSON.stringify(envelope.payload) + " to " + client.address + ":" + client.port);
                })
                    .on('buffer', function (envelope) {
                    logger.verbose("buffered " + JSON.stringify(envelope.payload));
                })
                    .on('reject', function (message) {
                    logger.verbose("rejected " + JSON.stringify(message));
                })
                    .on('timeout', function (envelope) {
                    logger.verbose("timeout " + JSON.stringify(envelope.payload));
                })
                    .on('begin-flush', function (count) {
                    logger.verbose("the buffer flush began with " + count + " messages remaining.");
                })
                    .on('end-flush', function (count) {
                    logger.verbose("the buffer flush ended with " + count + " messages remaining.");
                });
                // connect
                pclient_1.connect();
                generate_1 = function () {
                    try {
                        for (var _i = 0, partitions_2 = partitions_1; _i < partitions_2.length; _i++) {
                            var partition = partitions_2[_i];
                            for (var i = 0; i < COUNT; i++) {
                                var msg = {
                                    heading: random(0, 359),
                                    icao: random(1000, 15999),
                                    source: partition.id
                                };
                                dispatcher_1.tell(msg.icao, undefined, msg);
                            }
                        }
                    }
                    catch (error) {
                        logger.error("error while generating fake traffic...");
                        logger.error(error.stack);
                    }
                    setTimeout(function () {
                        generate_1();
                    }, 1000);
                };
                setTimeout(function () {
                    generate_1();
                }, 1000);
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
