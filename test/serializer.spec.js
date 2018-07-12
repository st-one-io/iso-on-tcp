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

const {
    expect
} = require('chai');
const ISOOnTCPSerializer = require('../src/serializer.js');
const Stream = require('stream');

describe('ISO-on-TCP Serializer', () => {

    it('should be a stream', () => {
        expect(new ISOOnTCPSerializer()).to.be.instanceOf(Stream);
    });

    it('should create a new instance', () => {
        expect(new ISOOnTCPSerializer).to.be.instanceOf(Stream); //jshint ignore:line
    });
});