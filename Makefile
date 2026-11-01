.PHONY: all build ui agent test clean install update uninstall dev dev-ui ui-dev ui-watch

all: build

dev:
	./scripts/dev.sh

dev-ui:
	cd ui && npm run dev

ui-dev: dev-ui

ui-watch:
	cd ui && npx vite build --watch

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
