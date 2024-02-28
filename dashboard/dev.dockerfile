FROM node:14.15-alpine

WORKDIR /app

ENV BROWSER=none

EXPOSE 8080

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY public ./public
COPY src ./src
COPY . ./

CMD ["yarn", "start"]
