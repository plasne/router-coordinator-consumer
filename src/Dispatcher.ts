// this dispatcher is used by the router to send messages to the consumers

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
import { EventEmitter } from 'events';
import { PartitionerClient } from 'partitioner';
import { ISendOptions, ITcpClientOptions, TcpClient } from 'tcp-comm';
import IMap from './IMap';
import IMessage from './IMessage';

export interface IEnvelope {
    icao: number;
    cmd?: string;
    payload?: any;
    options?: ISendOptions;
    resolve?: (value: any) => void;
    reject?: (value: any) => void;
    created: number;
}

interface IClient {
    client: TcpClient;
    address: string;
    port: number;
}

/* tslint:disable */
export declare interface Dispatcher {
    on(event: 'req-map', listener: (icao?: number) => void): this;
    on(event: 'map', listener: (map: IMap) => void): this;
    on(event: 'unmap', listener: (map: IMap) => void): this;
    on(event: 'reject', listener: (message: IMessage) => void): this;
    on(event: 'buffer', listener: (envelope: IEnvelope) => void): this;
    on(event: 'begin-flush', listener: (count: number) => void): this;
    on(event: 'end-flush', listener: (count: number) => void): this;
    on(
        event: 'dispatch',
        listener: (envelope: IEnvelope, client: TcpClient) => void
    ): this;
    on(event: 'timeout', listener: (envelope: IEnvelope) => void): this;
    on(event: 'error', listener: (error: Error, module: string) => void): this;
}
/* tslint:enable */

export class Dispatcher extends EventEmitter {
    private coordinator: PartitionerClient;
    private partitions: IMap[] = [];
    private clients: IClient[] = [];
    private envelopes: IEnvelope[] = [];
    private every: number;
    private timeout: number;

    public constructor(
        coordinator: PartitionerClient,
        flushEveryXms: number,
        timeoutAfterXms: number
    ) {
        super();

        // variables
        this.coordinator = coordinator;
        this.every = flushEveryXms;
        this.timeout = timeoutAfterXms;

        // look for a successful checkin (which is after a confirmed connect)
        this.coordinator
            .once('checkin', () => {
                // ask for all maps
                coordinator.tell('req-map');
                this.emit('req-map');

                // start flushing
                setTimeout(() => {
                    this.flush();
                }, this.every);
            })
            .on('cmd:map', (payload: IMap, respond) => {
                try {
                    this.assign(payload);
                } catch (error) {
                    this.emit('error', error, 'map');
                }
                if (respond) respond();
            });
    }

    public tell(
        icao: number,
        cmd?: string,
        payload?: any,
        options?: ISendOptions
    ) {
        // encapsulate the message into an envelope
        const envelope: IEnvelope = {
            cmd,
            created: new Date().valueOf(),
            icao,
            options,
            payload
        };

        // dispatch immediately if possible
        const attempt = this.attempt(envelope);
        if (attempt) return attempt;

        // put into buffer (hopefully there will be a client to process soon)
        return this.buffer(envelope);
    }

    public ask(
        icao: number,
        cmd?: string,
        payload?: any,
        options?: ISendOptions
    ) {
        const o = options || {};
        o.receipt = true;
        return this.tell(icao, cmd, payload, o);
    }

    public add(options: ITcpClientOptions) {
        // make sure there is not already a client
        const ref = this.clients.find(
            c => c.address === options.address && c.port === options.port
        );
        if (ref) return ref.client;

        // add the client + connect
        if (options.address && options.port) {
            const client = new TcpClient(options)
                .on('error', (error, module) => {
                    // re-throw errors into the dispatcher stream
                    this.emit('error', error, module);
                })
                .on('cmd:reject', async (payload: IMessage, respond) => {
                    // handle the case where the consumer rejected the message
                    try {
                        this.emit('reject', payload);
                        this.unassign(payload.icao);
                        this.buffer({
                            created: new Date().valueOf(),
                            icao: payload.icao,
                            payload
                        });
                    } catch (error) {
                        this.emit('error', error, 'reject');
                    }
                    if (respond) respond();
                });
            this.clients.push({
                address: options.address,
                client,
                port: options.port
            });
            client.connect();
            return client;
        }

        return null;
    }

    private assign(partition: IMap) {
        // look for existing destination
        const existing = this.partitions.find(
            p => p.low === partition.low && p.high === partition.high
        );

        // see if the existing map is different
        if (existing) {
            if (
                existing.address === partition.address &&
                existing.port === partition.port
            ) {
                // same, do nothing
            } else {
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
    }

    private unassign(icao: number) {
        // find out the partition for this icao
        const index = this.partitions.findIndex(
            p => p.low <= icao && p.high >= icao
        );

        // remove the mapping
        const partition = this.partitions[index];
        if (index > -1) this.partitions.splice(index, 1);
        this.emit('unmap', partition);

        // request a new mapping
        this.coordinator.tell('req-map', icao);
        this.emit('req-map', icao);
    }

    private buffer(envelope: IEnvelope) {
        const promise = new Promise((resolve, reject) => {
            envelope.resolve = resolve;
            envelope.reject = reject;
        });
        this.emit('buffer', envelope);
        this.envelopes.push(envelope);
        return promise;
    }

    private attempt(envelope: IEnvelope) {
        // find out the partition for this icao
        const partition = this.partitions.find(
            p => p.low <= envelope.icao && p.high >= envelope.icao
        );
        if (partition) {
            // find the client
            const ref = this.clients.find(
                c =>
                    c.address === partition.address && c.port === partition.port
            );

            // dispatch immediately if connected
            if (ref && ref.client.isConnected) {
                this.emit('dispatch', envelope, ref.client);
                return ref.client.tell(
                    envelope.cmd,
                    envelope.payload,
                    envelope.options
                );
            }

            // if there is not a client to service this; make one
            if (!ref) {
                this.add({
                    address: partition.address,
                    port: partition.port
                });
            }
        } else {
            // ask the coordinator who owns this icao
            this.coordinator.tell('req-map', envelope.icao);
            this.emit('req-map', envelope.icao);
        }
        return null;
    }

    private flush() {
        try {
            // have a buffer of things to keep
            const remaining: IEnvelope[] = [];
            this.emit('begin-flush', this.envelopes.length);

            // determine the oldest to keep
            const oldest = new Date().valueOf() - this.timeout;

            // iterate through the entire buffer
            for (const envelope of this.envelopes) {
                const attempt = this.attempt(envelope);
                if (attempt) {
                    attempt.then(
                        payload => {
                            if (envelope.resolve) {
                                envelope.resolve(payload);
                            }
                        },
                        error => {
                            if (envelope.reject) envelope.reject(error);
                        }
                    );
                } else if (envelope.created >= oldest) {
                    // leave in buffer
                    remaining.push(envelope);
                } else {
                    // timeout
                    this.emit('timeout', envelope);
                    if (envelope.reject) {
                        envelope.reject(
                            new Error(
                                'TIMEOUT - the message was held in the buffer for too long.'
                            )
                        );
                    }
                }
            }

            // keep whatever is left
            this.envelopes = remaining;
            this.emit('end-flush', remaining.length);
        } catch (error) {
            this.emit('error', error, 'dispatch');
        }

        // reschedule
        setTimeout(() => {
            this.flush();
        }, this.every);
    }
}
