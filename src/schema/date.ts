import { MuWriteStream, MuReadStream } from '../stream';
import { MuSchema } from './schema';

export class MuDate implements MuSchema<Date> {
    public readonly muType = 'date';
    public readonly identity:Date;
    public readonly json;
    public pool:Date[] = [];

    constructor (identity?:Date) {
        this.identity = new Date();
        if (identity) {
            this.identity.setTime(identity.getTime());
        }
        this.json = {
            type: 'date',
            identity: this.identity.toISOString(),
        };
    }

    public alloc () : Date {
        return this.pool.pop() || new Date();
    }

    public free (date:Date) {
        this.pool.push(date);
    }

    public equal (a:Date, b:Date) : boolean {
        return a.getTime() === b.getTime();
    }

    public clone (date_:Date) : Date {
        const date = this.alloc();
        date.setTime(date_.getTime());
        return date;
    }

    public assign (dst:Date, src:Date) {
        dst.setTime(src.getTime());
    }

    public diff (base:Date, target:Date, out:MuWriteStream) : boolean {
        const bTime = base.getTime();
        const tTime = target.getTime();
        if (bTime === tTime) {
            return false;
        }

        out.grow(32);
        out.writeASCII(target.toISOString());
        return true;
    }

    public patch (base:Date, inp:MuReadStream) : Date {
        const date = this.alloc();
        date.setTime(Date.parse(inp.readASCII(24)));
        return date;
    }

    public toJSON (date:Date) : string {
        return date.toISOString();
    }

    public fromJSON (json:string) : Date {
        const date = this.alloc();
        date.setTime(Date.parse(json));
        return date;
    }
}
