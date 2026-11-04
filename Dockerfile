FROM node:22-alpine AS ui
WORKDIR /src/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

FROM golang:1.27-alpine AS agent
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY ui/embed.go ui/embed_stub.go ./ui/
COPY --from=ui /src/ui/dist ./ui/dist
RUN CGO_ENABLED=0 go build -tags embedui -ldflags="-s -w" -o /zeropulse ./cmd/agent

FROM alpine:3.22
COPY --from=agent /zeropulse /usr/local/bin/zeropulse
WORKDIR /data
ENV ZEROPULSE_DATA_DIR=/data
EXPOSE 8080
ENTRYPOINT ["zeropulse"]
