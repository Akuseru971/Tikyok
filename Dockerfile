FROM node:20-bookworm

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip \
  && pip3 install --break-system-packages yt-dlp \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./package.json
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN npm install \
  && npm --prefix backend install \
  && npm --prefix frontend install

COPY . .

RUN npm --prefix frontend run build

EXPOSE 3000
EXPOSE 4000

CMD ["npm", "run", "start"]
