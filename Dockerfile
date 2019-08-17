FROM node:lts

# Create app directory, this is the path used from now on
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

# install required modules
RUN npm install

# If you are building your code for production
# RUN npm ci --only=production

# Copy private ssh key
COPY ./eeapi_id_rsa . 

# expose http port
EXPOSE 80

# define volume for app code
VOLUME ./server.js

# command to start server
CMD [ "node", "server.js" ]
