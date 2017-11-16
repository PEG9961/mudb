import { MuClient, MuClientProtocol } from 'mudb/client';
import { MuRPCProtocolSchema, MuRPCTable, MuRPCInterface, DefaultRPCSchema } from './rpc';

export class MuRPCRemoteServer<Schema extends MuRPCTable> {
    public readonly rpc:MuRPCInterface<Schema>['callAPI'];

    constructor(schema:MuRPCInterface<Schema>['callAPI']) {
        this.rpc = schema;
    }
}

export class MuRPCClient<Schema extends MuRPCProtocolSchema> {
    public readonly sessionId:string;
    public readonly client:MuClient;
    public readonly schema:Schema;

    public server:MuRPCRemoteServer<Schema['server']>;
    private _protocol:MuClientProtocol<typeof DefaultRPCSchema>;

    public callbacks:{[id:string]:(err, response) => void};
    private counter:number;

    constructor (client:MuClient, schema:Schema) {
        this.client = client;
        this.schema = schema;
        this._protocol = client.protocol(DefaultRPCSchema);
        this.server = new MuRPCRemoteServer(this.createSchemaDispatch(this._protocol, schema.server));
        this.callbacks = {};
        this.counter = 0;
    }

    private createSchemaDispatch(protocol, schema) {
        const result = {};
        Object.keys(schema).forEach((methodName) => {
            result[methodName] = (arg, next) => {
                this.counter ++;
                const id = this.client.sessionId + this.counter;
                this.callbacks[id] = next;
                protocol.server.message.call({id, methodName, arg});
            };
        });
        return result;
    }

    public configure(spec:{
        rpc:MuRPCInterface<Schema['client']>['handlerAPI'];
        ready?:() => void;
        close?:() => void;
    }) {
        this._protocol.configure({
            message: {
                call: ({id, methodName, arg}) => {

                },
                response: ({id, err, response}) => {
                    console.log(this.callbacks);
                    console.log(id);
                    this.callbacks[id](err, response);
                },
            },
            ready: () => {
                if (spec && spec.ready) {
                    spec.ready();
                }
            },
            close: () => {
                if (spec && spec.close) {
                    spec.close();
                }
            },
        });
    }
}
