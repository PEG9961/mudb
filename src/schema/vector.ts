import {
    MuReadStream,
    MuWriteStream,
} from '../stream';
import { MuSchema } from './schema';
import { MuNumber } from './_number';

export interface MuFloat32Array<D extends number> extends Float32Array {
    readonly length:D;
}

export interface MuFloat64Array<D extends number> extends Float64Array {
    readonly length:D;
}

export interface MuInt8Array<D extends number> extends Int8Array {
    readonly length:D;
}

export interface MuInt16Array<D extends number> extends Int16Array {
    readonly length:D;
}

export interface MuInt32Array<D extends number> extends Int32Array {
    readonly length:D;
}

export interface MuUint8Array<D extends number> extends Uint8Array {
    readonly length:D;
}

export interface MuUint16Array<D extends number> extends Uint16Array {
    readonly length:D;
}

export interface MuUint32Array<D extends number> extends Uint32Array {
    readonly length:D;
}

export interface MuFloat32ArrayConstructor {
    new<D extends number>(length:D) : MuFloat32Array<D>;
}

export interface MuFloat64ArrayConstructor {
    new<D extends number>(length:D) : MuFloat64Array<D>;
}

export interface MuInt8ArrayConstructor {
    new<D extends number>(length:D) : MuInt8Array<D>;
}

export interface MuInt16ArrayConstructor {
    new<D extends number>(length:D) : MuInt16Array<D>;
}

export interface MuInt32ArrayConstructor {
    new<D extends number>(length:D) : MuInt32Array<D>;
}

export interface MuUint8ArrayConstructor {
    new<D extends number>(length:D) : MuUint8Array<D>;
}

export interface MuUint16ArrayConstructor {
    new<D extends number>(length:D) : MuUint16Array<D>;
}

export interface MuUint32ArrayConstructor {
    new<D extends number>(length:D) : MuUint32Array<D>;
}

export type _Vector<ValueSchema extends MuNumber, D extends number> = {
    float32:MuFloat32Array<D>;
    float64:MuFloat64Array<D>;
    int8:MuInt8Array<D>;
    int16:MuInt16Array<D>;
    int32:MuInt32Array<D>;
    uint8:MuUint8Array<D>;
    uint16:MuUint16Array<D>;
    uint32:MuUint32Array<D>;
}[ValueSchema['muType']];

const muType2TypedArray = {
    float32: <MuFloat32ArrayConstructor>Float32Array,
    float64: <MuFloat64ArrayConstructor>Float64Array,
    int8: <MuInt8ArrayConstructor>Int8Array,
    int16: <MuInt16ArrayConstructor>Int16Array,
    int32: <MuInt32ArrayConstructor>Int32Array,
    uint8: <MuUint8ArrayConstructor>Uint8Array,
    uint16: <MuUint16ArrayConstructor>Uint16Array,
    uint32: <MuUint32ArrayConstructor>Uint32Array,
};

export class MuVector<ValueSchema extends MuNumber, D extends number>
        implements MuSchema<_Vector<ValueSchema, D>> {
    public readonly identity:_Vector<ValueSchema, D>;
    public readonly muType = 'vector';
    public readonly json:object;

    private _constructor:typeof muType2TypedArray[ValueSchema['muType']];
    public readonly dimension:D;

    public pool:_Vector<ValueSchema, D>[] = [];

    constructor (valueSchema:ValueSchema, dimension:D) {
        this._constructor = muType2TypedArray[valueSchema.muType];

        this.identity = new this._constructor(dimension);
        for (let i = 0; i < dimension; ++i) {
            this.identity[i] = valueSchema.identity;
        }

        this.dimension = dimension;
        this.json = {
            type: 'vector',
            valueType: valueSchema.json,
            dimension,
        };
    }

    public alloc () : _Vector<ValueSchema, D> {
        return this.pool.pop() || new this._constructor(this.dimension);
    }

    public free (vec:_Vector<ValueSchema, D>) {
        this.pool.push(vec);
    }

    public equal (a:_Vector<ValueSchema, D>, b:_Vector<ValueSchema, D>) {
        if (!(a instanceof this._constructor) || !(b instanceof this._constructor)) {
            return false;
        }
        if (a.length !== b.length) {
            return false;
        }
        for (let i = a.length - 1; i >= 0 ; --i) {
            if (a[i] !== b[i]) {
                return false;
            }
        }

        return true;
    }

    public clone (vec:_Vector<ValueSchema, D>) : _Vector<ValueSchema, D> {
        const copy = this.alloc();
        copy.set(vec);
        return copy;
    }

    public assign (dst:_Vector<ValueSchema, D>, src:_Vector<ValueSchema, D>) {
        if (dst === src) {
            return;
        }
        dst.set(src);
    }

    public diff (
        base_:_Vector<ValueSchema, D>,
        target_:_Vector<ValueSchema, D>,
        out:MuWriteStream,
    ) : boolean {
        const base = new Uint8Array(base_.buffer);
        const target = new Uint8Array(target_.buffer);

        const dimension = this.identity.byteLength;
        out.grow(Math.ceil(this.identity.byteLength * 9 / 8));

        const headPtr = out.offset;

        let trackerOffset = headPtr;
        out.offset = trackerOffset + Math.ceil(dimension / 8);

        let tracker = 0;
        let numPatch = 0;

        for (let i = 0; i < dimension; ++i) {
            if (base[i] !== target[i]) {
                out.writeUint8(target[i]);
                tracker |= 1 << (i & 7);
                ++numPatch;
            }

            if ((i & 7) === 7) {
                out.writeUint8At(trackerOffset++, tracker);
                tracker = 0;
            }
        }

        if (numPatch === 0) {
            out.offset = headPtr;
            return false;
        }

        if (dimension & 7) {
            out.writeUint8At(trackerOffset, tracker);
        }
        return true;
    }

    public patch (
        base:_Vector<ValueSchema, D>,
        inp:MuReadStream,
    ) : _Vector<ValueSchema, D> {
        const resultArray = this.clone(base);
        const result = new Uint8Array(resultArray.buffer);

        const trackerOffset = inp.offset;
        const trackerBits = this.dimension * this.identity.BYTES_PER_ELEMENT;
        const trackerFullBytes = Math.floor(trackerBits / 8);
        const trackerBytes = Math.ceil(trackerBits / 8);
        inp.offset = trackerOffset + trackerBytes;

        for (let i = 0; i < trackerFullBytes; ++i) {
            const start = i * 8;
            const tracker = inp.readUint8At(trackerOffset + i);

            for (let j = 0; j < 8; ++j) {
                if (tracker & (1 << j)) {
                    result[start + j] = inp.readUint8();
                }
            }
        }

        if (trackerBits & 7) {
            const start = trackerFullBytes * 8;
            const tracker = inp.readUint8At(trackerOffset + trackerFullBytes);
            const partialBits = trackerBits & 7;

            for (let j = 0; j < partialBits; ++j) {
                if (tracker & (1 << j)) {
                    result[start + j] = inp.readUint8();
                }
            }
        }

        return resultArray;
    }

    public toJSON (vec:_Vector<ValueSchema, D>) : number[] {
        const arr = new Array(vec.length);
        for (let i = 0; i < arr.length; ++i) {
            arr[i] = vec[i];
        }
        return arr;
    }

    public fromJSON (json:number[]) : _Vector<ValueSchema, D> {
        const vec = this.alloc();
        for (let i = 0; i < vec.length; ++i) {
            vec[i] = json[i];
        }
        return vec;
    }
}
