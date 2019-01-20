#!/bin/sh
# Copyright 2013-2019 KI-AG

name=`awk '/exports.prefix/{print $3;}' config.js | sed -e 's/[^a-zA-Z0-9_]//g'`
export NODE_PATH=`npm root -g`

# Exchange the database (first 4 lines)
if test $# = 1; then
  sed -e '5,$d' config.js > config.js.new
  sed -e '1,4d' $1 >> config.js.new
  sed -e 's/module.exports.httpPort.*/module.exports.httpPort = 8081;/' config.js.new > config.js
fi

while true
do
  node backend.js $name 2>&1 | tee -a backend.log
  # 10 seconds to allow mysql to swap in (innovafrica)
  sleep 10
done
