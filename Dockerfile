FROM node:18-alpine as build

WORKDIR /source

# Copy the package lock file into the container
COPY package*.json ./

# Run ci only for the production dependencies
RUN npm i --legacy-peer-deps

# Copy the rest of the files into the container and build
COPY . .
RUN npm run build --prod

FROM nginx:alpine
COPY --from=build /source/dist/sistema-nutricional/browser /usr/share/nginx/html
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080