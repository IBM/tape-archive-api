/******************************************************************************
# The MIT License (MIT)                                                        #
#                                                                              #
# Copyright (c) 2019 Nils Haustein                             				   #
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
# Version:	0.91
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
#
################################################################################
#
# to be done: 
# -----------
# cleanup debug message and add console.debug
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

/* define global constants */
// define version
const ver = "0.91"
// common ssh and scp option
const sshOpts ="-p "+sshPort+" -o BatchMode=yes -o StrictHostKeyChecking=no -i "+sshKey+" "+sshUser+"@"+sshHost+""
const scpOpts ="-P "+sshPort+" -o BatchMode=yes -o StrictHostKeyChecking=no -i "+sshKey+""
// define bytes
var bytes = 1024*1024*1024;

/* instantiate express object */
var app = express();
var adminRoutes = express.Router();
app.use(morgan("common"));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());


/*****************************************************************************************
  Endpoint: /about
  Prints the available endpoints
  
  Example: curl -X GET http://localhost/about

*****************************************************************************************/
app.get("/about", function(req, res) {
  let format = req.query.format || "text";
  let count = 0
 
  console.log("DEBUG: Route started: "+req.route.path+""); 

  res.write("Welcome to the Tape Archve REST API!\n");
  app._router.stack.forEach(function(r){
    if (r.route && r.route.path){
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
app.get("/test", function(req, res) {
  let format = req.query.format || "text";
  let output = "";
  let worker;

  console.log("DEBUG: Route started: "+req.route.path+""); 

  output = ("INFO Environment:\n  EEAPI_PORT="+httpPort+"\n  EEAPI_USESSH="+useSSH+"\n  EEAPI_SSHPORT="+sshPort+"\n  EEAPI_SSHKEY="+sshKey+"\n  EEAPI_SSHUSER="+sshUser+"\n  EEAPI_SSHHOST="+sshHost+"\n  EEAPI_RECALLFILE="+recallFileSpec+"\n  EEAPI_MIGRATEFILE="+migrateFileSpec+"\n");

  if (useSSH == "true") {
    // run ssh test
    worker = runCommand("exit 0", "text", undefined);

    worker.stdout.on("data", function(data) {
      console.log("stdout: "+data);
    });
    worker.stderr.on("data", function(data) {
      output = ""+output+"stderr: "+data+""; 
    });
    worker.on("exit", function(code) {
      if (code != 0 ) {
        output = ""+output+"\nERROR: ssh connection failed with return code: "+code+"\n";
        console.log(output); 
        res.status(500).send(output);
      }
      else {
        // if ssh works then check if scp wors
        output = ""+output+"INFO: ssh works\n";
        
        // create dummy file
        let dummyFile="/tmp/dummyFile"; 
        try {
          fs.writeFileSync(dummyFile, "scp test");
        } catch (err) {
	      console.log("ERROR: writing to file "+dummyFile+", message: "+err.message+", return http 500\n");
          res.status(500).send("ERROR: creating test file, message: "+err.message+"");
          return;
        }

        // send file to remote host
        let destFile = ""+recallFileSpec+"."+shortid.generate()+"";
        worker=runCopy(dummyFile, destFile); 

        worker.stdout.on("data", function(data) {
          console.log("stdout: "+data);
        });
        worker.stderr.on("data", function(data) {
          output = ""+output+"stderr: "+data+""; 
        });
        worker.on("exit", function(code) {
          if (code != 0 ) {
            output = ""+output+"\nERROR: scp connection failed with return code: "+code+"\n";
            console.log(output); 
            res.status(500).send(output);
          }
          else {
            output = ""+output+"INFO: scp works\n";
            // if ssh works then check if scp wors
        
            worker=runCommand("/usr/bin/ls /opt/ibm/ltfsee/bin/eeadm", "text", undefined); 

            worker.stdout.on("data", function(data) {
              console.log("stdout: "+data);
            });
            worker.stderr.on("data", function(data) {
              output = ""+output+"stderr: "+data+""; 
            });
            worker.on("exit", function(code) {
              if (code != 0 ) {
                output = ""+output+"\nERROR: checking presence of eeadm failed with return code: "+code+"\n";
                console.log(output); 
                res.status(500).send(output);
              }
              else {
                output = ""+output+"INFO: eeadm is present\n";
                console.log(output); 
                res.send(output);
              }
            });
          }
        });
      }
    });
  }
  else {
    let eeadmFile = "/opt/ibm/ltfsee/bin/eeadm";
    try {
        fs.accessSync(eeadmFile); 
    } catch(err) {
        output = ""+output+"ERROR: eeadm does not exists, message: "+err.message+".\n"
        console.log(output); 
        res.status(500).send(output);
        return; 
    }
    output = ""+output+"INFO: eeadm exists.\n";
    console.log(output); 
    res.send(output);
    
  }

  console.log("DEBUG: Route finished: "+req.route.path+""); 

});

/*****************************************************************************************
  Endpoint: /status
  Check Spectrum Archive EE status by running eeadm node list
  Returns output of eeadm node list
  
  Example: curl -X GET http://localhost/status

*****************************************************************************************/
app.get("/status", function(req, res) {
  let format = req.query.format || "text";

  console.log("DEBUG: Route started: "+req.route.path+""); 

  runCommand("/opt/ibm/ltfsee/bin/eeadm node list", format, res);

  console.log("DEBUG: Route finished: "+req.route.path+""); 
});


/*****************************************************************************************
  Endpoint: /info/tape|drive|node|pool|library
  Runs command: eeadm <comp> list
  Provide eeadm info command output
  
  Example: curl -X GET http://localhost/info/<cmd>
*****************************************************************************************/
app.get("/info/:cmd(tape|drive|node|pool|library)", function(req, res) {
  let format = req.query.format || "text";
  let cmd = req.params.cmd;

  console.log("DEBUG: Route started: "+req.route.path+", command="+cmd+""); 

  runCommand("/opt/ibm/ltfsee/bin/eeadm "+cmd+" list", format, res);

  console.log("DEBUG: Route finished: "+req.route.path+""); 

});


/*****************************************************************************************
  Endpoint: /tasks/:cmd(active|complete)
  Runs command: eeadm task list [-c] 
  Provide eeadm task list [-c] output
  
  Example: curl -X GET http://localhost/tasks/:cmd(active|all)

*****************************************************************************************/
app.get("/tasks/:cmd(active|all)", function(req, res) {
  let format = req.query.format || "text";
  let filter = req.query.filter;
  let cmd = req.params.cmd;
  let opt = "";

  console.log("DEBUG: Route started: "+req.route.path+", scope="+cmd+""); 

  if (cmd === "all") {
    opt = "-c";
  }
  
  if (filter) {
     runCommand("/opt/ibm/ltfsee/bin/eeadm task list "+opt+" | grep "+filter, format, res);
  }
  else {
     runCommand("/opt/ibm/ltfsee/bin/eeadm task list "+opt, format, res);
  }

  console.log("DEBUG: Route finished: "+req.route.path+""); 
});

/*****************************************************************************************
  Endpoint: /taskshow/:taskid
  Runs command: eeadm task show task-ID 
  Provide eeadm task show task-id
  
  Example: curl -X GET http://localhost/taskshow/:task-id
*****************************************************************************************/
app.get("/taskshow/:taskid", function(req, res) {
  let format = req.query.format || "text";
  let taskid = req.params.taskid;

  console.log("DEBUG: Route started: "+req.route.path+" task-id="+taskid+""); 

  if (!isNaN(taskid)) {
    runCommand("/opt/ibm/ltfsee/bin/eeadm task show "+taskid, format, res);
  }
  else {
/*  return error */
    console.log("Error: Invalid task-ID, must be a integer number");
    res.status(412).send("Error: Invalid task-ID, must be a integer number\n");
  }

  console.log("DEBUG: Route finished: "+req.route.path+""); 
});


/*****************************************************************************************
  Endpoint: /filestate/<path-and-file-name>
  Runs command: eeadm file state on given file
  Provide eeadm file state output
  
  Example: curl -X GET http://localhost/filestate/<path-and-file-name>

TODO:
- tolerate blank in filename
*****************************************************************************************/
app.get("/filestate/*", function(req, res) {
  let format = req.query.format || "text";
  let output = "";
  let file = "/"+req.params[0];
  let worker;

  console.log("DEBUG: Route started: "+req.route.path+", file="+file+""); 

  // run the command with fixed format text because eeadm file state does not support json
  worker = runCommand("/opt/ibm/ltfsee/bin/eeadm file state "+file, "text", undefined);

  worker.stdout.on("data", function(data) {
    output += data;
  });
  worker.stderr.on("data", function(data) {
    console.log("stderr: "+data);
  });
  worker.on("exit", function(code) {
    if (code === 0 ) {
      if (format === "json") {
        res.type("json");
        res.send(convertFileInfo(code, output)); 
      }
      else {
        res.type("text");
        res.send(output);
      }
    }
    else {
      console.log("Error: command eeadm file state failed with return code: "+code+""); 
      if (format === "json") {
	    res.status(500).send("{\"Response\": {\"Returncode\": "+code+", \"Message\": \"command eeadm file state failed\"}}\n");
	  }
	  else {
	    res.status(500).send("Error: command eeadm file list  failed with return code "+code+"\n");
	  }
	};
  }); 

  console.log("DEBUG: Route finished: "+req.route.path+""); 
});


/*****************************************************************************************
  Endpoint: /recall
  Obtains file list from request.body
  Copies filelist to EE host
  Runs command: eeadm recall filelist 
  Returns result of the operation
  
  Example: curl -X PUT http://localhost/recall -d "filelist"
*****************************************************************************************/
app.put("/recall", function(req, res) {
  let format = req.query.format || "text";
  let file_list = Object.keys(req.body)[0];
  let worker;
  let tmp_file = "/tmp/ee-restapi-reclist."+shortid.generate();
  let destFile = ""+recallFileSpec+"."+shortid.generate()+"";

  console.log("DEBUG: Route started: "+req.route.path+""); 

  // console.log("DEBUG: request body sting: "+file_list);

  if (file_list === "" || file_list == undefined || file_list == "\n") {
    console.log("Error: recall file list is empty, returning http 412.");
    res.status(412).send("Error: recall file list is empty.\n");
    return;
  }
  
  // write file_list in file tmp_file 
  file_list = file_list.trim();
  try {
    fs.writeFileSync(tmp_file, file_list);
  } catch (err) {
	console.log("Error: writing to file "+tmp_file+", message: "+err.message+", return http 500\n");
    res.status(500).send("Error: creating file list, message: "+err.message+"");
    return;
  }

  // send tmp_file to eenode as file destFile, return 500 (internal server error) if it fails
  worker = runCopy(tmp_file, destFile);
  // capture stdout and check exit code
  worker.stdout.on("data", function(data) {
    console.log("DEBUG: runcopy output: "+data);
  });
  worker.on("exit", function(code) {
    // if runCopy was good then run the command
    if (code === 0 ) {
      // unlink the tmp_file
      fs.unlink(tmp_file, function(err) {
        if (err) {
          console.log("WARNING: unlink "+tmp_file+" failed with err.message \n");  
        } 
      });

      // run the eeadm command
      worker = runCommand("/opt/ibm/ltfsee/bin/eeadm recall "+destFile, "text", undefined);
      // capture stdout and check exit code
      worker.stdout.on("data", function(data) {
        console.log("DEBUG: runCommand output: "+data);
      });
      worker.on("exit", function(code) {
        if (code === 0 ) {
          if (format === "json") {
           res.type("json");
           res.send("{\"Response\": {\"Returncode\": \"0\", \"Message\": \"Recall finished.\"}}\n");
          }
          else {
            res.type("text");
            res.send("Recall finished!\n");
          }
        }
        else {
          console.log("Error: recall failed with return code "+code+", returning http 500");
          if (format === "json") response.status(500).send("{\"Response\": {\"Returncode\": "+code+", \"Message\": \"recall failed.\"}}\n");
          else res.status(500).send("Error: recall failed with return code "+code+"\n");
        }
      });
    }
    else {
      console.log("Error: create file list failed with return code "+code+", returning http 500. SSH key may not work.");
      if (format === "json") response.status(500).send("{\"Response\": {\"Returncode\": "+code+", \"Message\": \"create file list failed.\"}}\n");
      else res.status(500).send("Error: create file list failed with return code "+code+"\n");
    }
  }); 
  worker.stderr.on("data", function(data) {
    console.log("stderr: "+data);
  });

  console.log("DEBUG: Route finished: "+req.route.path+""); 
});

/*****************************************************************************************
  Endpoint: /migrate
  Obtains file list from request.body and pool name from modifier ?pool1=name?po
  Copies filelist to EE host
  Runs command: eeadm migrate filelist -p pool
  Returns result of the operation
  
  Example: curl -X PUT http://localhost/migrate?pool1=pool1@lib1&pool2=pool2@lib1 -d "filelist"
*****************************************************************************************/
app.put("/migrate", function(req, res) {
  // get format from URL modifier ?format=, default is text
  let format = req.query.format || "text";
  // extract the file names from req.body key field 0
  let file_list = Object.keys(req.body)[0];
  let worker;
  let tmp_file = "/tmp/ee-restapi-miglist."+shortid.generate();
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

  console.log("DEBUG: Route started: "+req.route.path+", pools="+pools+""); 

  // bail out if we do not have a pool
  if (pools === "") {
    console.log("Error: no migration destination pool specified.");
    res.status(412).send("Error: no migration destination pool specified, use modifier ?pool=pool \n");
    // return to prevent continuing this function
    return; 
  }

  // bail out if pool count is greate than 3
  if (poolCount > 3) {
    console.log("Error: Number of pools ("+poolCount+") exceeds the maximum (3).");
    res.status(412).send("Error: Number of pools ("+poolCount+") exceeds the maximum (3).\n");
    // return to prevent continuing this function
    return; 
  }

  // bail out if the file_list is empty or undefined (-d not given)
  if (file_list === "" || file_list == undefined || file_list == "\n") {
    console.log("Error: migrate file list is empty.");
    res.status(412).send("Error: migrate file list is empty.\n");
    return;
  }

  // write file_list in file tmp_file 
  file_list = file_list.trim();
  try {
    fs.writeFileSync(tmp_file, file_list);
  } catch (err) {
	console.log("Error: writing to file "+tmp_file+", message: "+err.message+", return http 500\n");
    res.status(500).send("Error: creating file list, message: "+err.message+"");
    return;
  }

  //send tmp_file to eenode as file destFile, return 500 (internal server error) if it fails
  worker = runCopy(tmp_file, destFile);
  // capture stdout and exit codes
  worker.stdout.on("data", function(data) {
    console.log("DEBUG: runcopy output: "+data);
  });
  worker.on("exit", function(code) {
    // if runCopy was good, run the command
    if (code === 0 ) {
      // unlink the tmp_file
      fs.unlink(tmp_file, function(err) {
        if (err) {
          console.log("WARNING: unlink "+tmp_file+" failed with err.message \n");  
        } 
      });

      // run eeadm command
      worker = runCommand("/opt/ibm/ltfsee/bin/eeadm migrate "+destFile+" -p "+pools+"", "text", undefined);
      // capture stdout and exit codes
      worker.stdout.on("data", function(data) {
        console.log("DEBUG: runCommand output: "+data);
      });
      worker.on("exit", function(code) {
        if (code === 0 ) {
          if (format === "json") {
            res.type("json");
            res.send("{Response: {Returncode: 0, Message: Migrate finished}}\n");
          }
          else {
            res.type("text");
            res.send("Migrate finished!\n");
          }
        }
        else {
          console.log("Error: migrate failed with return code "+code+", returning http 500.");
          if (format === "json") response.status(500).send("{\"Response\": {\"Returncode\": "+code+", \"Message\": \"migrate failed.\"}}\n");
          else res.status(500).send("Error: migrate failed with return code "+code+"\n");
        }
       });
     }
     else {
       console.log("Error: create file list for migrate failed with return code "+code+",returning http 500");
       if (format === "json") response.status(500).send("{\"Response\": {\"Returncode\": "+code+", \"Message\": \"create file list for migrate failed.\"}}\n");
       else res.status(500).send("Error: create file list failed for migrate with return code: "+code+"\n");
     }
     }); 
  worker.stderr.on("data", function(data) {
    console.log("stderr: "+data);
  });

  console.log("DEBUG: Route finished: "+req.route.path+""); 
});


/*******************************************************************************
 MAIN Code
*******************************************************************************/
app.listen(httpPort)

/* print welcome */
console.log("Tape Archive REST API version "+ver+" started on HTTP port "+httpPort);
// console.log("DEBUG: useSSH="+useSSH+" sshPort="+sshPort+" sshkeyfile="+sshKey+" sshUser="+sshUser+" sshHost="+sshHost+" recallDir="+recallFileSpec+" migrateDir="+migrateFileSpec+"");

/********************************************************************
  HELPER FUNCTIONS
********************************************************************/

/********************************************************************
   Function: runCommand
   Input: 
    1. command string to run
    2. output format (determines whether to add --json
   Return: 
     output: command output as spawn object
*********************************************************************/
function runCommand(command, format, response) {
  let cmdPrefix = "";
  let cmdPostfix = "";
  let proc;
  let output = "";

  if (format === "json") {
    cmdPostfix = " --json"
  }

  if (useSSH === "true") {
    cmdPrefix = "/usr/bin/ssh "+sshOpts+" ";
    console.log("DEBUG: running command: "+cmdPrefix+""+command+""+cmdPostfix+"");
    proc = spawn("/bin/sh",["-c", cmdPrefix+command+cmdPostfix]);
  }
  else {
    console.log("DEBUG: running command: "+command+cmdPostfix);
    proc = spawn("/bin/sh",["-c", command+cmdPostfix]);
  };

  // this is common code for some enpoints, but not for all
  if (response) {
	  proc.stdout.on("data", function(data) {
		output += data;
	  });
	  proc.stderr.on("data", function(data) {
		console.log("stderr: "+data);
	  });
	  proc.on("exit", function(code) {
		if (format == "json") { 
		  response.type("json");
		}
		else {
		  response.type("text");
		}

		if (code === 0 ) {
		  response.send(output);
		}
		else {
          console.log("Error: command "+command+"  failed with return code "+code+"");
          if (output != "") {
            console.log("Error: "+output+"");
          }
		  if (format === "json") {
			 response.status(500).send("{\"Response\": {\"Returncode\": "+code+", \"Message\": \"command "+command+" failed ("+output+")\"}}\n");
		  }
		  else {
			response.status(500).send("Error: command "+command+" failed with return code "+code+" ("+output+")\n");
		  }
		};
	  }); 
  }
  return(proc);
}


/********************************************************************
   Function: runCopy
   Input: source file, destination file
   Processing: runs remote copy command and returns status
   Return: result of the copy operation as spawn object
*********************************************************************/
function runCopy(sourceFile, destFile) {
  let copyCmd = "";
  let proc = "";

  if (useSSH === "true") {
    copyCmd = "/usr/bin/scp "+scpOpts+" "+sourceFile+" "+sshUser+"@"+sshHost+":"+destFile+"";
    console.log("DEBUG: running command: "+copyCmd+"");
    proc = spawn("/bin/sh",["-c", copyCmd]);
  }
  else {
    copyCmd = "/usr/bin/cp "+sourceFile+" "+destFile+"";
    console.log("DEBUG: running command: "+copyCmd);
    proc = spawn("/bin/sh",["-c", copyCmd]);
  };

  return(proc);
}

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
