//@ts-check
/*
  Copyright: (c) 2018-2020, Smart-Tech Controle e Automação
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const {
    Transform
} = require('stream');
const constants = require('./constants.json');
const util = require('util');
const debug = util.debuglog('iso-on-tcp');

/**
 * Transform Stream that parses buffers into Javascript
 * objects according to the ISO-on-TCP protocol
 */
class ISOOnTCPParser extends Transform {

    constructor(opts) {
        opts = opts || {};
        opts.readableObjectMode = true;
        opts.decodeStrings = true;

        super(opts);

        this._nBuffer = null;
        debug("new ISOOnTCPParser");
    }

    _transform(chunk, encoding, cb) {
        debug("ISOOnTCPParser _transform");

        let ptr = 0;

        if (this._nBuffer !== null) {
            chunk = Buffer.concat([this._nBuffer, chunk]);
            this._nBuffer = null;
        }

        // test for minimum length
        if (chunk.length < 7) {
            this._nBuffer = chunk;
            cb();
            return;
        }

        while (ptr < chunk.length) {

            // TPKT header

            let tpktStart = ptr;

            let tpkt_version = chunk.readUInt8(ptr);
            let tpkt_reserved = chunk.readUInt8(ptr + 1);
            let tpkt_length = chunk.readUInt16BE(ptr + 2);

            //we don't have enough data, let's backup it
            if (chunk.length < (ptr + tpkt_length)) {
                this._nBuffer = chunk.slice(ptr);
                cb();
                return;
            }

            ptr += 4;

            let obj = {
                tpkt: {
                    version: tpkt_version,
                    reserved: tpkt_reserved
                }
            };

            // TPDU

            let tpduStart = ptr;
            let tpdu_length = chunk.readUInt8(ptr) + 1; //+1, because the length itself is not included in protocol
            ptr += 1;

            // TPDU - fixed part

            let type_and_credit = chunk.readUInt8(ptr);
            ptr += 1;

            obj.type = type_and_credit >> 4;
            obj.credit = type_and_credit & 0xf;

            switch (obj.type) {
                case constants.tpdu_type.CR:
                case constants.tpdu_type.CC:
                case constants.tpdu_type.DR:

                    obj.destination = chunk.readUInt16BE(ptr);
                    ptr += 2;
                    obj.source = chunk.readUInt16BE(ptr);
                    ptr += 2;

                    let varfield = chunk.readUInt8(ptr);
                    if (obj.type === constants.tpdu_type.DR) {
                        obj.reason = varfield;
                    } else {
                        obj.class = varfield >> 4;
                        obj.no_flow_control = (varfield & 0x1) > 0;
                        obj.extended_format = (varfield & 0x2) > 0;
                    }
                    ptr += 1;

                    break;

                case constants.tpdu_type.DT:
                case constants.tpdu_type.ED:

                    let nr_and_eot = chunk.readUInt8(ptr);
                    obj.tpdu_number = nr_and_eot & 0x7f;
                    obj.last_data_unit = (nr_and_eot & 0x80) > 0;
                    ptr += 1;

                    break;

                default:
                    //throw if we can't handle it
                    cb(new Error(`Unknown or not implemented TPDU type [${obj.type}]:[${constants.tpdu_type_desc[obj.type]}]`));
                    return;
            }

            // TPDU - variable part

            let var_params = [];

            //TODO improvement: do boundary checks while parsing the variable data fields
            while ((ptr - tpduStart) < tpdu_length) {
                let var_code = chunk.readUInt8(ptr);
                ptr += 1;
                let var_length = chunk.readUInt8(ptr);
                ptr += 1;
                var_params.push({
                    code: var_code,
                    data: chunk.slice(ptr, ptr + var_length)
                });
                ptr += var_length;
            }

            for(let elm of var_params) {
                switch (elm.code) {
                    case constants.var_type.TPDU_SIZE:
                        obj.tpdu_size = 1 << elm.data.readUInt8(0);
                        break;
                    case constants.var_type.SRC_TSAP:
                        obj.srcTSAP = elm.data.readUInt16BE(0);
                        break;
                    case constants.var_type.DST_TSAP:
                        obj.dstTSAP = elm.data.readUInt16BE(0);
                        break;
                    default:
                        //for now, throw if we don't have it implemented
                        cb(new Error(`Unknown or not implemented variable parameter code [${var_code}]:[${constants.var_type_desc[var_code]}]`));
                        return;
                }
            }

            // TPDU - user data

            let payloadStart = tpduStart + tpdu_length; //inclusive
            let payloadEnd = tpktStart + tpkt_length; //exclusive
            if (payloadEnd >= payloadStart) {
                obj.payload = chunk.slice(payloadStart, payloadEnd);
            }

            this.push(obj);

            //TODO should we do this, albeit technically correct?
            ptr = payloadEnd;
        }

        cb();
    }
}

module.exports = ISOOnTCPParser;