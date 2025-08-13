# Custom Node.js image with pre-installed libraries for kids learning programming
FROM node:18-alpine

# Install common packages that kids use for learning
RUN npm install -g \
    lodash@4.17.21 \
    axios@1.4.0 \
    moment@2.29.4 \
    uuid@9.0.0 \
    express@4.18.2 \
    socket.io@4.7.2 \
    chalk@5.3.0 \
    fs-extra@11.1.1 \
    typescript@5.1.6 \
    ts-node@10.9.1 \
    @types/node@20.4.5 \
    jest@29.6.2 \
    nodemon@3.0.1

# Create package.json with pre-installed dependencies
RUN mkdir -p /app && cd /app && npm init -y

# Install dependencies globally and create symlinks for easy access
RUN npm install -g \
    lodash \
    axios \
    moment \
    uuid \
    express \
    socket.io \
    chalk \
    fs-extra

# Create global node_modules accessible from anywhere
ENV NODE_PATH=/usr/local/lib/node_modules
RUN mkdir -p /usr/local/lib/node_modules_global && \
    ln -sf /usr/local/lib/node_modules/* /usr/local/lib/node_modules_global/

# Create a basic working directory
WORKDIR /app

# Create a non-root user for security (use existing node user)
RUN chown -R node:node /app

USER node

# Default command
CMD ["node"]
