package collector

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// useFakeDocker points the collector at an HTTP handler on a temporary Unix socket.
func useFakeDocker(t *testing.T, handler http.HandlerFunc) {
	t.Helper()

	dir, err := os.MkdirTemp("", "zp")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	socket := filepath.Join(dir, "docker.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewUnstartedServer(handler)
	server.Listener = listener
	server.Start()
	t.Cleanup(server.Close)

	original := dockerSocketPath
	dockerSocketPath = socket
	t.Cleanup(func() { dockerSocketPath = original })
}

func TestRestartContainerRequest(t *testing.T) {
	var gotMethod, gotPath, gotQuery string
	useFakeDocker(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath, gotQuery = r.Method, r.URL.EscapedPath(), r.URL.RawQuery
		w.WriteHeader(http.StatusNoContent)
	})

	if err := RestartContainer(context.Background(), "abc?t=0"); err != nil {
		t.Fatalf("RestartContainer failed: %v", err)
	}
	if gotMethod != http.MethodPost {
		t.Errorf("method = %s, want POST", gotMethod)
	}
	if gotPath != "/v1.41/containers/abc%3Ft=0/restart" {
		t.Errorf("container ID was not escaped: %s", gotPath)
	}
	if gotQuery != "t=10" {
		t.Errorf("query = %q, want t=10", gotQuery)
	}
}

func TestRestartContainerReportsDockerError(t *testing.T) {
	useFakeDocker(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"No such container: gone"}`))
	})

	err := RestartContainer(context.Background(), "gone")
	if err == nil || !strings.Contains(err.Error(), "No such container") {
		t.Fatalf("expected Docker's message in the error, got %v", err)
	}
}

func TestRestartTimeoutOutlastsStopGrace(t *testing.T) {
	if restartRequestTimeout <= restartStopGraceSeconds*time.Second {
		t.Fatalf("timeout %s would report a slow but successful restart as failed", restartRequestTimeout)
	}
}
