import {
    MuStruct,
    MuInt8,
    MuString,
    MuArray,
    MuVoid,
} from 'muschema';

export const RPCSchema = {
    client: {

    },
    server: {
        combine: {
            0: new MuArray(new MuInt8()),
            1: new MuInt8(),
        },
        square: {
            0: new MuInt8(),
            1: new MuVoid(),
        },
    },
};
