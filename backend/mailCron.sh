#!/bin/sh
# Copyright 2013-2019 KI-AG
home=$HOME/kipus/backend

logfile=$home/mailCron.log
exec >> $logfile 2>&1

cd $home

NH=../node
export NODE_PATH=$NH/lib/node_modules

trap "exit" SIGINT

echo "`date`: Executing mailCron.js ..." | tee -a $LOGFILE
$NH/bin/node helper/mailCron.js 2>&1 | tee -a $LOGFILE

