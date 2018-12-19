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
var tcp_comm_1 = require("tcp-comm");
var winston = __importStar(require("winston"));
// set env
dotenv.config();
// define options
cmd.option('-l, --log-level <s>', 'LOG_LEVEL. The minimum level to log (error, warn, info, verbose, debug, silly). Defaults to "info".', /^(error|warn|info|verbose|debug|silly)$/i)
    .option('-i, --client-id <s>', 'CLIENT_ID. The unique identifier of this client. Default is a random GUID, but this means if the client is recycled it cannot be reassigned to the previous partitions.')
    .option('-a, --client-address <s>', 'CLIENT_ADDRESS. The address of the client that routers will use to connect on. Default is "127.0.0.1".')
    .option('-p, --client-port <i>', 'CLIENT_PORT. The port to listen on. Default is "9000".', parseInt)
    .option('-s, --server-address <s>', 'SERVER_ADDRESS. The address of the server. Default is "127.0.0.1".')
    .option('-t, --server-port <i>', 'SERVER_PORT. The port to connect to on the server. Default is "8001".', parseInt)
    .parse(process.argv);
// globals
var LOG_LEVEL = cmd.logLevel || process.env.LOG_LEVEL || 'info';
var CLIENT_ID = cmd.clientId || process.env.CLIENT_ID;
var CLIENT_ADDRESS = cmd.clientAddress || process.env.CLIENT_ADDRESS || '127.0.0.1';
var CLIENT_PORT = cmd.clientPort || process.env.CLIENT_PORT || 9000;
var SERVER_ADDRESS = cmd.serverAddress || process.env.SERVER_ADDRESS;
var SERVER_PORT = cmd.serverPort || process.env.SERVER_PORT || 8001;
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
function setup() {
    return __awaiter(this, void 0, void 0, function () {
        var partitions_1, server, pclient_1;
        return __generator(this, function (_a) {
            try {
                console.log("LOG_LEVEL is \"" + LOG_LEVEL + "\".");
                partitions_1 = [];
                server = new tcp_comm_1.TcpServer({
                    port: CLIENT_PORT
                })
                    .on('connect', function (client) {
                    logger.info("client \"" + client.id + "\" connected.");
                })
                    .on('disconnect', function (client) {
                    if (client)
                        logger.info("client \"" + client.id + "\" disconnected.");
                })
                    .on('data', function (client, payload, respond) {
                    logger.info("from \"" + client.id + "\": " + JSON.stringify(payload));
                    if (respond)
                        respond();
                })
                    .on('error', function (error, module) {
                    logger.error("there was an error raised in module \"" + module + "\"...");
                    logger.error(error.stack ? error.stack : error.message);
                });
                pclient_1 = new partitioner_1.PartitionerClient({
                    address: SERVER_ADDRESS,
                    id: CLIENT_ID,
                    metadata: {
                        address: CLIENT_ADDRESS,
                        port: server.port
                    },
                    port: SERVER_PORT
                })
                    .on('connect', function () {
                    logger.info("connected to server at \"" + pclient_1.address + ":" + pclient_1.port + "\".");
                })
                    .on('disconnect', function () {
                    logger.info("disconnected from server.");
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
                logger.info("CLIENT_ID is \"" + pclient_1.port + "\".");
                logger.info("CLIENT_ADDRESS is \"" + CLIENT_ADDRESS + "\".");
                logger.info("CLIENT_PORT is \"" + server.port + "\".");
                logger.info("SERVER_ADDRESS is \"" + pclient_1.port + "\".");
                logger.info("SERVER_PORT is \"" + pclient_1.port + "\".");
                // connect
                server.listen();
                pclient_1.connect();
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
