package server

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"zeropulse-agent/ui"
)

func newUIHandler(cfg ServerConfig) (http.Handler, error) {
	// 1. Live Dev Reverse Proxy: Forward UI requests to Vite dev server (e.g. http://localhost:3000)
	if cfg.UIProxyURL != "" {
		target, err := url.Parse(cfg.UIProxyURL)
		if err != nil {
			return nil, fmt.Errorf("geçersiz ui-proxy adresi (%s): %w", cfg.UIProxyURL, err)
		}
		proxy := httputil.NewSingleHostReverseProxy(target)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Do not proxy /api/ calls
			if strings.HasPrefix(r.URL.Path, "/api/") {
				http.NotFound(w, r)
				return
			}
			r.Host = target.Host
			proxy.ServeHTTP(w, r)
		}), nil
	}

	// 2. Local Disk Mode: Serve static files directly from disk directory (e.g. ./ui/dist)
	var dist fs.FS
	if cfg.UIDir != "" {
		info, err := os.Stat(cfg.UIDir)
		if err != nil || !info.IsDir() {
			return nil, fmt.Errorf("ui dizini bulunamadı (%s): %w", cfg.UIDir, err)
		}
		dist = os.DirFS(cfg.UIDir)
	} else {
		// 3. Embedded Assets: Fallback to compiled embedded assets
		var err error
		dist, err = ui.DistFS()
		if err != nil {
			return nil, err
		}
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

		// Check if file exists in the static assets
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
