'use strict';


const fs = require('fs');
const armlet = require('armlet');
const mythx = require('./lib/mythx');
const trufstuf = require('./lib/trufstuf');
const { MythXIssues } = require('./lib/issues2eslint');
const contracts = require('truffle-workflow-compile');
const util = require('util');

const readFile = util.promisify(fs.readFile);
const contractsCompile = util.promisify(contracts.compile);

/**
 *
 * Loads preferred ESLint formatter for warning reports.
 *
 * @param {String} config
 * @returns ESLint formatter module
 */
function getFormatter(style) {
    const formatterName = style || 'stylish';
    try {
        return require(`eslint/lib/formatters/${formatterName}`);
    } catch (ex) {
        ex.message = `\nThere was a problem loading formatter option: ${style} \nError: ${
            ex.message
        }`;
        throw ex;
    }
}


/**
 *
 * Returns a JSON object from a version response. Each attribute/key
 * is a tool name and the value is a version string of the tool.
 *
 * @param {Object} jsonResponse
 * @returns string  A comma-separated string of tool: version
 */
function versionJSON2String(jsonResponse) {
    return Object.keys(jsonResponse).map((key) => `${key}: ${jsonResponse[key]}`).join(', ');
}

/**
 *
 * Handles: truffle run analyze --help
 *
 * @returns promise which resolves after help is shown
 */
function printHelpMessage() {
    return new Promise(resolve => {
        const helpMessage = `Usage: truffle run analyze [options] [*contract-name1* [*contract-name2*] ...]

Runs MythX analyses on given Solidity contracts. If no contracts are
given, all are analyzed.

Options:
  --debug    Provide additional debug output
  --mode { quick | full }
             Perform quick or in-depth (full) analysis.
  --style {stylish | unix | visualstudio | table | tap | ...},
             Output report in the given es-lint style style.
             See https://eslint.org/docs/user-guide/formatters/ for a full list.
  --timeout *seconds* ,
          Limit MythX analyses time to *s* seconds.
          The default is 120 seconds (two minutes).
  --version show package and MythX version information
`;
        // FIXME: decide if this is okay or whether we need
        // to pass in `config` and use `config.logger.log`.
        console.log(helpMessage);
        resolve(null);
    });
}

/**
 *
 * Handles: truffle run analyze --version
 * Shows version information for this plugin and each of the MythX components.
 *
 * @returns promise which resolves after MythX version information is shown
 */
function printVersion() {
    return new Promise(resolve => {
        const pjson = require('./package.json');
        // FIXME: decide if this is okay or whether we need
        // to pass in `config` and use `config.logger.log`.
        console.log(`${pjson.name} ${pjson.version}`);
        const version = armlet.ApiVersion();
        console.log(versionJSON2String(version));
        resolve(null);
    });
}


/**
 * Runs MythX security analyses on smart contract build json files found
 * in truffle build folder
 *
 * @param {armlet.Client} client - instance of armlet.Client to send data to API.
 * @param {Object} config - Truffle configuration object.
 * @param {Array<String>} jsonFiles - List of smart contract build json files.
 * @param {Array<String>} contractNames - List of smart contract name to run analyze (*Optional*).
 * @returns {Promise} - Resolves array of hashmaps with issues for each contract.
 */
const doAnalysis = async (client, config, jsonFiles, contractNames = null) => {
    /**
   * Multiple smart contracts need to be run concurrently
   * to speed up analyze report output.
   * Because simple forEach or map can't handle async operations -
   * async map is used and Promise.all to be notified when all analyses
   * are finished.
   */

    const results = await Promise.all(jsonFiles.map(async file => {
        const buildJson = await readFile(file, 'utf8');
        const buildObj = JSON.parse(buildJson);

        /**
     * If contractNames have been passed then skip analyze for unwanted ones.
     */
        if (contractNames && contractNames.indexOf(buildObj.contractName) < 0) {
            return [null, null];
        }

        const obj = new MythXIssues(buildObj);

        let analyzeOpts = {
            data: obj.buildObj,
            timeout: (config.timeout || 120) * 1000,
            clientToolName: 'truffle',
        };

        analyzeOpts.data.analysisMode = analyzeOpts.mode || 'full';

        try {
            const reports = await client.analyze(analyzeOpts);
	    // For debugging:
	    // const util = require('util');
	    // console.log(`${util.inspect(reports, {depth: null})}`);
            obj.setIssues(reports);
            return [null, obj];
        } catch (err) {
            return [err, null];
        }
    }));

    return results.reduce((accum, curr) => {
        const [ err, obj ] = curr;
        if (err) {
            accum.errors.push(err);
        } else if (obj) {
            accum.objects.push(obj);
        }
        return accum;
    }, { errors: [], objects: [] });
};

/**
 *
 * @param {Object} config - truffle configuration object.
 */
async function analyze(config) {
    const armletOptions = {
	clientToolName: 'truffle'  // client chargeback
    };

    if (process.env.MYTHX_API_KEY) {
        armletOptions.apiKey = process.env.MYTHX_API_KEY;
    } else {
        if (!process.env.MYTHX_PASSWORD) {
            throw new Error('You need to set environment variable MYTHX_PASSWORD to run analyze.');
        }

        armletOptions.password = process.env.MYTHX_PASSWORD;

        if (process.env.MYTHX_ETH_ADDRESS) {
            armletOptions.ethAddress = process.env.MYTHX_ETH_ADDRESS;
        } else if (process.env.MYTHX_EMAIL) {
            armletOptions.email = process.env.MYTHX_EMAIL;
        } else {
            throw new Error('You need to set either environment variable MYTHX_ETH_ADDRESS or MYTHX_EMAIL to run analyze.');
        }
    }

    const client = new armlet.Client(armletOptions);

    // Extract list of contracts passed in cli to analyze
    const contractNames = config._.length > 1 ? config._.slice(1, config._.length) : null;

    // Get list of smart contract build json files from truffle build folder
    const jsonFiles = await trufstuf.getTruffleBuildJsonFiles(config.contracts_build_directory);

    if (!config.style) {
	config.style = 'stylish'
    }

    const { objects, errors } = await doAnalysis(client, config, jsonFiles, contractNames);

    const spaceLimited = ['tap', 'markdown'].indexOf(config.style) !== -1;
    const eslintIssues = objects
        .map(obj => obj.getEslintIssues(spaceLimited))
        .reduce((acc, curr) => acc.concat(curr), []);;

    errors.forEach(err => console.error(err, err.stack));

    // FIXME: temporary solution until backend will return correct filepath and output.
    const eslintIssuesBtBaseName = groupEslintIssuesByBasename(eslintIssues);

    const formatter = getFormatter(config.style);
    console.log(formatter(eslintIssuesBtBaseName));
}


// FIXME: this stuff is cut and paste from truffle-workflow-compile writeContracts
var mkdirp = require('mkdirp');
var path = require('path');
var { promisify } = require('util');
var OS = require('os');

/**
 * A 2-level line-column comparison function.
 * @returns {integer} -
      zero:      line1/column1 == line2/column2
      negative:  line1/column1 < line2/column2
      positive:  line1/column1 > line2/column2
*/
function compareLineCol(line1, column1, line2, column2) {
    return line1 === line2 ?
        (column1 - column2) :
        (line1 - line2);
}

/**
 * A 2-level comparison function for eslint message structure ranges
 * the fields off a message
 * We use the start position in the first comparison and then the
 * end position only when the start positions are the same.
 *
 * @returns {integer} -
      zero:      range(mess1) == range(mess2)
      negative:  range(mess1) <  range(mess2)
      positive:  range(mess1) > range(mess)

*/
function compareMessLCRange(mess1, mess2) {
    const c = compareLineCol(mess1.line, mess1.column, mess2.line, mess2.column)
    return c != 0 ? c : compareLineCol(mess1.endLine, mess1.endCol, mess2.endLine, mess2.endCol);
}

async function writeContracts(contracts, options) {
    var logger = options.logger || console;

    const result = await promisify(mkdirp)(options.contracts_build_directory);

    if (options.quiet != true && options.quietWrite != true) {
        logger.log('Writing artifacts to .' + path.sep + path.relative(options.working_directory, options.contracts_build_directory) + OS.EOL);
    }

    var extra_opts = {
        network_id: options.network_id
    };

    const contractNames = Object.keys(contracts).sort();
    const sources = contractNames.map(c => contracts[c].sourcePath);
    for (let c of contractNames) {
        contracts[c].sources = sources;
    }
    await options.artifactor.saveAll(contracts, extra_opts);
}


/**
 * Temporary function which turns eslint issues grouped by filepath
 * to eslint issues rouped by filename.

 * @param {ESLintIssue[]}
 * @returns {ESListIssue[]}
 */
const groupEslintIssuesByBasename = issues => {
    const path = require('path');
    const mappedIssues = issues.reduce((accum, issue) => {
        const {
            errorCount,
            warningCount,
            fixableErrorCount,
            fixableWarningCount,
            filePath,
            messages,
        } = issue;

        const basename = path.basename(filePath);
        if (!accum[basename]) {
            accum[basename] = {
                errorCount: 0,
                warningCount: 0,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: filePath,
                messages: [],
            };
        }
        accum[basename].errorCount += errorCount;
        accum[basename].warningCount += warningCount;
        accum[basename].fixableErrorCount += fixableErrorCount;
        accum[basename].fixableWarningCount += fixableWarningCount;
        accum[basename].messages = accum[basename].messages.concat(messages);
        return accum;
    }, {});

    const issueGroups = Object.values(mappedIssues);
    for (const group of issueGroups) {
        group.messages = group.messages.sort(function(mess1, mess2) {
            return compareMessLCRange(mess1, mess2);
        });

    };
    return issueGroups;
};


module.exports = {
    analyze,
    compareLineCol,
    printVersion,
    printHelpMessage,
    contractsCompile,
    writeContracts,
};
