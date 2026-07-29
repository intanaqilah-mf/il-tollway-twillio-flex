# Stage 1: build Twilio Flex plugin
FROM node:20-alpine AS builder
WORKDIR /app
COPY plugin-sample/package.json plugin-sample/package-lock.json ./
RUN npm ci
COPY plugin-sample/ .
RUN npm run build

# Stage 2: serve
FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
