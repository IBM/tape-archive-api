#!/bin/bash

# Test program for eeapi

if [[ -z $1 ]]; 
then
  echo "ERROR: port number missing"
  echo "       Syntax: $0 [portnumber]"
  echo "               portnumber is the port of the eeapi server."
  echo 
  exit 1
else
  port=$1
fi

# this includes all routes to test
commands="about test status info/tape info/node info/pool info/library tasks/all tasks/active taskshow/1054 filestate/gpfs/fs1/ee/dir0/file0 recall migrate"

urlprefix="http://localhost:"$port"/"

for cmd in $commands;
do
  url="$urlprefix$cmd"
  if [[ "$cmd" != "recall" && "$cmd" != "migrate" ]];
  then 
    curlcmd="curl -X GET "$url
  else
    curlcmd="curl -X PUT "$url
  fi 
  echo "Command: $curlcmd"
  eval "$curlcmd"
  echo "===================================================================="
  echo "Press Enter (CTRL-C to finish)"
  read a 
done

exit 0