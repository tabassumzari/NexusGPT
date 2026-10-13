# ---- stage 1: build the React app ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# "/api" = same website address as the page; nginx (below) forwards it to the backend.
# Set another value (e.g. https://api.example.com/api) if the backend lives elsewhere.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- stage 2: serve it with nginx ----
FROM nginx:1.27-alpine

# the nginx image fills in ${...} variables in this file when the container starts
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV BACKEND_URL=http://backend:8080
ENV DNS_RESOLVER=127.0.0.11

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
