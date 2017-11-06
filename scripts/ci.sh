#!/bin/bash

set -e

if [ "$SOLIDITY_COVERAGE" = true ]; then
  yarn run coveralls
else
  yarn lint
  QB_DEBUG=true yarn test test/token/QiibeeToken.js test/CreatePresale.js test/CreateCrowdsale.js test/Crowdsale.js test/WhitelistedCrowdsale.js
  QB_DEBUG=true GEN_TESTS_TIMEOUT=400 GEN_TESTS_QTY=40 yarn test test/CrowdsaleGenTest.js test/PresaleGenTest.js
fi
