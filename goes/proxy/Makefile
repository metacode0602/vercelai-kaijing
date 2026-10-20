.PHONY: build clean test lint tidy run-mock

BINARY=openroute-agent
VERSION?=dev

build:
	CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -ldflags "-s -w -X main.version=$(VERSION)" -o bin/$(BINARY) ./cmd/agent

build-arm64:
	CGO_ENABLED=1 GOOS=linux GOARCH=arm64 go build -ldflags "-s -w -X main.version=$(VERSION)" -o bin/$(BINARY)-arm64 ./cmd/agent

build-mock:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o bin/mock-server ./cmd/mock-server

clean:
	rm -rf bin/

test:
	go test ./... -v

lint:
	go vet ./...

tidy:
	go mod tidy

run-mock: build-mock
	./bin/mock-server
