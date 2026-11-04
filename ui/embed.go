//go:build embedui

// Package ui provides embedded static assets for the Zeropulse Edge Dashboard.
package ui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// DistFS returns the sub-filesystem for the embedded dist directory.
func DistFS() (fs.FS, error) {
	return fs.Sub(distFS, "dist")
}
