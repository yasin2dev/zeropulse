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
	@./scripts/check-build-env.sh npm
	cd ui && { [ -d node_modules ] || npm ci; } && npm run build

agent:
	@./scripts/check-build-env.sh go
	go build -tags embedui -ldflags="-s -w" -o bin/zeropulse ./cmd/agent

build: ui agent

test: ui
	go test -v -tags embedui ./...

# Build as the current user; only installing the result needs root.
install: build
	sudo ./systemd/install.sh

update: build
	sudo ./systemd/install.sh

uninstall:
	sudo ./systemd/uninstall.sh

clean:
	rm -rf bin/
