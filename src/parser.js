/*
   Copyright 2018 Smart-Tech Controle e Automação

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
/*jshint esversion: 6, node: true*/

const {
    Transform
} = require('stream');
const constants = require('./constants.json');
const util = require('util');
const debug = util.debuglog('iso-on-tcp');

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

            // TPDU

            let tpduStart = ptr;

            let tpdu_length = chunk.readUInt8(ptr) + 1; //+1, because the length itself is not included in protocol
            let tpdu_type = chunk.readUInt8(ptr + 1) >> 4;

            ptr += 2;

            let obj = {
                type: tpdu_type,
                tpkt: {
                    version: tpkt_version,
                    reserved: tpkt_reserved
                }
            };

            switch (tpdu_type) {
                case constants.tpdu_type.CR:
                case constants.tpdu_type.CC:
                case constants.tpdu_type.DR:

                    obj.destination = chunk.readUInt16BE(ptr);
                    ptr += 2;
                    obj.source = chunk.readUInt16BE(ptr);
                    ptr += 2;

                    let varfield = chunk.readUInt8(ptr);
                    if (tpdu_type === constants.tpdu_type.DR) {
                        obj.reason = varfield;
                    } else {
                        obj.class = varfield >> 4;
                        obj.no_flow_control = (varfield & 0x1) > 0;
                        obj.extended_format = (varfield & 0x2) > 0;
                    }
                    ptr += 1;

                    //TODO improvement: do boundary checks while parsing the variable data fields
                    while ((ptr - tpduStart) < tpdu_length) {
                        let var_code = chunk.readUInt8(ptr);
                        ptr += 1;
                        let var_length = chunk.readUInt8(ptr);
                        ptr += 1;

                        switch (var_code) {
                            case constants.var_type.TPDU_SIZE:
                                obj.tpdu_size = 1 << chunk.readUInt8(ptr);
                                break;
                            case constants.var_type.SRC_TSAP:
                                obj.srcTSAP = chunk.readUInt16BE(ptr);
                                break;
                            case constants.var_type.DST_TSAP:
                                obj.dstTSAP = chunk.readUInt16BE(ptr);
                                break;
                            default:
                                //for now, throw if we don't have it implemented
                                cb(new Error(`Unknown or not implemented variable parameter code [${var_code}]:[${constants.var_type_desc[var_code]}]`));
                                return;
                        }

                        ptr += var_length;
                    }

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
                    cb(new Error(`Unknown or not implemented TPDU type [${tpdu_type}]:[${constants.tpdu_type_desc[tpdu_type]}]`));
                    return;
            }

            let payloadStart = tpduStart + tpdu_length; //inclusive
            let payloadEnd = tpktStart + tpkt_length; //exclusive
            if (payloadEnd > payloadStart) {
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