import { MuSchema } from './schema';
import { MuWriteStream, MuReadStream } from 'mustreams';

import {
    muType2ReadMethod,
    muType2WriteMethod,
    primitiveMuTypes,
} from './constants';

export type _MuArrayType<ValueSchema extends MuSchema<any>> = ValueSchema['identity'][];

export class MuArray<ValueSchema extends MuSchema<any>>
        implements MuSchema<_MuArrayType<ValueSchema>> {
    public readonly identity:_MuArrayType<ValueSchema> = [];
    public readonly muType = 'array';
    public readonly muData:ValueSchema;
    public readonly json:object;

    constructor(valueSchema:ValueSchema, id?:_MuArrayType<ValueSchema>) {
        this.identity = id || [];
        this.muData = valueSchema;
        this.json = {
            type: 'array',
            valueType: this.muData.json,
            identity: JSON.stringify(this.diff([], this.identity)),
        };
    }

    public alloc () : _MuArrayType<ValueSchema> { return []; }

    public free (x:_MuArrayType<ValueSchema>) : void {
        const valueSchema = this.muData;
        switch (valueSchema.muType) {
            case 'boolean':
            case 'float32':
            case 'float64':
            case 'int8':
            case 'int16':
            case 'int32':
            case 'string':
            case 'uint8':
            case 'uint16':
            case 'uint32':
                break;
            default:
                for (let i = 0; i < x.length; ++i) {
                    valueSchema.free(x[i]);
                }
        }
    }

    public clone (x:_MuArrayType<ValueSchema>) : _MuArrayType<ValueSchema> {
        const result = new Array(x.length);

        const schema = this.muData;
        switch (schema.muType) {
            case 'boolean':
            case 'float32':
            case 'float64':
            case 'int8':
            case 'int16':
            case 'int32':
            case 'string':
            case 'uint8':
            case 'uint16':
            case 'uint32':
                for (let i = 0; i < x.length; ++i) {
                    result[i] = x[i];
                }
                break;
            default:
                for (let i = 0; i < x.length; ++i) {
                    result[i] = schema.clone(x[i]);
                }
        }

        return result;
    }

    public diffBinary (
        base:_MuArrayType<ValueSchema>,
        target:_MuArrayType<ValueSchema>,
        stream:MuWriteStream,
    ) : boolean {
        stream.grow(this.getByteLength(target));

        const prefixOffset = stream.offset;
        const targetLength = target.length;
        stream.writeUint32(targetLength);

        let trackerOffset = stream.offset;
        const numTrackers = Math.ceil(targetLength / 8);
        stream.offset = trackerOffset + numTrackers;

        let tracker = 0;
        let numPatch = 0;

        const baseLength = base.length;
        const valueSchema = this.muData;
        for (let i = 0; i < Math.min(baseLength, targetLength); ++i) {
            if (valueSchema.diffBinary!(base[i], target[i], stream)) {
                tracker |= 1 << (i & 7);
                ++numPatch;
            }

            if ((i & 7) === 7) {
                stream.writeUint8At(trackerOffset++, tracker);
                tracker = 0;
            }
        }

        for (let i = baseLength; i < targetLength; ++i) {
            if (valueSchema.diffBinary!(valueSchema.identity, target[i], stream)) {
                tracker |= 1 << (i & 7);
                ++numPatch;
            }

            if ((i & 7) === 7) {
                stream.writeUint8At(trackerOffset++, tracker);
                tracker = 0;
            }
        }

        if (targetLength & 7) {
            stream.writeUint8At(trackerOffset, tracker);
        }

        if (numPatch > 0 || baseLength !== targetLength) {
            return true;
        }
        stream.offset = prefixOffset;
        return false;
    }

    public patchBinary (
        base:_MuArrayType<ValueSchema>,
        stream:MuReadStream,
    ) : _MuArrayType<ValueSchema> {
        const result = this.clone(base);

        const targetLength = stream.readUint32();
        result.length = targetLength;

        let trackerOffset = stream.offset;
        const numTrackers = Math.ceil(targetLength / 8);
        stream.offset = trackerOffset + numTrackers;

        let tracker = 0;

        const baseLength = base.length;
        const valueSchema = this.muData;
        for (let i = 0; i < Math.min(baseLength, targetLength); ++i) {
            const mod8 = i & 7;

            if (!mod8) {
                tracker = stream.readUint8At(trackerOffset++);
            }

            if ((1 << mod8) & tracker) {
                result[i] = valueSchema.patchBinary!(base[i], stream);
            }
        }

        for (let i = baseLength; i < targetLength; ++i) {
            const mod8 = i & 7;

            if (!mod8) {
                tracker = stream.readUint8At(trackerOffset++);
            }

            if ((1 << mod8) & tracker) {
                result[i] = valueSchema.patchBinary!(valueSchema.identity, stream);
            } else {
                result[i] = valueSchema.clone(valueSchema.identity);
            }
        }

        return result;
    }

    public getByteLength (x:_MuArrayType<ValueSchema>) : number {
        const length = x.length;
        const numTrackers = Math.ceil(length / 8);

        const META_BYTES = 8;
        let result = META_BYTES + numTrackers;

        const valueSchema = this.muData;
        switch (valueSchema.muType) {
            case 'boolean':
            case 'int8':
            case 'uint8':
                result += length;
            case 'int16':
            case 'uint16':
                result += length * 2;
            case 'float32':
            case 'int32':
            case 'uint32':
                result += length * 4;
            case 'float64':
                result += length * 8;
            default:
                for (let i = 0; i < length; ++i) {
                    result += valueSchema.getByteLength!(x[i]);
                }
        }

        return result;
    }

    public diff(base:_MuArrayType<ValueSchema>, target:_MuArrayType<ValueSchema>) {
        const schema = this.muData;
        const result = new Array(target.length);
        let changed = base.length !== target.length;
        for (let i = 0; i < target.length; ++i) {
            if (i < base.length) {
                const p = schema.diff(base[i], target[i])
                if (typeof p !== undefined) {
                    changed = true;
                }
                result[i] = p;
            } else {
                result[i] = schema.diff(schema.identity, target[i]);
            }
        }
        if (changed) {
            return result;
        }
        return;
     }

    public patch(base:_MuArrayType<ValueSchema>, patch:any[]|undefined) {
        if (!patch) {
            return this.clone(base);
        }
        const result:_MuArrayType<ValueSchema> = new Array(patch.length);
        const schema = this.muData;
        for (let i = 0; i < patch.length; ++i) {
            const x = patch[i];
            if (x === undefined || x === null) {
                if (i < base.length) {
                    result[i] = schema.clone(base[i]);
                } else {
                    result[i] = schema.clone(schema.identity);
                }
            } else {
                if (i < base.length) {
                    result[i] = schema.patch(base[i], x);
                } else {
                    result[i] = schema.patch(schema.identity, x);
                }
            }
        }
        return result;
     }
}
