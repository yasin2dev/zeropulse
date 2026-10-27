package server

import (
	"errors"
	"io"
	"io/fs"
	"net/http"
	"strings"

	"zeropulse-agent/ui"
)

func newUIHandler() (http.Handler, error) {
	dist, err := ui.DistFS()
	if err != nil {
		return nil, err
	}

	fileServer := http.FileServer(http.FS(dist))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Do not intercept /api/ calls
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" || path == "index.html" {
			path = "index.html"
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		}

		// Check if file exists in the embedded dist
		f, err := dist.Open(path)
		if err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// Fallback to index.html for SPA client-side routing
		if errors.Is(err, fs.ErrNotExist) {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			indexFile, err := dist.Open("index.html")
			if err != nil {
				http.NotFound(w, r)
				return
			}
			defer indexFile.Close()

			stat, err := indexFile.Stat()
			if err != nil {
				http.NotFound(w, r)
				return
			}

			readSeeker, ok := indexFile.(io.ReadSeeker)
			if ok {
				http.ServeContent(w, r, "index.html", stat.ModTime(), readSeeker)
			} else {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				_, _ = io.Copy(w, indexFile)
			}
			return
		}

		http.NotFound(w, r)
	}), nil
}
