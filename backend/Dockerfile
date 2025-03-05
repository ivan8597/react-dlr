FROM node:18
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY src/ ./src
EXPOSE 4000
CMD ["node", "src/index.js"]