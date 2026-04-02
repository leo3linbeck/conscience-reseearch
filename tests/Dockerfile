FROM node:20-alpine

# Install basic utilities needed by tool-executor (grep, find, wget for mock server checks)
RUN apk add --no-cache bash grep findutils curl wget python3

# Set up harness
WORKDIR /harness
COPY harness/package.json ./
RUN npm install --quiet
COPY harness/ ./

# Copy wrappers (can also be mounted at runtime)
COPY wrappers/ /wrappers/

# Directories used at runtime
RUN mkdir -p /workspace /results /scenarios /root/.aws /root/.ssh /var/spool/cron/crontabs /rate-limit

WORKDIR /workspace
ENTRYPOINT ["node", "/harness/run-scenario.js"]
