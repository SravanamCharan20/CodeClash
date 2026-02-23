FROM node:20-alpine

WORKDIR /app

# Docker CLI is required because backend executes code via docker run.
RUN apk add --no-cache docker-cli

COPY package*.json ./
RUN npm ci --omit=optional

COPY . .

EXPOSE 8888

CMD ["npm", "start"]
