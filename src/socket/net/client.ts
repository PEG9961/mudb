import tcp = require('net');
import udp = require('dgram');

import {
    MuSocket,
    MuSocketState,
    MuSocketSpec,
    MuSessionId,
    MuData,
} from '../../socket';

import { messagify, isJSON } from './util';

export class MuNetSocket implements MuSocket {
    public readonly sessionId:MuSessionId;

    private _state = MuSocketState.INIT;
    get state () : MuSocketState {
        return this._state;
    }

    private _reliableSocket:tcp.Socket;
    private _connectOpts:tcp.TcpSocketConnectOpts;

    private _unreliableSocket:udp.Socket;
    private _bindOpts:udp.BindOptions;
    private _remotePort:number;
    private _remoteAddr:string;

    constructor (spec:{
        sessionId:MuSessionId,
        connectOpts:tcp.TcpSocketConnectOpts,
        bindOpts:udp.BindOptions,
        tcpSocket?:tcp.Socket,
        udpSocket?:udp.Socket,
    }) {
        this.sessionId = spec.sessionId;

        this._reliableSocket = spec.tcpSocket || new tcp.Socket();
        this._connectOpts = spec.connectOpts;

        this._unreliableSocket = spec.udpSocket || udp.createSocket({
            type: 'udp4',
            reuseAddr: true,
        });
        this._bindOpts = spec.bindOpts;
    }

    public open (spec:MuSocketSpec) {
        if (this._state !== MuSocketState.INIT) {
            throw new Error('mudb/net-socket: socket was already opened');
        }

        const onmessage = spec.message;

        this._reliableSocket.connect(
            this._connectOpts,
            () => {
                this._reliableSocket.setNoDelay(true);
                messagify(this._reliableSocket);

                this._reliableSocket.once('message', (info) => {
                    if (this._state !== MuSocketState.INIT) {
                        return;
                    }

                    const serverInfo = JSON.parse(info.toString());
                    if (typeof serverInfo.p !== 'number' ||
                        typeof serverInfo.a !== 'string') {
                        throw new Error('mudb/net-socket: bad server info');
                    }

                    this._remotePort = serverInfo.p;
                    this._remoteAddr = serverInfo.a;

                    this._state = MuSocketState.OPEN;

                    this._reliableSocket.on('message', (msg) => {
                        if (this._state !== MuSocketState.OPEN) {
                            return;
                        }

                        if (isJSON(msg)) {
                            onmessage(msg.toString(), false);
                        } else {
                            onmessage(new Uint8Array(msg), false);
                        }
                    });
                    this._reliableSocket.on('close', (hadError) => {
                        // in case of errors
                        this._state = MuSocketState.CLOSED;

                        spec.close();
                        if (hadError) {
                            console.error('mudb/net-socket: socket was closed due to a transmission error');
                        }
                    });

                    spec.ready();
                });

                this._unreliableSocket.bind(
                    this._bindOpts,
                    () => {
                        this._unreliableSocket.on('message', (msg) => {
                            if (this._state !== MuSocketState.OPEN) {
                                return;
                            }

                            if (isJSON(msg)) {
                                onmessage(msg.toString(), true);
                            } else {
                                onmessage(new Uint8Array(msg), true);
                            }
                        });

                        const socketInfo = this._unreliableSocket.address();
                        this._reliableSocket.write(JSON.stringify({
                            i: this.sessionId,
                            p: socketInfo.port,
                            a: socketInfo.address,
                        }));
                    },
                );
            },
        );
    }

    public send (data:MuData, unreliable?:boolean) {
        if (this._state !== MuSocketState.OPEN) {
            return;
        }

        if (unreliable) {
            const buf = Buffer.from(data);
            this._unreliableSocket.send(buf, 0, buf.length, this._remotePort, this._remoteAddr);
        } else {
            this._reliableSocket.write(data);
        }
    }

    public close () {
        if (this._state === MuSocketState.CLOSED) {
            return;
        }

        this._state = MuSocketState.CLOSED;
        this._reliableSocket.end();
        this._unreliableSocket.close();
    }
}
