# Tape archive API


## Introduction
The Tape archive API facilitates controlling migration and recalls of files managed by IBM Spectrum Archive Enterprise Edition. It also allows to obtain component status for IBM Spectrum Archive system. The Tape archive API is a REST API that provides http calls to manage files and obtain status information.


### Tape Archive API calls
The following calls are provided to check the setup and the API:
- GET test: checks if ssh and scp works and if the Spectrum Archive EE admin tool `eeadm` exists.

	`curl -X GET http://host:port/test`

- GET about: shows all available routes (endpoints) provided by the API:

	`curl -X GET http://host:port/about`

The following calls are provided by the Tape archive API to obtain IBm Spectrum Archive component information, In the examples below simple curl commands are presented:
- GET node status: obtains node status information using the Spectrum Archive command: eeadm node list

	`curl -X GET http://host:port/info/node`

- GET tape status: obtains tape status information using the Spectrum Archive command: eeadm tape list

	`curl -X GET http://host:port/info/tape`

- GET drive status: obtains drive status information using the Spectrum Archive command: eeadm drive list

	`curl -X GET http://host:port/info/drive`

- GET pool status: obtains tape status information using the Spectrum Archive command: eeadm pool list

	`curl -X GET http://host:port/info/pool`

- GET library status: obtains tape status information using the Spectrum Archive command: eeadm library list

	`curl -X GET http://host:port/info/library`

Furthermore the API allows to inquire information about Spectrum Archive tasks. The following calls are provided:
- GET tasks status: obtains information about running or completed tasks. The token "type" can be set to active or all. It runs the Spectrum Archive command: eeamd task list [-c]

	`curl -X GET http://host:port/tasks/<type>`

- GET task details: obtains information about a particular task ID. The token "task-ID" specifies the task ID to be inquired. It must be an integer number. It runs the command: eeadm task show <task-id>

	`curl -X GET http://host:port/taskshow/<task-id>`


For controlling file operations the following API call are availeble
- GET file state: ontain information about the file status that can be: resident, migrated or pre-migrated. The file name or a single file name pattern is specified by the token "path-and-filename". This must be a fully qualified path and file name of the file within the space managed file system. 

	`curl -X GET http://host:port/filestate/<path-and-filename>`

- PUT file list for migration: migrates a list of files provided with the body of the http request. The file list to be migrated must be provided as body of the request with one path and file name per line. The path and file names must be given relative to the space managed file system: 

	`curl -X PUT http://host:port/recall -d "<filelist>"`

- PUT file list for recall: recalls a list of files provided with the body of the http request. The file list to be recalled must be provided as body of the request with one path and file name per line. The path and file name must be given relative to the space managed file system. The destination pool for migration is provide using one or more of the modifiers "pool", "pool1", "pool2" and "pool3". A maximum number of pools that can be specified is 3. The use of the modifier "pool" is made for convenience if only one pool is used: 

	`curl -X PUT http://host:port/migrate?pool1=pool1@lib1&pool2@lib2 -d "<filelist>"`


All status and output information can be obtained in text format (default) or in JSON format. To obtain status information in JSON format use the modifier "?format=json" with the http request. 


## Deployment
The Tape archive API is based on Node JavaScript (Node JS) and can be deployed directly on a Spectrum Archive server or on a remote system that uses password-less SSH to communicate with the Spectrum Archive server. The API has been tested with node version 10. 


### Environmental variables
For defining the deployment and communication parameters the following environmental variables are available:

| Environmental variable | Description |
| -----------------------|-------------|
| EEAPI_PORT | specifies the port for the communication with the API, default port is 80. |
| EEAPI_USESSH | specifies whether to use SSH to connect to the Spectrum Archive server remotely or not. When running on a Spectrum Archive server this should be set to false. Default is true. |
| EEAPI_SSHPORT | specifies the SSH port to be used for SSH and SCP communication. Must be specified if EEAPI_USESSH is set to true. Default is 22.  |
| EEAPI_SSHUSER | specifies the SSH / SCP user name. Default ist root. Must be specified if EEAPI_USESSH is set to true. Please notice that currently Spectrum Archive EE is not aware of non-root users. |
| EEAPI_SSHHOST | specifies host name or IP address of the the Spectrum Archive server. Must be specified if EEAPI_USESSH is set to true. Default is localhost. |
| EEAPI_KEYFILE |specifies the name of the SSH key file to be used for the communication with the Spectrum Archive server. Must be specified if EEAPI_USESSH is set to true. Default is localhost. |
| EEAPI_RECALLFILE | specifies the directory and file name prefix on the Spectrum Archive server where the recall file lists are stored. The recall list includes fully qualified path and file name to be recalled. The subsequent command: eeadm recall <file list> will recall the files within this list. The default path and file name prefix is /tmp/recall-list. |
| EEAPI_MIGRATEFILE | specifies the directory and file name prefix on the Spectrum Archive server where the migrate file lists are stored. The migrate list includes fully qualified path and file name to be migrated. The subsequent command: eeadm migrate <file list> -p poolQlib will migrate the files within this list. The default path and file name prefix is /tmp/recall-list.  |


### Deployment on Spectrum Archive server 
To deploy the Tape Archive API on a Spectrum Archive node, node version 10 or higher must be installed on the Spectrum Archive node. Copy server.js and package.json to the server and run `npm install`. Prior to starting the API export the following environmental variables: `export EEAPI_USESSH=false`. To start the API run `node ./server.js`

Check the about page: `curl -X GET http://<EE server IP>:<EEAPI_PORT>/about`


### Deployment on remote server
To deploy the Tape API on a remote server running node copy server.js and package.json to the remote server into a directory, or clone the git into this directory. Run `npm install` to install the required node modules. Now set the environmental variables according configuration, see section Deployment. 

** Note ** You have to provide a ssh key allowing the remote server to perform passwordless ssh with the Spectrum Archive EE node. The public part of the ssh key file must be referenced by the environment variable `EEAPI_SSHKEY`.

Once the environment is set start the API: `node ./server.js`

Start with testing the connection using this URL: `curl -X GET http://<EE server IP>:<EEAPI_PORT>/test`


The Tape API can also be deployed in a Docker container. This git includes a Dockerfile to build the image and a docker-compose file to run the image in a container. 

Clone the git.

** Note ** You have to provide a ssh key allowing the remote server to perform passwordless ssh with the Spectrum Archive EE node. The public part of the ssh key file must be referenced by the environment variable `EEAPI_SSHKEY` and within the dockerfile. 

Adjust the Dockerfile with the ssh key file path (public key) at:
```
# Copy private ssh key
COPY <your key file> . 
```

Build the container using the Dockerfile: `docker built -t eeapi .`

Adjust the environment variable in the docker-compose file.

Start the container: `docker-compose up [-d]` Starting the container with `-d` gives you the console which is useful for debugging. 

Now you can test the connection: `curl -X GET http://<EE server IP>:<EEAPI_PORT>/test`

And run other API commands.


Have fun and thanks to Khanh V Ngo for providing the baseline API :+1: 