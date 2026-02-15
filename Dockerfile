FROM node:24-slim

WORKDIR /app

ENV PORT=3000

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
