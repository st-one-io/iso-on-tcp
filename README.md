iso-on-tcp
==========

This is a (still) partial implementation of the **ISO-on-TCP** protocol. This is part of the stack needed to implement the *S7 Protocol*

## TODOs

 [ ] Documentation

## Glossary

- **TSAP** - Transport Service Access Point
- **TPDU** - Transport Protocol Data Units
- **TSDU** - Transport Service Data Units
- **SPDU** - Session Protocol Data Unit
- **TPKT** - TPDU packet
- **COTP** - Connection-Oriented Transport Protocol

## References

 - https://tools.ietf.org/html/rfc1006
 - https://tools.ietf.org/html/rfc905
 - https://wiki.wireshark.org/S7comm
 - https://github.com/boundary/wireshark/blob/master/epan/dissectors/packet-ositp.c
 - https://github.com/szpajder/dumpvdl2/blob/master/cotp.c
 - https://github.com/mushorg/conpot/blob/master/conpot/protocols/s7comm/cotp.py