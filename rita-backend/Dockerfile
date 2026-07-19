FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git cmake g++ make ffmpeg wget \
    && rm -rf /var/lib/apt/lists/*

# Build whisper.cpp
WORKDIR /app
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git && \
    cd whisper.cpp && \
    cmake -B build && \
    cmake --build build --config Release -j$(nproc) && \
    cp build/bin/whisper-cli main

# Download base model (~150MB, good balance quality/speed for Spanish)
RUN cd whisper.cpp/models && \
    wget -q https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

# App
WORKDIR /app/rita
COPY package.json ./
RUN npm install --production
COPY src/ ./src/

ENV WHISPER_BIN=/app/whisper.cpp/main
ENV WHISPER_MODEL=/app/whisper.cpp/models/ggml-base.bin
ENV PORT=3000

EXPOSE 3000
CMD ["node", "src/server.js"]
