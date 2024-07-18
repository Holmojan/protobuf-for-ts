
import * as iconv from "./../predefine/iconv.js";

export const bool = function(): boolean { return false; }
export const int32 = function(): number { return 0; }
export const uint32 = function(): number { return 0; }
export const sint32 = function(): number { return 0; }
export const fixed32 = function(): number { return 0; }
export const sfixed32 = function(): number { return 0; }
export const int64 = function(): bigint { return 0n; }
export const uint64 = function(): bigint { return 0n; }
export const sint64 = function(): bigint { return 0n; }
export const fixed64 = function(): bigint { return 0n; }
export const sfixed64 = function(): bigint { return 0n; }
export const float = function(): number { return 0; }
export const double = function(): number { return 0; }
export const string = function(): string { return ""; }
export const bytes = function(): Uint8Array { return new Uint8Array(); }

enum member_style{
    optional,
    repeated,
    repeated_packed,
    map
}

interface member_describe {
    type: string;
    name: string;
    num: number;
    style: member_style;
    wire_type: number;
    charset: string;
};

interface msg_declare {
    con: any;
    members: member_describe[];
};
//let _type_describe_map = {}
let _msg_declare_map = new Map<string, msg_declare>();

export interface param {
    init?: boolean,
    charset?: "utf8"|"gb2312",
}

const defcharset = "utf8";

function new_type_describe(
    type: string,
    name: string,
    num: number,
    style: member_style,
    wire_type: number,
    charset: string): member_describe
{
    let td = {
        type: type,
        name: name,
        num: num,
        style: style,
        wire_type: wire_type,
        charset: charset
    }

    //_type_describe_map[type] = td;
    return td;
}


function get_wire_type(type:string):number {
    switch (type) {
        case "bool":
        case "int32":
        case "int64":
        case "uint32":
        case "uint64":
        case "sint32":
        case "sint64":
            return 0;
        case "fixed64":
        case "sfixed64":
        case "double":
            return 1;
        case "fixed32":
        case "sfixed32":
        case "float":
            return 5;
        case "string":
        case "bytes":
            return 2;
    };
    return -1;
}

function raw_message(name:string, ...members:member_describe[]): void {
    _msg_declare_map.set(name, { con: null, members: members });
}

function raw_optional(type:string, name:string, num:number, charset: string): member_describe {
    let wire_type = get_wire_type(type);
    return new_type_describe(type, name, num, member_style.optional, (wire_type>=0 ? wire_type : 2), charset);
}

function raw_repeated(type:string, name:string, num:number, charset: string): member_describe {
    let wire_type = get_wire_type(type);
    return new_type_describe(type, name, num, member_style.repeated, (wire_type>=0 ? wire_type : 2), charset);
}

function raw_map(key:string, value:string, name:string, num:number, charset: string): member_describe {
    raw_message(`pair<${key}, ${value}>`,
        raw_optional(key, "key", 1, charset),
        raw_optional(value, "value", 2, charset)
    );
    return new_type_describe(`pair<${key}, ${value}>`, name, num, member_style.map, 2, charset);
}

let _msg_declare_members: member_describe[] = null;

export function message(type: Function) {
    _msg_declare_members = [];
    let con = type.prototype.constructor;
    let obj = new con();
    let props = Object.getOwnPropertyNames(obj);
    for(let i=0;i<props.length;i++){
        _msg_declare_members[i].name = props[i];
    }
    _msg_declare_map.set(type.name, { con: con, members: _msg_declare_members });
    _msg_declare_members = null;
}

export function optional<T>(type: (() => T) | (new() => T), num: number, param: param = null): T {
    let type_name = type.name;
    let wire_type = get_wire_type(type_name);
    if (_msg_declare_members) {
        let charset = (param ? param.charset : defcharset);
        let member = new_type_describe(type_name, /*name*/"", num, 
            member_style.optional, (wire_type>=0 ? wire_type : 2), charset);
        _msg_declare_members.push(member);
    }
    if (param && param.init){
        if (wire_type>=0){
            return (type as (() => T))();
        }
        else {
            return new (type as (new() => T))();
        } 
    } 
    return null;
}

export function repeated<T>(type: (() => T) | (new() => T), num: number, param: param = null): T[] {
    let type_name = type.name;
    let wire_type = get_wire_type(type_name);
    if (_msg_declare_members) {
        let charset = (param ? param.charset : defcharset);
        let member = new_type_describe(type_name, /*name*/"", num, 
            member_style.repeated, (wire_type>=0 ? wire_type : 2), charset);
        _msg_declare_members.push(member);
    }
    return [];
}

export function map<K, V>(key:(() => K), value:(() => V) | (new() => V), num: number, param: param = null): {} {
    if (_msg_declare_members) {
        let key_type = key.name;
        let value_type = value.name;
        let charset = (param ? param.charset : defcharset);
        raw_message(`pair<${key_type}, ${value_type}>`,
            raw_optional(key_type, "key", 1, charset),
            raw_optional(value_type, "value", 2, charset)
        );
        let member = new_type_describe(`pair<${key_type}, ${value_type}>`, /*name*/"", num, member_style.map, 2, charset);
        _msg_declare_members.push(member);
    }
    return {};
}

enum IntType{
    Int8,
    Int16,
    Int32,
    Int64,
    UInt8,
    UInt16,
    UInt32,
    UInt64,
}

function get_int_size(it:IntType) {
    switch(it){
        case IntType.Int8:
        case IntType.UInt8:
            return 1;
        case IntType.Int16:
        case IntType.UInt16:
            return 2;
        case IntType.Int32:
        case IntType.UInt32:
            return 4;
        case IntType.Int64:
        case IntType.UInt64:
            return 8;
    }
}

class BinaryStream {
    private buff:Uint8Array;
    private view:DataView;
    private length:number;
    private pos:number;

    constructor() {
        this.buff = new Uint8Array(64);
        this.view = new DataView(this.buff.buffer);
        this.length = 0
        this.pos = 0
    }

    private ReSize(new_length:number) 
    {
        if(new_length <= this.length){
            return;
        }

        if(new_length <= this.view.byteLength){
            this.length = new_length;
            return;
        }

        let buff_length = this.view.byteLength;
        while(new_length > buff_length){
            buff_length *= 2;
        }

        var buff = new Uint8Array(buff_length);
        for(let i=0; i<this.length; i++){
            buff[i] = this.view.getUint8(i);
        }

        this.buff = buff;
        this.view = new DataView(buff.buffer);
        this.length = new_length;
    }

    GetPos():number{
        return this.pos;
    }
    SetPos(pos:number){
        this.pos = pos;
    }

    GetLength():number{
        return this.length;
    }

    GetBuffer():Uint8Array{
        return this.buff.slice(0, this.pos);
    }

    ReadInt(it:IntType):bigint|number
    {
        let pos = this.pos;
        this.pos += get_int_size(it);
        switch(it)
        {
            case IntType.Int8:
                return this.view.getInt8(pos);
            case IntType.Int16:
                return this.view.getInt16(pos, true);
            case IntType.Int32:
                return this.view.getInt32(pos, true);
            case IntType.Int64:
                return this.view.getBigInt64(pos, true);
            case IntType.UInt8:
                return this.view.getUint8(pos);
            case IntType.UInt16:
                return this.view.getUint16(pos, true);
            case IntType.UInt32:
                return this.view.getUint32(pos, true);
            case IntType.UInt64:
                return this.view.getBigUint64(pos, true);
        }
    }

    ReadFloat():number{
        let v = this.view.getFloat32(this.pos, true);
        this.pos += 4;
        return v;
    }
    ReadDouble():number{
        let v = this.view.getFloat64(this.pos, true);
        this.pos += 8;
        return v;
    }

    ReadVarints():bigint
    {
        let v = 0n;
        
        for (let i = 0n; true; i += 7n)
        {
            let t = BigInt(this.ReadInt(IntType.UInt8));
            v |= (t & 0x7Fn) << i;

            if (!((t & 0x80n) > 0)) {
                break;
            }
        }
        return v;
    }

    ReadBuffer():Uint8Array
    {
        let l=this.ReadVarints();
        let bs = new BinaryStream();
        for (let i=0; i<l; i++) {
            bs.WriteInt(this.ReadInt(IntType.UInt8),IntType.UInt8);
        }
        return bs.GetBuffer();
    }

    WriteInt(v:number|bigint, it:IntType)
    {
        let pos = this.pos;
        this.ReSize(pos + get_int_size(it));
        this.pos += get_int_size(it);
        switch(it)
        {
            case IntType.Int8:
                return this.view.setInt8(pos, Number(v));
            case IntType.Int16:
                return this.view.setInt16(pos, Number(v), true);
            case IntType.Int32:
                return this.view.setInt32(pos, Number(v), true);
            case IntType.Int64:
                return this.view.setBigInt64(pos, BigInt(v), true);
            case IntType.UInt8:
                return this.view.setUint8(pos, Number(v));
            case IntType.UInt16:
                return this.view.setUint16(pos, Number(v), true);
            case IntType.UInt32:
                return this.view.setUint32(pos, Number(v), true);
            case IntType.UInt64:
                return this.view.setBigUint64(pos, BigInt(v), true);
        }
    }
    
    WriteFloat(v:number){
        this.ReSize(this.pos + 4);
        this.view.setFloat32(this.pos, v, true);
        this.pos += 4;
    }
    WriteDouble(v:number){
        this.ReSize(this.pos + 8);
        this.view.setFloat64(this.pos, v, true);
        this.pos += 8;
    }

    WriteVarints(v:number|bigint)
    {
        let t = (BigInt(v) & 0xFFFFFFFFFFFFFFFFn);

        do
        {
            let b = (t & 0x7Fn);
            t >>= 7n;
            if(t > 0){
                b |= 0x80n;
            }

            this.WriteInt(b, IntType.UInt8);

        }while(t > 0);
    }

    WriteBuffer(buff:Uint8Array)
    {
        this.WriteVarints(buff.byteLength);
        for(let i=0;i<buff.byteLength;i++){
            this.WriteInt(buff[i], IntType.UInt8);
        }
    }
};

function zig_zag(n:bigint|number):bigint {
    let v = BigInt(n);
    v = (v << 1n) ^ ((v >> 63n) & 1n);
    return (v & 0xFFFFFFFFFFFFFFFFn);
}

function inv_zig_zag(n:bigint|number):bigint {
    let v = (BigInt(n) & 0xFFFFFFFFFFFFFFFFn);
    v = (v >> 1n) ^ (0n - (v & 1n));
    return v;
}
/*
export function from_string(s:string, charset:string):Uint8Array
{
    let bs = new BinaryStream();
    for(let i=0; i<s.length; i++)
    {
        let unicode = (s.charCodeAt(i) & 0xffff);
        if (unicode >= 0xD800 && unicode <= 0xDFFF)
        {
            if (unicode >= 0xDC00) {
                console.error("not legitimate unicode!");
                return null;
            }

            i++;
            if (!(i < s.length)) {
                console.error("not legitimate unicode!");
                return null;
            }

            let unicode2 = (s.charCodeAt(i) & 0xffff);
            if (!(unicode2 >= 0xDC00 && unicode2 <= 0xDFFF)) {
                console.error("not legitimate unicode!");
                return null;
            }
            unicode = (unicode2 & 0x03FF) + (((unicode & 0x03FF) + 0x40) << 10);
        }

        let buff = new Uint8Array(32);
        let bytes = 0;
        if (unicode > 0x7F) {
            while (unicode > 0x3F) {
                buff[bytes++] = (unicode & 0x3F | 0x80);
                unicode >>>= 6;
            }
        }
        buff[bytes++] = unicode;
        if(bytes > 1) {
            buff[bytes-1] |= ((1<<bytes)-1)<<(8-bytes);
        }

        if(bytes > 6) {
            console.error("not legitimate unicode!");
            return null;
        }

        for(let j=bytes-1; j>=0; j--){
            bs.WriteInt(buff[j], IntType.UInt8);
        }
    }

    return bs.GetBuffer();
}

export function to_string(buff:Uint8Array, charset:string) : string 
{
    let str = "";
    let codes = new Array<number>();
    
    for(let i=0; i<buff.byteLength; )
    {
        let c = buff[i];
        if(0 == c){
            break;
        }

        let unicode = 0;
        let bytes = 1;
        for(let j=7;j>0;j--){
            if((c>>j & 1)>0){
                bytes++;
            }
            else{
                unicode = (c & (1<<j)-1);
                break;
            }
        }

        if(bytes > 6) {
            console.error("not legitimate utf8!");
            return null;
        }

        for (let j = 1; j < bytes; j++) {
            if (i+j >= buff.byteLength) {
                console.error("not legitimate utf8!");
                return null
            }
            c = buff[i+j];
            if ((c >> 6) != 2) {
                console.error("not legitimate utf8!");
                return null
            }
            unicode = ((unicode << 6) | (c & 0x3F));
        }

        if (unicode <= 0xFFFF) {
            codes.push(unicode);
        }
        else if (unicode <= 0xEFFFF) {
            codes.push(0xD800 + (unicode >> 10) - 0x40);  // high
            codes.push(0xDC00 + (unicode & 0x03FF));      // low
        }
        else {
            console.error("not legitimate utf8!");
            return null;
        }

        if(codes.length > 64){
            str += String.fromCharCode.apply(null, codes);
            codes = new Array<number>();
        }
        i += bytes;
    }
    
    return str + String.fromCharCode.apply(null, codes);
}
*/

function serialize(msg:string, obj:any, bs:BinaryStream, charset:string): boolean
 {
    if (obj == undefined) {
        console.error(`access null when serialize type "${msg}"!`);
        return false;
    }

    let wire_type = get_wire_type(msg);
    if (wire_type >= 0) 
    {
        switch(msg)
        {
            case "bool":    bs.WriteInt((obj ? 1 : 0), IntType.UInt8);          break;
            case "int32":   bs.WriteVarints(obj);                               break;
            case "uint32":  bs.WriteVarints(obj);                               break;
            case "sint32":  bs.WriteVarints(zig_zag(obj));                      break;
            case "fixed32": bs.WriteInt(obj, IntType.UInt32);                   break;
            case "sfixed32":bs.WriteInt(zig_zag(obj), IntType.UInt32);          break;
            case "int64":   bs.WriteVarints(obj);                               break;
            case "uint64":  bs.WriteVarints(obj);                               break;
            case "sint64":  bs.WriteVarints(zig_zag(obj));                      break;
            case "fixed64": bs.WriteInt(obj, IntType.UInt64);                   break;
            case "sfixed64":bs.WriteInt(zig_zag(obj), IntType.UInt64);          break;
            case "float":   bs.WriteFloat(obj);                                 break;
            case "double":  bs.WriteDouble(obj);                                break;
            case "string":  bs.WriteBuffer(iconv.from_string(obj, charset));    break;
            case "bytes":   bs.WriteBuffer(obj);                                break;
        }

        return true;
    }

    let def = _msg_declare_map.get(msg);
    if (def == undefined) {
        console.error(`msg declare "${msg}" can not find!`);
        return false;
    }
    else
    {
        let bs2 = new BinaryStream();
        for (let member_desc of def.members) {
            let member = obj[member_desc.name];
            if(member == undefined) {
                continue;
            }
    
            let tag = (member_desc.num << 3) | member_desc.wire_type;
            switch(member_desc.style) {
                case member_style.optional:
                    bs2.WriteVarints(tag);
                    if(!serialize(member_desc.type, member, bs2, member_desc.charset)) {
                        return false;
                    }
                    break;
                case member_style.repeated:
                    if(!Array.isArray(member)){
                        console.error(`obj member "${member_desc.name}" is not array!`);
                        return false;
                    }
                    for(let item of member) {
                        bs2.WriteVarints(tag);
                        if(!serialize(member_desc.type, item, bs2, member_desc.charset)) {
                            return false;
                        }
                    }
                    break;
                case member_style.repeated_packed:
                    if(!Array.isArray(member)){
                        console.error(`obj member "${member_desc.name}" is not array!`);
                        return false;
                    }
                    tag = (member_desc.num << 3) | 2;
                    let bs3 = new BinaryStream();
                    bs3.WriteVarints(tag);
                    for(let item of member) {
                        if(!serialize(member_desc.type, item, bs3, member_desc.charset)) {
                            return false;
                        }
                    }
                    bs2.WriteBuffer(bs3.GetBuffer());
                    break;
                case member_style.map:
                    for(let key in member) {
                        bs2.WriteVarints(tag);
                        if(!serialize(member_desc.type, { key:key, value:member[key] }, bs2, member_desc.charset)) {
                            return false;
                        }
                    }
                    break;
            }
        }

        let undeclared = obj["__undeclared"];
        if(null != undeclared)
        {
            for(let key in undeclared)
            {
                let tag = parseInt(key);
                bs2.WriteVarints(tag);

                let data:any = undeclared[key];
                switch (tag & 0x7) {
                case 1:
                    bs2.WriteInt(data, IntType.UInt64);
                    break;
                case 5:
                    bs2.WriteInt(data, IntType.UInt32);
                    break;
                case 0:
                    bs2.WriteVarints(data);
                case 2:
                    bs2.WriteBuffer(data);
                    break;
                }
            }
        }

        bs.WriteBuffer(bs2.GetBuffer());
        return true;
    }

    return false;
}

function raw_serialize_as_array(msg:string, obj:any): Uint8Array
{
    let bs = new BinaryStream();
    if(!serialize(msg, obj, bs, defcharset)) {
        return undefined;
    }
    bs.SetPos(0);
    return bs.ReadBuffer();
}

export function serialize_as_array<T>(type: (new() => T), obj:T): Uint8Array
{
    let bs = new BinaryStream();
    if(!serialize(type.name, obj, bs, defcharset)) {
        return undefined;
    }
    bs.SetPos(0);
    return bs.ReadBuffer();
}

function signed32(v:bigint):bigint{
    v &= 0xFFFFFFFFn;
    return (v>0x7FFFFFFFn?v-0x100000000n:v);
}
function signed64(v:bigint):bigint{
    v &= 0xFFFFFFFFFFFFFFFFn;
    return (v>0x7FFFFFFFFFFFFFFFn?v-0x10000000000000000n:v);
}

function deserialize(msg:string, bs:BinaryStream, charset:string): any
{
    let wire_type = get_wire_type(msg);
    if (wire_type >= 0) 
    {
        switch(msg)
        {
            case "bool":    return (bs.ReadInt(IntType.UInt8) ? true : false);    
            case "int32":   return Number(signed32(bs.ReadVarints())); 
            case "uint32":  return Number(bs.ReadVarints()); 
            case "sint32":  return Number(signed32(inv_zig_zag(bs.ReadVarints())));
            case "fixed32": return Number(bs.ReadInt(IntType.Int32));
            case "sfixed32":return Number(signed32(inv_zig_zag(bs.ReadInt(IntType.Int32))));
            case "int64":   return signed64(bs.ReadVarints()); 
            case "uint64":  return bs.ReadVarints(); 
            case "sint64":  return signed64(inv_zig_zag(bs.ReadVarints()));
            case "fixed64": return bs.ReadInt(IntType.Int64);
            case "sfixed64":return signed64(inv_zig_zag(bs.ReadInt(IntType.Int64)));
            case "float":   return bs.ReadFloat();
            case "double":  return bs.ReadDouble();
            case "string":  return iconv.to_string(bs.ReadBuffer(), charset);
            case "bytes":   return bs.ReadBuffer();
        }

        return true;
    }

    let def = _msg_declare_map.get(msg);
    if (def == undefined) {
        console.error(`msg declare "${msg}" can not find!`);
        return null;
    }
    else
    {
        let obj = (def.con ? new def.con() : {});

        let l = Number(bs.ReadVarints());
        l += bs.GetPos();

        while (bs.GetPos() < l)
        {
            let tag = Number(bs.ReadVarints());
            
            let find = false;
            for (let member_desc of def.members)
            {
                let member_tag = (member_desc.num << 3) | member_desc.wire_type;
                if (member_style.repeated_packed == member_desc.style) {
                    member_tag = (member_desc.num << 3) | 2;
                }

                if(tag == member_tag)
                {
                    find = true;

                    switch(member_desc.style) {
                        case member_style.optional:
                            obj[member_desc.name] = deserialize(member_desc.type, bs, member_desc.charset);
                            break;
                        case member_style.repeated:
                            if (null == obj[member_desc.name]) {
                                obj[member_desc.name] = [];
                            }
                            obj[member_desc.name].push(deserialize(member_desc.type, bs, member_desc.charset));
                            break;
                        case member_style.repeated_packed:
                            if (null == obj[member_desc.name]) {
                                obj[member_desc.name] = [];
                            }
                            let l2 = Number(bs.ReadVarints());
                            l2 += bs.GetPos();
                            while (bs.GetPos() < l2) {
                                obj[member_desc.name].push(deserialize(member_desc.type, bs, member_desc.charset));
                            }
                            break;
                        case member_style.map:
                            if (null == obj[member_desc.name]) {
                                obj[member_desc.name] = {};
                            }
                            let p = deserialize(member_desc.type, bs, member_desc.charset);
                            obj[member_desc.name][p.key] = p.value;
                            break;
                    }
                    break;
                }
            }

            if(!find)
            {
                let data: any;

                switch (tag & 0x7) {
                case 1:
                    data = bs.ReadInt(IntType.UInt64);
                    break;
                case 5:
                    data = bs.ReadInt(IntType.UInt32);
                    break;
                case 0:
                    data = bs.ReadVarints();
                    break;
                case 2:
                    data = bs.ReadBuffer();
                    break;
                }
                if(null == obj["__undeclared"]) {
                    obj["__undeclared"] = {};
                }
                obj["__undeclared"][tag.toString()] = data;
            }
        }

        return obj;
    }

    return null;
}

function raw_parse_from_array(msg:string, buff:Uint8Array): any 
{
    let bs = new BinaryStream();
    bs.WriteBuffer(buff);
    bs.SetPos(0);
    return deserialize(msg, bs, defcharset);
}

export function parse_from_array<T>(type: (new() => T), buff:Uint8Array): T 
{
    let bs = new BinaryStream();
    bs.WriteBuffer(buff);
    bs.SetPos(0);
    return deserialize(type.name, bs, defcharset);
}

/*
pb.raw_message("test",
    pb.raw_optional(pb.string, "a", 1),
    pb.raw_repeated(pb.int64, "b", 2),
    pb.raw_map(pb.int32, pb.string, "c", 3)
);
let arr = pb.raw_serialize_as_array("test", obj);
let obj = pb.raw_parse_from_array("test", arr);
*/

/* 
exsample

    @protobuf.message
    class test {
        a = protobuf.optional(protobuf.string, 1);
        b = protobuf.repeated(protobuf.int64, 2);
        c = protobuf.map(protobuf.int32, protobuf.string, 3);
    };

    @protobuf.message
    class test2 {
        t = protobuf.optional(test, 1);
    };

    let obj = new test2();
    obj.t = new test();
    obj.t.a = "xxx";
    obj.t.b = [123n];
    obj.t.c[456] = "xxx";

    let arr = protobuf.serialize_as_array(test2, obj);
    let obj2 = protobuf.parse_from_array(test2, arr);
*/