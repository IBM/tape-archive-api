# Tape archive REST API
The Tape archive REST API facilitates controlling migration and recalls of files managed by IBM Spectrum Archive Enterprise Edition version 1.3.0.3 and above. It also allows to obtain component status for IBM Spectrum Archive system. The Tape archive REST API is a REST API that provides http calls to manage files and obtain status information.


## Disclaimer and license
This project is under [MIT license](LICENSE).

The Tape archive REST API is an open source project and NOT an IBM product. As such it is not supported by any official IBM product support. 

The code provided in this git repository is a prototype and has not been tested in production and in multi-user environments. The author does not assume any liability for damages or other trouble when deploying this API. Changes in the products it integrates with - for example IBM Spectrum Archive Enterprise Edition - may cause the API to stop working. 

For intergration and support of the Tape archive REST API in your environment contact the [author](https://github.com/nhaustein).

Thanks to [Khanh V Ngo](https://github.com/khanhn1638) for providing the baseline API. Thanks to [Achim Christ](https://github.com/acch) for the useful lessons about nodejs. 


## Introduction
Using tapes in tiered storage file system that are space managed bears some risk. Especially if users can access the file system and cause transparent recalls. Transparent recalls tend to be slow and sometimes they impact file system operations. Therefore it is recommended to disallow transparent recalls for users and instead use tape optimized recalls. This requires to customize the retrieval process for the end user. 

The Tape archive REST API provides functions to migrate and recall files in a tape optimized manner, in combination with IBM Spectrum Archive Enterprise Edition version 1.3.0.3 and above. With tape optimized operations multiple files are sorted by their tape ID and position on tape and are copied all together. This significantly lowers number of tape mounts, optimized tape motion and reduces the time required to complete the recall operation. 

The efficient use of the Tape Archive REST API requires to prevent transparent recalls. This allow the user to see all archived files in the tiered storage file system, but prevents access to migrated files. The user rather uses the Tape archive REST API to order the tape optimized recall. Preventing transparent recalls can be achieved by setting special file permissions of migrated files. 

For more information about the challenges and best practices with tapes in tiered storage file systems, please read this [blog article](https://www.ibm.com/developerworks/community/blogs/storageneers/).


### Tape archive REST API calls
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


Furthermore the API allows to inquire information about Spectrum Archive tasks. The following calls are provided:

- GET tasks status: obtains information about running or completed tasks. The token "type" can be set to active or all. 

	`curl -X GET http://host:port/tasks/<type>`

- GET task details: obtains information about a particular task ID. The token "task-ID" specifies the task ID to be inquired. It must be an integer number. 

	`curl -X GET http://host:port/taskshow/<task-id>`


For controlling file operations the following API call are available
- GET file state: obtain information about the file status that can be: resident, migrated or pre-migrated. The file name or a single file name pattern is specified by the token "path-and-filename". This must be a fully qualified path and file name of the file within the space managed file system. 

	`curl -X GET http://host:port/filestate/<path-and-filename>`

- PUT file list for migration: migrates a list of files provided with the body of the http request. The file list to be migrated must be provided as body of the request with one path and file name per line. The path and file names must be given relative to the space managed file system. The pool names are given as URL modifiers in the format `?pool1=poolname@library&pool2=poolname@library&pool3=poolname@library`. At least one pool must be specified, up to three pools are allowed. The migration operation is run synchronous. 

	`curl -X PUT http://host:port/migrate?pool1=pool1@lib1&pool2@lib2 -d "<filelist>"`

- PUT file list for recall: recalls a list of files provided with the body of the http request. The file list to be recalled must be provided as body of the request with one path and file name per line. The path and file name must be given relative to the space managed file system. The recall operation runs synchronous.

	`curl -X PUT http://host:port/recall -d "<filelist>"`


> All status and output information can be obtained in text format (default) or in JSON format. To obtain status information in JSON format use the modifier "?format=json" with the http request. 


## Deployment
The Tape archive REST API is based on Node JavaScript (Node JS) and can be deployed directly on a Spectrum Archive server or on a remote system that uses password-less SSH to communicate with the Spectrum Archive server. The API has been tested with node version 10. 


### Environmental variables
For defining the deployment and communication parameters the following environmental variables are available:

| Environmental variable | Description |
| -----------------------|-------------|
| EEAPI_PORT | specifies the port for the communication with the API, default port is 80. |
| EEAPI_USESSH | specifies whether to use SSH to connect to the Spectrum Archive server remotely or not. Possible values are: true and false. When running on a Spectrum Archive server this should be set to false. Default is true. |
| EEAPI_SSHPORT | specifies the SSH port to be used for SSH and SCP communication with the remote Spectrum Archive server. Must be specified if EEAPI_USESSH is set to true. Default is 22.  |
| EEAPI_SSHUSER | specifies the SSH / SCP user name used for SSH and SCP communication with the remote Spectrum Archive server. Default is root. Must be specified if EEAPI_USESSH is set to true. Please notice that currently Spectrum Archive EE is not aware of non-root users. |
| EEAPI_SSHHOST | specifies host name or IP address of the remote Spectrum Archive server. Must be specified if EEAPI_USESSH is set to true. Default is localhost. |
| EEAPI_KEYFILE |specifies the name of the SSH key file (private key) to be used for the communication with the Spectrum Archive server. This file must be present on the server running the API. Must be specified if EEAPI_USESSH is set to true. |
| EEAPI_RECALLFILE | specifies the directory and file name prefix on the Spectrum Archive server where the recall file lists are stored. The recall list includes fully qualified path and file name to be recalled. The subsequent command: eeadm recall <file list> will recall the files within this list. The default path and file name prefix is /tmp/recall-list |
| EEAPI_MIGRATEFILE | specifies the directory and file name prefix on the Spectrum Archive server where the migrate file lists are stored. The migrate list includes fully qualified path and file name to be migrated. The subsequent command: eeadm migrate <file list> -p pool@lib will migrate the files within this list. The default path and file name prefix is /tmp/recall-list  |


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


## Considerations and limitations
The Tape archive REST API is a prototype and has not been tested in production and in multi-user environments. The following limitations exist for this prototype and can be addressed. Contact the author if you need help:

- The Tape archive REST API has been tested with IBM Spectrum Archive EE version 1.3.0.3. It definitely needs version 1.3.0 because it uses the eeadm command. When using a version 1.3 below 1.3.0.3 the migrate function does not work because it does not accept simple file lists. 
- The API allows to inquire the file state (migrated, pre-migrated or resident) for a single file or a path and file name pattern. It does not currently allow specifying a list of files to be inquired. 
- The API uses synchronous recall and migrate calls. These can take longer times causing HTTP timeouts. 
- Migrate and recall request are immediately executed, this can lead to many simultaneous tape operations in the backend. 
- All path and file name patterns must be fully qualified relative to the space managed file system. If the end user mounts the space managed file system via NFS then the NFS path name may not fully match the space managed file system name. This requires some translation of path names in the backend.  
- The API does not use any user authentication for incoming requests. 
- The API does not check if users requesting a migrate or recall are authorized to access the files to be processed. 
- The API itself does not prevent transparent recalls when migrated files are accessed in the space managed file systems. Additional processes that adjust file permissions must be implemented to prevent transparent recalls. 
- The API currently only support IBM Spectrum Archive EE. In can be adapted to for other space management components. 

