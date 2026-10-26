.PHONY: all build ui agent test clean install update uninstall

all: build

ui:
	cd ui && npm run build

agent:
	go build -ldflags="-s -w" -o bin/zeropulse ./cmd/agent

build: ui agent

test:
	go test -v ./...
	cd ui && npm run build

install: build
	./systemd/install.sh

update: build
	./systemd/update.sh

uninstall:
	./systemd/uninstall.sh

clean:
	rm -rf bin/
