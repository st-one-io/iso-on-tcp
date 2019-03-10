# ISO-on-TCP Protocol Details

These are personal notes about the ISO-on-TCP protocol

## Glossary

- **TPDU** - transport protocol data units
- **TPKT** - TPDU packet
- **TSAP** - Transport service access point
- **SPDU** - Session protocol data unit (user data)
- **COTP** - Connection-oriented Transport Protocol

## TPKT

TPKT = packet header + TPDU + SPDU

### Packet header

       0                   1                   2                   3
       0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
      +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
      |      vrsn     |    reserved   |          packet length        |
      +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 -  8 bits - Version number (0x03)
 -  8 bits - Reserved
 - 16 bits - Packet length - the length of entire packet in octets, including packet-header

### TPDU

The format of the TPDU depends on the type of a TPDU. All TPDUs start with a fixed-part header length
and the code.  The information following after the code varies, depending on the value of the code
| Type | Code  | Description        |
| ---- | ----- | ------------------ |
| CR   | `0xe` | connect request    |
| CC   | `0xd` | connect confirm    |
| DR   | `0x8` | disconnect request |
| DT   | `0xf` | data               |
| ED   | `0x1` | expedited data     |

#### CC / CR / DR

Format for CR/CC or DR types


        0                   1                   2                   3
        0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       | header length | code  | credit|     destination reference     |
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |       source reference        | class |options| variable data |
       |       source reference        |     reason    | variable data |
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |    ...        |      ...      |      ...      |      ...      |
       |    ...        |      ...      |      ...      |      ...      |
       |    ...        |   user data   |      ...      |      ...      |
       |    ...        |      ...      |      ...      |      ...      |
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+


 -  8 bits - TPDU-header length in octets including parameters but excluding the header 
             length field and user data (if any)
 -  4 bits - Code
 -  4 bits - Credit - Always ZERO
 - 16 bits - destination reference - Always ZERO
 - 16 bits - source reference - Always ZERO
For a CR or CC packet
 -  4 bits - class - Alway 0x4 (0b0100)
 -  4 bits - options
    - 0~1: unused
    - 2: Extended format
    - 3: No explicit flow control
For a DR packet
 -  8 bits - reason


##### DR reason codes
 | Code  | Reason                                                       |
 | ----- | ------------------------------------------------------------ |
 | 1     | Congestion at TSAP                                           |
 | 2     | Session entity not attached to TSAP                          |
 | 3     | Address unknown (at TCP connect time)                        |
 | 128+0 | Normal disconnect initiated by the session entity            |
 | 128+1 | Remote transport entity congestion at connect request time   |
 | 128+3 | Connection negotiation failed                                |
 | 128+5 | Protocol Error                                               |
 | 128+8 | Connection request refused on this network connection        |

#### DT / ED

The format of a DT or ED TPDU is:


       0                   1                   2                   3
       0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
      +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
      | header length | code  |credit |TPDU-NR and EOT|   user data   |
      +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
      |      ...      |      ...      |      ...      |      ...      |
      |      ...      |      ...      |      ...      |      ...      |
      |      ...      |      ...      |      ...      |      ...      |
      +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+


 -  8 bits - TPDU-header length in octets including parameters but excluding the header 
             length field and user data (if any)
 -  4 bits - Code
 -  4 bits - Credit - Always ZERO
 -  8 bits - TPDU-NR and EOT
    - 0: Last data unit?
    - 1~15: TPDU number

## Examples

```js
self.connectReq = new Buffer([

    // TPKT header
    0x03, //version number
    0x00, //reserver
    0x00, 0x16, //packet length: 22

    // TPDU
    0x11, //length: 17
    0xe0, //code: CR - connect request + credit
    0x00, 0x00, //destination
    0x00, 0x02, //source
    0x00, //class + options (should be 0x40)?
    //variable data of TPKT header
    //p1
    0xc0, //192 - TPDU size
    0x01, //length: 1
    0x0a, //size: 10 -> 1024
    //p2
    0xc1, //193 - TSAP-ID of the client
    0x02, // length: 2
        //TSAP-ID attributes
        0x01, //length: 1
        0x00, //value: 0 (rack*32 + slot)
    //p3
    0xc2, //194 - TSAP-ID of the server
    0x02, //length: 2
        //TSAP-ID attributes
        0x01, //length 
        0x02  //value: 2 (rack*32 + slot)
]);

self.negotiatePDU = new Buffer([

    // TPKT header
    0x03, //version
    0x00, //reserved
    0x00, 0x19, //length: 25
    
    // TPDU
    0x02, //length
    0xf0, //code: DT - data + credit
    0x80, 

    // user data (SPDU) - S7 comm
    //header
    0x32, //protocol ID
    0x01, //ROSCTR: 1 - Job
    0x00, 0x00, //Redundancy identification
    0x00, 0x00, //PDU reference
    0x00, 0x08, //Parameter length: 8
    0x00, 0x00, //Data length: 0
    //parameter
    0xf0, //function: setup communication
    0x00, //reserved
    0x00, 0x08, //max AmQ (parallel jobs with ACK) calling: 8
    0x00, 0x08, //max AmQ (parallel jobs with ACK) called: 8
    0x03, 0xc0  //PDU length: 960
]);
```