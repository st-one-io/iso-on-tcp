//@ts-check
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

const { EventEmitter } = require('events');
const { Duplex } = require('stream');
const util = require('util');
const debug = util.debuglog('iso-on-tcp');
const net = require('net');

//@ts-ignore
const constants = require('./constants.json');
const Parser = require('./parser.js');
const Serializer = require('./serializer.js');

const CONN_DISCONNECTED = 0;
const CONN_CONNECTING = 1;
const CONN_CONNECTED = 2;
const CONN_DISCONNECTING = 3;
const CONN_ERROR = 3;

/**
 * @emits connect when the connection has been successfully negotiated
 * @emits error when an error has occured when processing either incoming data
 * @emits message is emitted whenever a message is received with the parsed message as a parameter
 */
class ISOOnTCPClient extends Duplex {

    /**
     * 
     * @param {Duplex} stream the underlying stream used to 
     * @param {object} [opts] options to the constructor
     * @param {number} [opts.tpduSize=1024] the tpdu size. Must be a power of 2
     * @param {number} [opts.srcTSAP=0] the source TSAP
     * @param {number} [opts.dstTSAP=0] the destination TSAP
     * @param {number} [opts.sourceRef] our reference. If not provided, an random one is generated
     * @param {number} [opts.handleStreamEvents] If we should handle and forward events that happened on the underlying stream
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

        if (opts.handleStreamEvents) {
            this.stream.on('error', e => this.emit('error', e));
            this.stream.on('close', e => this.emit('close', e));
        }

        this._initParams();
    }

    _initParams() {
        this._inBuffer = [];
        this._outBuffer = [];
        this._tpduSize = this.tpduSize;
        this._connectionState = CONN_DISCONNECTED;
        this._destRef = 0;
    }

    connect(cb) {
        if (this._connectionState > CONN_DISCONNECTED) {
            throw new Error('Client not in disconnected state');
        }

        if (typeof cb === 'function') {
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

    disconnect() {
        debug("ISOOnTCPClient disconnect");

        //TODO
    }

    _onParserError(e) {
        debug("ISOOnTCPClient _onParserError", e);

        this._connectionState = CONN_ERROR;

        this.emit('error', e);
    }

    _onSerializerError(e) {
        debug("ISOOnTCPClient _onSerializerError", e);

        this._connectionState = CONN_ERROR;

        this.emit('error', e);
    }

    _incomingData(data) {
        debug("ISOOnTCPClient _incomingData", data);

        process.nextTick(() => this.emit('raw-message', data));

        switch (data.type) {
            case constants.tpdu_type.CC:

                this._destRef = data.source
                //negotiate tdpu size
                this._tpduSize = Math.min(data.tpdu_size, this.tpduSize);

                //TODO - validate src/dst TSAP?
                //TODO - validate src/dst references?

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

            default:
                //TODO
        }
    }

    get sourceReference() {
        return this._sourceRef;
    }

    get destinationReference() {
        return this._destRef;
    }

    get negotiatedTpduSize() {
        return this._tpduSize;
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

}

module.exports = ISOOnTCPClient;