"use strict";
// this dispatcher is used by the router to send messages to the consumers
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
Object.defineProperty(exports, "__esModule", { value: true });
// features:
//   at-most-once delivery
//   wait-for-connect? yes
//   buffer-if-unavailable? yes
//   readdress? N/A as stored by ICAO
//   order-guaranteed? no
// todo:
//   needs a process to clear out clients that are old without anything going to them
//   there is nothing that prevents a message from bouncing around between consumers, which always reject
// includes
var events_1 = require("events");
var tcp_comm_1 = require("tcp-comm");
/* tslint:enable */
var Dispatcher = /** @class */ (function (_super) {
    __extends(Dispatcher, _super);
    function Dispatcher(coordinator, flushEveryXms, timeoutAfterXms) {
        var _this = _super.call(this) || this;
        _this.partitions = [];
        _this.clients = [];
        _this.envelopes = [];
        // variables
        _this.coordinator = coordinator;
        _this.every = flushEveryXms;
        _this.timeout = timeoutAfterXms;
        // look for a successful checkin (which is after a confirmed connect)
        _this.coordinator
            .once('checkin', function () {
            // ask for all maps
            coordinator.tell('req-map');
            _this.emit('req-map');
            // start flushing
            setTimeout(function () {
                _this.flush();
            }, _this.every);
        })
            .on('cmd:map', function (payload, respond) {
            try {
                _this.assign(payload);
            }
            catch (error) {
                _this.emit('error', error, 'map');
            }
            if (respond)
                respond();
        });
        return _this;
    }
    Dispatcher.prototype.tell = function (icao, cmd, payload, options) {
        // encapsulate the message into an envelope
        var envelope = {
            cmd: cmd,
            created: new Date().valueOf(),
            icao: icao,
            options: options,
            payload: payload
        };
        // dispatch immediately if possible
        var attempt = this.attempt(envelope);
        if (attempt)
            return attempt;
        // put into buffer (hopefully there will be a client to process soon)
        this.buffer(envelope);
        return Promise.resolve();
    };
    Dispatcher.prototype.ask = function (icao, cmd, payload, options) {
        // ensure that the options is looking for a receipt
        var o = options || {};
        o.receipt = true;
        // encapsulate the message into an envelope
        var envelope = {
            cmd: cmd,
            created: new Date().valueOf(),
            icao: icao,
            options: o,
            payload: payload
        };
        // dispatch immediately if possible
        var attempt = this.attempt(envelope);
        if (attempt)
            return attempt;
        // put into buffer (hopefully there will be a client to process soon)
        return this.buffer(envelope);
    };
    Dispatcher.prototype.add = function (options) {
        var _this = this;
        // make sure there is not already a client
        var ref = this.clients.find(function (c) { return c.address === options.address && c.port === options.port; });
        if (ref)
            return ref.client;
        // add the client + connect
        if (options.address && options.port) {
            var client = new tcp_comm_1.TcpClient(options)
                .on('error', function (error, module) {
                // re-throw errors into the dispatcher stream
                _this.emit('error', error, module);
            })
                .on('cmd:reject', function (payload, respond) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    // handle the case where the consumer rejected the message
                    try {
                        this.emit('reject', payload);
                        this.unassign(payload.icao);
                        this.buffer({
                            created: new Date().valueOf(),
                            icao: payload.icao,
                            payload: payload
                        });
                    }
                    catch (error) {
                        this.emit('error', error, 'reject');
                    }
                    if (respond)
                        respond();
                    return [2 /*return*/];
                });
            }); });
            this.clients.push({
                address: options.address,
                client: client,
                port: options.port
            });
            client.connect();
            return client;
        }
        return null;
    };
    Dispatcher.prototype.assign = function (partition) {
        // look for existing destination
        var existing = this.partitions.find(function (p) { return p.low === partition.low && p.high === partition.high; });
        // see if the existing map is different
        if (existing) {
            if (existing.address === partition.address &&
                existing.port === partition.port) {
                // same, do nothing
            }
            else {
                // different, update
                existing.address = partition.address;
                existing.port = partition.port;
                this.emit('map', existing);
            }
            return;
        }
        // add as new
        this.partitions.push(partition);
        // log
        this.emit('map', partition);
    };
    Dispatcher.prototype.unassign = function (icao) {
        // find out the partition for this icao
        var index = this.partitions.findIndex(function (p) { return p.low <= icao && p.high >= icao; });
        if (index < 0)
            return;
        // remove the mapping
        var partition = this.partitions[index];
        this.partitions.splice(index, 1);
        this.emit('unmap', partition);
        // request a new mapping
        this.coordinator.tell('req-map', icao);
        this.emit('req-map', icao);
    };
    Dispatcher.prototype.buffer = function (envelope) {
        this.envelopes.push(envelope);
        this.emit('buffer', envelope);
        if (envelope.options && envelope.options.receipt) {
            var promise = new Promise(function (resolve, reject) {
                envelope.resolve = resolve;
                envelope.reject = reject;
            });
            return promise;
        }
        else {
            return null;
        }
    };
    Dispatcher.prototype.attempt = function (envelope) {
        // find out the partition for this icao
        var partition = this.partitions.find(function (p) { return p.low <= envelope.icao && p.high >= envelope.icao; });
        if (partition) {
            // find the client
            var ref = this.clients.find(function (c) {
                return c.address === partition.address && c.port === partition.port;
            });
            // dispatch immediately if connected
            if (ref && ref.client.isConnected) {
                this.emit('dispatch', envelope, ref.client);
                return ref.client.tell(envelope.cmd, envelope.payload, envelope.options);
            }
            // if there is not a client to service this; make one
            if (!ref) {
                this.add({
                    address: partition.address,
                    id: this.coordinator.id,
                    port: partition.port
                });
            }
        }
        else {
            // ask the coordinator who owns this icao
            this.coordinator.tell('req-map', envelope.icao);
            this.emit('req-map', envelope.icao);
        }
        return null;
    };
    Dispatcher.prototype.flush = function () {
        var _this = this;
        try {
            // have a buffer of things to keep
            var remaining = [];
            this.emit('begin-flush', this.envelopes.length);
            // determine the oldest to keep
            var oldest = new Date().valueOf() - this.timeout;
            var _loop_1 = function (envelope) {
                var attempt = this_1.attempt(envelope);
                if (attempt) {
                    attempt.then(function (payload) {
                        if (envelope.resolve) {
                            envelope.resolve(payload);
                        }
                    }, function (error) {
                        if (envelope.reject)
                            envelope.reject(error);
                    });
                }
                else if (envelope.created >= oldest) {
                    // leave in buffer
                    remaining.push(envelope);
                }
                else {
                    // timeout
                    this_1.emit('timeout', envelope);
                    if (envelope.reject) {
                        envelope.reject(new Error('TIMEOUT - the message was held in the buffer for too long.'));
                    }
                }
            };
            var this_1 = this;
            // iterate through the entire buffer
            for (var _i = 0, _a = this.envelopes; _i < _a.length; _i++) {
                var envelope = _a[_i];
                _loop_1(envelope);
            }
            // keep whatever is left
            this.envelopes = remaining;
            this.emit('end-flush', remaining.length);
        }
        catch (error) {
            this.emit('error', error, 'dispatch');
        }
        // reschedule
        setTimeout(function () {
            _this.flush();
        }, this.every);
    };
    return Dispatcher;
}(events_1.EventEmitter));
exports.Dispatcher = Dispatcher;
