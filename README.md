![](https://avatars3.githubusercontent.com/u/31820267?v=4&s=100)

QBX Presale
=======================

[![Build Status](https://travis-ci.org/qiibee/qb-contracts.svg?branch=master)](https://travis-ci.org/qiibee/qb-presale)
[![Coverage Status](https://coveralls.io/repos/github/qiibee/qb-contracts/badge.svg?branch=master)](https://coveralls.io/github/qiibee/qb-contracts?branch=master)


## Requirements

Node v8 or higher

## Install

```sh
npm install
```

## Main Contracts

- [QiibeePresale](contracts/QiibeePresale.sol)

## Test

* To run all tests: `npm test`

* To enable verbose mode: `npm test --v` OR `npm test --verbose`

* To run a specific test: `npm test -- test/QiibeePresale.js`

There are also two environment variables (`GEN_TESTS_QTY` and `GEN_TESTS_TIMEOUT`) that regulate the duration/depth of the property-based tests, so for example:

```sh
GEN_TESTS_QTY=50 GEN_TESTS_TIMEOUT=300 npm test
```

will make the property-based tests in `test/QiibeePresaleGenTest.js` to run 50 examples in a maximum of 5 minutes


## Coverage
Coverage has been disable because of conflicts with the different solidity versions of the contracts.

## License

qiibee Token is open source and distributed under the Apache License v2.0
