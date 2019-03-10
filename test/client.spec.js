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
/*jshint esversion: 6, node: true, mocha: true */
'use strict';

const { expect } = require('chai');
const ISOOnTCPClient = require('../src/client.js');
const constants = require('../src/constants.json');
const { Duplex } = require('stream');

describe('ISO-on-TCP Client', () => {

    it('should throw without a source stream', () => {
        expect(() => new ISOOnTCPClient()).to.throw()
    });

    it('should setup a basic communication', (done) => {
        let opts = {
            sourceRef: 1,
            srcTSAP: 0x1000,
            dstTSAP: 0x2700
        };
        let stream = new Duplex({
            read(size) { },
            write(chunk, encoding, cb) {
                expect(chunk.toString('hex')).to.be.equal('0300001611e00000000100c0010ac1021000c2022700');
                this.push(Buffer.from('0300001611d00001a0e300c00109c1021000c2022700', 'hex'));
            }
        });
        let client = new ISOOnTCPClient(stream, opts);

        client.on('connect', () => {
            expect(client.destinationReference).to.be.equals(0xa0e3, "Destination reference does not match");
            expect(client.negotiatedTpduSize).to.be.equals(512, "Failed to negotiate tpdu size");
            done();
        })
        client.on('error', e => { throw e });
        client.connect();
    });

    it('should send data only after connecting', (done) => {
        let opts = {
            sourceRef: 1,
            srcTSAP: 0x1000,
            dstTSAP: 0x2700
        };
        let streamState = 1;
        let stream = new Duplex({
            read(size) { },
            write(chunk, encoding, cb) {
                switch (streamState) {
                    case 1:
                        streamState++;
                        expect(chunk.toString('hex')).to.be.equal('0300001611e00000000100c0010ac1021000c2022700');
                        this.push(Buffer.from('0300001611d00001a0e300c00109c1021000c2022700', 'hex'));
                        break;
                    case 2:
                        streamState++;
                        expect(chunk.toString('hex')).to.be.equal('0300001902f08032010000040000080000f0000001000101e0');
                        this.push(Buffer.from('0300001b02f080320300000400000800000000f0000001000100f0', 'hex'));
                        break;
                }
                cb();
            }
        });
        let client = new ISOOnTCPClient(stream, opts);

        client.write(Buffer.from('32010000040000080000f0000001000101e0', 'hex'));

        client.on('connect', () => {
            expect(client.destinationReference).to.be.equals(0xa0e3, "Destination reference does not match");
            expect(client.negotiatedTpduSize).to.be.equals(512, "Failed to negotiate tpdu size");
        })
        client.on('data', d => {
            expect(d.toString('hex')).to.be.equals('320300000400000800000000f0000001000100f0');
            done();
        })
        client.on('error', e => { throw e });
        client.connect();
    });

    it('should group DT telegrams', (done) => {
        let opts = {
            sourceRef: 1,
            srcTSAP: 0x1000,
            dstTSAP: 0x2700
        };
        let streamState = 1;
        let stream = new Duplex({
            read(size) { },
            write(chunk, encoding, cb) {
                switch (streamState) {
                    case 1:
                        streamState++;
                        expect(chunk.toString('hex')).to.be.equal('0300001611e00000000100c0010ac1021000c2022700');
                        this.push(Buffer.from('0300001611d00001a0e300c00109c1021000c2022700', 'hex'));
                        break;
                    case 2:
                        streamState++;
                        expect(chunk.toString('hex')).to.be.equal('0300001902f08032010000040000080000f0000001000101e0');
                        this.push(Buffer.from('0300000702f000', 'hex'));
                        setTimeout(() => this.push(Buffer.from('0300001b02f080320300000400000800000000f0000001000100f0', 'hex')), 10);
                        break;
                }
                cb();
            }
        });
        let client = new ISOOnTCPClient(stream, opts);

        client.write(Buffer.from('32010000040000080000f0000001000101e0', 'hex'));

        client.on('connect', () => {
            expect(client.destinationReference).to.be.equals(0xa0e3, "Destination reference does not match");
            expect(client.negotiatedTpduSize).to.be.equals(512, "Failed to negotiate tpdu size");
        })
        client.on('data', d => {
            expect(d.toString('hex')).to.be.equals('320300000400000800000000f0000001000100f0');
            done();
        })
        client.on('error', e => { throw e });
        client.connect();
    });
});