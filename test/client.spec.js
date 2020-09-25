//@ts-check
/*
  Copyright: (c) 2018-2020, ST-One Ltda.
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const { expect } = require('chai');
const ISOOnTCPClient = require('../src/client.js');
const constants = require('../src/constants.json');
const { Duplex } = require('stream');
const makeDuplexPair = require('./duplexPair');

describe('ISO-on-TCP Client', () => {

    it('should throw without a source stream', () => {
        //@ts-ignore 
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

    it('should be able to be a server for itselt', (done) => {
        let opts = {
            sourceRef: 1,
            srcTSAP: 0x1000,
            dstTSAP: 0x2700
        };
        let testDataClient = Buffer.from('hello server');
        let testDataServer = Buffer.from('hello client');
        let clientConnected = false;
        let serverConnected = false;
        let serverClosed = false;

        let {clientSide, serverSide} = makeDuplexPair();
        let client = new ISOOnTCPClient(clientSide, opts);
        let server = new ISOOnTCPClient(serverSide);

        //['connect', 'data', 'close', 'finish', 'end'].forEach(evt => client.on(evt, d => console.log(`CLIENT #${evt}`, d)));
        //['connect', 'data', 'close', 'finish', 'end'].forEach(evt => server.on(evt, d => console.log(`SERVER #${evt}`, d)));

        client.on('data', d => {
            expect(d.toString('hex')).to.be.equals(testDataServer.toString('hex'));
            expect(clientConnected, "client didn't connect").to.be.true;
            expect(serverConnected, "server didn't connect").to.be.true;
            client.close();
        })
        client.on('close', () => {
            process.nextTick(() => {
                expect(serverClosed, "server didn't close").to.be.true;
                done();
            });
        })
        client.on('connect', () => {
            clientConnected = true;
            client.write(testDataClient);
        });
        client.on('error', e => { throw e });

        server.on('data', d => {
            expect(d.toString('hex')).to.be.equals(testDataClient.toString('hex'));
            server.write(testDataServer);
        })
        server.on('close', () => { serverClosed = true });
        server.on('connect', () => { serverConnected = true });
        server.on('error', e => { throw e });

        client.connect();
    });

});