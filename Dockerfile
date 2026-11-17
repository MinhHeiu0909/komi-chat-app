# Bản deploy công khai, một service (Render): build frontend, rồi backend phục vụ cả API lẫn frontend
# cùng một địa chỉ. Khi dev vẫn dùng docker-compose.yml (backend/Dockerfile + frontend/Dockerfile).
# Hướng dẫn: docs/DEPLOY.md

FROM node:22-slim AS frontend
WORKDIR /app
COPY frontend/package*.json frontend/.npmrc ./
RUN npm ci
COPY frontend/ ./
# API cùng địa chỉ (/api); để trống VITE_SOCKET_URL để socket nối tới chính trang đang mở.
# Tài khoản demo hiện ở trang đăng nhập (Render truyền biến môi trường vào build qua ARG).
ARG VITE_DEMO_USERNAME=""
ARG VITE_DEMO_PASSWORD=""
ENV VITE_API_URL=/api \
    VITE_DEMO_USERNAME=$VITE_DEMO_USERNAME \
    VITE_DEMO_PASSWORD=$VITE_DEMO_PASSWORD
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY --from=frontend /app/dist ./public
ENV NODE_ENV=production \
    FRONTEND_DIST=/app/public
EXPOSE 5001
CMD ["node", "src/server.js"]
