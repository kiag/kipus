#!/bin/sh
# Copyright 2013-2019 KI-AG

NH=../node
export NODE_PATH=$NH/lib/node_modules

LOGFILE=refreshuserbookids.log

trap "exit" SIGINT

LOGFILE=`pwd`/$LOGFILE

echo "`date`: refreshuserbookids.sh: Started" | tee -a $LOGFILE
echo "    Logfile:  $LOGFILE"

echo "`date`: Executing refreshlookuphierarchypath.js ..." | tee -a $LOGFILE
$NH/bin/node helper/refreshlookuphierarchypath.js 2>&1 | tee -a $LOGFILE

# RKO: Not needed
# echo "`date`: Executing rootbook.js ..." | tee -a $LOGFILE
# $NH/bin/node helper/rootbook.js 2>&1 | tee -a $LOGFILE

echo "`date`: Executing createuserbookids.js ..." | tee -a $LOGFILE
$NH/bin/node helper/createuserbookids.js 2>&1 | tee -a $LOGFILE

echo "`date`: refreshuserbookids.sh: Completed" | tee -a $LOGFILE
