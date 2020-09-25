//@ts-check
/*
  Copyright: (c) 2018-2020, ST-One Ltda.
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const {
    expect
} = require('chai');
const ISOOnTCPParser = require('../src/parser.js');
const constants = require('../src/constants.json');
const Stream = require('stream');

describe('ISO-on-TCP Parser', () => {

    it('should be a stream', () => {
        expect(new ISOOnTCPParser()).to.be.instanceOf(Stream);
    });

    it('should create a new instance', () => {
        expect(new ISOOnTCPParser).to.be.instanceOf(Stream); //jshint ignore:line
    });

    it('should emit an error when input is not a buffer', (done) => {
        let parser = new ISOOnTCPParser();
        parser.on('error', (err) => {
            expect(err).to.be.an('error');
            done();
        });

        try {
            parser.write({});
        } catch (err) {
            expect(err).to.be.an.instanceOf(TypeError)
            done();
        }
    });

    it('should decode a telegram received in two parts', (done) => {
        let parser = new ISOOnTCPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                tpkt: {
                    version: 3,
                    reserved: 0
                },
                type: 0x0f, //DT
                credit: 0,
                tpdu_number: 0,
                last_data_unit: true,
                payload: Buffer.from('32010000000000080000f0000008000803c0', 'hex')
            });
            done();
        });

        // TPKT + COTP + Payload
        parser.write(Buffer.from('0300001902f0803201', 'hex'));
        parser.write(Buffer.from('0000000000080000f0000008000803c0', 'hex'));
    });

    it('should decode a telegram even if header is split in two buffers', (done) => {
        let parser = new ISOOnTCPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                tpkt: {
                    version: 3,
                    reserved: 0
                },
                type: 0x0f, //DT
                credit: 0,
                tpdu_number: 0,
                last_data_unit: true,
                payload: Buffer.from('32010000000000080000f0000008000803c0', 'hex')
            });
            done();
        });

        // TPKT + COTP + Payload
        parser.write(Buffer.from('0300', 'hex'));
        parser.write(Buffer.from('001902f08032010000000000080000f0000008000803c0', 'hex'));
    });

    it('should decode two consecutive telegrams in the same Buffer', (done) => {
        let parser = new ISOOnTCPParser();
        let res = [];
        parser.on('data', (data) => {
            res.push(data);
            if (res.length < 2) return;
            expect(res).to.be.deep.equal([{
                tpkt: {
                    version: 3,
                    reserved: 0
                },
                type: 0x0f, //DT
                credit: 0,
                tpdu_number: 0,
                last_data_unit: true,
                payload: Buffer.from('32010000000000080000f0000008000803c0', 'hex')
            }, {
                tpkt: {
                    version: 3,
                    reserved: 0
                },
                type: 0x0f, //DT
                credit: 0,
                tpdu_number: 0,
                last_data_unit: true,
                payload: Buffer.from('320300000000000800000000f0000002000200f0', 'hex')
            }]);
            done();
        });

        // TPKT + COTP + Payload (*2)
        parser.write(Buffer.from('0300001902f08032010000000000080000f0000008000803c0' + '0300001b02f080320300000000000800000000f0000002000200f0', 'hex'));
    });

    it('should decode two consecutive telegrams (1.5 + 0.5)', (done) => {
        let parser = new ISOOnTCPParser();
        let res = [];
        parser.on('data', (data) => {
            res.push(data);
            if (res.length < 2) return;
            expect(res).to.be.deep.equal([{
                tpkt: {
                    version: 3,
                    reserved: 0
                },
                type: 0x0f, //DT
                credit: 0,
                tpdu_number: 0,
                last_data_unit: true,
                payload: Buffer.from('32010000000000080000f0000008000803c0', 'hex')
            }, {
                tpkt: {
                    version: 3,
                    reserved: 0
                },
                type: 0x0f, //DT
                credit: 0,
                tpdu_number: 0,
                last_data_unit: true,
                payload: Buffer.from('320300000000000800000000f0000002000200f0', 'hex')
            }]);
            done();
        });

        // TPKT + COTP + Payload (*2)
        parser.write(Buffer.from('0300001902f08032010000000000080000f0000008000803c0' + '0300001b', 'hex'));
        parser.write(Buffer.from('02f080320300000000000800000000f0000002000200f0', 'hex'));
    });

    it('should decode a Data (DT) telegram', (done) => {
        let parser = new ISOOnTCPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                tpkt: {
                    version: 3,
                    reserved: 0
                },
                type: 0x0f, //DT
                credit: 0,
                tpdu_number: 0,
                last_data_unit: true,
                payload: Buffer.from('32010000000000080000f0000008000803c0', 'hex')
            });
            done();
        });

        // TPKT + COTP + Payload
        parser.write(Buffer.from('03000019' + '02f080' + '32010000000000080000f0000008000803c0', 'hex'));
    });

    it('should decode a Connection Request (CR) telegram', (done) => {
        let parser = new ISOOnTCPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                tpkt: {
                    version: 3,
                    reserved: 0
                },
                type: 0x0e, //CR
                credit: 0,
                destination: 0,
                source: 2,
                class: 0,
                extended_format: false,
                no_flow_control: false,
                tpdu_size: 1024,
                srcTSAP: 0x0100,
                dstTSAP: 0x0102,
                payload: Buffer.alloc(0)
            });
            done();
        });

        // TPKT + COTP
        parser.write(Buffer.from('03000016' + '11e00000000200c0010ac1020100c2020102', 'hex'));
    });

    it('should decode another Connection Request (CR) telegram', (done) => {
        let parser = new ISOOnTCPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                tpkt: {
                    version: 3,
                    reserved: 0
                },
                type: 0x0e, //CR
                credit: 0,
                destination: 0,
                source: 1,
                class: 0,
                extended_format: false,
                no_flow_control: false,
                tpdu_size: 1024,
                srcTSAP: 0x1000,
                dstTSAP: 0x2700,
                payload: Buffer.alloc(0)
            });
            done();
        });

        // TPKT + COTP
        parser.write(Buffer.from('03000016' + '11e00000000100c0010ac1021000c2022700', 'hex'));
    });

    it('should decode a Connection Confirm (CC) telegram', (done) => {
        let parser = new ISOOnTCPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                tpkt: {
                    version: 3,
                    reserved: 0
                },
                type: 0x0d, //CC
                credit: 0,
                destination: 2,
                source: 0x4431,
                class: 0,
                extended_format: false,
                no_flow_control: false,
                tpdu_size: 1024,
                srcTSAP: 0x0100,
                dstTSAP: 0x0102,
                payload: Buffer.alloc(0)
            });
            done();
        });

        // TPKT + COTP
        parser.write(Buffer.from('03000016' + '11d00002443100c0010ac1020100c2020102', 'hex'));
    });

    it('should decode another Connection Confirm (CC) telegram', (done) => {
        let parser = new ISOOnTCPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                tpkt: {
                    version: 3,
                    reserved: 0
                },
                type: 0x0d, //CC
                credit: 0,
                destination: 1,
                source: 0xa0e3,
                class: 0,
                extended_format: false,
                no_flow_control: false,
                tpdu_size: 512,
                srcTSAP: 0x1000,
                dstTSAP: 0x2700,
                payload: Buffer.alloc(0)
            });
            done();
        });

        // TPKT + COTP
        parser.write(Buffer.from('03000016' + '11d00001a0e300c00109c1021000c2022700', 'hex'));
    });
});