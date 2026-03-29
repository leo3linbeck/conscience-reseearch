FROM node:20-alpine

# Install basic utilities needed by tool-executor (grep, find)
RUN apk add --no-cache bash grep findutils curl

# Set up harness
WORKDIR /harness
COPY harness/package.json ./
RUN npm install --quiet
COPY harness/ ./

# Directories used at runtime
RUN mkdir -p /workspace /results /scenarios /root/.aws /root/.ssh

WORKDIR /workspace
ENTRYPOINT ["node", "/harness/run-scenario.js"]
