#! /bin/bash

npm run test && cat coverage/lcov.info | ./node_modules/coveralls/bin/coveralls.js
