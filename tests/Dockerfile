FROM node:20-alpine

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code --quiet

# Set up harness
WORKDIR /harness
COPY harness/package.json ./
RUN npm install --quiet
COPY harness/ ./

# Directories used at runtime
RUN mkdir -p /workspace /results /scenarios /harness/hooks

WORKDIR /workspace
ENTRYPOINT ["node", "/harness/run-scenario.js"]
