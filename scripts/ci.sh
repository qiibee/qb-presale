#!/bin/bash

set -e

if [ "$SOLIDITY_COVERAGE" = true ]; then
  yarn run coveralls
else
  GEN_TESTS_TIMEOUT=400 GEN_TESTS_QTY=40 yarn test test/PresaleGenTest.js test/CrowdsaleGenTest.js
  yarn test test/Crowdsale.js
  yarn test test/token/QiibeeToken.js test/QiibeePresale.js test/QiibeeCrowdsale.js test/WhitelistedCrowdsale.js
fi