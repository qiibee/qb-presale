#!/bin/bash

set -e

if [ "$SOLIDITY_COVERAGE" = true ]; then
  npm run test && cat coverage/lcov.info | ./node_modules/coveralls/bin/coveralls.js
else
  npm run test
fi
