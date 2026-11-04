//go:build !embedui

package ui

import (
	"errors"
	"io/fs"
)

// DistFS reports that this binary has no dashboard. It keeps a plain
// `go build` and `go test` working without a Node.js build step.
func DistFS() (fs.FS, error) {
	return nil, errors.New("built without the dashboard; run `make build` or pass --ui-dir")
}
