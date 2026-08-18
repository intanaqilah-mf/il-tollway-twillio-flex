# Stage 1: build React app
FROM node:20-alpine AS builder
WORKDIR /app
COPY plugin-sample/package.json plugin-sample/package-lock.json ./
RUN npm ci
COPY plugin-sample/ .
ENV SKIP_PREFLIGHT_CHECK=true
ENV DISABLE_ESLINT_PLUGIN=true
RUN npm run build

# Stage 2: serve
FROM nginx:1.27-alpine
# Upgrade all OS packages to pick up latest security patches (curl, expat, c-ares etc.)
# and remove curl which is not needed at runtime for a static file server
RUN apk update && apk upgrade --no-cache \
    && apk del curl \
    && rm -rf /var/cache/apk/*
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
