//@ts-check
/*
  Copyright: (c) 2018-2020, ST-One Ltda.
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const { Duplex } = require('stream');
const util = require('util');
const debug = util.debuglog('iso-on-tcp');

//@ts-ignore
const constants = require('./constants.json');
const Parser = require('./parser.js');
const Serializer = require('./serializer.js');

const CONN_DISCONNECTED = 0;
const CONN_CONNECTING = 1;
const CONN_CONNECTED = 2;
const CONN_DISCONNECTING = 3;
const CONN_FINISHED = 99;

/**
 * Duplex stream that handles the lifecycle of an ISO-on-TCP connection
 * as a client.
 * 
 * @class
 */
class ISOOnTCPClient extends Duplex {

    /**
     * 
     * @param {Duplex}  stream the underlying stream used to 
     * @param {object}  [opts] options to the constructor
     * @param {number}  [opts.tpduSize=1024] the tpdu size. Must be a power of 2
     * @param {number}  [opts.srcTSAP=0] the source TSAP
     * @param {number}  [opts.dstTSAP=0] the destination TSAP
     * @param {number}  [opts.sourceRef=random] our reference. If not provided, an random one is generated
     * @param {boolean} [opts.forceClose=false] skip sending Disconnect Requests on disconnecting, and forcibly closes the connection instead
     * @param {(msg: object) => boolean} [opts.validateConnection] a function that will be called to validate the connection parameters.
     */
    constructor(stream, opts) {
        debug("new ISOOnTCPClient", opts);

        super();

        if (!(stream instanceof Duplex)) {
            throw new Error("Parameter 'stream' must be a duplex stream")
        }

        this.stream = stream;

        opts = opts || {}

        this.tpduSize = opts.tpduSize || 1024;
        this.srcTSAP = opts.srcTSAP || 0;
        this.dstTSAP = opts.dstTSAP || 0;
        this.forceClose = !!opts.forceClose;
        this.validateConnection = (typeof opts.validateConnection === "function") ? opts.validateConnection : () => true;

        if (opts.sourceRef === undefined) {
            this._sourceRef = Math.floor(Math.random() * 0xffff)
        } else {
            this._sourceRef = opts.sourceRef
        }

        this._parser = new Parser();
        this._serializer = new Serializer();
        this._parser.on('error', e => this._onParserError(e))
        this._serializer.on('error', e => this._onSerializerError(e))

        this._parser.on('data', d => this._incomingData(d))

        this.stream.pipe(this._parser);
        this._serializer.pipe(this.stream);

        this.stream.on('error', e => this._onStreamError(e));
        this.stream.on('close', () => this._onStreamClose());
        this.stream.on('end', () => this._onStreamEnd());

        this._initParams();
    }

    /**
     * our reference code
     */
    get sourceReference() {
        return this._sourceRef;
    }

    /**
     * the destination reference if we're connected, null otherwhise
     */
    get destinationReference() {
        return this.isConnected ? this._destRef : null;
    }

    /**
     * the negotiated TPDU size, being the smallest of ours and theirs TPDU size
     */
    get negotiatedTpduSize() {
        return this._tpduSize;
    }

    /**
     * whether we're currently connected or not
     */
    get isConnected() {
        return this._connectionState === CONN_CONNECTED;
    }

    _initParams() {
        this._inBuffer = [];
        this._outBuffer = [];
        this._tpduSize = this.tpduSize;
        this._connectionState = CONN_DISCONNECTED;
        this._destRef = 0;
        this._drSent = false;
    }

    _onStreamError(e) {
        debug("ISOOnTCPClient _onStreamError", e);

        this.emit('error', e);
        this._destroy();
    }

    _onStreamClose() {
        debug("ISOOnTCPClient _onStreamClose");

        this.push(null); //signalizes end of read stream, emits 'end' event
        this._destroy();
    }

    _onStreamEnd() {
        debug("ISOOnTCPClient _onStreamEnd");

        this.push(null); //signalizes end of read stream, emits 'end' event
        this._destroy();
    }

    _onParserError(e) {
        debug("ISOOnTCPClient _onParserError", e);

        this.emit('error', e);
        this._destroy();
    }

    _onSerializerError(e) {
        debug("ISOOnTCPClient _onSerializerError", e);

        this.emit('error', e);
        this._destroy();
    }

    _incomingData(data) {
        debug("ISOOnTCPClient _incomingData", data);

        process.nextTick(() => this.emit('raw-message', data));

        switch (data.type) {
            case constants.tpdu_type.CR:
            case constants.tpdu_type.CC:

                if (!this.validateConnection(data)) {
                    debug("ISOOnTCPClient _incomingData CR-CC-not-valid");
                    this.close();
                    return;
                }

                this._destRef = data.source
                //negotiate tdpu size
                this._tpduSize = Math.min(data.tpdu_size, this.tpduSize);

                if (data.type == constants.tpdu_type.CR) {
                    this._serializer.write({
                        type: constants.tpdu_type.CC,
                        destination: this._destRef,
                        source: this._sourceRef,
                        tpdu_size: this._tpduSize,
                        srcTSAP: this.srcTSAP,
                        dstTSAP: this.dstTSAP
                    });
                }

                this._connectionState = CONN_CONNECTED;

                // send any queued messages
                for (const buf of this._outBuffer) {
                    this._sendDT(buf);
                }
                this._outBuffer = [];

                process.nextTick(() => this.emit('connect'));

                break;

            case constants.tpdu_type.DT:
                this._inBuffer.push(data.payload);
                if (data.last_data_unit) {
                    let res = Buffer.concat(this._inBuffer);
                    this._inBuffer = [];
                    this.emit('message', {
                        payload: res
                    });
                    this.push(res);
                }
                break;

            case constants.tpdu_type.DR:
                // 0: Reason not specified
                // 128: Normal disconnect initiated by the session entity
                if (!(data.reason == 0 || data.reason == 128)){
                    let errDescr = constants.DR_reason[data.reason] || '<Unknown reason code>';
                    this.emit('error', new Error(`Received a disconnect request with reason [${data.reason}]: ${errDescr}`));
                }
                if (!this._drSent) {
                    this._serializer.write({
                        type: constants.tpdu_type.DR
                    });
                }
                if (this.stream.end) {
                    this.stream.end();
                } else {
                    this._destroy();
                }
                break;

            default:
                
        }
    }

    _sendDT(chunk) {

        //split buffer in multiple telegrams if buffer is bigger than negotiated tdpu size
        let chunkArr;
        if (chunk.length > this._tpduSize) {
            chunkArr = [];
            for (let i = 0; i < chunk.length; i += this._tpduSize) {
                chunkArr.push(chunk.slice(i, Math.min(i + this._tpduSize, chunk.length)));
            }
        } else {
            chunkArr = [chunk];
        }

        for (let i = 0; i < chunkArr.length; i++) {
            this._serializer.write({
                type: constants.tpdu_type.DT,
                last_data_unit: i === (chunkArr.length - 1),
                payload: chunkArr[i]
            });
        }
    }

    _read(size) {
        debug("ISOOnTCPClient _read", size);
        //TODO handle backpressure
    }

    _write(chunk, encoding, cb) {
        debug("ISOOnTCPClient _write", chunk);

        if (!(chunk instanceof Buffer)) {
            cb(new Error('Data must be of Buffer type'));
            return;
        }

        if (this._connectionState > CONN_CONNECTED) {
            cb(new Error("Can't write data after end"));
            return;
        }

        // buffer the outgoing messsages until we're connected
        if (this._connectionState < CONN_CONNECTED) {
            debug("ISOOnTCPClient write not-connected");
            this._outBuffer.push(chunk);
            cb();
            return;
        }

        this._sendDT(chunk);
        cb();
    }

    _final(cb) {
        debug("ISOOnTCPClient _finish");

        this.close();
        cb();
    }

    _destroy() {
        debug("ISOOnTCPClient _destroy");

        //call this only once
        if (this._connectionState >= CONN_FINISHED) return;
        this._connectionState = CONN_FINISHED;

        function destroyStream(stream) {
            debug("ISOOnTCPClient _destroy destroyStream");

            if(!stream) return;
            if(stream.destroy){
                stream.destroy();
            } else if (stream._destroy){
                stream._destroy();
            }
        }

        destroyStream(this._serializer);
        destroyStream(this.stream);
        destroyStream(this._parser);

        this.emit('close');
    }

    // ----- public methods

    /**
     * Initiates the connection process
     * 
     * @param {function} [cb] a callback that is added to the {@link ISOOnTCPClient#connect} event
     * @throws an error if the client is not in a disconnected state
     */
    connect(cb) {
        if (this._connectionState > CONN_DISCONNECTED) {
            throw new Error('Client not in disconnected state');
        }

        if (typeof cb === 'function') {
            // @ts-ignore
            this.once('connect', cb);
        }

        this._connectionState = CONN_CONNECTING;

        this._serializer.write({
            type: constants.tpdu_type.CR,
            destination: this._destRef,
            source: this._sourceRef,
            //class: 0,
            //extended_format: false,
            //no_flow_control: false,
            tpdu_size: this.tpduSize,
            srcTSAP: this.srcTSAP,
            dstTSAP: this.dstTSAP
        });
    }

    /**
     * Closes the connection by sending a DR telegram. If forceClose was set
     * to true, DR is not sent and the connection is abruptly disconnected instead
     */
    close() {
        debug("ISOOnTCPClient disconnect");

        if (this._connectionState == CONN_CONNECTED && !this.forceClose){
            this._connectionState = CONN_DISCONNECTING;
            this._serializer.write({
                type: constants.tpdu_type.DR
            });
            this._drSent = true;
        } else {
            this._destroy();
        }
    }

}

module.exports = ISOOnTCPClient;