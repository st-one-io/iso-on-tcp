//@ts-check
/*
  Copyright: (c) 2018-2020, ST-One Ltda.
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const {
    Transform
} = require('stream');
const constants = require('./constants.json');
const util = require('util');
const debug = util.debuglog('iso-on-tcp');

/**
 * Transform Stream that takes in javascript objects that
 * represents ISO-on-TCP telegrams and serializes them into
 * buffers
 *
 * @example <caption>Example of a CR telegram</caption>
 * serializer.write({
 *     type: 0x0e, //CR
 *     destination: 0,
 *     source: 2,
 *     //class: 0, //default if not present
 *     //extended_format: false, //default if not present
 *     //no_flow_control: false, //default if not present
 *     tpdu_size: 1024,
 *     srcTSAP: 0x0100,
 *     dstTSAP: 0x0102
 * });
 *
 * @example <caption>Example of a DT telegram</caption>
 * serializer.write({
 *     type: constants.tpdu_type.DT,
 *     last_data_unit: true,
 *     payload: Buffer.from('32010000000000080000f0000008000803c0', 'hex')
 * });
 */
class ISOOnTCPSerializer extends Transform {

    constructor(opts) {
        opts = opts || {};
        opts.writableObjectMode = true;

        super(opts);

        debug("new ISOOnTCPSerializer");
    }

    _transform(chunk, encoding, cb) {
        debug("ISOOnTCPSerializer _transform");

        //checks

        if (!chunk.type) {
            cb(new Error('Missing telegram type'));
            return;
        }

        if (chunk.payload !== undefined && !Buffer.isBuffer(chunk.payload)) {
            cb(new Error('Payload is not of type Buffer'));
            return;
        }


        //tpkt(4) + tpdu_length(1) + payload (tpdu content will be added later depending on type)
        let tpkt_length = 4 + 1 + (chunk.payload ? chunk.payload.length : 0);
        let tpdu_length = 1; //(length) + type (the "length" byte doesn't count)
        let ptr = 6; //tpkt(4) + tpdu_len(1) + tpdu_type(1)
        let buf;

        switch (chunk.type) {
            case constants.tpdu_type.CR:
            case constants.tpdu_type.CC:
            case constants.tpdu_type.DR:
                tpdu_length += 5; //src + dst + reason_or_class

                let destination = parseInt(chunk.destination) || 0;
                let source = parseInt(chunk.source) || 0;

                let reason_or_class;
                if (chunk.type === constants.tpdu_type.DR) {
                    reason_or_class = parseInt(chunk.reason) || 0;
                } else {
                    reason_or_class = ((parseInt(chunk.class) || 0) & 0x0f) << 4;
                    reason_or_class |= chunk.no_flow_control ? 0x1 : 0;
                    reason_or_class |= chunk.extended_format ? 0x2 : 0;
                }

                // variable data

                if (chunk.tpdu_size !== undefined) {
                    tpdu_length += 3;
                }

                if (chunk.srcTSAP !== undefined) {
                    tpdu_length += 4;
                }

                if (chunk.dstTSAP !== undefined) {
                    tpdu_length += 4;
                }

                tpkt_length += tpdu_length;

                // allocate buffer and write

                buf = Buffer.alloc(tpkt_length);

                buf.writeUInt16BE(destination, ptr); //source
                ptr += 2;
                buf.writeUInt16BE(source, ptr); //source
                ptr += 2;
                buf.writeUInt8(reason_or_class, ptr); //source
                ptr += 1;

                if (chunk.tpdu_size !== undefined) {
                    buf.writeUInt8(constants.var_type.TPDU_SIZE, ptr);
                    buf.writeUInt8(1, ptr + 1); //length
                    buf.writeUInt8(highestOrderBit(chunk.tpdu_size), ptr + 2);
                    ptr += 3;
                }

                if (chunk.srcTSAP !== undefined) {
                    buf.writeUInt8(constants.var_type.SRC_TSAP, ptr);
                    buf.writeUInt8(2, ptr + 1); //length
                    buf.writeUInt16BE(chunk.srcTSAP, ptr + 2);
                    ptr += 4;
                }

                if (chunk.dstTSAP !== undefined) {
                    buf.writeUInt8(constants.var_type.DST_TSAP, ptr);
                    buf.writeUInt8(2, ptr + 1); //length
                    buf.writeUInt16BE(chunk.dstTSAP, ptr + 2);
                    ptr += 4;
                }

                break;

            case constants.tpdu_type.DT:
            case constants.tpdu_type.ED:
                tpdu_length += 1; //number/ldu

                let nr_and_eot = (parseInt(chunk.tpdu_number) || 0) & 0x7f;
                nr_and_eot |= chunk.last_data_unit ? 0x80 : 0;

                tpkt_length += tpdu_length;

                // allocate buffer and write

                buf = Buffer.alloc(tpkt_length);

                buf.writeUInt8(nr_and_eot, ptr);
                ptr += 1;

                break;

            default:
                cb(new Error(`Telegram type [${chunk.type}] not yet implemented`));
                return;
        }

        //tpkt
        buf.writeUInt8(3, 0); //version
        buf.writeUInt8(0, 1); //reserved
        buf.writeUInt16BE(tpkt_length, 2); //length

        //tpdu
        let type_and_credit = (chunk.type << 4) & 0xff;
        type_and_credit |= (parseInt(chunk.credit) || 0) & 0xf;

        buf.writeUInt8(tpdu_length, 4); //length
        buf.writeUInt8(type_and_credit, 5); //type and credit

        if (chunk.payload) {
            chunk.payload.copy(buf, 5 + tpdu_length);
        }

        this.push(buf);
        cb();
    }
}

// -- helper

function highestOrderBit(num) {
    if (!num) return 0;

    let ret = 0;

    //while(num >>= 1) ret <<= 1;
    while (num >>= 1) ret++;

    return ret;
}

module.exports = ISOOnTCPSerializer;