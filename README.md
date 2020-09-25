# iso-on-tcp

This is a (still) partial implementation of the ISO-on-TCP protocol (RFC1006). It implements a parser and a serializer as Transform Streams that can be used individually, and a client implementation as a Duplex stream.

The code currently lacks the implementation of parts of the protocol, as it's currently focused on the parts needed for the [nodeS7](https://github.com/plcpeople/nodeS7) project. But as long as it follows the protocol, pull requests will be happily accepted. Please check the [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).


This library was created as part of the [ST-One](https://st-one.io) project.

## Usage

The easiest way to create a connection is to use the `createConnection()` method
```js
let client = isoontcp.createConnection({
    port: 102
    host: '192.168.0.100',
    srcTSAP: 0x0100,
    dstTSAP: 0x0100
});
```

It will create a bidirectional stream that will be sent and received as `DATA (DT)` telegrams. From there on you can use it as any other Node.JS duplex stream, that is, you can call methods like `client.on('data')`, `client.write(buffer)`, and event `client.pipe(anotherStream)`.

If you want to access the individual messages received, you can listen to the `raw-message` event, or even `message` for every complete `DT` telegram.


## Documentation

Please check the [JSDoc Documentation](doc/jsdoc/index.html)


## References

 - [Personal Notes](doc/PROTOCOL_ISOONTCP.md)
 - https://tools.ietf.org/html/rfc1006
 - https://tools.ietf.org/html/rfc905
 - https://wiki.wireshark.org/S7comm
 - https://github.com/boundary/wireshark/blob/master/epan/dissectors/packet-ositp.c
 - https://github.com/szpajder/dumpvdl2/blob/master/cotp.c
 - https://github.com/mushorg/conpot/blob/master/conpot/protocols/s7comm/cotp.py


### Glossary

These are some abbreviations commonly found in the references that may be useful to know beforehand

- **TSAP** - Transport Service Access Point
- **TPDU** - Transport Protocol Data Units
- **TSDU** - Transport Service Data Units
- **SPDU** - Session Protocol Data Unit
- **TPKT** - TPDU packet
- **COTP** - Connection-Oriented Transport Protocol


## License
Copyright: (c) 2018-2020, ST-One, Guilherme Francescon Cittolin <guilherme@st-one.io>

GNU General Public License v3.0+ (see [LICENSE](LICENSE) or https://www.gnu.org/licenses/gpl-3.0.txt)
