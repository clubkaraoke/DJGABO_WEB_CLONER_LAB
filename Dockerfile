FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    MAX_CONCURRENT_JOBS=1 \
    MAX_QUEUE=5 \
    JOB_TIMEOUT_MS=120000 \
    RATE_LIMIT_PER_HOUR=12

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --chown=pwuser:pwuser . .
RUN mkdir -p /app/captures/jobs && chown -R pwuser:pwuser /app/captures

USER pwuser
EXPOSE 8787
CMD ["npm", "start"]
