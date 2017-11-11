![](https://avatars3.githubusercontent.com/u/31820267?v=4&s=100)

QBX Token
=======================

[![Build Status](https://travis-ci.org/qiibee/qb-contracts.svg?branch=master)](https://travis-ci.org/qiibee/qb-contracts)
[![Coverage Status](https://coveralls.io/repos/github/qiibee/qb-contracts/badge.svg?branch=master)](https://coveralls.io/github/qiibee/qb-contracts?branch=master)

QBX is the token (ERC20 based) of the qiibee protocol.


## Requirements

Node v7.6 or higher (versions before 7.6 do not support async/await that is used in the QiibeeToken tests)

## Install

```sh
npm install
```

## Main Contracts

- [QiibeeToken](contracts/QiibeeToken.sol)
- [QiibeeCrowdsale](contracts/QiibeeCrowdsale.sol)
- [QiibeePresale](contracts/QiibeePresale.sol)

## Test

* To run all tests: `npm test`

* To run a specific test: `npm test -- test/Crowdsale.js`

There are also two environment variables (`GEN_TESTS_QTY` and `GEN_TESTS_TIMEOUT`) that regulate the duration/depth of the property-based tests, so for example:

```sh
GEN_TESTS_QTY=50 GEN_TESTS_TIMEOUT=300 npm test
```

will make the property-based tests in `test/QiibeeCrowdsaleGenTest.js` `test/QiibeePresaleGenTest.js` to run 50 examples in a maximum of 5 minutes

## License

qiibee Token is open source and distributed under the Apache License v2.0
