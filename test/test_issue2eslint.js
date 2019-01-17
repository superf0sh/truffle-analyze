const assert = require('assert');
const sinon = require('sinon');
const rewire = require('rewire');
const fs = require('fs');
const srcmap = require('../lib/srcmap');
const mythx = require('../lib/mythx');
const rewired = rewire('../lib/issues2eslint');

describe('issues2Eslint', function() {
    describe('Info class', () => {
        let truffleJSON;
        let mythXJSON
        const InfoClass = rewired.__get__('Info');
        const contractJSON = `${__dirname}/sample-truffle/simple_dao/build/contracts/SimpleDAO.json`;
        const sourceName = 'simple_dao.sol';

        beforeEach(done => {
            fs.readFile(contractJSON, 'utf8', (err, data) => {
                if (err) return done(err);
                truffleJSON = JSON.parse(data);
                mythXJSON = mythx.truffle2MythXJSON(truffleJSON);
                done();
            })
        });

        it('should decode a source code location correctly', (done) => {
            const info = new InfoClass(mythXJSON);
            assert.deepEqual(info.textSrcEntry2lineColumn('30:2:0', info.lineBreakPositions[sourceName]),
                             [ { 'line': 2, 'column': 27 }, { 'line': 2, 'column': 29 } ]);

            done()
        });
        
        it('should decode a bytecode offset correctly', (done) => {
            const info = new InfoClass(mythXJSON);
            assert.deepEqual(info.byteOffset2lineColumn('100', info.lineBreakPositions[sourceName]),
			     [ { 'line': 8, 'column': 0 }, { 'line': 25, 'column': 1 } ]);
            done()
        });

        it('should decode a bytecode offset to empty result', (done) => {
            const info = new InfoClass(mythXJSON);
            assert.deepEqual(info.byteOffset2lineColumn('50', info.lineBreakPositions[sourceName]),
			     [ { 'line': -1, 'column': 0 }, { } ]);
            done()
        });

        it('should convert MythX issue to Eslint style with sourceFormat: evm-byzantium-bytecode', () => {
            const mythXOutput = {
                "sourceFormat": "evm-byzantium-bytecode",
                "sourceList": [
                    `/tmp/contracts/${sourceName}`
                ],
                "sourceType": "raw-bytecode",
                "issues": [{
                    "description": {
                        "head": "Head message",
                        "tail": "Tail message"
                    },
                    "locations": [{
                        "sourceMap": "444:1:0"
                    }],
                    "severity": "High",
                    "swcID": "SWC-000",
                    "swcTitle": "Test Title"
                }],
                "meta": {
                    "selected_compiler": "0.5.0",
                    "error": [],
                    "warning": []
                }
            }

            const remappedMythXOutput = mythx.remapMythXOutput(mythXOutput);
            const info = new InfoClass(mythXJSON);
            const res = info.issue2EsLintNew(remappedMythXOutput[0].issues[0], false, 'evm-byzantium-bytecode', sourceName);
    
            assert.deepEqual({
                ruleId: "SWC-000",
                column: 4,
                line: 12,
                endCol: 27,
                endLine: 12,
                fatal: false,
                message: "Head message Tail message",
                severity: "High",
                },
            res);
        });

        it('should convert MythX issue to Eslint style with sourceFormat: text', () => {
            const mythXOutput = {
                "sourceType": "solidity-file",
                "sourceFormat": "text",
                "sourceList": [
                    `/tmp/contracts/${sourceName}`,
                ],
                "issues": [{
                    "description": {
                        "head": "Head message",
                        "tail": "Tail message"
                    },
                    "locations": [{
                        "sourceMap": "310:23:0"
                    }],
                    "severity": "High",
                    "swcID": "SWC-000",
                    "swcTitle": "Test Title"
                }],
                "meta": {
                    "selected_compiler": "0.5.0",
                    "error": [],
                    "warning": []
                }
            }

            const remappedMythXOutput = mythx.remapMythXOutput(mythXOutput);
            const info = new InfoClass(mythXJSON);
            const res = info.issue2EsLintNew(remappedMythXOutput[0].issues[0], false, 'text', sourceName);
    
            assert.deepEqual({
                ruleId: "SWC-000",
                column: 4,
                line: 12,
                endCol: 27,
                endLine: 12,
                fatal: false,
                message: "Head message Tail message",
                severity: "High",
                },
            res);
        });
/*
        it('should call isIgnorable correctly', () => {
            const spyIsVariableDeclaration = sinon.spy(srcmap, 'isVariableDeclaration');
            const spyIsDynamicArray = sinon.spy(srcmap, 'isDynamicArray');
            const info = new InfoClass(mythXJSON);
            const issue = {
                address: 444,
                contract: 'TestContract',
                description: 'Issue description',
                function: '_function_0x00000000',
                title: 'Issie',
                type: 'Warning',
                'swc-id': 'xxx',
                tool: 'mythril'
            }
            const res = info.isIgnorable(issue, {});
            assert.ok(spyIsVariableDeclaration.called);
            assert.ok(spyIsDynamicArray.called);
            assert.ok(spyIsDynamicArray.returned(false));
            assert.equal(res, false);

            spyIsVariableDeclaration.restore();
            spyIsDynamicArray.restore();
        });
/*
        it('should call isIgnorable correctly wheb issue is ignored', () => {
            const spyIsVariableDeclaration = sinon.spy(srcmap, 'isVariableDeclaration');
            const spyIsDynamicArray = sinon.stub(srcmap, 'isDynamicArray');
            spyIsDynamicArray.returns(true);
            const info = new InfoClass([], truffleJSON);
            const issue = {
                address: 444,
                contract: 'TestContract',
                description: 'Issue description',
                function: '_function_0x00000000',
                title: 'Issie',
                type: 'Warning',
                'swc-id': 'xxx',
                tool: 'mythril'
            }
            const res = info.isIgnorable(issue, {});
            assert.ok(spyIsVariableDeclaration.called);
            assert.ok(spyIsDynamicArray.called);
            assert.ok(res);
            spyIsVariableDeclaration.restore();
            spyIsDynamicArray.restore();
        });
    
        it('should call isIgnorable correctly wheb issue is ignored in debug mode', () => {
            const spyIsVariableDeclaration = sinon.spy(srcmap, 'isVariableDeclaration');
            const spyIsDynamicArray = sinon.stub(srcmap, 'isDynamicArray');
            const loggerStub = sinon.stub();
            spyIsDynamicArray.returns(true);
            const info = new InfoClass([], truffleJSON);
            const issue = {
                address: 444,
                contract: 'TestContract',
                description: 'Issue description',
                function: '_function_0x00000000',
                title: 'Issie',
                type: 'Warning',
                'swc-id': 'xxx',
                tool: 'mythril'
            }
            const res = info.isIgnorable(issue, { debug: true, logger: { log: loggerStub } });
            assert.ok(spyIsVariableDeclaration.called);
            assert.ok(spyIsDynamicArray.called);
            assert.ok(loggerStub.called);
            assert.ok(res);
            spyIsVariableDeclaration.restore();
            spyIsDynamicArray.restore();
        });

        it('should call mythXresults2Eslint correctly', () => {
            const issues = [{
                address: 444,
                contract: 'TestContract',
                description: 'Issue description',
                function: '_function_0x00000000',
                title: 'Issie',
                type: 'Warning',
                'swc-id': 'xxx',
                tool: 'mythril'
            }];

            const spyIssue2EsLintNew = sinon.spy(InfoClass.prototype, 'issue2EsLintNew');
            const stubIsIgnorable = sinon.stub(InfoClass.prototype, 'isIgnorable');
            const loggerStub = sinon.stub();
            stubIsIgnorable.returns(false);
            const mythXresults2Eslint = rewired.__get__('mythXresults2Eslint');
            const res = mythXresults2Eslint([{
                issues,
                sourceFormat: 'evm-byzantium-bytecode',
                sourceType: 'raw-bytecode',
                sourceList: ['"0x608060405260043610610061576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff168062362a95146100665780632e1a7d4d1461009c57806359f1286d146100c9578063d5d44d8014610120575b600080fd5b61009a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610177565b005b3480156100a857600080fd5b506100c7600480360381019080803590602001909291905050506101c6565b005b3480156100d557600080fd5b5061010a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610294565b6040518082815260200191505060405180910390f35b34801561012c57600080fd5b50610161600480360381019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506102dc565b6040518082815260200191505060405180910390f35b346000808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828254019250508190555050565b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054101515610291573373ffffffffffffffffffffffffffffffffffffffff168160405160006040518083038185875af192505050151561024457600080fd5b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055505b50565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b600060205280600052604060002060009150905054815600a165627a7a72305820995dd360cfe1e03c0dded401ac885f902c03677f72bdcce6d8d845db1f313dca0029"'],
            }], truffleJSON, { logger: { log: loggerStub }})
            assert.equal(res.length, 1);
            assert.ok(spyIssue2EsLintNew.called);
            assert.ok(stubIsIgnorable.called);
            spyIssue2EsLintNew.restore();
            stubIsIgnorable.restore();
        });

        it('should call mythXresults2Eslint and return empty array when issue is ignored', () => {
            const issues = [{
                address: 444,
                contract: 'TestContract',
                description: 'Issue description',
                function: '_function_0x00000000',
                title: 'Issie',
                type: 'Warning',
                'swc-id': 'xxx',
                tool: 'mythril'
            }];

            const spyIssue2EsLintNew = sinon.spy(InfoClass.prototype, 'issue2EsLintNew');
            const stubIsIgnorable = sinon.stub(InfoClass.prototype, 'isIgnorable');
            const loggerStub = sinon.stub();
            stubIsIgnorable.returns(true);
            const mythXresults2Eslint = rewired.__get__('mythXresults2Eslint');
            const res = mythXresults2Eslint([{
                issues,
                sourceFormat: 'evm-byzantium-bytecode',
                sourceType: 'raw-bytecode',
                sourceList: ['"0x608060405260043610610061576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff168062362a95146100665780632e1a7d4d1461009c57806359f1286d146100c9578063d5d44d8014610120575b600080fd5b61009a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610177565b005b3480156100a857600080fd5b506100c7600480360381019080803590602001909291905050506101c6565b005b3480156100d557600080fd5b5061010a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610294565b6040518082815260200191505060405180910390f35b34801561012c57600080fd5b50610161600480360381019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506102dc565b6040518082815260200191505060405180910390f35b346000808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828254019250508190555050565b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054101515610291573373ffffffffffffffffffffffffffffffffffffffff168160405160006040518083038185875af192505050151561024457600080fd5b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055505b50565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b600060205280600052604060002060009150905054815600a165627a7a72305820995dd360cfe1e03c0dded401ac885f902c03677f72bdcce6d8d845db1f313dca0029"'],
            }], truffleJSON, { logger: { log: loggerStub }})
            assert.equal(res.length, 0);
            assert.ok(spyIssue2EsLintNew.notCalled);
            assert.ok(stubIsIgnorable.called);
            spyIssue2EsLintNew.restore();
            stubIsIgnorable.restore();
        });
        */
    });
});
