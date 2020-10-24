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
commands="about test status info/tape info/node info/pool info/library tasks/all tasks/active taskshow/1054 filestate recall migrate"

fileList=$(echo -e "/gpfs/fs1/ee/test1/file_0.pdf\n/gpfs/fs1/ee/test1/file_1.pdf\n/gpfs/fs1/ee/test1/file_2.pdf\n/gpfs/fs1/ee/test1/file _ 6 .pdf\n/gpfs/fs1/ee/test1/file_7.pdf")

urlprefix="http://localhost:"$port"/"

for cmd in $commands;
do
  url="$urlprefix$cmd"
  if [[ "$cmd" != "recall" && "$cmd" != "migrate" && "$cmd" != "filestate" && "$cmd" != "runpolicy" ]];
  then 
    curlcmd="curl -X GET "$url
  else
    if [[ "$cmd" == "filestate" ]]; 
	then
	  op=GET
	else
	  op=PUT
	fi
    if [[ "$cmd" == "migrate" ]]; 
	then
	  url=$url"?pool=pool1"
	fi

    curlcmd="curl -X $op "$url" -d \"$fileList\""
  fi 
  echo "Command: $curlcmd"
  eval "$curlcmd"
  echo "===================================================================="
  echo "Press Enter (CTRL-C to finish)"
#  read a 
done

exit 0