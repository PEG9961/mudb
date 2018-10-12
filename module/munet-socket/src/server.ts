import tcp = require('net');
import udp = require('dgram');

import {
    MuSocketServer,
    MuSocketServerState,
    MuSocketServerSpec,
    MuSocket,
    MuSocketState,
    MuSocketSpec,
    MuSessionId,
    MuData,
    MuMessageHandler,
    MuCloseHandler,
} from 'mudb/socket';

import { isJSON } from './util';

function noop () { }

class MuNetSocketClient implements MuSocket {
    public readonly sessionId:MuSessionId;
    public state = MuSocketState.INIT;

    private _reliableSocket:tcp.Socket;

    private _unreliableSocket:udp.Socket;
    private _remotePort:number;
    private _remoteAddr:string;

    private _pendingMessages:MuData[] = [];

    public onmessage:MuMessageHandler = noop;
    private _onclose:MuCloseHandler = noop;

    constructor (
        sessionId:MuSessionId,
        reliableSocket:tcp.Socket,
        unreliableSocket:udp.Socket,
        remotePort:number,
        remoteAddr:string,
        removeConnection:() => void,
    ) {
        this.sessionId = sessionId;
        this._reliableSocket = reliableSocket;
        this._unreliableSocket = unreliableSocket;
        this._remotePort = remotePort;
        this._remoteAddr = remoteAddr;

        this._reliableSocket.on('data', (data) => {
            if (typeof data === 'string') {
                this._pendingMessages.push(data);
            } else {
                // make a copy in case buffer is reused
                this._pendingMessages.push(new Uint8Array(data.buffer).slice(0));
            }
        });
        this._reliableSocket.on('close', (hadError) => {
            // in case of errors
            this.state = MuSocketState.CLOSED;

            this._onclose();
            removeConnection();
            if (hadError) {
                console.error('mudb/net-socket: socket was closed due to a transmission error');
            }
        });
    }

    public open (spec:MuSocketSpec) {
        if (this.state !== MuSocketState.INIT) {
            throw new Error('mudb/net-socket: socket was already opened');
        }

        setTimeout(
            () => {
                const onmessage = this.onmessage = spec.message;
                this._onclose = spec.close;
                this.state = MuSocketState.OPEN;

                spec.ready();

                this._reliableSocket.on('data', (data) => {
                    if (this.state !== MuSocketState.OPEN) {
                        return;
                    }

                    if (typeof data === 'string') {
                        onmessage(data, false);
                    } else {
                        onmessage(new Uint8Array(data.buffer), false);
                    }
                });

                for (let i = 0; i < this._pendingMessages.length; ++i) {
                    onmessage(this._pendingMessages[i], false);
                }
                this._pendingMessages.length = 0;
            },
            0,
        );
    }

    public send (data:MuData, unreliable?:boolean) {
        if (this.state !== MuSocketState.OPEN) {
            return;
        }

        if (unreliable) {
            this._unreliableSocket.send(data, this._remotePort, this._remoteAddr);
        } else {
            this._reliableSocket.write(data);
        }
    }

    public close () {
        if (this.state === MuSocketState.CLOSED) {
            return;
        }

        this.state = MuSocketState.CLOSED;
        this._reliableSocket.end();
    }
}

export class MuNetSocketServer implements MuSocketServer {
    public state = MuSocketServerState.INIT;
    public clients:MuSocket[] = [];

    private _tcpServer:tcp.Server;
    private _udpServer:udp.Socket;

    private _unreliableMsgHandlers:{ [url:string]:(buf:Buffer) => void } = {};

    private _onclose:MuCloseHandler;

    constructor (spec:{
        tcpServer:tcp.Server,
        udpServer:udp.Socket,
    }) {
        this._tcpServer = spec.tcpServer;
        this._udpServer = spec.udpServer;
    }

    public start (spec:MuSocketServerSpec) {
        if (this.state !== MuSocketServerState.INIT) {
            throw new Error('mudb/net-socket: server was already started');
        }

        setTimeout(
            () => {
                this._tcpServer.on('connection', (socket) => {
                    socket.once('data', (data) => {
                        try {
                            if (typeof data !== 'string') {
                                throw new Error('first packet was not string');
                            }

                            const clientInfo = JSON.parse(data);
                            if (typeof clientInfo.i !== 'string' ||
                                typeof clientInfo.p !== 'number' ||
                                typeof clientInfo.a !== 'string') {
                                throw new Error('bad client info');
                            }

                            const udpServerInfo = this._udpServer.address();
                            socket.write(JSON.stringify({
                                p: udpServerInfo.port,
                                a: udpServerInfo.address,
                            }));

                            const url = `${clientInfo.a}:${clientInfo.p}`;
                            const client = new MuNetSocketClient(
                                clientInfo.i,
                                socket,
                                this._udpServer,
                                clientInfo.p,
                                clientInfo.a,
                                () => {
                                    this.clients.splice(this.clients.indexOf(client), 1);
                                    delete this._unreliableMsgHandlers[url];
                                },
                            );
                            this.clients.push(client);

                            this._unreliableMsgHandlers[url] = function (msg) {
                                if (client.state !== MuSocketState.OPEN) {
                                    return;
                                }

                                if (isJSON(msg)) {
                                    client.onmessage(msg.toString(), true);
                                } else {
                                    client.onmessage(new Uint8Array(msg.buffer), true);
                                }
                            };

                            spec.connection(client);
                        } catch (e) {
                            console.error(`mudb/net-socket: destroying socket due to ${e}`);
                            socket.destroy();
                        }
                    });
                });

                this._udpServer.on('message', (msg, client) => {
                    const onmessage = this._unreliableMsgHandlers[`${client.address}:${client.port}`];
                    if (typeof onmessage === 'function') {
                        onmessage(msg);
                    }
                });

                this._onclose = spec.close;
                this.state = MuSocketServerState.RUNNING;

                spec.ready();
            },
            0,
        );
    }

    public close () {
        if (this.state === MuSocketServerState.SHUTDOWN) {
            return;
        }

        this.state = MuSocketServerState.SHUTDOWN;
        this._tcpServer.close(this._onclose);
        this._udpServer.close();
    }
}
