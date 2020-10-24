# Tape archive REST API
The Tape archive REST API facilitates controlling migration and recalls of files managed by IBM Spectrum Archive Enterprise Edition version 1.3.0.3 and above. It also allows to obtain component status for IBM Spectrum Archive system. The Tape archive REST API is a REST API that provides http calls to manage files and obtain status information.


## Disclaimer and license
This project is under [MIT license](LICENSE).

The Tape archive REST API is an open source project and NOT an IBM product. As such it is not supported by any official IBM product support. 

The code provided in this git repository is a prototype and has not been tested in production and in multi-user environments. The author does not assume any liability for damages or other trouble when deploying this API. Changes in the products it integrates with - for example IBM Spectrum Archive Enterprise Edition - may cause the API to stop working. 

For integration and support of the Tape archive REST API in your environment contact the [author](https://github.com/nhaustein).

Thanks to [Khanh V Ngo](https://github.com/khanhn1638) for providing the baseline API. Thanks to [Achim Christ](https://github.com/acch) for the useful lessons about nodejs. 


## Introduction
Using tapes in tiered storage file system that are space managed bears some risk, especially if end users can access the file system directly and cause transparent recalls. Transparent recalls tend to be slow and many of them can impact file system operations (recall storms). Therefore it is recommended to prevent transparent recalls for users and instead use tape optimized recalls. 

The Tape Archive REST API provides functions to migrate and recall file in a tape optimized manner. In particulare the recall function can be used to recall files in a tape optimized manner. With tape optimized recall multiple files are sorted by their tape ID and position on tape and are copied all together. This significantly lowers number of tape mounts, optimized tape motion and reduces the time required to complete the recall operation. 

The efficient use of the Tape Archive REST API requires to disable transparent recalls. By disabling tansparent recalls it is possible to provide users access to the tiered storage file system without risking recall storms caused by many transparent recalls. Users can see all files and immediatelly access all non-migrated files. If a migrated file is accessed a well defined error message will be presented. With this the user knows that the file is migrated and can order to recall. The Tape Archive REST API provides a way for users order the recall of migrated files. The actual file recall may be deferred and executed as bulk recall, whereby files from multiple users are being recalled. 

[IBM Spectrum Archive Enterprise Edition 1.3.0.6 and above](https://www.ibm.com/support/knowledgecenter/en/ST9MBR_1.3.0/ltfs_ee_whats_new_this_release.html) allows to disable transparent recalls using the new command: `eeadm cluster set`. With transparent recalls disabled, access to a migrated file results in an error (permission denied). Disabling transparent recalls can be used to prevent recall storms caused when many migrated files are accessed simultaneously. Bulk recalls continue to work, even if transparent recalls are disabled. Bulk recalls - initiated with the command: `eeadm recall filelist -p poolname` - are tape optimized, faster and less resource consuming.

For more information about the challenges and best practices with tapes in tiered storage file systems, please read this [blog article](https://community.ibm.com/community/user/storage/blogs/nils-haustein1/2020/01/14/managing-files-in-tiered-storage).

The Tape archive REST API provides a comprehensive set of REST API calls to:

- get the status of IBM Spectrum Archive EE components including library, nodes, tapes and pools
- get information about running and completed tasks
- execute tape optimized recall and migration for a set of files provided in file lists
- execute policies

For more information about the REST API call syntax and semantic see section [Tape archive REST API reference](#Tape-archive-REST-API-reference).



## Deployment
The Tape archive REST API is based on Node JavaScript (Node JS) and can be deployed directly on a Spectrum Archive server or on a remote system that uses password-less SSH to communicate with the Spectrum Archive server. The API has been tested with node version 10. 



### Environmental variables
For defining the deployment and communication parameters the following environmental variables are available:

| Environmental variable | Description |
| -----------------------|-------------|
| EEAPI_PORT | specifies the port for the communication with the API, default port is 80. |
| EEAPI_USESSH | specifies whether to use SSH to connect to the Spectrum Archive server remotely or not. Possible values are: true and false. When running on a Spectrum Archive server this should be set to false. Default is true. |
| EEAPI_SSHPORT | specifies the SSH port to be used for SSH and SCP communication with the remote Spectrum Archive server. Must be specified if `EEAPI_USESSH` is set to true. Default is 22.  |
| EEAPI_SSHUSER | specifies the SSH / SCP user name used for SSH and SCP communication with the remote Spectrum Archive server. Default is root. Must be specified if `EEAPI_USESSH` is set to true. Please notice that currently Spectrum Archive EE is not aware of non-root users. |
| EEAPI_SSHHOST | specifies host name or IP address of the remote Spectrum Archive server. Must be specified if `EEAPI_USESSH` is set to true. Default is localhost. |
| EEAPI_KEYFILE |specifies the name of the SSH key file (private key) to be used for the communication with the Spectrum Archive server. This file must be present on the server running the API. Must be specified if `EEAPI_USESSH` is set to true. |
| EEAPI_RECALLFILE | specifies the path and file name prefix for recall file lists. A recall file list includes fully qualified path and file name to be recalled. File names for recall are provided with the `/recall` endpoint. The default path and file name prefix is /tmp/recall-list |
| EEAPI_MIGRATEFILE | sspecifies the path and file name prefix for migrate file lists. A migrate file list includes fully qualified path and file name to be migated. File names for migate are provided with the `/migate` endpoint. The default path and file name prefix is /tmp/migrage-list  |
| EEAPI_POLICYFILE | specifies the path and file name prefix for policy files. A policy file includes the policy rules to be executed. The policy rules are provided with the `/runpolicy` endpoint. The default path and file name prefix is /tmp/policy-file |
| EEAPI_USESUDO | specifies whether to run `eeadm` commands in a sudo context. Possible values are: true and false. When using ssh (`EEAPI_USESSH=true`) then the sudo user is provided with environmental variable `EEAPI_SSHUSER`. When not using ssh but running on a local server (`EEAPI_USESSH=false`), the sudo user is the one that launches the EE API server. Sudo privileges must be configured for the sudo user. Default value is false.|



### Deployment on Spectrum Archive server 
To deploy the Tape archive REST API on a Spectrum Archive node, node version 10 or higher must be installed on the Spectrum Archive node. Copy files [server.js](server.js) and [package.json](package.json) to a directory in the server and run `npm install` in this directory. 

Prior to starting the API export the following environmental variables: 

`export EEAPI_USESSH=false`

To start the API run 

`node ./server.js`

Check the console and assure that the API has started. Issue the about call using curl: 

`curl -X GET http://<EE server IP>:<EEAPI_PORT>/about`


### Deployment on remote server
To deploy the Tape API on a remote server running node copy the files [server.js](server.js) and [package.json](package.json) to the remote server into a directory, or clone the git into this directory. Run `npm install` to install the required node modules. Now set the environmental variables according configuration, see section Deployment. You have to enable ssh (`EEAPI_USESSH=true`) and specify the environmental variables describing the ssh and scp communication parameters: `EEAPI_SSHPORT, EEAPI_SSHUSER, EEAPI_SSHHOST, EEAPI_KEYFILE, EEAPI_RECALLFILE, EEAPI_MIGRATEFILE`


> You have to provide a ssh key allowing the remote server to perform password less ssh with the Spectrum Archive EE node. The public part of the ssh key file must be referenced by the environment variable `EEAPI_SSHKEY`.

Once the environment is set start the API: 

`node ./server.js`

Start with testing the connection using this URL: 

`curl -X GET http://<EE server IP>:<EEAPI_PORT>/test`


The Tape API can also be deployed in a Docker container. This git includes a Dockerfile to build the image and a docker-compose file to run the image in a container. 

Clone the git.

> You have to provide a ssh key allowing the remote server to perform password less ssh with the Spectrum Archive EE node. The public part of the ssh key file must be referenced by the environment variable `EEAPI_SSHKEY` and within the dockerfile. 

Adjust the [Dockerfile](Dockerfile) with the ssh key file path (public key) at:
```
# Copy private ssh key
COPY <your key file> . 
```
Build the container using the Dockerfile: 

`docker built -t eeapi .`

Adjust the environment variable in the [docker-compose](docker-compose.yml) file. See section Environment variables for more details. 

Start the container. Starting the container with `-d` gives you the console which is useful for debugging.

`docker-compose up [-d]`  

Now you can test the connection: 

`curl -X GET http://<EE server IP>:<EEAPI_PORT>/test`



## Tape archive REST API reference
The following calls are provided to check the setup and the API:

- GET test: checks if ssh and scp works and if the Spectrum Archive EE admin tool `eeadm` exists.

	`curl -X GET http://host:port/test`

- GET about: shows all available routes (endpoints) provided by the API:

	`curl -X GET http://host:port/about`


The following calls are provided by the Tape archive REST API to obtain IBM Spectrum Archive component information, In the examples below simple curl commands are presented:

- GET node status: obtains node status information from Spectrum Archive EE:

	`curl -X GET http://host:port/info/node`

- GET tape status: obtains tape status information from Spectrum Archive EE:

	`curl -X GET http://host:port/info/tape`

- GET drive status: obtains drive status information from Spectrum Archive EE:

	`curl -X GET http://host:port/info/drive`

- GET pool status: obtains tape status information from Spectrum Archive EE:

	`curl -X GET http://host:port/info/pool`

- GET library status: obtains tape status information from Spectrum Archive EE:

	`curl -X GET http://host:port/info/library`

> All status and output information can be obtained in text format (default) or in JSON format. To obtain status information in JSON format use the modifier "?format=json" with the http request. 


Furthermore the API allows to inquire information about Spectrum Archive tasks. The following calls are provided:

- GET tasks status: obtains information about running or completed tasks. The token "type" can be set to active or all. 

	`curl -X GET http://host:port/tasks/<type>`

- GET task details: obtains information about a particular task ID. The token "task-ID" specifies the task ID to be inquired. It must be an integer number. 

	`curl -X GET http://host:port/taskshow/<task-id>`


The following API calls allow file operations such as inquiring file states, tape optimized recall and migrate. 

- GET file state: obtain information about the file status that can be: resident, migrated or pre-migrated. The fully qualified path and file names are provided as request body (e.g. using the -d option with curl). There must be one fully qualified path and file name per line. Blank lines are ignored, wildcards are not yet supported. 

	`curl -X GET http://host:port/filestate/ -d "<filelist>"`

- PUT file list for migration: migrates a list of files provided with the body of the http request. The file list provided in the request body must include one fully qualified path and file name per line. Blank lines are ignored, wildcards are not yet supported. The migration destination pool names are given as URL modifiers in the format `?pool1=poolname@library&pool2=poolname@library&pool3=poolname@library`. At least one pool must be specified, up to three pools are allowed. The migration operation is run synchronous. 

	`curl -X PUT http://host:port/migrate?pool1=pool1@lib1&pool2@lib2 -d "<filelist>"`

- PUT file list for recall: recalls a list of files provided with the body of the http request. The file list provided in the request body must include one fully qualified path and file name per line. The recall operation runs synchronous. Blank lines are ignored, wildcards are not yet supported.

	`curl -X PUT http://host:port/recall -d "<filelist>"`

- PUT policy: executes a policy provided with this request. The policy is provided in the request body using the following tokens in separate lines:
  - `Path: <file system path>` file system path that is subject for the policy execution (required). 
  - `Options: <options>` Options for the mmapplypolicy command (optional).
  - `Policy: <rules>` policy rules to be executed. Each rule must be in a separate line. 
  
  Lines that do not include any of these tokens are interpreted as policy rules. 

	```
	curl -X PUT http://host:port/runpolicy -d "
	Path: mypath 
	Options: -I defer -f /tmp/mypathlist
	Policy: 
	RULE EXTERNAL LIST 'mylist' EXEC ''
	RULE LIST 'mylist' WHERE (MISC_ATTRIBUTES LIKE '%V')
	"
    ```


## Considerations and limitations
The Tape archive REST API is a prototype and has not been tested in production and in multi-user environments. The following limitations exist for this prototype and can be addressed. Contact the author if you need help:

- The Tape archive REST API has been tested with IBM Spectrum Archive EE version 1.3.0.7. It definitely requires version 1.3.0 because it uses the eeadm command. When using a version 1.3 below 1.3.0.3 the migrate function does not work because it does not accept simple file lists. 
- The API uses synchronous recall, migrate and file state calls. These can take longer times causing HTTP timeouts. 
- Migrate and recall request are immediately executed, this can lead to many simultaneous tape operations in the backend. 
- All path and file name patterns must be fully qualified relative to the space managed file system. If the end user mounts the space managed file system via NFS then the NFS path name may not fully match the space managed file system name. This requires some translation of path names in the backend.  
- The API does not use any user authentication for incoming requests. 
- The API does not check if users requesting a migrate or recall are authorized to access the files to be processed. 
- The API itself does not prevent transparent recalls when migrated files are accessed in the space managed file systems. Additional processes that adjust file permissions must be implemented to prevent transparent recalls. 
- The API supports IBM Spectrum Archive EE only. However, it can be ported to other space management software. Let the author know if you are interested using the API with other space management software. 

