# Build stage
# golang:1.26-alpine tracks the latest 1.26.x patch, so rebuilds pick up Go
# standard-library security fixes (e.g. the 1.26.3 net/http/html-template fixes).
FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server .

# Run stage
FROM alpine:3.21
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /server ./server
COPY migrations/ ./migrations/
# Run as an unprivileged user, not root.
RUN addgroup -S app && adduser -S -G app -u 10001 app && chown -R app:app /app
USER app
EXPOSE 8080
CMD ["./server"]
