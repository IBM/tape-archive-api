/******************************************************************************
# The MIT License (MIT)                                                        #
#                                                                              #
# Copyright (c) 2020 Nils Haustein                             				   #
#                                                                              #
# Permission is hereby granted, free of charge, to any person obtaining a copy #
# of this software and associated documentation files (the "Software"), to deal#
# in the Software without restriction, including without limitation the rights #
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell    #
# copies of the Software, and to permit persons to whom the Software is        #
# furnished to do so, subject to the following conditions:                     #
#                                                                              #
# The above copyright notice and this permission notice shall be included in   #
# all copies or substantial portions of the Software.                          #
#                                                                              #
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR   #
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,     #
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE  #
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER       #
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,#
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE#
# SOFTWARE.                                                                    #
################################################################################
#
# General
# -------
# Name:			eeapi - Tape Archive REST API for IBM Spectrum Archive EE
# Author: 	    Nils Haustein - haustein(at)de.ibm.com
# Contributor:	Khanh V Ngo - khanhn(at)us.ibm.com
# Contributor:	Achim Christ - achim(dot)christ(at)gmail(dot)com
# Version:	0.95
# Dependencies:	
#   - nodejs version 10
#   - IBM Spectrum Archive EE version 1.3.0 and above and IBM Spectrum Scale
#   - optional: remote access to IBM Spectrum Archive EE node using ssh with pre-shared keys
# Repository: https://github.ibm.com/nils-haustein/eeapi
#
################################################################################
#
# Description
# ------------
# The Tape archive REST API facilitates controlling migration and recalls of files 
# managed by IBM Spectrum Archive Enterprise Edition. It also allows to obtain 
# component status for IBM Spectrum Archive system. The Tape archive API is a 
# REST API that provides http calls to manage files and obtain status information.
# 
# The Tape archive REST API is based on Node JavaScript (Node JS) and can be deployed 
# directly on a Spectrum Archive server or on a remote system that uses 
# password-less SSH to communicate with the Spectrum Archive server. For defining 
# the deployment and communication parameters environmental variables are available.
#
################################################################################
#
# Disclaimer: 
# -----------
# This sample is provided 'as is', without any warranty or support.
# It is provided solely for demonstrative purposes - the end user must test and
# modify this sample to suit his or her particular environment. This code is
# provided for your convenience, only - though being tested, there's no
# guarantee that it doesn't seriously break things in your environment! If you
# decide to run it, you do so on your own risk!
#
################################################################################
#
# change history: 
# ---------------
# 08/16/19 first implementation
# 08/20/19 implement test function, streamline packages and package.json
# 08/20/19 added strictHostKeyCheck=no as ssh option
# 10/15/20 use node ssh instead of ssh command executed with spawn /usr/bin/ssh
# 10/18/20 change endpoint /filestate to provide file names in request body
# 10/22/20 added new endpoint /runpolicy
# 10/23/20 streamline code and messaging
################################################################################
#
# to be done: 
# -----------
# catch wrong endpoint
# add json output to all encpoints (test, migrate, recall)
# put routes in separate files
#
******************************************************************************/


/* define required modules */
const express = require("express");
const https = require("https");
const spawn = require("child_process").spawn
const shortid = require("shortid");
const fs = require("fs");
const bodyParser = require("body-parser");
const sprintf = require("sprintf-js").sprintf;
const morgan = require("morgan");
const process = require("process");
const node_ssh = require('node-ssh')


/* assign environment variables or defaults */
// http port to be used by the API
const httpPort = process.env.EEAPI_PORT || 80; 
// when using SSH then the API does not run on eenode
const useSSH = process.env.EEAPI_USESSH || "true";
// ssh Port
const sshPort = process.env.EEAPI_SSHPORT || 22;
// ssh and scp user 
const sshUser = process.env.EEAPI_SSHUSER || "root";
// ssh and scp host address or name
const sshHost = process.env.EEAPI_SSHHOST || "localhost";
// name of the key file used for ssh
const sshKey = process.env.EEAPI_KEYFILE || "/root/.ssh/id_rsa";
// directory and file name prefix for recall filelists on EE node 
const recallFileSpec = process.env.EEAPI_RECALLFILE || "/tmp/recall-list";
// directory and file name prefix for migrate filelists on EE node
const migrateFileSpec = process.env.EEAPI_MIGRATEFILE || "/tmp/migrate-list";
// use sudo or not
const useSudo = process.env.EEAPI_USESUDO || "false"; 
// NEW directory and file name prefix for policy file name on EE node
const policyFileSpec = process.env.EEAPI_POLICYFILE || "/tmp/policy-file";

/* define global constants */
// define version
const ver = "0.92"
// common ssh and scp option
const sshOpts ="-p "+sshPort+" -o BatchMode=yes -o StrictHostKeyChecking=no -i "+sshKey+" "+sshUser+"@"+sshHost+""
const scpOpts ="-P "+sshPort+" -o BatchMode=yes -o StrictHostKeyChecking=no -i "+sshKey+""
// define bytes
var bytes = 1024*1024*1024;
// instantiate ssh object
const ssh = new node_ssh()

/*******************************************************************************
 MAIN Code
*******************************************************************************/

try { 
  // instantiate express object
  var app = express();
  var adminRoutes = express.Router();
  app.use(morgan("common"));
  app.use(bodyParser.urlencoded({extended: false}));
  app.use(bodyParser.json());

  // start web server
  app.listen(httpPort)
  // print welcome */
  console.log("Tape Archive REST API version "+ver+" started on HTTP port "+httpPort);
} catch(err) {
  console.log("ERROR: something when wrong in the webserver"+err);
}; 



/*****************************************************************************************
  Endpoint: /about
  Prints the available endpoints
  
  Example: curl -X GET http://localhost/about

*****************************************************************************************/
app.get("/about", function(req, res) {
  let format = req.query.format || "text";
  let count = 0
 
  console.log("DEBUG: Route started: "+req.route.path+""); 

  res.write("Welcome to the Tape Archive REST API!\n");
  app._router.stack.forEach(function(r){
    if (r.route && r.route.path && ! r.route.path.includes("*")){
      if (format === "json") {
        let routePath = r.route.path.split('/');
        let name = routePath[1];
        if (count == 0) {
          res.write("{\"Response\": { \n"); 
        }
        count++
        res.write(sprintf("  \"%s\" : \"%3s http://%s:%s/%s\",\n", name, Object.keys(r.route.methods).toString().toUpperCase(), sshHost, httpPort, name));
      }
      else {
        res.write(sprintf("%4s http://%s:%s%s\n", Object.keys(r.route.methods).toString().toUpperCase(), sshHost, httpPort, r.route.path));
      }
    }
  });
  if (format === "json") res.write("  }\n} \n"); 
  res.end();

  console.log("DEBUG: Route finished: "+req.route.path+""); 
});

/*****************************************************************************************
  Endpoint: /test
  Performs the following tests and return status
  - print environment
  - if ssh = true then 
      test ssh & scp using the environment
      check if eeadm is installed
  - if ssh = false then test if eeadm is present
  Should be used after starting the server to check if the comminication works
  Example: curl -X GET http://localhost/test

TODO:
- produce json output
*****************************************************************************************/
app.get("/test", async function(req, res) {
  let format = req.query.format || "text";
  let output = "";
  let errNo = 0; 
  let result; 
  let dummyFile = "/tmp/localfile."+shortid.generate()+""; 
  let destFile =  "/tmp/remotefile."+shortid.generate()+"";

  const eeadmCmd = "/opt/ibm/ltfsee/bin/eeadm";
  
  console.log("DEBUG: Route started: "+req.route.path+""); 

  output = ("INFO Environment:\n  EEAPI_PORT="+httpPort+"\n  EEAPI_USESSH="+useSSH+"\n  EEAPI_SSHPORT="+sshPort+"\n  EEAPI_SSHKEY="+sshKey+"\n  EEAPI_SSHUSER="+sshUser+"\n  EEAPI_SSHHOST="+sshHost+"\n  EEAPI_USESUDO="+useSudo+"\n  EEAPI_RECALLFILE="+recallFileSpec+"\n  EEAPI_MIGRATEFILE="+migrateFileSpec+"\n  EEAPI_POLICYFILE="+policyFileSpec+"\n");
  console.log(output);

  if (useSSH == "true") {
	// test ssh
    try {
	  console.log("INFO: Checking ssh connection to "+sshUser+"@"+sshHost+" Port "+sshPort+" keyfile "+sshKey+"");
	  result = await runCommand("exit 0", "text");
      if ( result.code === 0 ) {
        output = ""+output+"INFO: ssh works\n";
        console.log("INFO: ssh works, Message: " +result.msg);
      } else {
	    output = ""+output+"ERROR: ssh failed with return code "+result.code+" message: "+result.msg+"\n"; 
        console.log("ERROR: ssh failed with return code "+result.code+" message: "+result.msg+"");
	    errNo += 1;
      };
	} catch(err) {
      console.log("ERROR: Checking ssh connection to "+sshUser+"@"+sshHost+" failed. Error message: " +err);
      res.status(500).send("ERROR: Checking ssh connection to "+sshUser+"@"+sshHost+" failed. Error message: "+err+" \nStatus: "+output+"");
	  return;
    };

	// test scp, create a dummy file and runCopy
    try {
      fs.writeFileSync(dummyFile, "scp test\n");
      console.log("INFO: calling runCopy "+dummyFile+" to "+sshUser+"@"+sshHost+":"+destFile+" Port "+sshPort+" keyfile "+sshKey+"");
	  result = await runCopy(dummyFile, destFile)

      fs.unlink(dummyFile, function(err) {
        if (err) {
          console.log("WARNING: unlink "+dummyFile+" failed with err.message \n");  
        } 
	  });

      // delete destFile
      delResult = await runCommand("/usr/bin/rm -f "+destFile, format); 
	  if ( delResult.code > 0 ) {
	    console.log("WARNING: unable to delete destinatin file ("+destFile+"). Return code "+delResult.code+".\nMessage: "+delResult.msg+"");
      };

	  if ( result.code === 0 ) {
        output = ""+output+"INFO: scp works\n";
        console.log("INFO: scp works. Message: " +result.msg);
      } else {
        output = ""+output+"ERROR: scp failed with return code "+result.code+" message: "+result.msg+"\n"; 
        console.log("ERROR: scp failed with return code "+result.code+" message: "+result.msg+"");
		errNo += 1;
	  };
	} catch(err) {
      console.log("ERROR: Failed to create and copy file to remote host. Error message: " +err);
      res.status(500).send("ERROR: Failed to create and copy file to remote host. Error message: "+err+" \nStatus: "+output+"");
	  return;
    };
	  
	// check if eeadm exists
    try {	
      console.log("INFO: checking if "+eeadmCmd+" exists on "+sshUser+"@"+sshHost+" Port "+sshPort+" keyfile "+sshKey+"");
      result = await runCommand("/usr/bin/ls /opt/ibm/ltfsee/bin/eeadm", "text");
	  if ( result.code === 0 ) {
		output = ""+output+"INFO: "+eeadmCmd+" exists\n";
        console.log("INFO: "+eeadmCmd+" exists. Message: " +result.msg);
      } else {
		output = ""+output+"ERROR: checking for "+eeadmCmd+" failed, return code "+result.code+" message: "+result.msg+""; 
        console.log("ERROR: checking for "+eeadmCmd+" failed, return code "+result.code+" message: "+result.msg+"");
		errNo += 1;
      };
	} catch(err) {
      console.log("ERROR: check for "+eeadmCmd+" failed. Error message: " +err);
      res.status(500).send("ERROR: check for "+eeadmCmd+" failed. Error message: "+err+" \nStatus: "+output+"");
	  return;
	};

    // send status and output
    if ( errNo == 0 ) {
      res.status(200).send(output);
      return;
    } else {
      res.status(500).send(output);
	  return;
    }; 	
  } else {
	console.log("INFO: checking if "+eeadmCmd+" exists on this server");
    try {
      fs.accessSync(eeadmCmd); 
      output = ""+output+"INFO: eeadm exists.\n";
      console.log("INFO: eeadm exists.\n"); 
      res.status(200).send(output);
	  return;
    } catch(err) {
        output = "ERROR: eeadm does not exists, message: "+err.message+".\n"
        console.log(output); 
        res.status(500).send(output);
        return; 
    };
  };

  console.log("INFO: Route finished: "+req.route.path+""); 
});

/*****************************************************************************************
  Endpoint: /status
  Check Spectrum Archive EE status by running eeadm node list
  Returns output of eeadm node list
  
  Example: curl -X GET http://localhost/status

*****************************************************************************************/
app.get("/status", async function(req, res) {
  let format = req.query.format || "text";
  let result;
  const cmd = "/opt/ibm/ltfsee/bin/eeadm node list";

  console.log("DEBUG: Route started: "+req.route.path+""); 
  
  try { 
    result = await runCommand(cmd, format);
	if ( result.code === 0 ) {
	  console.log("INFO: command "+cmd+" sucessful.");
	  res.status(200).send(result.msg+"\n");
	  return;
    } else {
	  console.log("ERROR: command "+cmd+"  failed with return code "+result.code+" ("+result.msg+")");
      res.status(500).send("ERROR: command "+cmd+"  failed with return code "+result.code+" ("+result.msg+")\n");
	  return;
    };
  } catch(err) {
    console.log("ERROR: function runCommand("+cmd+") failed , error message: " +err);
    res.status(500).send("ERROR: function runCommand("+cmd+") failed , error message: "+err+" \n");
	return;
  };

  console.log("DEBUG: Route finished: "+req.route.path+""); 
});


/*****************************************************************************************
  Endpoint: /info/tape|drive|node|pool|library
  Modifier: format = json | text
  Runs command: eeadm <comp> list
  Provide eeadm info command output
  
  Example: curl -X GET http://localhost/info/<cmd>
*****************************************************************************************/
app.get("/info/:cmd(tape|drive|node|pool|library)", async function(req, res) {
  let format = req.query.format || "text";
  let comp = req.params.cmd;
  let result; 
  const cmd = "/opt/ibm/ltfsee/bin/eeadm "+comp+" list";

  console.log("INFO: Route started: "+req.route.path+""); 
  
  // run command
  try {
    result = await runCommand(cmd, format);
	if ( result.code === 0 ) {
	  console.log("INFO: command "+cmd+" sucessful.");
	  res.status(200).send(result.msg+"\n");
	  return;
    } else {
	  console.log("ERROR: command "+cmd+"  failed with return code "+result.code+" ("+result.msg+")");
      res.status(500).send("ERROR: command "+cmd+"  failed with return code "+result.code+" ("+result.msg+")\n");
	  return;
    };
  } catch(err) {
    console.log("ERROR: function runCommand("+cmd+") failed , error message: " +err);
    res.status(500).send("ERROR: function runCommand("+cmd+") failed , error message: "+err+" \n");
	return;
  };

  console.log("DEBUG: Route finished: "+req.route.path+""); 
});


/*****************************************************************************************
  Endpoint: /tasks/:cmd(active|complete)
  Modifier: format = json | text
            filter = <recall|migrate|..>
  Runs command: eeadm task list [-c] 
  Provide eeadm task list [-c] output
  
  Example: curl -X GET http://localhost/tasks/:cmd(active|all)

*****************************************************************************************/
app.get("/tasks/:cmd(active|all)", async function(req, res) {
  let format = req.query.format || "text";
  let filter = req.query.filter;
  let scope = req.params.cmd;
  let opt = "";
  let result; 
  let cmd = "/opt/ibm/ltfsee/bin/eeadm task list";

  console.log("INFO: Route started: "+req.route.path+", scope="+cmd+""); 

  if (scope === "all") {
    opt = "-c";
  }

  if (filter) {
     cmd = ""+cmd+" "+opt+" | grep "+filter+"";
  }
  else {
     cmd = ""+cmd+" "+opt+"";
  }

  // run command
  try { 
    result = await runCommand(cmd, format);
    if ( result.code === 0 ) {
      console.log("INFO: command "+cmd+" sucessful.");
	  res.status(200).send(result.msg+"\n");
	  return;
    } else {
	  console.log("ERROR: command "+cmd+"  failed with return code "+result.code+" ("+result.msg+")");
      res.status(500).send("ERROR: command "+cmd+"  failed with return code "+result.code+" ("+result.msg+")\n");
	  return;
    };
  } catch(err) {
    console.log("ERROR: function runCommand("+cmd+") failed , error message: " +err);
    res.status(500).send("ERROR: function runCommand("+cmd+") failed , error message: "+err+" \n");
	return;
  };

  console.log("INFO: Route finished: "+req.route.path+""); 
});


/*****************************************************************************************
  Endpoint: /taskshow/:taskid
  Modifier: format = json | text
  Runs command: eeadm task show task-ID 
  Provide eeadm task show task-id
  
  Example: curl -X GET http://localhost/taskshow/:task-id
*****************************************************************************************/
app.get("/taskshow/:taskid", async function(req, res) {
  let format = req.query.format || "text";
  let taskid = req.params.taskid;
  let execCmd = "";
  let result;
  const cmd = "/opt/ibm/ltfsee/bin/eeadm task show ";
  
  console.log("INFO: Route started: "+req.route.path+" task-id="+taskid+""); 

  if (!isNaN(taskid)) {
    try {
      execCmd = cmd+taskid;
	  result = await runCommand(execCmd, format);
      if ( result.code === 0 ) {
        console.log("INFO: command "+execCmd+" sucessful.");
	    res.status(200).send(result.msg+"\n");
		return;
      } else {
	    console.log("ERROR: command "+execCmd+"  failed with return code "+result.code+" ("+result.msg+")");
        res.status(500).send("ERROR: command "+execCmd+"  failed with return code "+result.code+" ("+result.msg+")\n");
	    return;
      }
    } catch(err) {
      console.log("ERROR: function runCommand("+execCmd+") failed , error message: " +err);
      res.status(500).send("ERROR: function runCommand("+execCmd+") failed , error message: "+err+" \n");
	  return;
    };
  }
  else {
/*  return error */
    console.log("Error: Invalid task-ID ("+taskid+"), must be a integer number");
    res.status(412).send("Error: Invalid task-ID, must be a integer number\n");
	return;
  }

  console.log("INFO: Route finished: "+req.route.path+""); 
});

/*****************************************************************************************
  Endpoint: /filestate
  Modifier: format = json | text
  Body: list of fully qualified path and file names
  Processing:
    Runs command: eeadm file state on given file
    Provide eeadm file state output
  
  Example: curl -X GET http://localhost/filestate -d "<list of file names>"

TODO:
- accept wildcards
- produce json
*****************************************************************************************/
// the trick here is to run function(req,res) as async which allows us to wait on runCommand
app.get("/filestate", async function(req, res) {
  let format = req.query.format || "text";
  let cmd = "/opt/ibm/ltfsee/bin/eeadm file state ";
  let output = "";
  let file = ""; 
  let execCmd = "";
  let num = 0;
  let fileList; 
  let result; 

  console.log("INFO: Route started: "+req.route.path+""); 

  // assign request body to object array and try to trim and split the file list now, if it is empty, we will catch the error, 
  // expected output [ 'line1', 'line2', '', 'line3' ]
  try {
    fileList = Object.keys(req.body)[0]; 
	fileList=fileList.trim().split("\n");
  } catch (err) {
    console.log("ERROR: request body cannot be processed, message: "+err);
    res.status(412).send("ERROR: request body cannot be processed. You have to provide one file name per line in the request body.\n");
    return;
  };

  for (let file of Object.values(fileList)) {
	try {
      file = file.trimLeft();
	} catch (err) {
	  console.log ("WARNING: file name ("+file+") is not valid. Message: "+err);
	  continue;
    };
	
	if ( file === "" || file.includes(";") ) {
	  console.log("WARNING: file name ("+file+") is empty or not valid, continuing with next file.");
	  output += "Name: "+file+"\nState: invalid_file_name\n\n";
	  continue;
	} else {
	  // await runCommand to get it serialized.
	  try {
        execCmd = cmd+"'"+file+"'"; 
        console.log("INFO: runing command: "+execCmd+""); 
        result = await runCommand(execCmd, "");
	    if ( result.code === 0 ) {
          output += result.msg+"\n\n";
		  num += 1
        } else {
	      output = output+"ERROR: command "+execCmd+"  failed with return code "+result.code+" ("+result.msg+")\n";
          console.log("ERROR: command "+execCmd+"  failed with return code "+result.code+" ("+result.msg+")");
        };
      } catch(err) {
		console.log("ERROR: async function runCommand("+execCmd+") failed , error message: " +err);
        res.status(500).send("ERROR: async function runCommand("+execCmd+") failed , error message: "+err+" \n");
	  };
	};
  };

  if ( output === "" ) {
	output = "ERROR: No file names provided in request body.\n";
	console.log(output); 
	res.status(500).send(output);
	return;
  } else {
    if ( num == 0 ) {
	  output = output+"ERROR: Unable to determine the status of any given files.\n"; 
	  console.log(output); 
	  res.status(500).send(output);
	  return;
	} else {
      res.status(200).send(output);
    };
  };
  
  console.log("INFO: Route finished: "+req.route.path+""); 

});


/*****************************************************************************************
  Endpoint: /recall
  Modifier: format = json | text
  Body: list of fully qualified file names to be recalled. 
  Processing:
    Obtains file list from request.body
    Copies filelist to EE host
    Runs command: eeadm recall filelist 
    Returns result of the operation
  
  Example: curl -X PUT http://localhost/recall -d "filelist"
  
TODO:
- produce json
*****************************************************************************************/
app.put("/recall", async function(req, res) {
  let format = req.query.format || "text";
  let fileList;
  let execCmd = "";
  let result; 
  let delResult; 
  
  const cmd = "/opt/ibm/ltfsee/bin/eeadm recall ";
  const tmpFile = "/tmp/ee-restapi-reclist."+shortid.generate();
  // cannot be const because it may get tmpFile assigned
  let destFile = ""+recallFileSpec+"."+shortid.generate()+"";
  
  console.log("INFO: Route started: "+req.route.path+""); 
  // console.log("DEBUG: request body sting: "+fileList);

  // write fileList in file tmpFile 
  try {
    fileList = Object.keys(req.body)[0];
    fileList = fileList.trim();
    fs.writeFileSync(tmpFile, fileList);
  } catch (err) {
	console.log("ERROR: creating recall file-list from request body. Message: "+err);
    res.status(500).send("ERROR: creating recall-file list from request body. Message: "+err);
    return;
  };


  if ( useSSH == "true" ) {
    // send tmpFile to eenode as file destFile, return 500 (internal server error) if it fails
	try {
      console.log("INFO: copying file "+tmpFile+" to file "+destFile+""); 
      result = await runCopy(tmpFile, destFile)
 
      fs.unlink(tmpFile, function(err) {
        if (err) {
          console.log("WARNING: unlink "+tmpFile+" failed with err.message \n");  
        } 
	  });
	
	  if ( result.code === 0 ) {
        console.log("INFO: Copy done.");
      } else {
        console.log("ERROR: runCopy failed with return code "+result.code+" message: "+result.msg+"");
        res.status(500).send("ERROR: runCopy failed with return code "+result.code+" message: "+result.msg+"\n");
	    return;
      };
    } catch(err) {
      console.log("ERROR: runCopy failed, error message: " +err);
      res.status(500).send("ERROR: runcopy1 failed, error message: "+err+"\n");
	  return; 
    };
  } else {
	destFile = tmpFile; 
  };
      
  // run recall 
  try { 
    execCmd = cmd+destFile;
    console.log("INFO: running command "+execCmd+""); 
    result = await runCommand(execCmd, format);
	
    // delete destFile
    delResult = await runCommand("/usr/bin/rm -f "+destFile, format); 
	if ( delResult.code > 0 ) {
	  console.log("WARNING: unable to delete recall list file ("+destFile+"). Return code "+delResult.code+".\nMessage: "+delResult.msg+"");
    };
    
	if ( result.code === 0 ) {
	  console.log("INFO: command "+execCmd+" successful.");
	  res.status(200).send(result.msg+"\n");
	  return; 
    } else {
	  console.log("ERROR: command "+execCmd+"  failed with return code "+result.code+" ("+result.msg+")");
      res.status(500).send("ERROR: command "+execCmd+"  failed with return code "+result.code+" ("+result.msg+")\n");
	  return;
    };
  } catch(err) {
    console.log("ERROR: function runCommand("+execCmd+") failed , error message: " +err);
    res.status(500).send("ERROR: function runCommand("+execCmd+") failed , error message: "+err+" \n");
	return; 
  };

  console.log("INFO: Route finished: "+req.route.path+""); 
});

/*****************************************************************************************
  Endpoint: /migrate
  Modifier: format = json | text
            pool = poolname (required)
			pool1-pool3 = poolname (obtional)
  Body: list of fully qualified file names to be recalled. 
  Processing:
    Obtains file list from request.body and pool name from modifier ?pool1=name?po
    Copies filelist to EE host
    Runs command: eeadm migrate filelist -p pool
    Returns result of the operation
  
  Example: curl -X PUT http://localhost/migrate?pool1=pool1@lib1&pool2=pool2@lib1 -d "filelist"

TODO:
- produce json
*****************************************************************************************/
app.put("/migrate", async function(req, res) {
  // get format from URL modifier ?format=, default is text
  let format = req.query.format || "text";
  // extract the file names from req.body key field 0
  let fileList;
  let execCmd = "";
  let result;
  let delResult; 
  
  const tmpFile = "/tmp/ee-restapi-miglist."+shortid.generate();
  const cmd = "/opt/ibm/ltfsee/bin/eeadm migrate ";
  // cannot be const because it may get tmpFile assigned. 
  let destFile = ""+migrateFileSpec+"."+shortid.generate()+"";
  
  // get pool name from URL modiers
  let pool = [];
  pool[0] = req.query.pool || undefined;
  pool[1] = req.query.pool1 || undefined;
  pool[2] = req.query.pool2 || undefined;
  pool[3] = req.query.pool3 || undefined;
  let pools = "";
  let poolCount = 0;

  // build the pools string
  for (let i=0; i<=3; i++) {
    if (pool[i]) {
      if (pools === "") {
        pools = pool[i];
      } else {
          pools = ""+pools+","+pool[i]+"";
      }
      poolCount++;
    }
  }

  console.log("INFO: Route started: "+req.route.path+", pools="+pools+""); 

  // bail out if we do not have a pool
  if (pools === "") {
    console.log("ERROR: no migration destination pool specified.");
    res.status(412).send("ERROR: no migration destination pool specified, use modifier ?pool=pool \n");
    // return to prevent continuing this function
    return; 
  }

  // bail out if pool count is greate than 3
  if (poolCount > 3) {
    console.log("ERROR: Number of pools ("+poolCount+") exceeds the maximum (3).");
    res.status(412).send("ERROR: Number of pools ("+poolCount+") exceeds the maximum (3).\n");
    // return to prevent continuing this function
    return; 
  }

  // write fileList in file tmpFile 
  try {
    fileList = Object.keys(req.body)[0];
    fileList = fileList.trim();
    fs.writeFileSync(tmpFile, fileList);
  } catch (err) {
	console.log("ERROR: creating migrate file-list from request body. Message: "+err.message+"");
    res.status(500).send("ERROR: creating migrate file-list from request body. Message: "+err.message+"\n");
    return;
  };
  
  if ( useSSH == "true" ) {
    // send tmpFile to eenode as file destFile, return 500 (internal server error) if it fails
	try { 
      console.log("INFO: copying file "+tmpFile+" to file "+destFile+""); 
      result = await runCopy(tmpFile, destFile)

      fs.unlink(tmpFile, function(err) {
        if (err) {
          console.log("WARNING: unlink "+tmpFile+" failed with err.message \n");  
        } 
      });
	  	  
	  if ( result.code === 0 ) {
        console.log("INFO: Copy done.");
      } else {
        console.log("ERROR: runCopy failed with return code "+result.code+" message: "+result.msg+"");
        res.status(500).send("ERROR: runCopy failed with return code "+result.code+" message: "+result.msg+"\n");
	    return;
      };
	} catch(err) {
      console.log("ERROR: runCopy failed, error message: " +err);
      res.status(500).send("ERROR: runcopy1 failed, error message: "+err+"\n");
	  return; 
    };
  } else {
	destFile = tmpFile;   
  }
  
  // run migrate 
  try { 
    execCmd = cmd+destFile+" -p "+pools+"";
    console.log("DEBUG: running command "+execCmd+""); 
    result = await runCommand(execCmd, format);
	
    // delete destFile
    delResult = await runCommand("/usr/bin/rm -f "+destFile, format); 
	if ( delResult.code > 0 ) {
	  console.log("WARNING: unable to delete migrate list file ("+destFile+"). Return code "+delResult.code+".\nMessage: "+delResult.msg+"");
    };
    
	if ( result.code === 0 ) {
	  console.log("INFO: command "+execCmd+" sucessful.");
	  res.status(200).send(result.msg+"\n");
	  return; 
    } else {
	  console.log("ERROR: command "+execCmd+"  failed with return code "+result.code+" ("+result.msg+")");
      res.status(500).send("ERROR: command "+execCmd+"  failed with return code "+result.code+" ("+result.msg+")\n");
	  return;
    };
  } catch(err) {
    console.log("ERROR: function runCommand("+execCmd+") failed , error message: " +err);
    res.status(500).send("ERROR: function runCommand("+execCmd+") failed , error message: "+err+" \n");
	return; 
  };

  console.log("INFO: Route finished: "+req.route.path+""); 
});

/*****************************************************************************************
  Endpoint: /runpolicy
  Modifier: format = json | text
  Body: Path, options and policy to run in the following format:
    Options: options (must all be in one line)
    Path: path for the policy run (must all be in one line)
	Policy: policy rules (can cross over multiple lines)
	Note, all lines which do not have any of the token above are interpreted as policy
  Processing:
    Runs command: mmapplypolicy path -P policyfile [opts]
    Provide eeadm file state output
  
  Example: curl -X PUT http://localhost/runpolicy -d "<Path: scope-for-policy \nOptions: [opts] \nPolicy: \n"

TODO:
- produce json
*****************************************************************************************/
// the trick here is to run function(req,res) as async which allows us to wait on runCommand
app.put("/runpolicy", async function(req, res) {
  let format = req.query.format || "text";
  let reqBody; 
  let path = "";
  let opts = "";
  let policy = "";   
  let execCmd = ""; 
  let result; 
  let delResult;  
  const cmd = "/usr/lpp/mmfs/bin/mmapplypolicy ";
  const tmpFile = "/tmp/ee-restapi-polfile."+shortid.generate();
  // cannot be const because it may get tmpFile assigned. 
  let destFile = ""+policyFileSpec+"."+shortid.generate()+"";

  console.log("INFO: Route started: "+req.route.path+""); 

  // assign request body to object array and try to trim and split the file list now, if it is empty, we will catch the error, 
  // expected output [ 'line1', 'line2', '', 'line3' ]
  try {
    reqBody = Object.keys(req.body)[0]; 
	reqBody=reqBody.trim().split("\n");
//    console.log("DEBUG: reqBody:");
//    console.log(reqBody);
  } catch (err) {
    console.log("ERROR: request body cannot be processed, message: "+err);
    res.status(412).send("ERROR: request body cannot be processed. You have to provide one file name per line in the request body.\n");
    return;
  };

  for (let line of Object.values(reqBody)) {
	try {
      line = line.trimLeft();
	} catch (err) {
	  console.log ("WARNING: Line ("+line+") is not valid. Message: "+err);
	  continue;
    };
	
	// catch empty lines and escapes
	if ( line === "" || line.includes(";")) {
	  console.log("WARNING: Line ("+line+") is empty or not valid, continuing with next line.");
	  continue;
	} 
	if ( line.includes("Path:") ) {
	  path = line.split(":")[1];
	  path = path.trimLeft(); 
      continue;
	}; 
    if ( line.includes("Options:") ) {
	  opts += line.split(":")[1]; 
	  opts = opts.trimLeft();
	  continue;
	};
    if ( line.includes("Policy:") ) {
	  policy = line.split(":")[1];
	  policy = policy.trimLeft(); 
      if ( policy === "" ) {
        policy = "";
	  } else {
		policy += "\n";
	  }
	} else {
	  policy += line+"\n"
	};
  };

  if ( path === "" || opts == "invalid" ) {
	console.log("ERROR Path ("+path+") or Options ("+opts+") not specified or not valid.\n"); 
	res.status(500).send("ERROR Path or Options not specified or not valid.\n");
	return;
  } else {
    if ( policy == "" ) {
	  console.log("ERROR Policy not specified or invalid.\n");
	  res.status(500).send("ERROR Policy not specified.\n");
	  return;
	} else {
      // write policy in file tmpFile 
	  console.log("DeBUG: policy:");
	  console.log(policy); 
      try {
        await fs.writeFileSync(tmpFile, policy);
      } catch (err) {
	    console.log("ERROR: creating policy file. Message: "+err);
        res.status(500).send("ERROR: creating policy file. Message: "+err+"\n");
        return;
      };
	  
	  if ( useSSH == "true" ) {
        // send tmpFile to eenode as file destFile, return 500 (internal server error) if it fails
		try {
          console.log("INFO: copying file "+tmpFile+" to file "+destFile+""); 
          result = await runCopy(tmpFile, destFile)

          fs.unlink(tmpFile, function(err) {
            if (err) {
              console.log("WARNING: unlink "+tmpFile+" failed: "+err);  
            } 
          });


          if ( result.code === 0 ) {
            console.log("INFO: Copy done.");
		  } else {
            console.log("ERROR: runCopy failed with return code "+result.code+" message: "+result.msg+"");
            res.status(500).send("ERROR: runCopy failed with return code "+result.code+" message: "+result.msg+"");
	        return;
          };
		} catch (err) {
          console.log("ERROR: runCopy failed, error message: " +err);
          res.status(500).send("ERROR: runcopy failed, error message: "+err+"\n");
          return; 
        };
	  } else {
		destFile = tmpFile; 
	  };

	  // run policy
	  try {
        execCmd = ""+cmd+""+path+" -P "+destFile+" "+opts+"";
	    console.log("INFO: running command "+execCmd+""); 
	    result = await runCommand(execCmd, format);

        // delete destFile
		delResult = await runCommand("/usr/bin/rm -f "+destFile, format); 
		if ( delResult.code > 0 ) {
	      console.log("WARNING: unable to delete policy file ("+destFile+"). Return code "+delResult.code+".\nMessage: "+delResult.msg+"");
        };
		
        if ( result.code === 0 ) {
	      console.log("INFO: command "+execCmd+" sucessful.");
          res.status(200).send(result.msg+"\n");
		  return; 
        } else {
	      console.log("ERROR: command "+execCmd+"  failed with return code "+result.code+".\nMessage: "+result.msg+"");
          res.status(500).send("ERROR: command "+execCmd+"  failed with return code "+result.code+".\nMessage: "+result.msg+"\n");
		  return;
        };
      } catch(err) {
        console.log("ERROR: function runCommand("+execCmd+") failed , error message: " +err);
        res.status(500).send("ERROR: function runCommand("+execCmd+") failed , error message: "+err+" \n");
		return;
      };
    };
  };
  
  console.log("INFO: Route finished: "+req.route.path+""); 

});

/*****************************************************************************************
  Default Endpoint: (catch wrong GET endpoints)
  Processing:
    send default error message  
  Example: curl -X get http://localhost/something

TODO:
- produce json
*****************************************************************************************/
app.get('*', function(req, res, next) {
	
  const output = "ERROR: 404 - Endpoint not found. For available endpoints see: GET http://localhost/about\n";
  console.log(output); 
  res.status(404).send(output); 
  
});

/*****************************************************************************************
  Default Endpoint: (catch wrong PUT endpoints)
  Processing:
    send default error message  
  Example: curl -X put http://localhost/something

TODO:
- produce json
*****************************************************************************************/
app.put('*', function(req, res, next) {
	
  const output = "ERROR: 404 - Endpoint not found. For available endpoints see: GET http://localhost/about\n";
  console.log(output); 
  res.status(404).send(output); 
  
});


/********************************************************************
  HELPER FUNCTIONS
********************************************************************/
/********************************************************************
   Function: runCommand
   Input: 
    1. command string to run
	2. format identifier (json is being tolerated, otherwise text
   Return: 
     returns a promise, consisting of promise.code and promise.msg
	 Code can be:
	 0: ssh command completed successfully
	 x: ssh specific codes
*********************************************************************/
function runCommand(command, format) { 
  let cmdPrefix = ""; 
  let cmdPostfix = "";
  let proc;
  let output="";
  
  // assign command prefix: if useSudo is set then sudo should be used
  if (useSudo === "true") {
    cmdPrefix = "/usr/bin/sudo ";
  }
  
  // assign command post fix: if format is set to json then set json
  if (format === "json") {
    cmdPostfix = " --json ";
  }
  
  // compose command
  cmd = cmdPrefix+command+cmdPostfix;

  // create promise
  return new Promise((resolve, reject) => {
	if ( useSSH == "true" ) {  
      console.log("DEBUG: runCommand: "+cmd+" on "+sshUser+"@"+sshHost+" at Port "+sshPort+" with keyfile "+sshKey+"");
      ssh.connect({
        host: sshHost,
        username: sshUser,
        privateKey: sshKey,
        port: sshPort, 
      })
	  .then(function(sshcon_result) {
//    console.log("DEBUG: connected: "+sshUser+"@"+sshHost+" on port: "+sshPort+" with ID file: "+sshKey+"");
        ssh.execCommand(cmd, { options: { pty: true }}).then(function(exec_result) {
	      resolve({
            'code' : exec_result.code,
            'msg' : exec_result.stdout+exec_result.stderr 		
	      });
        })
        .catch(function(err) {
          console.log("DEBUG ERROR: runCommand ssh.execCommand failed for command "+cmd+", error message: " +err);
          reject(err);
	      return;
        });
      })
      .catch(function(err) {
        console.log("DEBUG ERROR: runCommand failed to connect to: "+sshUser+"@"+sshHost+"on port: "+sshPort+" with ID file: "+sshKey+", error message: "+err);
        reject(err);
         return;
      });
    } else {
      console.log("DEBUG: runCommand: "+cmd+" on local");
	  try {
	    proc = spawn("/bin/sh",["-c", cmd]);
	  } catch(err) {
		console.log("DEBUG ERROR: runCommand failed for command "+cmd+", error message: "+err);
        reject(err);
        return; 		
	  }
	  proc.stdout.on("data", function(data) {
		output += data;
	  });
	  proc.stderr.on("data", function(data) {
		output += data; 
		console.log("stderr: "+data);
	  });
	  proc.on("exit", function(code) {
		resolve({
          'code' : code,
          'msg' : output 		
	    });
	  });
	};
// close promise  
  });
};


/********************************************************************
   Function: runCopy
   Input: local file name, remote file name
   Processing: copies local file to destination host as remote file
   Return: returns a promise comprised of: promise.code and promise.msg
   Code can be:
   0: ok
   x: scp specific
*********************************************************************/
function runCopy(lf, rf) {
  let proc;
  let output = "";
  
    // create promise
  return new Promise((resolve, reject) => {
	if ( useSSH == "true" ) {  
      console.log("DEBUG: runCopy: putFile on "+sshUser+"@"+sshHost+" at Port "+sshPort+" with keyfile "+sshKey+"");
      ssh.connect({
        host: sshHost,
        username: sshUser,
        privateKey: sshKey,
        port: sshPort, 
      })
      .then(function(result) {
//    console.log("DEBUG: connected to : "+sshUser+"@"+sshHost+" on port: "+sshPort+" with ID file: "+sshKey+"");
        ssh.putFile(lf, rf, undefined, { options: { pty: true }}).then(function() {
//      console.log("SUCCESS: runCopy ok!");
	      resolve({
            'code' : 0,
            'msg' : "file "+lf+" copied to "+sshHost+":"+rf+"",
	      });
        })
        .catch(function(err) {
          console.log("DEBUG ERROR: in runCopy, scp failed, message: " +err.message);
          reject(err);
	      return;
        });
      })
      .catch(function(err) {
         console.log("DEBUG ERROR: in runCopy, failed to connect to: "+sshUser+"@"+sshHost+"on port: "+sshPort+" with ID file: "+sshKey+"");
         reject(err);
         return;
      });
	} else {
	  const copyCmd = "/usr/bin/cp "+lf+" "+rf+"";
      console.log("DEBUG: runCopy: "+copyCmd);
	  try {
        proc = spawn("/bin/sh",["-c", copyCmd]);
	  } catch(err) {
        console.log("DEBUG ERROR: runCopy failed for command "+copyCmd+", error message: "+err);
        reject(err);
        return; 		
	  };
	  proc.stdout.on("data", function(data) {
	    output += data;
	  });
	  proc.stderr.on("data", function(data) {
		output += data; 
	    console.log("stderr: "+data);
	  });
	  proc.on("exit", function(code) {
		resolve({
          'code' : code,
          'msg' : output 		
	    });
	  });
	};
  // close promise
  });
};


/********************************************************************
   Function: convertFileInfo
   Input: 
     code: return code of the command
     output: text output of eeadm file state
   Processing: runs through the output and creates json format
   Return: returns file state in json format
*********************************************************************/
function convertFileInfo(code, output) {

  let lines = output.trim().split("\n");
  let files = [];
  let file = {};
  let numnames = 0;

  for (let line of lines) {
    // Skip empty lines
    if (line === "") { continue; }

	// Parse line
    let keyvaluepair = line.split(':');

	// Check if this is a new record
	if (keyvaluepair[0] === 'Name') {
	  
	  if (numnames === 0) {
        // Very first record, just count it
        numnames++;
      } else {
        // New record after first one, add previous file to array
        //console.log(file); 
		files.push(file);
		file = new Object();
	  }
    }

	// Add record to object
	file[keyvaluepair[0].toLowerCase()] = keyvaluepair[1];
  }

  // Add last file to array
  // console.log(file); 
  files.push(file);

  return({Response: {Error: code, files: files}});
}
