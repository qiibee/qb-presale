#!/bin/bash

set -e

if [ "$SOLIDITY_COVERAGE" = true ]; then
  yarn run coveralls
else
  GEN_TESTS_TIMEOUT=400 GEN_TESTS_QTY=40 yarn test test/QiibeePresaleGenTest.js test/QiibeeCrowdsaleGenTest.js
  yarn test test/Crowdsale.js
  yarn test test/QiibeeToken.js test/QiibeeCrowdsale.js test/WhitelistedCrowdsale.js
fi
