# Router-Coordinator-Consumer Pattern

Consider the following problem: event data is available in some partitioned fashion and you need to distribute those events to the appropriate consumers that are also partitioned in some way. This sample shows how you can reliably fetch and distribute data solving the above problem.

This sample builds on top of:

-   https://github.com/plasne/tcp-comm - A simple TCP communication library I wrote in TypeScript.
-   https://github.com/plasne/partitioner - A partition manager built on top of tcp-comm.

There are 3 components to this design:

-   Router - A component that fetches event data from a partitioned source. You will want at least one router, but could have as many as you have source partitions to improve performance.

-   Consumer - A component that is responsible for the processing of data for the 1 or more partitions that it owns. Based on the complexity of processing, you might have a small number of these or hundreds.

-   Coordinator - A component that is responsible for distributing partitions to the routers and consumers as well as giving the Routers mapping information so they know how to send the right data to the right consumers. There will only ever be a single coordinator.

Some details about the implementation of this sample:

-   This simulates processing aircraft telemetry data.
-   The ICAO number is the unique identifier for an aircraft.
-   Most likely the coordinator would read partitions from the source system, but for this sample, it simply creates them.
-   The routers would read data from some partitioned source (like Kafka), but for this sample, they simply generate random data.
-   The consumers would process the messages in some way, but for this sample, they simply write the data to the console.

Of course there are many other ways to solve this same problem, but if you are looking for a code-based option, this might work.

The traffic flow looks like this:

1. Routers are assigned source partitions by the coordinator.
1. Consumers are assigned target partitions by the coordinator.
1. The coordinator sends maps to the routers so they know which consumers own which partitions.
1. Routers fetch messages based on the source partitions they were assigned.
1. Routers dispatch messages directly to the consumers.

## Configuration

Each application has a number of variables that must be set and some that can be optionally set. The variables may be set by any of the following methods:

1. Providing them on the command line.
1. Setting environmental variables.
1. Providing them in a .env file.
1. Use the default value, if there is one.

Those methods are in order based on their precident. For instance, if you set an environment variable in a .env file it can be overriden by specifying an environment variable to the console or by providing the variable via the command line.

The variables can be seen by running...

```javascript
node dist/coordinator.js --help
node dist/router.js --help
node dist/consumer.js --help
```

## Coordinator

When manually starting up a cluster, you should start the coordinator first. This is not a requirement, but it will keep the routers and consumers from reporting errors while they look for a coordinator.

To startup the coordinator with all defaults, you can simply type:

```javascript
node dist/coordinator.js
```

The coordinator has the following options:

-   LOG_LEVEL. The minimum level to log (error, warn, info, verbose, debug, silly). Defaults to "info".
-   ROUTER_PORT - The port that accepts connections from router clients. Default is "8000".
-   CONSUMER_PORT - The port that accepts connections from consumer clients. Default is "8001".
-   REBALANCE - The number of milliseconds between rebalancing the partitions. Default is "10000" (10 seconds).
-   ROUTER_IMBALANCE - If set to "0" the partitions will distributed equally, with a greater number, REBALANCE will allow a client to have more partitions than its peers per this value. Default is "0".
-   CONSUMER_IMBALANCE - If set to "0" the partitions will distributed equally, with a greater number, REBALANCE will allow a client to have more partitions than its peers per this value. Default is "0".
-   TIMEOUT - A client must checkin within the timeout period in milliseconds or its partitions will be reassigned. Default is "30000".
-   LEARN_FOR - The number of milliseconds after this application starts up that it will stay in learning mode. Default is "60000" (1 min).
-   SHARD_SIZE - The number of aircraft per partition (shard). Default is "100".

## Router

To create a router named "routerA" and connect it to a coordinator at "coordinator.sample.com" on the default port:

```javascript
node dist/router.js --client-id routerA --server-address coordinator.sample.com
```

It is important that you provide a unqiue CLIENT_ID for each router. If a stable name is provided, then a router can be assigned the same partitions if it comes back up before a rebalance.

A router has the following options:

-   LOG_LEVEL. The minimum level to log (error, warn, info, verbose, debug, silly). Defaults to "info".
-   CLIENT_ID. The unique identifier of this client. Default is a random GUID, but this means if the client is recycled it cannot be reassigned to the previous partitions.
-   SERVER_ADDRESS. The address of the server. Default is "127.0.0.1".
-   SERVER_PORT. The port to connect to on the server (the coordinator's ROUTER_PORT). Default is "8000".
-   COUNT. The number of messages per second per partition to generate. Default is "10".
-   FLUSH_EVERY. The number of milliseconds between attempts to flush the buffer. Default is "10000" (every 10 seconds).
-   BUFFER_TIMEOUT. The number of milliseconds that a message can stay in the buffer. Default is "60000" (1 minute).

## Consumer

To create a consumer named "consumerA" and connect it to a coordinator at "coordinator.sample.com" on the default port:

```javascript
node dist/router.js --client-id consumerA --address coordinator.sample.com
```

It is important that you provide a unqiue CLIENT_ID for each consumer. If a stable name is provided, then a consumer can be assigned the same partitions if it comes back up before a rebalance.

A consumer has the following options:

-   LOG_LEVEL. The minimum level to log (error, warn, info, verbose, debug, silly). Defaults to "info".
-   CLIENT_ID. The unique identifier of this client. Default is a random GUID, but this means if the client is recycled it cannot be reassigned to the previous partitions.
-   CLIENT_ADDRESS. The address of the client that routers will use to connect on. Default is "127.0.0.1".
-   CLIENT_PORT. The port to listen on. Default is "9000".
-   SERVER_ADDRESS. The address of the server. Default is "127.0.0.1".
-   SERVER_PORT. The port to connect to on the server (the coordinator's CONSUMER_PORT). Default is "8001".

## Dispatcher

The routers use a dispatcher to send messages. The dispatcher has design principals and features that are opinionated and may not be appropriate for every project, so I broke it out into a separate class so that it could be easily replaced. The concept is that when the router has a message it can hand it off to the dispatcher and the dispatcher will figure out how to deliver it.

The dispatcher included with this project was designed this way:

-   At-Most-Once Delivery - Message delivery is not guaranteed, but a message won't be sent more than once. If a TCP channel is open to the consumer, the message will be sent (whether it was live or buffered) without care for whether it was accepted or not.

-   No Receipts - Messages are sent but there is no acknowledgement that they were received.

-   Fast Delivery - Messages are delivered immediately if possible (they are not buffered and flushed).

-   Wait for Connect - If there is not an open TCP channel to the correct consumer, the message will be buffered until a connection is established.

-   Addressing - The dispatcher manages all mapping so it can address messages to the correct client based on ICAO. This also means that if addressing changes, the messages held in the buffer will also be readdressed.

-   No Order Guarantee - The order by which messages are delivered is not guaranteed.

-   Stateless - Messages in the buffer are not persisted, if the router crashes, the buffered messages are lost.

-   Rejection - A consumer might reject a message because it doesn't own the partition that the message was addressed to. If the dispatcher receives a rejected message, it will invalidate that map, ask for a new map, and buffer the message for delivery after the new map is obtained.

## Failure

Perhaps the best way to host this pattern would be to deploy each role as a container via an orchestrator. You would deploy:

-   "x" instances of routers where x <= the number of source partitions.
-   "y" instances of consumers based on how much compute is necessary.
-   1 instance of a coordinator.

You should configure a restart policy such that any time a container is terminated, a new one is created to replace it.

### Router

A down router could result in some data loss as the buffer might contain messages.

If the router came back fast enough (before a rebalance), the router would get the same partitions assigned and should start dispatching and buffering messages again. A router identifies a client as being the "same" if it has the same CLIENT_ID.

If the router is down when the coordinator rebalances, it will reassign the partitions for the router to other routers.

### Consumer

A router attempts to send messages to the consumer that hosts the necessary partition. However, if that delivery could not happen because the consumer was unavailable, that message will be buffered. Buffered messages will be flushed (if possible) every so often (configurable time).

If a consumer came back fast enough (before a rebalance), it will be assigned the same partitions and the messages will be dispatched from routers as soon as the buffer flush happens (though the order of the messages is not guaranteed).

If the consumer is down when the coordinator rebalances, it will reassign the partitions for the consumer to other consumers. As soon as they are reassigned, a broadcast message to the routers will update them with the new mappings. If the consumer comes back later, it will get some partitions on the next rebalance, though not necessarily the ones it had before.

### Coordinator

To keep things simple, this pattern implements a single coordinator. There are some mitigations in place to ensure this doesn't hamper the successful distribution of data:

-   The routers can continue to send messages to the consumers that they have mapped, they just won't get new maps.

-   The routers will buffer messages for a configurable period of time if they cannot be dispatched (for example, if they don't have a map to an appropriate consumer).

-   The coordinator starts up in Learning Mode for a configurable number of milliseconds (1 minute by default). While in Learning Mode, the coordinator will not rebalance and will ask clients as they connect which partitions they were assigned and accept that. Of course, once Learning Mode is done and it starts to rebalance, it will follow the normal rules. This is fine because it will only move partitions that need to move because of imbalance.

The combination of these features mean that messages will still continue to flow as long as the routers and consumers don't change. It also means when the coordinator is restored, it should be minimally disruptive. While the coordinator is unavailable, the routers will not get new maps and partitions will not be reassigned.
